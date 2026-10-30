import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { createOffersServer } from '../../backend/src/server.js'
import { createLocalAdminAccess } from '../../backend/src/localAdmin.js'

const suppliedPngPath = process.env.FILAMIND_TEST_IMAGE_PATH || ''
const png = suppliedPngPath ? await readFile(suppliedPngPath) : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7J8AAAAASUVORK5CYII=', 'base64')
const pngName = suppliedPngPath ? path.basename(suppliedPngPath) : 'filamento.png'

test('keeps the selected file and preview through validation, upload, save and edit', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'filamind-admin-image-'))
  const catalogPath = path.join(directory, 'catalog.json')
  const uploadsPath = path.join(directory, 'images')
  await writeFile(catalogPath, JSON.stringify({ version: 1, products: [], offers: [] }))
  const access = createLocalAdminAccess()
  const server = createOffersServer({ catalogPath, uploadsPath, localAdminAccess: access, frontendPath: path.resolve('dist') })
  let browser
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/admin/ofertas/', async (route) => {
      const response = await route.fetch()
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'" } })
    })
    await page.goto(base + '/admin/ofertas/')
    await page.getByLabel('Código temporário').fill(access.code)
    await page.getByRole('button', { name: 'Acessar painel' }).click()
    const form = page.locator('.admin-offers-forms form').first()
    await form.getByRole('heading', { name: 'Novo produto' }).waitFor()
    const blobBlockedByOldPolicy = await page.evaluate((encoded) => new Promise((resolve) => {
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
      const image = new Image()
      image.onload = () => { URL.revokeObjectURL(url); resolve(false) }
      image.onerror = () => { URL.revokeObjectURL(url); resolve(true) }
      image.src = url
    }), png.toString('base64'))
    assert.equal(blobBlockedByOldPolicy, true)

    const input = form.locator('input[type=file]')
    const selected = async () => input.evaluate((element) => ({ name: element.files[0]?.name || '', type: element.files[0]?.type || '', count: element.files.length, value: element.value }))
    const previewLoaded = async () => form.locator('.admin-offers-image-preview img').evaluate((image) => image.complete && image.naturalWidth > 0)
    await input.setInputFiles(suppliedPngPath || { name: pngName, mimeType: 'image/png', buffer: png })
    await page.getByText(/Prévia pronta/).waitFor()
    assert.equal((await selected()).name, pngName)
    assert.equal((await selected()).type, 'image/png')
    assert.equal((await selected()).count, 1)
    assert.ok((await selected()).value.endsWith(pngName))
    assert.equal(await previewLoaded(), true)
    assert.match(await form.locator('.admin-offers-image-preview img').getAttribute('src'), /^data:image\/png;base64,/)
    assert.ok((await form.locator('.admin-offers-image-path').first().innerText()).endsWith(pngName))

    await form.getByLabel('Nome').fill('Filamento de teste')
    await form.getByRole('button', { name: 'Salvar produto' }).click()
    assert.match(await form.locator('.admin-offers-image-status').innerText(), /Conclua o envio/)
    assert.equal((await selected()).count, 1)
    assert.equal(JSON.parse(await readFile(catalogPath, 'utf8')).products.length, 0)

    await form.getByRole('button', { name: 'Enviar imagem' }).click()
    assert.match(await form.locator('.admin-offers-image-status').innerText(), /Informe a origem/)
    assert.equal((await selected()).count, 1)
    await form.getByLabel('Origem e autorização da imagem').fill('Imagem autorizada para teste local')
    await page.route('**/api/admin/images', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Falha simulada no upload.' }) }), { times: 1 })
    await form.getByRole('button', { name: 'Enviar imagem' }).click()
    await page.getByText(/Falha no upload: Falha simulada no upload/).waitFor()
    assert.equal((await selected()).count, 1)
    assert.equal(await previewLoaded(), true)

    await form.getByRole('button', { name: 'Enviar imagem' }).click()
    await page.getByText(/Upload concluído/).waitFor()
    assert.equal((await selected()).count, 1)
    assert.equal(await previewLoaded(), true)
    const uploadedPath = (await form.locator('.admin-offers-image-path').allInnerTexts()).find((text) => text.includes('/offer-images/'))?.split('Imagem cadastrada: ')[1]
    assert.match(uploadedPath, /^\/offer-images\/[a-f0-9-]{36}\.png$/)
    const imageResponse = await page.request.get(base + uploadedPath)
    assert.equal(imageResponse.status(), 200)
    assert.equal(imageResponse.headers()['content-type'], 'image/png')
    assert.deepEqual(await imageResponse.body(), png)

    await form.getByLabel('Produto ativo').check()
    await form.getByRole('button', { name: 'Salvar produto' }).click()
    await page.getByText('Produto salvo com imagem.').waitFor()
    const stored = JSON.parse(await readFile(catalogPath, 'utf8'))
    assert.equal(stored.products.length, 1)
    assert.equal(stored.products[0].imageUrl, uploadedPath)
    assert.deepEqual(await readFile(path.join(uploadsPath, path.basename(uploadedPath))), png)

    const cookie = (await page.context().cookies(base)).find((entry) => entry.name === 'filamind_local_admin')
    assert.ok(cookie)
    const offerResponse = await fetch(base + '/api/admin/offers', {
      method: 'POST',
      headers: { Origin: base, Cookie: `${cookie.name}=${cookie.value}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: stored.products[0].id, marketplace: 'shopee', affiliateUrl: 'https://s.shopee.com.br/teste-local', affiliateConfirmed: true, active: true, priceCents: null, availability: 'unknown' }),
    })
    assert.equal(offerResponse.status, 201)
    await page.goto(base + '/ofertas/')
    await page.locator('.offer-card img').waitFor()
    assert.equal(await page.locator('.offer-card img').evaluate((image) => image.complete && image.naturalWidth > 0), true)
    await page.reload()
    await page.locator('.offer-card img').waitFor()
    assert.equal(await page.locator('.offer-card img').evaluate((image) => image.complete && image.naturalWidth > 0), true)

    await page.goto(base + '/admin/ofertas/')
    await page.getByRole('button', { name: 'Editar' }).first().click()
    assert.equal(await form.locator('.admin-offers-image-preview img').getAttribute('src'), uploadedPath)
    await form.getByLabel('Descrição curta').fill('Descrição editada sem trocar a imagem')
    await form.getByRole('button', { name: 'Salvar produto' }).click()
    await page.getByText('Produto salvo com imagem.').waitFor()
    const edited = JSON.parse(await readFile(catalogPath, 'utf8'))
    assert.equal(edited.products[0].imageUrl, uploadedPath)
    assert.equal(edited.offers[0].affiliateUrl, 'https://s.shopee.com.br/teste-local')

    await input.setInputFiles({ name: 'arquivo.txt', mimeType: 'text/plain', buffer: Buffer.from('não é uma imagem') })
    assert.equal((await selected()).name, 'arquivo.txt')
    assert.match(await form.locator('.admin-offers-image-status').innerText(), /PNG, JPEG ou WebP/)
    assert.equal(await form.getByRole('button', { name: 'Enviar imagem' }).isDisabled(), true)
    await input.setInputFiles({ name: 'grande.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) })
    assert.equal((await selected()).name, 'grande.png')
    assert.match(await form.locator('.admin-offers-image-status').innerText(), /máximo 2 MB/)
    assert.equal((await selected()).count, 1)

    await input.setInputFiles({ name: 'falso.png', mimeType: 'image/png', buffer: Buffer.from('não é PNG') })
    assert.equal((await selected()).name, 'falso.png')
    await page.getByText(/conteúdo do arquivo não corresponde/).waitFor()
    assert.equal(await form.getByRole('button', { name: 'Enviar imagem' }).isDisabled(), true)
    await input.setInputFiles({ name: 'corrompido.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]) })
    await page.getByText(/não conseguiu decodificar/).waitFor()
    assert.equal((await selected()).name, 'corrompido.png')
    assert.equal(await form.getByRole('button', { name: 'Enviar imagem' }).isDisabled(), true)

    await page.getByRole('button', { name: 'Editar' }).first().click()
    await form.getByLabel('Origem e autorização da imagem').fill('Imagem autorizada para teste local')
    for (const [mime, extension] of [['image/jpeg', 'jpg'], ['image/webp', 'webp']]) {
      const data = await page.evaluate((type) => {
        const canvas = document.createElement('canvas')
        canvas.width = 2
        canvas.height = 2
        canvas.getContext('2d').fillRect(0, 0, 2, 2)
        return canvas.toDataURL(type).split(',')[1]
      }, mime)
      const bytes = Buffer.from(data, 'base64')
      await input.setInputFiles({ name: `teste.${extension}`, mimeType: mime, buffer: bytes })
      await page.getByText(/Prévia pronta/).waitFor()
      assert.equal((await selected()).name, `teste.${extension}`)
      assert.equal(await previewLoaded(), true)
      await form.getByRole('button', { name: 'Enviar imagem' }).click()
      await page.getByText(/Upload concluído/).waitFor()
      const imagePath = (await form.locator('.admin-offers-image-path').allInnerTexts()).find((text) => text.includes('/offer-images/'))?.split('Imagem cadastrada: ')[1]
      assert.match(imagePath, new RegExp(`\\.${extension}$`))
      const response = await page.request.get(base + imagePath)
      assert.equal(response.status(), 200)
      assert.equal(response.headers()['content-type'], mime)
      assert.deepEqual(await response.body(), bytes)
    }
    const replacementPath = (await form.locator('.admin-offers-image-path').allInnerTexts()).find((text) => text.includes('/offer-images/'))?.split('Imagem cadastrada: ')[1]
    await form.getByRole('button', { name: 'Salvar produto' }).click()
    await page.getByText('Produto salvo com imagem.').waitFor()
    const replaced = JSON.parse(await readFile(catalogPath, 'utf8'))
    assert.equal(replaced.products[0].imageUrl, replacementPath)
    assert.notEqual(replacementPath, uploadedPath)
    assert.equal(replaced.offers[0].affiliateUrl, 'https://s.shopee.com.br/teste-local')
    assert.deepEqual(errors, [])
  } finally {
    if (browser) await browser.close()
    if (server.listening) await new Promise((resolve) => server.close(resolve))
    if (!directory.startsWith(tmpdir() + path.sep)) throw new Error('Unsafe test cleanup path')
    await rm(directory, { recursive: true, force: true })
  }
})
