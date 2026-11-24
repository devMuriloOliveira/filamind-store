import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { createOffersServer } from '../../backend/src/server.js'
import { createLocalAdminAccess } from '../../backend/src/localAdmin.js'

test('admin creates three marketplace offers, filters records and keeps responsive pages', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'filamind-admin-workflow-'))
  const catalogPath = path.join(directory, 'catalog.json')
  const productId = '11111111-1111-4111-8111-111111111111'
  const now = new Date().toISOString()
  await writeFile(catalogPath, JSON.stringify({ version: 1, products: [{ id: productId, name: 'Produto de teste local', description: 'Descrição de teste', category: 'Filamentos', keywords: [], imageUrl: '', imageRightsSource: '', featured: false, active: true, createdAt: now, updatedAt: now }], offers: [] }))
  const access = createLocalAdminAccess()
  const createServer = () => createOffersServer({ catalogPath, uploadsPath: path.join(directory, 'images'), localAdminAccess: access, frontendPath: path.resolve('dist') })
  let server = createServer()
  let browser
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    let base = `http://127.0.0.1:${server.address().port}`
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({ timezoneId: 'America/Sao_Paulo' })
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto(base + '/admin/ofertas/')
    await page.getByLabel('Código temporário').fill(access.code)
    await page.getByRole('button', { name: 'Acessar painel' }).click()
    await page.getByText('Produtos Shopee').waitFor()
    const form = page.locator('.admin-offers-forms form').last()
    const links = [
      ['shopee', 'https://s.shopee.com.br/teste-afiliado'],
      ['mercado_livre', 'https://www.mercadolivre.com.br/teste?affiliate=teste'],
      ['amazon', 'https://www.amazon.com.br/teste?tag=teste'],
    ]
    for (const [marketplace, affiliateUrl] of links) {
      await form.locator('select').first().selectOption(productId)
      await form.getByLabel('Marketplace').selectOption(marketplace)
      await form.getByLabel('Link de afiliado HTTPS').fill(affiliateUrl)
      await form.getByLabel(/Confirmo que o link/).check()
      await form.getByLabel('Oferta ativa').check()
      await form.getByRole('button', { name: 'Salvar oferta' }).click()
      await page.getByText('Oferta salva.').waitFor()
    }
    const saved = JSON.parse(await readFile(catalogPath, 'utf8'))
    assert.equal(saved.offers.length, 3)
    assert.deepEqual(saved.offers.map((item) => item.marketplace), links.map(([marketplace]) => marketplace))
    const originalDate = '2025-02-03T12:30:45.123Z'
    const datedOffer = { ...saved.offers[0], priceCents: 12345, priceDisplayAuthorized: true, priceSource: 'Fonte autorizada de teste', priceUpdatedAt: originalDate, availability: 'available', availabilityConfirmedAt: originalDate }
    assert.equal(await page.evaluate(async (entry) => {
      const response = await fetch(`/api/admin/offers/${entry.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) })
      return response.status
    }, datedOffer), 200)
    await page.reload()
    await page.getByText('Produtos Shopee').waitFor()
    await page.locator('.admin-offers-list ul').last().locator('li').filter({ hasText: 'Shopee' }).getByRole('button', { name: 'Editar' }).click()
    assert.equal(await form.getByLabel('Atualizado em').inputValue(), '2025-02-03T09:30')
    assert.equal(await form.getByLabel('Confirmada em').inputValue(), '2025-02-03T09:30')
    await form.getByRole('button', { name: 'Salvar oferta' }).click()
    await page.getByText('Oferta salva.').waitFor()
    let unchanged = JSON.parse(await readFile(catalogPath, 'utf8')).offers[0]
    assert.equal(unchanged.priceUpdatedAt, originalDate)
    assert.equal(unchanged.availabilityConfirmedAt, originalDate)
    await page.locator('.admin-offers-list ul').last().locator('li').filter({ hasText: 'Shopee' }).getByRole('button', { name: 'Editar' }).click()
    await form.getByLabel('Atualizado em').fill('2025-02-03T10:45')
    await form.getByLabel('Confirmada em').fill('2025-02-03T10:45')
    await form.getByRole('button', { name: 'Salvar oferta' }).click()
    await page.getByText('Oferta salva.').waitFor()
    unchanged = JSON.parse(await readFile(catalogPath, 'utf8')).offers[0]
    assert.equal(unchanged.priceUpdatedAt, '2025-02-03T13:45:00.000Z')
    assert.equal(unchanged.availabilityConfirmedAt, '2025-02-03T13:45:00.000Z')
    const freshDate = new Date().toISOString()
    assert.equal(await page.evaluate(async (entry) => {
      const response = await fetch(`/api/admin/offers/${entry.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) })
      return response.status
    }, { ...unchanged, priceUpdatedAt: freshDate, availabilityConfirmedAt: freshDate }), 200)
    const noticeText = 'Os preços e a disponibilidade dos produtos podem variar. Consulte as informações atualizadas diretamente na loja antes de finalizar sua compra.'
    const pricedPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await pricedPage.goto(base + '/ofertas/')
    await pricedPage.locator('.offer-card').first().waitFor()
    await pricedPage.getByText('R$ 123,45').waitFor()
    assert.equal(await pricedPage.locator('.offers-price-notice').innerText(), noticeText)
    await pricedPage.close()
    await page.locator('.admin-offers-list ul').last().locator('li').filter({ hasText: 'Shopee' }).getByRole('button', { name: 'Editar' }).click()
    await form.getByLabel('Preço em R$ (opcional)').fill('')
    await form.getByLabel('Disponibilidade').selectOption('unknown')
    await form.getByRole('button', { name: 'Salvar oferta' }).click()
    await page.getByText('Oferta salva.').waitFor()
    unchanged = JSON.parse(await readFile(catalogPath, 'utf8')).offers[0]
    assert.equal(unchanged.priceUpdatedAt, null)
    assert.equal(unchanged.availabilityConfirmedAt, null)
    assert.equal(await page.locator('.admin-offers-summary div').nth(1).locator('strong').innerText(), '3')
    await page.locator('.admin-offers-filters select').nth(1).selectOption('amazon')
    await page.getByRole('heading', { name: 'Ofertas (1)' }).waitFor()
    assert.equal(await page.locator('.admin-offers-list ul').last().locator('li').count(), 1)
    await page.locator('.admin-offers-filters select').nth(1).selectOption('')
    await page.getByRole('heading', { name: 'Ofertas (3)' }).waitFor()

    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `admin overflow at ${width}px`)
    }
    await page.goto(base + '/ofertas/')
    await page.locator('.offer-card').first().waitFor()
    assert.equal(await page.locator('.offer-card').count(), 3)
    assert.equal(await page.locator('.offers-price-filter').count(), 0)
    assert.equal(await page.locator('.offers-price-notice').innerText(), noticeText)
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `offers overflow at ${width}px`)
      assert.equal(await page.locator('.offers-price-notice').isVisible(), true)
      assert.equal(await page.locator('.offers-price-notice').evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth), true)
    }
    await page.goto(base + '/ofertas/?q=semresultado')
    await page.getByRole('heading', { name: 'Nenhuma oferta encontrada' }).waitFor()
    assert.equal(await page.locator('.offers-price-notice').innerText(), noticeText)
    assert.deepEqual(pageErrors, [])

    await browser.close(); browser = null
    await new Promise((resolve) => server.close(resolve))
    server = createServer()
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${server.address().port}`
    const response = await fetch(base + '/api/offers')
    assert.equal((await response.json()).total, 3)
  } finally {
    if (browser) await browser.close()
    if (server.listening) await new Promise((resolve) => server.close(resolve))
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unsafe test cleanup path')
    await rm(directory, { recursive: true, force: true })
  }
})
