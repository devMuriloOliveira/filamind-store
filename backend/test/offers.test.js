import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createOffersServer } from '../src/server.js'
import { listPublicOffers } from '../src/catalog.js'
import { createLocalAdminAccess } from '../src/localAdmin.js'

async function withServer(authorizeAdmin, run, localAdminAccess = null) {
  const directory = await mkdtemp(path.join(tmpdir(), 'filamind-offers-test-'))
  const catalogPath = path.join(directory, 'catalog.json')
  await writeFile(catalogPath, JSON.stringify({ version: 1, products: [], offers: [] }))
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Filamind test</title>')
  const server = createOffersServer({ catalogPath, uploadsPath: path.join(directory, 'images'), authorizeAdmin, localAdminAccess, frontendPath: directory })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = async (route, method = 'GET', body, token = 'test-admin') => {
    const response = await fetch(base + route, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, body: await response.json() }
  }
  try { await run(call, base) }
  finally {
    await new Promise((resolve) => server.close(resolve))
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unsafe test cleanup path')
    await rm(directory, { recursive: true, force: true })
  }
}

const product = { name: 'Peça 3D de teste', description: 'Descrição de teste', category: 'Peças de reposição', keywords: ['bico'], imageUrl: '', imageRightsSource: '', featured: false, active: true }
const offer = (productId, marketplace, affiliateUrl) => ({ productId, marketplace, affiliateUrl, affiliateConfirmed: true, active: true, priceCents: null, availability: 'unknown' })

test('public catalog starts empty and admin routes fail closed without integration', async () => {
  await withServer(null, async (call) => {
    const publicResult = await call('/api/offers')
    assert.equal(publicResult.status, 200)
    assert.deepEqual(publicResult.body.items, [])
    assert.equal(publicResult.body.total, 0)
    assert.equal((await call('/api/admin/catalog')).status, 503)
    assert.equal((await call('/api/admin/products', 'POST', product)).status, 503)
    assert.equal((await call('/admin/ofertas/')).status, 404)
  })
})

test('local admin requires a generated code, loopback origin and a temporary session', async () => {
  assert.throws(() => createLocalAdminAccess('0.0.0.0'))
  const localAdminAccess = createLocalAdminAccess()
  await withServer(null, async (_call, base) => {
    const origin = base
    const request = async (route, { method = 'GET', body, cookie = '', includeOrigin = false } = {}) => {
      const response = await fetch(base + route, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(includeOrigin ? { Origin: origin } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      return { response, body: await response.json() }
    }
    const status = await request('/api/admin/status')
    assert.equal(status.response.status, 401)
    assert.deepEqual(status.body, { authorized: false, localLogin: true, localAdmin: true })
    const spoofedHost = await new Promise((resolve, reject) => {
      const request = http.get(base + '/api/admin/status', { headers: { Host: 'example.invalid' } }, (response) => {
        response.resume()
        response.on('end', () => resolve(response.statusCode))
      })
      request.on('error', reject)
    })
    assert.equal(spoofedHost, 404)
    const canonical = await fetch(base + '/admin/ofertas', { redirect: 'manual' })
    assert.equal(canonical.status, 301)
    assert.equal(canonical.headers.get('location'), '/admin/ofertas/')
    assert.equal((await request('/api/admin/catalog')).response.status, 401)
    assert.equal((await request('/api/admin/products', { method: 'POST', body: product, includeOrigin: true })).response.status, 401)
    assert.equal((await request('/api/admin/login', { method: 'POST', body: { code: localAdminAccess.code } })).response.status, 403)
    assert.equal((await request('/api/admin/login', { method: 'POST', body: { code: 'wrong' }, includeOrigin: true })).response.status, 401)

    const login = await request('/api/admin/login', { method: 'POST', body: { code: localAdminAccess.code }, includeOrigin: true })
    assert.equal(login.response.status, 200)
    const setCookie = login.response.headers.get('set-cookie')
    assert.match(setCookie, /HttpOnly; SameSite=Strict; Max-Age=28800/)
    const cookie = setCookie.split(';')[0]
    assert.equal((await request('/api/admin/catalog', { cookie })).response.status, 200)
    assert.equal((await request('/api/admin/status', { cookie })).response.status, 200)
    assert.equal((await request('/api/admin/products', { method: 'POST', body: product, cookie })).response.status, 403)
    const hostileOrigin = await fetch(base + '/api/admin/products', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://example.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify(product) })
    assert.equal(hostileOrigin.status, 403)
    assert.equal((await request('/api/admin/products', { method: 'POST', body: product, cookie, includeOrigin: true })).response.status, 201)
    assert.equal((await request('/api/offers')).body.total, 0)

    const page = await fetch(base + '/admin/ofertas/', { headers: { Cookie: cookie } })
    assert.equal(page.status, 200)
    assert.match(await page.text(), /Filamind test/)
    assert.equal((await request('/api/admin/logout', { method: 'POST', cookie, includeOrigin: true })).response.status, 200)
    assert.equal((await request('/api/admin/catalog', { cookie })).response.status, 401)
  }, localAdminAccess)
})

test('admin validation, public filters, prices and soft removal', async () => {
  await withServer(async (req) => req.headers.authorization === 'Bearer test-admin', async (call) => {
    assert.equal((await call('/api/admin/status', 'GET', null, 'other')).status, 403)
    const created = await call('/api/admin/products', 'POST', product)
    assert.equal(created.status, 201)
    const id = created.body.id
    const badLink = await call('/api/admin/offers', 'POST', offer(id, 'shopee', 'https://evil.example/'))
    assert.equal(badLink.status, 400)
    const badProtocol = await call('/api/admin/offers', 'POST', offer(id, 'shopee', 'http://shopee.com.br/item'))
    assert.equal(badProtocol.status, 400)
    const ml = await call('/api/admin/offers', 'POST', offer(id, 'mercado_livre', 'https://www.mercadolivre.com.br/test?affiliate=test'))
    assert.equal(ml.status, 201)
    const amazonPrice = await call('/api/admin/offers', 'POST', { ...offer(id, 'amazon', 'https://www.amazon.com.br/test?tag=test'), priceCents: 1000, priceDisplayAuthorized: true, priceSource: 'Test', priceUpdatedAt: new Date().toISOString() })
    assert.equal(amazonPrice.status, 400)
    const amazon = await call('/api/admin/offers', 'POST', offer(id, 'amazon', 'https://www.amazon.com.br/test?tag=test'))
    assert.equal(amazon.status, 201)
    const shopee = await call('/api/admin/offers', 'POST', { ...offer(id, 'shopee', 'https://s.shopee.com.br/test'), priceCents: 12345, priceDisplayAuthorized: true, priceSource: 'Fonte autorizada de teste', priceUpdatedAt: new Date().toISOString() })
    assert.equal(shopee.status, 201)

    const all = await call('/api/offers?sort=price_asc')
    assert.equal(all.body.total, 3)
    assert.equal(all.body.items[0].marketplace, 'shopee')
    assert.equal(all.body.items[0].priceCents, 12345)
    assert.equal(all.body.items[1].priceCents, null)
    assert.equal(all.body.hasAmazon, true)
    assert.equal((await call('/api/offers?marketplace=amazon')).body.total, 1)
    assert.equal((await call('/api/offers?q=bico')).body.total, 3)
    assert.equal((await call('/api/offers?category=Filamentos')).body.total, 0)
    assert.equal((await call('/api/offers?minPrice=10000&maxPrice=13000')).body.total, 1)
    assert.equal((await call('/api/offers?page=99')).body.page, 1)
    assert.equal((await call('/api/offers?marketplace=unknown')).status, 400)

    const record = (await call('/api/admin/catalog')).body
    const stale = listPublicOffers(record, new URLSearchParams('sort=price_asc'), Date.now() + 25 * 60 * 60 * 1000)
    assert.equal(stale.items.find((item) => item.marketplace === 'shopee').priceCents, null)
    assert.equal((await call(`/api/admin/products/${id}`, 'DELETE')).status, 200)
    assert.equal((await call('/api/offers')).body.total, 0)
  })
})

test('image upload checks type and size under admin authorization', async () => {
  await withServer(async (req) => req.headers.authorization === 'Bearer test-admin', async (call) => {
    const invalid = await call('/api/admin/images', 'POST', { mime: 'image/png', dataBase64: Buffer.from('not an image').toString('base64'), rightsSource: 'Imagem própria' })
    assert.equal(invalid.status, 400)
    const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7J8AAAAASUVORK5CYII=', 'base64')
    const uploaded = await call('/api/admin/images', 'POST', { mime: 'image/png', dataBase64: tinyPng.toString('base64'), rightsSource: 'Imagem própria' })
    assert.equal(uploaded.status, 201)
    assert.match(uploaded.body.imageUrl, /^\/offer-images\/[a-f0-9-]{36}\.png$/)
  })
})

test('pagination returns twelve offers per page without dropping the next page', () => {
  const now = new Date().toISOString()
  const productId = '11111111-1111-4111-8111-111111111111'
  const data = {
    products: [{ ...product, id: productId, createdAt: now, updatedAt: now }],
    offers: Array.from({ length: 13 }, (_, index) => ({
      ...offer(productId, 'shopee', `https://s.shopee.com.br/test-${index}`),
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      createdAt: now,
    })),
  }
  const first = listPublicOffers(data, new URLSearchParams('page=1'))
  const second = listPublicOffers(data, new URLSearchParams('page=2'))
  assert.equal(first.total, 13)
  assert.equal(first.pages, 2)
  assert.equal(first.items.length, 12)
  assert.equal(second.items.length, 1)
  assert.notEqual(first.items[0].id, second.items[0].id)
  data.offers[0].affiliateUrl = 'javascript:alert(1)'
  assert.equal(listPublicOffers(data, new URLSearchParams()).total, 12)
})

test('admin prevents duplicate products and links while preserving edits', async () => {
  await withServer(async (req) => req.headers.authorization === 'Bearer test-admin', async (call) => {
    const first = await call('/api/admin/products', 'POST', product)
    assert.equal(first.status, 201)
    assert.equal((await call('/api/admin/products', 'POST', { ...product, name: '  PEÇA   3D DE TESTE  ' })).status, 409)
    const other = await call('/api/admin/products', 'POST', { ...product, name: 'Outro produto' })
    assert.equal(other.status, 201)
    assert.equal((await call(`/api/admin/products/${other.body.id}`, 'PUT', { ...product, name: 'peça 3d de teste' })).status, 409)
    const url = 'https://s.shopee.com.br/test?affiliate=real-test'
    const firstOffer = await call('/api/admin/offers', 'POST', offer(first.body.id, 'shopee', url))
    assert.equal(firstOffer.status, 201)
    assert.equal((await call('/api/admin/offers', 'POST', offer(other.body.id, 'shopee', url))).status, 409)
    assert.equal((await call(`/api/admin/offers/${firstOffer.body.id}`, 'PUT', { ...firstOffer.body, active: false })).status, 200)
    const saved = await call(`/api/admin/offers/${firstOffer.body.id}`)
    assert.equal(saved.body.affiliateUrl, url)
    assert.equal(saved.body.active, false)
    await call(`/api/admin/products/${first.body.id}`, 'DELETE')
    assert.equal((await call('/api/admin/summary')).body.byMarketplace.shopee, 0)
  })
})

test('admin lists pages and counts actual records without sending the full catalog', async () => {
  await withServer(async (req) => req.headers.authorization === 'Bearer test-admin', async (call) => {
    const main = await call('/api/admin/products', 'POST', product)
    for (let index = 0; index < 21; index++) {
      assert.equal((await call('/api/admin/products', 'POST', { ...product, name: `Produto ${index}` })).status, 201)
    }
    assert.equal((await call('/api/admin/offers', 'POST', offer(main.body.id, 'shopee', 'https://s.shopee.com.br/test'))).status, 201)
    const first = await call('/api/admin/products?page=1')
    const second = await call('/api/admin/products?page=2')
    assert.equal(first.body.total, 22)
    assert.equal(first.body.items.length, 20)
    assert.equal(second.body.items.length, 2)
    assert.equal((await call('/api/admin/products?q=produto%2020')).body.total, 1)
    const summary = await call('/api/admin/summary')
    assert.equal(summary.body.products, 22)
    assert.equal(summary.body.offers, 1)
    assert.equal(summary.body.byMarketplace.shopee, 1)
    assert.equal(summary.body.productsWithoutImage, 22)
    assert.equal(summary.body.offersWithoutPrice, 1)
    assert.equal((await call('/api/admin/products?page=0')).status, 400)
  })
})

test('local login limits repeated invalid codes', () => {
  const access = createLocalAdminAccess()
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(access.login('wrong'), '')
  assert.equal(access.isRateLimited(), true)
  assert.equal(access.login(access.code), '')
})

test('recent order follows creation time and malformed price dates stay hidden', () => {
  const firstId = '11111111-1111-4111-8111-111111111111'
  const secondId = '22222222-2222-4222-8222-222222222222'
  const data = {
    products: [
      { ...product, id: firstId, name: 'Antigo destacado', featured: true },
      { ...product, id: secondId, name: 'Novo produto' },
    ],
    offers: [
      { ...offer(firstId, 'shopee', 'https://s.shopee.com.br/old'), id: firstId, createdAt: '2026-01-01T00:00:00Z', priceCents: 999, priceDisplayAuthorized: true, priceUpdatedAt: 'not-a-date' },
      { ...offer(secondId, 'shopee', 'https://s.shopee.com.br/new'), id: secondId, createdAt: '2026-02-01T00:00:00Z' },
    ],
  }
  const result = listPublicOffers(data, new URLSearchParams('sort=recent'))
  assert.equal(result.items[0].name, 'Novo produto')
  assert.equal(result.items[1].priceCents, null)
  assert.equal(result.hasPrices, false)
})
