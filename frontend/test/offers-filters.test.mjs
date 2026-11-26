import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { createOffersServer } from '../../backend/src/server.js'

test('public filters, contextual URL, history, pagination and mobile layout', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'filamind-offers-filters-'))
  const catalogPath = path.join(directory, 'catalog.json')
  const now = new Date().toISOString()
  const categories = ['impressoras-3d', 'filamentos', 'pecas-reposicao', 'acessorios-ferramentas', 'resinas', 'kits-combos', 'Filamentos']
  const prices = [5000, 5001, 15000, 15001, 50001, 150001, null]
  const products = categories.map((category, index) => ({ id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name: `Produto ${index} ${category === 'resinas' ? 'Resina' : ''}`, description: '', category, keywords: [], imageUrl: '', imageRightsSource: '', featured: false, active: true, createdAt: now, updatedAt: now }))
  const offers = products.map((product, index) => ({ id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`, productId: product.id, marketplace: index === 6 ? 'amazon' : index % 2 ? 'shopee' : 'mercado_livre', affiliateUrl: index === 6 ? 'https://www.amazon.com.br/test?tag=test' : index % 2 ? `https://s.shopee.com.br/test-${index}` : `https://www.mercadolivre.com.br/test-${index}`, affiliateConfirmed: true, active: true, priceCents: prices[index], priceDisplayAuthorized: index !== 6, priceSource: index === 6 ? '' : 'Fonte de teste', priceUpdatedAt: index === 6 ? null : now, availability: 'unknown', availabilityConfirmedAt: null, createdAt: now, updatedAt: now }))
  for (let index = 0; index < 12; index++) offers.push({ ...offers[1], id: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`, affiliateUrl: `https://s.shopee.com.br/extra-${index}`, priceCents: null, priceDisplayAuthorized: false, priceUpdatedAt: null })
  await writeFile(catalogPath, JSON.stringify({ version: 1, products, offers }))
  const server = createOffersServer({ catalogPath, frontendPath: path.resolve('dist') })
  let browser
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto(base + '/ofertas?categoria=filamentos')
    await page.getByText('14 ofertas encontradas').waitFor()
    assert.equal(await page.locator('#offers-category').inputValue(), 'filamentos')
    assert.equal(await page.locator('.offer-card').count(), 12)
    assert.equal(await page.locator('#offers-category option').count(), 7)
    assert.equal(await page.locator('#offers-marketplace option').count(), 4)
    assert.equal(await page.locator('#offers-price').count(), 0)
    assert.equal(await page.locator('.offers-disclosure, .offers-price-notice').count(), 0)
    await page.reload()
    await page.getByText('14 ofertas encontradas').waitFor()
    await page.getByRole('button', { name: 'Próxima' }).click()
    await page.waitForURL(/page=2/)
    await page.getByText('Página 2 de 2').waitFor()
    assert.equal(await page.locator('.offer-card').count(), 2)
    await page.goBack()
    await page.getByText('Página 1 de 2').waitFor()
    assert.equal(await page.locator('.offer-card').count(), 12)
    await page.goForward()
    await page.waitForURL(/page=2/)
    await page.getByText('Página 2 de 2').waitFor()
    assert.equal(await page.locator('.offer-card').count(), 2)

    await page.locator('#offers-category').selectOption('resinas')
    await page.getByText('1 oferta encontrada').waitFor()
    assert.match(page.url(), /categoria=resinas/)
    assert.doesNotMatch(page.url(), /page=2/)
    await page.goBack()
    await page.getByText('Página 2 de 2').waitFor()
    await page.goForward()
    await page.getByText('1 oferta encontrada').waitFor()
    await page.locator('#offers-marketplace').selectOption('mercado_livre')
    await page.goto(base + '/ofertas/?categoria=resinas&marketplace=mercado_livre&minPrice=50001&maxPrice=150000')
    await page.getByText('1 oferta encontrada').waitFor()
    assert.equal(await page.locator('#offers-price').count(), 0)
    await page.locator('#offers-marketplace').selectOption('shopee')
    await page.getByRole('heading', { name: 'Nenhuma oferta encontrada' }).waitFor()
    await page.getByRole('button', { name: 'Limpar filtros' }).last().click()
    await page.getByText('19 ofertas encontradas').waitFor()
    assert.equal(await page.locator('#offers-category').inputValue(), '')
    assert.equal(await page.locator('#offers-price').count(), 0)
    assert.match(await page.locator('.offers-amazon-disclosure').innerText(), /Como associado da Amazon/)

    await page.goto(base + '/ofertas/?category=Filamentos')
    await page.getByText('14 ofertas encontradas').waitFor()
    assert.equal(await page.locator('#offers-category').inputValue(), 'filamentos')
    await page.goto(base + '/ofertas/?marketplace=amazon&maxPrice=5000')
    await page.getByRole('heading', { name: 'Nenhuma oferta encontrada' }).waitFor()
    await page.goto(base + '/ofertas/?q=Resina&sort=price_asc')
    await page.getByText('1 oferta encontrada').waitFor()
    assert.equal(await page.locator('#offers-sort').inputValue(), 'price_asc')
    for (const width of [1440, 1200, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px`)
      assert.equal(await page.locator('#offers-category').isVisible(), true)
      assert.equal(await page.locator('#offers-search').isVisible(), true)
      assert.equal(await page.locator('#offers-sort').isVisible(), true)
    }
    await page.locator('#offers-category').selectOption('filamentos')
    await page.getByRole('heading', { name: 'Nenhuma oferta encontrada' }).waitFor()
    await page.getByRole('button', { name: 'Limpar filtros' }).last().click()
    await page.getByText('19 ofertas encontradas').waitFor()
    await page.locator('#offers-category').selectOption('filamentos')
    await page.getByText('14 ofertas encontradas').waitFor()
    await page.evaluate(() => {
      const sizes = [[120, 240], [240, 120], [200, 200]]
      document.querySelectorAll('.offer-card-image').forEach((area, index) => {
        if (index >= sizes.length) return
        const [width, height] = sizes[index]
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        context.fillStyle = ['#4568a8', '#ab6549', '#3b8465'][index]
        context.fillRect(0, 0, width, height)
        context.fillStyle = '#fff'
        context.fillRect(0, 0, 12, 12)
        context.fillRect(width - 12, height - 12, 12, 12)
        const image = document.createElement('img')
        image.src = canvas.toDataURL('image/png')
        image.alt = `Imagem de teste ${index + 1}`
        area.replaceChildren(image)
      })
    })
    for (const width of [1440, 1200, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      const cards = await page.locator('.offer-card').evaluateAll((elements) => elements.slice(0, 3).map((card) => {
        const area = card.querySelector('.offer-card-image')
        const image = area.querySelector('img')
        const areaBounds = area.getBoundingClientRect()
        const imageBounds = image.getBoundingClientRect()
        return {
          loaded: image.complete && image.naturalWidth > 0,
          fit: getComputedStyle(image).objectFit,
          inside: imageBounds.left >= areaBounds.left && imageBounds.right <= areaBounds.right && imageBounds.top >= areaBounds.top && imageBounds.bottom <= areaBounds.bottom,
          category: Boolean(card.querySelector('.offer-card-meta span:first-child')?.textContent.trim()),
          marketplace: Boolean(card.querySelector('.offer-card-meta span:last-child')?.textContent.trim()),
          price: Boolean(card.querySelector('.offer-card-price, .offer-card-price-unavailable')),
          button: Boolean(card.querySelector('.button')?.getBoundingClientRect().width),
          disclosure: card.querySelector('.offer-card-affiliate-note')?.textContent.trim()
        }
      }))
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px`)
      for (const card of cards) {
        assert.equal(card.loaded && card.inside && card.category && card.marketplace && card.price && card.button, true, `card layout at ${width}px`)
        assert.equal(card.fit, 'contain')
        assert.equal(card.disclosure, 'Link de afiliado')
      }
      assert.equal(await page.locator('.offer-card-ad').count(), 0)
    }
    assert.deepEqual(errors, [])
  } finally {
    if (browser) await browser.close()
    if (server.listening) await new Promise((resolve) => server.close(resolve))
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unsafe test cleanup path')
    await rm(directory, { recursive: true, force: true })
  }
})
