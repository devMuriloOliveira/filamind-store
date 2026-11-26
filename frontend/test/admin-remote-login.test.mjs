import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { createOffersServer } from '../../backend/src/server.js'
import { createAdminAuth, createFirstAdmin } from '../../backend/src/adminAuth.js'

function authStore() {
  const users = new Map()
  const sessions = new Map()
  const events = []
  return {
    events,
    async createFirstAdmin(email, passwordHash) {
      const id = randomUUID()
      users.set(email, { id, passwordHash, active: true })
      return id
    },
    async findUser(email) { return users.get(email) || null },
    async reserveAttempt() { return true },
    async createSession({ userId, tokenHash, csrfToken, expiresAt }) {
      sessions.set(tokenHash, { userId, csrfToken, expiresAt })
    },
    async findSession(tokenHash, now) {
      const session = sessions.get(tokenHash)
      return session && !session.revoked && session.expiresAt > now
        ? { userId: session.userId, csrfToken: session.csrfToken } : null
    },
    async revokeSession(tokenHash) {
      const session = sessions.get(tokenHash)
      if (session) session.revoked = true
      return Boolean(session)
    },
    async recordAudit(actorId, action) { events.push({ actorId, action }) },
  }
}

test('remote login protects admin navigation and keeps catalog editing behind cookie and CSRF', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'filamind-remote-login-'))
  const catalogPath = path.join(directory, 'catalog.json')
  await writeFile(catalogPath, JSON.stringify({ version: 1, products: [], offers: [] }))
  const store = authStore()
  const email = 'admin@example.invalid'
  const password = 'Senha ficticia segura 2026!'
  await createFirstAdmin(store, email, password)
  const holder = {}
  const server = createOffersServer({ catalogPath, uploadsPath: path.join(directory, 'images'), adminAuth: holder, frontendPath: path.resolve('dist') })
  let browser
  let now = Date.now()
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    Object.assign(holder, createAdminAuth({ store, origin: base, now: () => now, production: false }))
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    page.setDefaultTimeout(5000)
    const pageErrors = []
    const csrfHeaders = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('request', (request) => {
      if (/\/api\/admin\/(products|offers)(?:\/|$)/.test(request.url()) && ['POST', 'PUT', 'DELETE'].includes(request.method())) {
        csrfHeaders.push(request.headers()['x-csrf-token']?.length === 43)
      }
    })

    assert.equal((await page.goto(base + '/admin/ofertas/')).status(), 200)
    await page.getByRole('heading', { name: 'Acesso administrativo' }).waitFor()
    assert.equal(await page.getByRole('heading', { name: 'Novo produto' }).count(), 0)
    await mkdir('test-results', { recursive: true })
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `login overflow at ${width}px`)
      assert.equal(await page.getByRole('button', { name: 'Entrar' }).isVisible(), true)
      if (width !== 320) await page.screenshot({ path: `test-results/admin-login-${width}.png`, fullPage: true })
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: 'Entrar' }).click()
    await page.getByText('Informe um e-mail válido.').waitFor()
    await page.getByLabel('E-mail').fill('invalido')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await page.getByText('Informe um e-mail válido.').waitFor()
    await page.getByLabel('E-mail').fill(email)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await page.getByText('Informe a senha.').waitFor()
    await page.getByLabel('Senha', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Mostrar senha' }).click()
    assert.equal(await page.getByLabel('Senha', { exact: true }).getAttribute('type'), 'text')
    await page.getByRole('button', { name: 'Ocultar senha' }).click()
    assert.equal(await page.getByLabel('Senha', { exact: true }).getAttribute('type'), 'password')
    await page.getByLabel('Senha', { exact: true }).fill('senha incorreta')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await page.getByText('Credenciais inválidas.').waitFor()
    await page.getByLabel('Senha', { exact: true }).fill(password)
    await page.route('**/api/admin/login', (route) => route.abort())
    await page.getByRole('button', { name: 'Entrar' }).click()
    await page.getByText('Falha de conexão. Confira o servidor e tente novamente.').waitFor()
    await page.unroute('**/api/admin/login')
    await page.route('**/api/admin/login', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 350))
      await route.continue()
    })
    await page.getByRole('button', { name: 'Entrar' }).click()
    await page.getByRole('button', { name: 'Entrando…' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Entrando…' }).isDisabled(), true)
    await page.getByRole('heading', { name: 'Nova oferta' }).waitFor()
    await page.unroute('**/api/admin/login')
    assert.equal((await page.context().cookies(base)).some((cookie) => cookie.name === 'filamind_admin_dev' && cookie.httpOnly && cookie.sameSite === 'Strict'), true)
    assert.equal(await page.evaluate(() => document.cookie.includes('filamind_admin_dev')), false)
    assert.equal(await page.evaluate(async () => (await fetch('/api/admin/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status), 403)

    await page.locator('.admin-offers-advanced summary').click()
    await page.getByRole('button', { name: 'Produto avulso' }).click()
    await page.locator('.admin-offers-forms form').getByLabel('Nome', { exact: true }).fill('Produto fictício de teste')
    await page.getByRole('button', { name: 'Salvar produto' }).click()
    await page.getByText('Produto salvo sem imagem.').waitFor()
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
    assert.equal(catalog.products.length, 1)
    await page.getByRole('button', { name: 'Oferta para produto existente' }).click()
    await page.locator('.admin-offers-forms form').last().locator('select').first().selectOption(catalog.products[0].id)
    await page.locator('.admin-offers-forms form').getByLabel('Link de afiliado HTTPS').fill('https://www.mercadolivre.com.br/teste?affiliate=ficcional')
    await page.getByLabel('Preço em R$ (opcional)').fill('12.34')
    await page.getByLabel('Tenho autorização para exibir este preço').check()
    await page.getByLabel('Origem do preço').fill('Fonte fictícia de teste')
    await page.getByRole('button', { name: 'Salvar oferta' }).click()
    assert.equal(await page.getByLabel('Atualizado em').evaluate((input) => input.checkValidity()), false)
    assert.equal(JSON.parse(await readFile(catalogPath, 'utf8')).offers.length, 0)
    await page.getByLabel('Atualizado em').fill('2025-02-03T09:30')
    assert.equal(await page.getByLabel('Atualizado em').inputValue(), '2025-02-03T09:30')
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.getByLabel('Preço em R$ (opcional)').isVisible(), true)
      assert.equal(await page.getByLabel('Atualizado em').isVisible(), true)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `offer form overflow at ${width}px`)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: 'Salvar oferta' }).click()
    await page.getByText('Oferta salva.').waitFor()
    const savedOffer = JSON.parse(await readFile(catalogPath, 'utf8')).offers[0]
    assert.equal(savedOffer.priceCents, 1234)
    assert.equal(savedOffer.priceDisplayAuthorized, true)
    assert.equal(savedOffer.priceSource, 'Fonte fictícia de teste')
    assert.equal(savedOffer.priceUpdatedAt, await page.evaluate(() => new Date(2025, 1, 3, 9, 30).toISOString()))
    await page.locator('.admin-offers-list ul').last().getByRole('button', { name: 'Editar' }).click()
    await page.locator('.admin-offers-forms form').getByLabel('Link de afiliado HTTPS').fill('https://www.mercadolivre.com.br/teste-editado?affiliate=ficcional')
    await page.getByRole('button', { name: 'Salvar oferta' }).click()
    await page.getByText('Oferta salva.').waitFor()
    page.once('dialog', (dialog) => dialog.accept())
    await page.locator('.admin-offers-list ul').last().getByRole('button', { name: 'Remover' }).click()
    await page.getByText('Registro removido da vitrine.').waitFor()
    assert.equal(csrfHeaders[0], false)
    assert.equal(csrfHeaders.length >= 4 && csrfHeaders.slice(1).every(Boolean), true)

    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `admin overflow at ${width}px`)
      assert.equal(await page.getByRole('button', { name: 'Sair da conta' }).isVisible(), true)
    }
    now += 8 * 60 * 60 * 1000 + 1
    await page.getByLabel('Buscar cadastrados').fill('expirado')
    await page.getByText('Sua sessão expirou. Entre novamente para continuar.').waitFor()
    await page.reload()
    await page.getByRole('heading', { name: 'Acesso administrativo' }).waitFor()
    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Senha', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await page.getByRole('heading', { name: 'Nova oferta' }).waitFor()
    await page.route('**/api/admin/summary', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Acesso negado."}' }))
    await page.reload()
    await page.getByText('Acesso negado.').waitFor()
    await page.unroute('**/api/admin/summary')
    await page.reload()
    await page.getByRole('heading', { name: 'Nova oferta' }).waitFor()
    await page.getByRole('button', { name: 'Sair da conta' }).click()
    await page.getByRole('heading', { name: 'Acesso administrativo' }).waitFor()
    await page.reload()
    await page.getByRole('heading', { name: 'Acesso administrativo' }).waitFor()
    assert.deepEqual(pageErrors, [])
  } finally {
    if (browser) await browser.close()
    if (server.listening) await new Promise((resolve) => server.close(resolve))
    if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unsafe test cleanup path')
    await rm(directory, { recursive: true, force: true })
  }
})
