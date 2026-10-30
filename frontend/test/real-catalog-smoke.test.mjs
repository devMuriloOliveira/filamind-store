import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { createOffersServer } from '../../backend/src/server.js'
import { createPostgresPool, createPostgresRepository } from '../../backend/src/postgresRepository.js'

const catalogPath = path.resolve('../backend/data/catalog.json')
const hasPopulatedCatalog = existsSync(catalogPath) && JSON.parse(await readFile(catalogPath, 'utf8')).products.length > 0

test('existing Elegoo offer remains visible with its saved image and admin closed', { skip: !hasPopulatedCatalog }, async () => {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
  const elegoo = catalog.products.find((item) => item.name.includes('Elegoo'))
  assert.ok(elegoo)
  const savedOffer = catalog.offers.find((item) => item.productId === elegoo.id)
  assert.ok(savedOffer)
  const pool = process.env.FILAMIND_TEST_REAL_DATABASE_URL ? createPostgresPool(process.env.FILAMIND_TEST_REAL_DATABASE_URL) : null
  const server = createOffersServer({ repository: pool ? createPostgresRepository(pool) : null })
  let browser
  try {
    if (pool) await createPostgresRepository(pool).assertReady()
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    assert.equal((await fetch(base + '/api/admin/status')).status, 503)
    assert.equal((await fetch(base + '/admin/ofertas/')).status, 404)
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto(base + '/ofertas/')
    const card = page.locator('.offer-card').filter({ hasText: 'Elegoo' }).first()
    await card.waitFor()
    assert.equal(await card.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0), true)
    const link = card.locator('a').last()
    assert.equal(await link.getAttribute('href'), savedOffer.affiliateUrl)
    assert.equal(await link.getAttribute('target'), '_blank')
    assert.match(await link.getAttribute('rel'), /sponsored.*noopener.*noreferrer/)
    assert.deepEqual(pageErrors, [])
  } finally {
    if (browser) await browser.close()
    if (server.listening) await new Promise((resolve) => server.close(resolve))
    if (pool) await pool.end()
  }
})
