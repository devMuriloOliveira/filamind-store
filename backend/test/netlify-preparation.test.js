import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createConfiguredOffersServer } from '../src/server.js'

test('Netlify SPA rewrites leave the API and image routes to the Node server', async () => {
  const redirects = await readFile(new URL('../../frontend/public/_redirects', import.meta.url), 'utf8')
  const rules = redirects.split(/\r?\n/).map((line) => line.trim().split(/\s+/)).filter((parts) => parts.length === 3)
  assert.equal(rules.some(([from]) => from === '/*'), false)
  for (const route of ['/api/offers', '/api/admin/status', '/api/admin/login', '/offer-images/example.png']) {
    assert.equal(rules.some(([from]) => from === route || from === '/*'), false, route)
  }
  for (const route of ['/ofertas/', '/admin/ofertas/', '/privacidade/', '/termos/', '/cookies/', '/reembolso/']) {
    assert.equal(rules.some(([from, to, code]) => from === route && to === '/index.html' && code === '200'), true, route)
  }
  const headers = await readFile(new URL('../../frontend/public/_headers', import.meta.url), 'utf8')
  assert.match(headers, /\/index\.html\s+Cache-Control: no-store/)
  assert.match(headers, /\/admin\/ofertas\/\s+Cache-Control: no-store/)
})

test('configured Node server restarts with isolated local data and keeps admin API closed', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'filamind-netlify-test-'))
  assert.equal((await realpath(directory)).startsWith(await realpath(os.tmpdir())), true)
  try {
    const catalogPath = path.join(directory, 'catalog.json')
    await writeFile(catalogPath, JSON.stringify({ version: 1, products: [], offers: [] }))
    await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Filamind test</title>')

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { server } = await createConfiguredOffersServer({}, { catalogPath, uploadsPath: directory, frontendPath: directory })
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
      try {
        const base = `http://127.0.0.1:${server.address().port}`
        const offers = await fetch(`${base}/api/offers`)
        assert.equal(offers.status, 200)
        assert.match(offers.headers.get('content-type'), /application\/json/)
        assert.equal(offers.headers.get('cache-control'), 'no-store')
        const admin = await fetch(`${base}/api/admin/status`, { headers: { 'X-Forwarded-For': '203.0.113.8' } })
        assert.equal(admin.status, 503)
        assert.equal(admin.headers.get('cache-control'), 'no-store')
        assert.equal((await fetch(`${base}/admin/ofertas/`)).status, 404)
        assert.equal((await fetch(`${base}/ofertas/`)).status, 200)
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
