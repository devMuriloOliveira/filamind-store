import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { createOffersServer } from '../../backend/src/server.js'
import { createLocalAdminAccess } from '../../backend/src/localAdmin.js'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7J8AAAAASUVORK5CYII=', 'base64')

test('quick form uploads image, creates atomically, validates prices and fits four widths', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'filamind-quick-offer-'))
  const catalogPath = path.join(directory, 'catalog.json')
  await writeFile(catalogPath, JSON.stringify({ version: 1, products: [], offers: [] }))
  const access = createLocalAdminAccess()
  const server = createOffersServer({ catalogPath, uploadsPath: path.join(directory, 'images'), localAdminAccess: access, frontendPath: path.resolve('dist') })
  let browser
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base + '/admin/ofertas/')
    await page.getByLabel('Código temporário').fill(access.code)
    await page.getByRole('button', { name: 'Acessar painel' }).click()
    const form = page.locator('.admin-quick-offer')
    await form.getByRole('heading', { name: 'Nova oferta' }).waitFor()
    assert.equal(await form.locator('#quick-category option').count(), 7)
    await form.locator('#quick-name').fill('Filamento rápido')
    await form.locator('#quick-category').selectOption('filamentos')
    await form.locator('#quick-marketplace').selectOption('mercado_livre')
    await form.locator('#quick-price-from').fill('100,00')
    await form.locator('#quick-price-by').fill('199,90')
    await form.locator('#quick-link').fill('https://www.mercadolivre.com.br/filamento-rapido')
    await form.getByRole('button', { name: 'Cadastrar oferta' }).click()
    await form.getByText('O preço de deve ser maior que o preço por.').waitFor()
    assert.equal(JSON.parse(await readFile(catalogPath, 'utf8')).products.length, 0)
    await form.locator('#quick-price-from').fill('249,90')
    await form.locator('#quick-image').setInputFiles({ name: 'falso.png', mimeType: 'image/png', buffer: Buffer.from('não é png') })
    await form.getByText('O conteúdo não corresponde ao formato da imagem.').waitFor()
    await form.locator('#quick-image').setInputFiles({ name: 'teste.png', mimeType: 'image/png', buffer: png })
    await form.locator('.admin-offers-image-preview img').waitFor()
    await form.locator('.admin-offers-image-preview img').evaluate((image) => image.decode())
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px`)
      assert.equal(await form.getByRole('button', { name: 'Cadastrar oferta' }).isVisible(), true)
    }
    await page.route('**/api/admin/complete-offers', (route) => route.abort(), { times: 1 })
    await form.getByRole('button', { name: 'Cadastrar oferta' }).click()
    await form.getByText('Falha de conexão. Confira o servidor e tente novamente.').waitFor()
    assert.equal(JSON.parse(await readFile(catalogPath, 'utf8')).products.length, 0)
    await page.route('**/api/admin/complete-offers', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Falha simulada."}' }), { times: 1 })
    await form.getByRole('button', { name: 'Cadastrar oferta' }).click()
    await form.getByRole('alert').filter({ hasText: 'Falha simulada.' }).waitFor()
    assert.equal(JSON.parse(await readFile(catalogPath, 'utf8')).products.length, 0)
    assert.equal(await form.locator('#quick-name').inputValue(), 'Filamento rápido')
    await form.getByRole('button', { name: 'Cadastrar oferta' }).click()
    await form.getByText('Oferta cadastrada e ativa na vitrine.').waitFor()
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
    assert.equal(catalog.products.length, 1)
    assert.equal(catalog.offers.length, 1)
    assert.equal(catalog.offers[0].priceCents, 19990)
    assert.equal(catalog.offers[0].originalPriceCents, 24990)
    assert.match(catalog.products[0].imageUrl, /^\/offer-images\/[a-f0-9-]{36}\.png$/)
    await page.goto(base + '/ofertas/?categoria=filamentos')
    await page.locator('.offer-card-price').filter({ hasText: '199,90' }).waitFor()
    assert.equal((await page.locator('.offer-card-old-price').innerText()).replace(/\s/g, ' '), 'De R$ 249,90')
    await page.goto(base + '/admin/ofertas/')
    await form.getByRole('heading', { name: 'Nova oferta' }).waitFor()
    await form.locator('#quick-name').fill('Oferta Amazon')
    await form.locator('#quick-category').selectOption('resinas')
    await form.locator('#quick-marketplace').selectOption('amazon')
    assert.equal(await form.locator('#quick-price-by').count(), 0)
    await form.locator('#quick-link').fill('https://www.amazon.com.br/produto')
    await form.getByRole('button', { name: 'Cadastrar oferta' }).click()
    await form.getByText('Oferta cadastrada e ativa na vitrine.').waitFor()
    const amazon = JSON.parse(await readFile(catalogPath, 'utf8')).offers[1]
    assert.equal(amazon.priceCents, null)
    assert.deepEqual(errors, [])
  } finally {
    if (browser) await browser.close()
    if (server.listening) await new Promise((resolve) => server.close(resolve))
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unsafe test cleanup path')
    await rm(directory, { recursive: true, force: true })
  }
})
