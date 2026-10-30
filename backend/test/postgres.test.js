import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createOffersServer } from '../src/server.js'
import { createPostgresPool, createPostgresRepository } from '../src/postgresRepository.js'
import { initializeSchema } from '../scripts/init-schema.js'
import { importCatalog, prepareCatalogImport } from '../scripts/import-catalog.js'

test('PostgreSQL migration, import, CRUD, filters, persistence and unavailable connection', { skip: !process.env.FILAMIND_TEST_DATABASE_URL }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'filamind-postgres-test-'))
  const imagesPath = path.join(directory, 'images')
  const catalogPath = path.join(directory, 'catalog.json')
  const now = new Date().toISOString()
  const productId = '11111111-1111-4111-8111-111111111111'
  const offerId = '22222222-2222-4222-8222-222222222222'
  const imageName = '33333333-3333-4333-8333-333333333333.png'
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7J8AAAAASUVORK5CYII=', 'base64')
  await mkdir(imagesPath)
  await writeFile(path.join(imagesPath, imageName), image)
  const initial = { version: 1, products: [{ id: productId, name: 'Produto temporário de teste', description: 'Descrição', category: 'Filamentos', keywords: ['PLA'], imageUrl: `/offer-images/${imageName}`, imageRightsSource: 'Imagem de teste', featured: false, active: true, createdAt: now, updatedAt: now }], offers: [{ id: offerId, productId, marketplace: 'shopee', affiliateUrl: 'https://s.shopee.com.br/temporary-test', affiliateConfirmed: true, active: true, priceCents: null, priceDisplayAuthorized: false, priceSource: '', priceUpdatedAt: null, availability: 'unknown', availabilityConfirmedAt: null, createdAt: now, updatedAt: now }] }
  await writeFile(catalogPath, JSON.stringify(initial))
  const pool = createPostgresPool(process.env.FILAMIND_TEST_DATABASE_URL)
  let server
  try {
    assert.deepEqual(await initializeSchema(pool), { version: 1, created: true })
    await assert.rejects(initializeSchema(pool), /já existe/)
    const plan = await prepareCatalogImport(catalogPath, imagesPath)
    assert.equal(plan.images.length, 1)
    assert.equal((await importCatalog(pool, plan)).status, 'imported')
    assert.equal((await importCatalog(pool, plan)).status, 'already_imported')
    const changed = { ...plan, catalogSha256: 'different' }
    await assert.rejects(importCatalog(pool, changed), /outra importação/)
    const repo = createPostgresRepository(pool)
    await repo.assertReady()
    assert.equal((await repo.get('products', productId)).imageUrl, `/offer-images/${imageName}`)
    assert.equal((await repo.get('offers', offerId)).affiliateUrl, initial.offers[0].affiliateUrl)
    assert.equal((await repo.listPublic(new URLSearchParams())).total, 1)
    assert.equal((await repo.summary()).byMarketplace.shopee, 1)
    assert.equal((await repo.list('products', new URLSearchParams())).total, 1)

    server = createOffersServer({ repository: repo, uploadsPath: imagesPath, authorizeAdmin: (req) => req.headers.authorization === 'Bearer test-admin', frontendPath: directory })
    await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Test</title>')
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    const call = async (route, method = 'GET', body) => {
      const response = await fetch(base + route, { method, headers: { Authorization: 'Bearer test-admin', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
      return { status: response.status, body: await response.json() }
    }
    const duplicate = await call('/api/admin/products', 'POST', { ...initial.products[0], name: '  PRODUTO   TEMPORÁRIO DE TESTE ' })
    assert.equal(duplicate.status, 409)
    const second = await call('/api/admin/products', 'POST', { ...initial.products[0], name: 'Segundo produto', imageUrl: '', imageRightsSource: '', featured: false })
    assert.equal(second.status, 201)
    const secondId = second.body.id
    const edited = await call(`/api/admin/products/${secondId}`, 'PUT', { ...second.body, description: 'Nova descrição' })
    assert.equal(edited.body.description, 'Nova descrição')
    assert.equal((await call('/api/admin/offers', 'POST', { ...initial.offers[0], productId: secondId })).status, 409)
    const ml = await call('/api/admin/offers', 'POST', { ...initial.offers[0], productId: secondId, marketplace: 'mercado_livre', affiliateUrl: 'https://www.mercadolivre.com.br/test?affiliate=test' })
    assert.equal(ml.status, 201)
    const amazon = await call('/api/admin/offers', 'POST', { ...initial.offers[0], productId: secondId, marketplace: 'amazon', affiliateUrl: 'https://www.amazon.com.br/test?tag=test' })
    assert.equal(amazon.status, 201)
    const priced = await call('/api/admin/offers', 'POST', { ...initial.offers[0], productId: secondId, affiliateUrl: 'https://s.shopee.com.br/priced-test', priceCents: 12345, priceDisplayAuthorized: true, priceSource: 'Fonte de teste autorizada', priceUpdatedAt: now })
    assert.equal(priced.status, 201)
    assert.equal((await call('/api/offers?marketplace=amazon')).body.total, 1)
    assert.equal((await call('/api/offers?q=PLA')).body.total, 4)
    const sorted = await call('/api/offers?sort=price_asc')
    assert.equal(sorted.body.hasPrices, true)
    assert.equal(sorted.body.items[0].priceCents, 12345)
    assert.equal((await call('/api/admin/products?q=Segundo')).body.total, 1)
    assert.equal((await call('/api/admin/offers?marketplace=mercado_livre')).body.total, 1)
    assert.equal((await call('/api/admin/summary')).body.offers, 4)
    assert.equal((await call(`/api/admin/offers/${ml.body.id}`, 'DELETE')).status, 200)
    assert.equal((await call(`/api/admin/products/${secondId}`, 'DELETE')).status, 200)
    assert.equal((await call('/api/offers')).body.total, 1)
    for (let index = 0; index < 21; index++) {
      assert.equal((await call('/api/admin/products', 'POST', { ...initial.products[0], name: `Produto paginado ${index}`, imageUrl: '', imageRightsSource: '' })).status, 201)
    }
    assert.equal((await call('/api/admin/products?page=1')).body.items.length, 20)
    assert.equal((await call('/api/admin/products?page=2')).body.items.length, 2)
    assert.equal((await call('/api/admin/products?q=paginado%2020')).body.total, 1)
    await new Promise((resolve) => server.close(resolve)); server = null
    server = createOffersServer({ repository: createPostgresRepository(pool), frontendPath: directory })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const restarted = await fetch(`http://127.0.0.1:${server.address().port}/api/offers`)
    assert.equal((await restarted.json()).total, 1)
    await new Promise((resolve) => server.close(resolve)); server = null
    assert.equal((await readFile(catalogPath, 'utf8')), JSON.stringify(initial))

    const deadPool = createPostgresPool('postgresql://filamind_test@127.0.0.1:1/postgres')
    const deadServer = createOffersServer({ repository: createPostgresRepository(deadPool), frontendPath: directory })
    try {
      await new Promise((resolve) => deadServer.listen(0, '127.0.0.1', resolve))
      const response = await fetch(`http://127.0.0.1:${deadServer.address().port}/api/offers`)
      assert.equal(response.status, 503)
    } finally { await new Promise((resolve) => deadServer.close(resolve)); await deadPool.end() }
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve))
    await pool.end()
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unsafe test cleanup path')
    await rm(directory, { recursive: true, force: true })
  }
})
