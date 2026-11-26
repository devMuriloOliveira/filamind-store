import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createOffersServer } from '../src/server.js'
import { listPublicOffers } from '../src/catalog.js'

test('one authenticated request creates a complete offer and failures leave no partial product', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'filamind-complete-offer-'))
  const catalogPath = path.join(directory, 'catalog.json')
  await writeFile(catalogPath, JSON.stringify({ version: 1, products: [], offers: [] }))
  const server = createOffersServer({ catalogPath, uploadsPath: path.join(directory, 'images'), frontendPath: directory, authorizeAdmin: (req) => req.headers.authorization === 'Bearer test-admin' })
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    const call = async (body, authorized = true) => {
      const response = await fetch(base + '/api/admin/complete-offers', { method: 'POST', headers: { Authorization: authorized ? 'Bearer test-admin' : '', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      return { status: response.status, body: await response.json() }
    }
    const input = { name: 'Filamento conjunto', description: '', category: 'filamentos', marketplace: 'shopee', affiliateUrl: 'https://s.shopee.com.br/conjunto', priceFrom: '249,90', priceBy: '199,90', affiliateConfirmed: true, priceAuthorized: true, imageAuthorized: true }
    assert.equal((await call(input, false)).status, 403)
    assert.equal((await call({ ...input, affiliateConfirmed: false })).status, 400)
    assert.equal((await call({ ...input, priceAuthorized: false })).status, 400)
    assert.equal((await call({ ...input, priceBy: '-1' })).status, 400)
    assert.equal((await call({ ...input, priceFrom: '100,00' })).status, 400)
    assert.equal((await call({ ...input, affiliateUrl: 'http://s.shopee.com.br/conjunto' })).status, 400)
    assert.equal((await call({ ...input, imageUrl: '/offer-images/11111111-1111-4111-8111-111111111111.png' })).status, 400)
    assert.equal((await call({ ...input, marketplace: 'amazon', affiliateUrl: 'https://www.amazon.com.br/teste' })).status, 400)
    assert.deepEqual(JSON.parse(await readFile(catalogPath, 'utf8')).products, [])
    const created = await call(input)
    assert.equal(created.status, 201)
    assert.equal(created.body.offer.priceCents, 19990)
    assert.equal(created.body.offer.originalPriceCents, 24990)
    assert.equal(created.body.offer.active, true)
    const duplicate = await call({ ...input, name: 'Outro nome' })
    assert.equal(duplicate.status, 409)
    const duplicateName = await call({ ...input, affiliateUrl: 'https://s.shopee.com.br/outro' })
    assert.equal(duplicateName.status, 409)
    const amazon = await call({ ...input, name: 'Produto Amazon', marketplace: 'amazon', affiliateUrl: 'https://www.amazon.com.br/teste', priceBy: '', priceFrom: '' })
    assert.equal(amazon.status, 201)
    assert.equal(amazon.body.offer.priceCents, null)
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
    assert.equal(catalog.products.length, 2)
    assert.equal(catalog.offers.length, 2)
    const publicResult = await fetch(base + '/api/offers')
    const publicItems = (await publicResult.json()).items
    assert.equal(publicItems.find((item) => item.name === 'Filamento conjunto').originalPriceCents, 24990)
    assert.equal(publicItems.find((item) => item.name === 'Produto Amazon').priceCents, null)
    const expired = listPublicOffers(catalog, new URLSearchParams(), Date.now() + 25 * 60 * 60 * 1000).items.find((item) => item.name === 'Filamento conjunto')
    assert.equal(expired.priceCents, null)
    assert.equal(expired.originalPriceCents, null)
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve))
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unsafe test cleanup path')
    await rm(directory, { recursive: true, force: true })
  }
})
