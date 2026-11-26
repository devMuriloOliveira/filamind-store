import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createOffersServer } from '../src/server.js'
import { createPostgresPool, createPostgresRepository } from '../src/postgresRepository.js'
import { initializeSchema } from '../scripts/init-schema.js'
import { initializeAdminAuthSchema } from '../scripts/init-admin-auth.js'
import { initializeCategories } from '../scripts/init-categories.js'
import { initializeOriginalPrice } from '../scripts/init-original-price.js'
import { importCatalog, prepareCatalogImport } from '../scripts/import-catalog.js'
import { listPublicOffers } from '../src/catalog.js'

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
    assert.deepEqual(await initializeAdminAuthSchema(pool), { version: 2, created: true })
    assert.deepEqual(await initializeCategories(pool), { version: 3, created: true })
    await assert.rejects(initializeCategories(pool), /Migrations 001 e 002/)
    assert.deepEqual(await initializeOriginalPrice(pool), { version: 4, created: true })
    await assert.rejects(initializeOriginalPrice(pool), /Migrations 001 a 003/)
    assert.deepEqual((await pool.query('SELECT version FROM filamind_store.schema_migrations ORDER BY version')).rows.map(({ version }) => version), [1, 2, 3, 4])
    const plan = await prepareCatalogImport(catalogPath, imagesPath)
    assert.equal(plan.images.length, 1)
    assert.equal((await importCatalog(pool, plan)).status, 'imported')
    assert.equal((await importCatalog(pool, plan)).status, 'already_imported')
    const changed = { ...plan, catalogSha256: 'different' }
    await assert.rejects(importCatalog(pool, changed), /outra importação/)
    const repo = createPostgresRepository(pool)
    await repo.assertReady()
    const complete = { name: 'Oferta conjunta', description: 'Teste', category: 'filamentos', marketplace: 'mercado_livre', affiliateUrl: 'https://www.mercadolivre.com.br/conjunta', priceFrom: '249,90', priceBy: '199,90', affiliateConfirmed: true, priceAuthorized: true, imageAuthorized: true }
    const together = await repo.createCompleteOffer(complete)
    assert.equal(together.offer.priceCents, 19990)
    assert.equal(together.offer.originalPriceCents, 24990)
    assert.equal((await repo.listPublic(new URLSearchParams('q=conjunta'))).items[0].originalPriceCents, 24990)
    await assert.rejects(repo.createCompleteOffer({ ...complete, name: 'Produto que deve ser revertido' }), { code: '23505' })
    assert.equal((await pool.query(`SELECT count(*)::int AS total FROM filamind_store.products WHERE name = 'Produto que deve ser revertido'`)).rows[0].total, 0)
    await repo.deleteOffer(together.offer.id)
    await repo.deleteProduct(together.product.id)
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
    const outOfStock = await call(`/api/admin/offers/${ml.body.id}`, 'PUT', { ...ml.body, availability: 'unavailable', availabilityConfirmedAt: now })
    assert.equal(outOfStock.status, 200)
    assert.equal((await call('/api/offers?marketplace=mercado_livre')).body.total, 0)
    assert.equal((await call('/api/admin/offers?marketplace=mercado_livre')).body.total, 1)
    const backInStock = await call(`/api/admin/offers/${ml.body.id}`, 'PUT', { ...outOfStock.body, availability: 'available', availabilityConfirmedAt: now })
    assert.equal(backInStock.status, 200)
    assert.equal((await call('/api/offers?marketplace=mercado_livre')).body.total, 1)
    const snapshot = { products: (await repo.list('products', new URLSearchParams())).items, offers: (await repo.list('offers', new URLSearchParams())).items }
    for (const query of ['', 'q=PLA', 'marketplace=shopee', 'category=Filamentos', 'categoria=filamentos', 'minPrice=12000&maxPrice=13000', 'sort=price_asc', 'sort=price_desc', 'sort=name', 'page=2']) {
      const params = new URLSearchParams(query)
      const json = listPublicOffers(snapshot, params)
      const postgres = await repo.listPublic(params)
      assert.deepEqual({ total: postgres.total, page: postgres.page, pages: postgres.pages, ids: postgres.items.map((item) => item.id) }, { total: json.total, page: json.page, pages: json.pages, ids: json.items.map((item) => item.id) }, query)
    }
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
    const resin = await repo.createProduct({ ...initial.products[0], name: 'Resina isolada', category: 'resinas', imageUrl: '', imageRightsSource: '' })
    const resinOffer = await repo.createOffer({ ...initial.offers[0], productId: resin.id, affiliateUrl: 'https://s.shopee.com.br/resina-isolada' })
    const resinResult = await repo.listPublic(new URLSearchParams('categoria=resinas'))
    assert.equal(resinResult.items[0].id, resinOffer.id)
    assert.equal(resinResult.items[0].categoryLabel, 'Resinas')
    await repo.deleteOffer(resinOffer.id)
    await repo.deleteProduct(resin.id)
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
