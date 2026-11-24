import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createOffersServer } from '../src/server.js'
import { createSupabaseImageStorage } from '../src/supabaseImageStorage.js'
import { prepareCatalogImport } from '../scripts/import-catalog.js'
import { syncImages } from '../scripts/sync-images.js'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7J8AAAAASUVORK5CYII=', 'base64')
const jpeg = Buffer.from([255, 216, 255, 217])
const webp = Buffer.from('RIFF\0\0\0\0WEBP', 'binary')
const settings = { projectUrl: 'https://demo.supabase.co', bucket: 'offers', secretKey: 'sb_secret_test' }

function fakeStorage() {
  const objects = new Map()
  const requests = []
  let failUploads = false
  const fetchImpl = async (url, options) => {
    const address = new URL(url)
    const prefix = '/storage/v1/object/'
    assert.equal(address.origin, settings.projectUrl)
    assert.ok(address.pathname.startsWith(prefix))
    const name = address.pathname.slice(address.pathname.lastIndexOf('/') + 1)
    requests.push({ method: options.method, headers: options.headers || {}, name })
    if (options.method === 'POST') {
      assert.equal(options.headers.apikey, settings.secretKey)
      assert.equal(options.headers['x-upsert'], 'false')
      assert.equal(address.pathname, `${prefix}offers/${name}`)
      if (failUploads) return new Response('', { status: 503 })
      if (objects.has(name)) return new Response('', { status: 400 })
      objects.set(name, Buffer.from(options.body))
      return new Response('{}', { status: 200 })
    }
    assert.equal(address.pathname, `${prefix}public/offers/${name}`)
    assert.equal(options.headers?.apikey, undefined)
    if (!objects.has(name)) return options.method === 'HEAD'
      ? new Response(null, { status: 400 })
      : new Response(JSON.stringify({ code: 'NoSuchKey' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    return options.method === 'HEAD' ? new Response(null, { status: 200 }) : new Response(objects.get(name), { status: 200 })
  }
  return { objects, requests, fetchImpl, fail: () => { failUploads = true } }
}

test('Supabase Storage backend keeps local image URLs and does not expose the secret on reads', async () => {
  const remote = fakeStorage()
  const storage = createSupabaseImageStorage({ ...settings, fetchImpl: remote.fetchImpl })
  const directory = await mkdtemp(path.join(tmpdir(), 'filamind-supabase-image-'))
  const catalogPath = path.join(directory, 'catalog.json')
  await writeFile(catalogPath, JSON.stringify({ version: 1, products: [], offers: [] }))
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Test</title>')
  const server = createOffersServer({ catalogPath, imageStorage: storage, authorizeAdmin: (req) => req.headers.authorization === 'Bearer test-admin', frontendPath: directory })
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    const call = (route, method, body) => fetch(base + route, { method, headers: { Authorization: 'Bearer test-admin', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const upload = async (mime, data) => {
      const response = await call('/api/admin/images', 'POST', { mime, dataBase64: data.toString('base64'), rightsSource: 'Imagem própria' })
      assert.equal(response.status, 201)
      return (await response.json()).imageUrl
    }
    const firstUrl = await upload('image/png', png)
    const created = await call('/api/admin/products', 'POST', { name: 'Produto de teste', description: '', category: 'Filamentos', keywords: [], imageUrl: firstUrl, imageRightsSource: 'Imagem própria', featured: false, active: true })
    assert.equal(created.status, 201)
    const product = await created.json()
    const offer = await call('/api/admin/offers', 'POST', { productId: product.id, marketplace: 'shopee', affiliateUrl: 'https://s.shopee.com.br/test', affiliateConfirmed: true, active: true, priceCents: null, availability: 'unknown' })
    assert.equal(offer.status, 201)
    assert.equal((await (await fetch(base + '/api/offers')).json()).items[0].imageUrl, firstUrl)
    const firstImage = await fetch(base + firstUrl)
    assert.equal(firstImage.headers.get('content-type'), 'image/png')
    assert.deepEqual(Buffer.from(await firstImage.arrayBuffer()), png)
    const secondUrl = await upload('image/jpeg', jpeg)
    const edited = await call(`/api/admin/products/${product.id}`, 'PUT', { ...product, imageUrl: secondUrl })
    assert.equal(edited.status, 200)
    assert.equal((await (await fetch(base + '/api/offers')).json()).items[0].imageUrl, secondUrl)
    assert.equal((await fetch(base + secondUrl)).headers.get('content-type'), 'image/jpeg')
    const thirdUrl = await upload('image/webp', webp)
    assert.equal((await fetch(base + thirdUrl)).headers.get('content-type'), 'image/webp')
    const beforeRejected = remote.requests.length
    const tooLarge = await call('/api/admin/images', 'POST', { mime: 'image/png', dataBase64: Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]).toString('base64'), rightsSource: 'Imagem própria' })
    assert.equal(tooLarge.status, 400)
    assert.equal(remote.requests.length, beforeRejected)
    remote.fail()
    const failed = await call('/api/admin/images', 'POST', { mime: 'image/png', dataBase64: png.toString('base64'), rightsSource: 'Imagem própria' })
    assert.equal(failed.status, 503)
    assert.equal((await (await fetch(base + '/api/offers')).json()).items[0].imageUrl, secondUrl)
    assert.equal(JSON.parse(await readFile(catalogPath, 'utf8')).products[0].imageUrl, secondUrl)
    assert.equal(remote.requests.filter((request) => request.method === 'POST').length, 4)
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve))
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unsafe test cleanup path')
    await rm(directory, { recursive: true, force: true })
  }
})

test('image copy verifies existing objects and refuses to overwrite different content', async () => {
  const remote = fakeStorage()
  const storage = createSupabaseImageStorage({ ...settings, fetchImpl: remote.fetchImpl })
  const directory = await mkdtemp(path.join(tmpdir(), 'filamind-supabase-copy-'))
  const name = '11111111-1111-4111-8111-111111111111.png'
  const catalogPath = path.join(directory, 'catalog.json')
  try {
    await writeFile(path.join(directory, name), png)
    await writeFile(catalogPath, JSON.stringify({ version: 1, products: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Produto de teste', description: '', category: 'Filamentos', keywords: [], imageUrl: `/offer-images/${name}`, imageRightsSource: 'Imagem própria', featured: false, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }], offers: [] }))
    const plan = await prepareCatalogImport(catalogPath, directory)
    assert.deepEqual(await syncImages(plan, directory, storage), { uploaded: 1, verified: 0 })
    assert.deepEqual(await syncImages(plan, directory, storage), { uploaded: 0, verified: 1 })
    remote.objects.set(name, jpeg)
    await assert.rejects(syncImages(plan, directory, storage), /Imagem remota diferente/)
    assert.deepEqual(remote.objects.get(name), jpeg)
  } finally {
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unsafe test cleanup path')
    await rm(directory, { recursive: true, force: true })
  }
})

test('Supabase Storage configuration rejects unsafe endpoints and public keys', () => {
  assert.throws(() => createSupabaseImageStorage({ ...settings, projectUrl: 'http://demo.supabase.co' }), /SUPABASE_URL/)
  assert.throws(() => createSupabaseImageStorage({ ...settings, projectUrl: 'https://other.example.com' }), /SUPABASE_URL/)
  assert.throws(() => createSupabaseImageStorage({ ...settings, secretKey: 'sb_publishable_test' }), /SUPABASE_SECRET_KEY/)
})
