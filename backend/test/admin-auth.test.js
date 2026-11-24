import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createAdminAuth, createFirstAdmin, verifyAdminPassword } from '../src/adminAuth.js'
import { createOffersServer } from '../src/server.js'

const password = 'Uma frase longa e única 2026!'
const email = 'admin@example.com'
const product = { name: 'Produto autenticado de teste', description: '', category: 'Filamentos', keywords: [],
  imageUrl: '', imageRightsSource: '', featured: false, active: true }
const hash = (value) => createHash('sha256').update(value).digest('hex')

function memoryStore() {
  const users = new Map(), sessions = new Map(), attempts = new Map(), events = []
  return {
    users, sessions, attempts, events,
    async createFirstAdmin(emailKey, passwordHash) {
      if (users.size) throw new Error('Já existe um administrador. Nenhuma conta foi criada.')
      const id = randomUUID()
      users.set(emailKey, { id, passwordHash, active: true })
      events.push({ action: 'first_admin_created', actorId: id })
      return id
    },
    async findUser(emailKey) { return users.get(emailKey) || null },
    async reserveAttempt(keyHash, limit, now) {
      let attempt = attempts.get(keyHash)
      if (attempt?.lockedUntil && attempt.lockedUntil > now.getTime()) return false
      if (!attempt || attempt.startedAt <= now.getTime() - 15 * 60 * 1000) {
        attempt = { failures: 1, startedAt: now.getTime(), lockedUntil: 0 }
      } else {
        attempt.failures++
        if (attempt.failures >= limit) attempt.lockedUntil = now.getTime() + 15 * 60 * 1000
      }
      attempts.set(keyHash, attempt)
      return !attempt.lockedUntil
    },
    async createSession({ userId, tokenHash, csrfToken, expiresAt, attemptKeys }) {
      sessions.set(tokenHash, { userId, csrfToken, expiresAt: expiresAt.getTime(), revoked: false })
      for (const key of attemptKeys) attempts.delete(key)
      events.push({ action: 'login_success', actorId: userId })
    },
    async findSession(tokenHash, now) {
      const session = sessions.get(tokenHash)
      if (!session || session.revoked || session.expiresAt <= now.getTime()) return null
      const user = [...users.values()].find((item) => item.id === session.userId)
      return user?.active ? { userId: session.userId, csrfToken: session.csrfToken } : null
    },
    async revokeSession(tokenHash) {
      const session = sessions.get(tokenHash)
      if (!session || session.revoked) return false
      session.revoked = true
      events.push({ action: 'logout', actorId: session.userId })
      return true
    },
    async recordAudit(actorId, action, targetType, targetId, details) {
      events.push({ actorId, action, targetType, targetId, details })
    },
  }
}

test('first administrator is validated, salted and cannot be created twice', async () => {
  const store = memoryStore()
  await assert.rejects(createFirstAdmin(store, email, 'short'), /16 a 128/)
  const id = await createFirstAdmin(store, ' ADMIN@EXAMPLE.COM ', password)
  const saved = store.users.get(email)
  assert.equal(saved.id, id)
  assert.ok(saved.passwordHash.startsWith('scrypt$65536$8$2$'))
  assert.equal(saved.passwordHash.includes(password), false)
  assert.equal(await verifyAdminPassword(password, saved.passwordHash), true)
  assert.equal(await verifyAdminPassword('senha errada', saved.passwordHash), false)
  await assert.rejects(createFirstAdmin(store, email, password), /Já existe/)
  assert.equal(store.users.size, 1)
})

test('remote admin login, CSRF, session persistence, logout and expiry protect backend routes', async () => {
  const store = memoryStore()
  await createFirstAdmin(store, email, password)
  const directory = await mkdtemp(path.join(tmpdir(), 'filamind-admin-auth-'))
  const catalogPath = path.join(directory, 'catalog.json')
  await writeFile(catalogPath, JSON.stringify({ version: 1, products: [], offers: [] }))
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Admin test</title>')
  const holder = {}
  const server = createOffersServer({ catalogPath, frontendPath: directory, adminAuth: holder })
  let now = Date.now()
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    Object.assign(holder, createAdminAuth({ store, origin: base, now: () => now, production: false }))
    const call = async (route, { method = 'GET', body, cookie = '', origin = '', csrf = '' } = {}) => {
      const response = await fetch(base + route, { method, headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}),
        ...(origin ? { Origin: origin } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      }, body: body ? JSON.stringify(body) : undefined })
      return { status: response.status, headers: response.headers, body: await response.json() }
    }
    assert.equal((await call('/api/offers')).status, 200)
    assert.equal((await call('/api/admin/status')).status, 401)
    assert.equal((await call('/api/admin/products', { method: 'POST', body: product })).status, 401)
    const loginPage = await fetch(base + '/admin/ofertas/')
    assert.equal(loginPage.status, 200)
    assert.equal(loginPage.headers.get('cache-control'), 'no-store')
    assert.equal((await call('/api/admin/login', { method: 'POST', body: { email, password } })).status, 403)
    assert.equal((await call('/api/admin/login', { method: 'POST', body: { email, password }, origin: 'https://other.example' })).status, 403)
    assert.equal((await call('/api/admin/login', { method: 'POST', body: { email, password: 'incorreta' }, origin: base })).status, 401)
    assert.equal((await call('/api/admin/login', { method: 'POST', body: { email: 'unknown@example.com', password }, origin: base })).status, 401)
    const login = await call('/api/admin/login', { method: 'POST', body: { email, password }, origin: base })
    assert.equal(login.status, 200)
    assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Max-Age=28800/)
    assert.equal(login.headers.get('set-cookie').includes('Secure'), false)
    const cookie = login.headers.get('set-cookie').split(';')[0]
    assert.equal(cookie.includes(password), false)
    assert.equal([...store.sessions.keys()].includes(cookie.split('=')[1]), false)
    const status = await call('/api/admin/status', { cookie })
    assert.equal(status.status, 200)
    assert.equal(status.body.csrfToken, login.body.csrfToken)
    assert.equal((await call('/api/admin/summary', { cookie })).status, 200)
    assert.equal((await fetch(base + '/admin/ofertas/', { headers: { Cookie: cookie } })).status, 200)
    const secondInstance = createAdminAuth({ store, origin: base, now: () => now, production: false })
    assert.ok(await secondInstance.authorize({ headers: { cookie }, socket: {} }))
    assert.equal((await call('/api/admin/products', { method: 'POST', body: product, cookie })).status, 403)
    assert.equal((await call('/api/admin/products', { method: 'POST', body: product, cookie, origin: base })).status, 403)
    assert.equal((await call('/api/admin/products', { method: 'POST', body: product, cookie, origin: base, csrf: 'invalid' })).status, 403)
    assert.equal((await call('/api/admin/products', { method: 'POST', body: product, cookie, origin: 'https://other.example', csrf: login.body.csrfToken })).status, 403)
    const crossSite = await fetch(base + '/api/admin/products', { method: 'POST', headers: {
      Cookie: cookie, Origin: base, 'Sec-Fetch-Site': 'cross-site', 'X-CSRF-Token': login.body.csrfToken,
      'Content-Type': 'application/json',
    }, body: JSON.stringify(product) })
    assert.equal(crossSite.status, 403)
    const created = await call('/api/admin/products', { method: 'POST', body: product, cookie, origin: base, csrf: login.body.csrfToken })
    assert.equal(created.status, 201)
    assert.equal((await call('/api/admin/offers', { method: 'POST', body: {}, cookie, origin: base })).status, 403)
    assert.equal((await call('/api/admin/images', { method: 'POST', body: {}, cookie, origin: base })).status, 403)
    assert.equal((await call(`/api/admin/products/${created.body.id}`, { method: 'PUT', body: product, cookie, origin: base })).status, 403)
    assert.equal((await call(`/api/admin/products/${created.body.id}`, { method: 'DELETE', cookie, origin: base })).status, 403)
    assert.equal(store.events.filter((item) => item.action === 'admin_write_attempt').length, 1)
    assert.equal((await call('/api/admin/logout', { method: 'POST', cookie, origin: base })).status, 403)
    const logout = await call('/api/admin/logout', { method: 'POST', cookie, origin: base, csrf: login.body.csrfToken })
    assert.equal(logout.status, 200)
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)
    assert.equal((await call('/api/admin/status', { cookie })).status, 401)
    assert.equal((await secondInstance.authorize({ headers: { cookie }, socket: {} })), null)
    const nextLogin = await call('/api/admin/login', { method: 'POST', body: { email, password }, origin: base })
    assert.equal(nextLogin.status, 200)
    const nextCookie = nextLogin.headers.get('set-cookie').split(';')[0]
    now += 8 * 60 * 60 * 1000 + 1
    assert.equal((await call('/api/admin/status', { cookie: nextCookie })).status, 401)
    assert.equal((await fetch(base + '/admin/ofertas/', { headers: { Cookie: nextCookie } })).status, 200)
    assert.ok(store.events.some((item) => item.action === 'login_failed'))
    assert.ok(store.events.some((item) => item.action === 'logout'))
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve))
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unsafe test cleanup path')
    await rm(directory, { recursive: true, force: true })
  }
})

test('login rate limit persists across auth instances and HTTPS sessions use Secure cookies', async () => {
  const store = memoryStore()
  await createFirstAdmin(store, email, password)
  let now = Date.now()
  const origin = 'https://store.example.com'
  const request = { headers: { origin, host: 'store.example.com' }, socket: { remoteAddress: '203.0.113.1' } }
  const auth = () => createAdminAuth({ store, origin, now: () => now, production: true })
  for (let index = 0; index < 4; index++) {
    assert.equal((await auth().login(request, { email, password: 'incorreta' })).status, 401)
  }
  assert.equal((await auth().login(request, { email, password })).status, 429)
  assert.equal((await auth().login(request, { email, password })).status, 429)
  now += 15 * 60 * 1000 + 1
  const login = await auth().login(request, { email, password })
  assert.equal(login.status, 200)
  assert.match(login.cookie, /^__Host-filamind_admin=/)
  assert.match(login.cookie, /; Secure$/)
  const token = login.cookie.split(';')[0].split('=')[1]
  assert.equal(store.sessions.has(token), false)
  assert.equal(store.sessions.has(hash(token)), true)
})

test('HTTPS proxy contract ignores forged forwarded headers and protects writes', async () => {
  const store = memoryStore()
  await createFirstAdmin(store, email, password)
  const directory = await mkdtemp(path.join(tmpdir(), 'filamind-https-proxy-'))
  await writeFile(path.join(directory, 'catalog.json'), JSON.stringify({ version: 1, products: [], offers: [] }))
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Admin test</title>')
  const origin = 'https://127.0.0.1:8443'
  let now = Date.now()
  const auth = createAdminAuth({ store, origin, now: () => now, production: true })
  const server = createOffersServer({ catalogPath: path.join(directory, 'catalog.json'), frontendPath: directory, adminAuth: auth })
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    const proxyHeaders = { Host: '127.0.0.1:8443', Origin: origin, 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': '127.0.0.1:8443', 'X-Forwarded-For': '203.0.113.7' }
    const call = (route, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
      const request = http.request(base + route, {
        method, headers: { ...proxyHeaders, ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      }, (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => resolve({
          status: response.statusCode,
          headers: { get: (name) => {
            const value = response.headers[name.toLowerCase()]
            return Array.isArray(value) ? value.join(', ') : value || null
          } },
          json: async () => JSON.parse(Buffer.concat(chunks).toString('utf8')),
        }))
      })
      request.on('error', reject)
      request.end(body ? JSON.stringify(body) : undefined)
    })
    assert.equal((await call('/api/admin/status')).status, 401)
    assert.equal((await call('/admin/ofertas/')).status, 200)
    assert.equal((await call('/api/admin/login', { method: 'POST', headers: { Origin: '' }, body: { email, password } })).status, 403)
    assert.equal((await call('/api/admin/login', { method: 'POST', headers: { Host: 'other.example' }, body: { email, password } })).status, 403)
    assert.equal((await call('/api/admin/login', { method: 'POST', headers: { Origin: 'https://other.example' }, body: { email, password } })).status, 403)
    const login = await call('/api/admin/login', { method: 'POST', headers: { 'X-Forwarded-Proto': 'http', 'X-Forwarded-Host': 'other.example' }, body: { email, password } })
    assert.equal(login.status, 200)
    assert.match(login.headers.get('set-cookie'), /^__Host-filamind_admin=.*; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800; Secure$/)
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const { csrfToken } = await login.json()
    assert.equal((await call('/api/admin/status', { headers: { Cookie: cookie } })).status, 200)
    assert.equal((await call('/api/admin/unknown', { method: 'POST', headers: { Cookie: cookie }, body: {} })).status, 403)
    assert.equal((await call('/api/admin/unknown', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken, Origin: 'https://other.example' }, body: {} })).status, 403)
    assert.equal((await call('/api/admin/unknown', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken, 'Sec-Fetch-Site': 'cross-site' }, body: {} })).status, 403)
    assert.equal((await call('/api/admin/unknown', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken }, body: {} })).status, 404)
    assert.equal((await call('/api/admin/logout', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken, Host: 'other.example' } })).status, 403)
    const logout = await call('/api/admin/logout', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken } })
    assert.equal(logout.status, 200)
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0; Secure$/)
    assert.equal((await call('/api/admin/status', { headers: { Cookie: cookie } })).status, 401)
    const second = await call('/api/admin/login', { method: 'POST', body: { email, password } })
    assert.equal(second.status, 200)
    now += 8 * 60 * 60 * 1000 + 1
    assert.equal((await call('/api/admin/status', { headers: { Cookie: second.headers.get('set-cookie').split(';')[0] } })).status, 401)
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve))
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unsafe test cleanup path')
    await rm(directory, { recursive: true, force: true })
  }
})

test('forwarded client IP cannot change the backend rate-limit identity', async () => {
  const store = memoryStore()
  await createFirstAdmin(store, email, password)
  const origin = 'https://127.0.0.1:8443'
  const auth = createAdminAuth({ store, origin, production: true })
  const request = (forwardedFor) => ({ headers: { origin, host: '127.0.0.1:8443', 'x-forwarded-for': forwardedFor }, socket: { remoteAddress: '127.0.0.1' } })
  assert.equal((await auth.login(request('203.0.113.1'), { email, password: 'incorreta' })).status, 401)
  assert.equal((await auth.login(request('198.51.100.1'), { email, password: 'incorreta' })).status, 401)
  assert.equal(store.attempts.size, 2)
  assert.deepEqual([...store.attempts.values()].map((item) => item.failures), [2, 2])
})
