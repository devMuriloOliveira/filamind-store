import { createHash, randomBytes, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const passwordCost = { N: 2 ** 16, r: 8, p: 2, maxmem: 128 * 1024 * 1024 }
const sessionDurationMs = 8 * 60 * 60 * 1000
const tokenPattern = /^[A-Za-z0-9_-]{43}$/
const digest = (value) => createHash('sha256').update(value).digest('hex')
const same = (left, right) => timingSafeEqual(
  createHash('sha256').update(String(left)).digest(),
  createHash('sha256').update(String(right)).digest(),
)

export function normalizeAdminEmail(value) {
  if (typeof value !== 'string') throw new Error('E-mail administrativo inválido.')
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]{1,64}@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email)) {
    throw new Error('E-mail administrativo inválido.')
  }
  return email
}

export function validateAdminPassword(password, email) {
  const accountName = email.split('@')[0]
  if (typeof password !== 'string' || password.length < 16 || password.length > 128 ||
      Buffer.byteLength(password, 'utf8') > 512 || /[\u0000-\u001f\u007f]/.test(password) ||
      new Set([...password]).size < 4 || (accountName.length >= 4 && password.toLowerCase().includes(accountName))) {
    throw new Error('Use uma senha única de 16 a 128 caracteres, sem caracteres de controle ou o e-mail.')
  }
}

export async function hashAdminPassword(password) {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, 64, passwordCost)
  return `scrypt$${passwordCost.N}$${passwordCost.r}$${passwordCost.p}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

export async function verifyAdminPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt' || Number(parts[1]) !== passwordCost.N ||
      Number(parts[2]) !== passwordCost.r || Number(parts[3]) !== passwordCost.p) return false
  const salt = Buffer.from(parts[4], 'base64url')
  const expected = Buffer.from(parts[5], 'base64url')
  if (salt.length !== 16 || expected.length !== 64) return false
  const actual = await scrypt(password, salt, 64, passwordCost)
  return timingSafeEqual(actual, expected)
}

export async function createFirstAdmin(store, email, password) {
  const emailKey = normalizeAdminEmail(email)
  validateAdminPassword(password, emailKey)
  const passwordHash = await hashAdminPassword(password)
  return store.createFirstAdmin(emailKey, passwordHash)
}

export function createAdminAuth({ store, origin, now = Date.now, production = process.env.NODE_ENV === 'production' }) {
  let parsed
  try { parsed = new URL(origin) } catch { throw new Error('FILAMIND_ADMIN_ORIGIN inválida.') }
  if (parsed.origin !== origin || parsed.username || parsed.password || parsed.hash || parsed.search ||
      !['http:', 'https:'].includes(parsed.protocol) ||
      (parsed.protocol === 'http:' && (production || parsed.hostname !== '127.0.0.1'))) {
    throw new Error('FILAMIND_ADMIN_ORIGIN exige HTTPS ou HTTP em 127.0.0.1 apenas no desenvolvimento.')
  }
  const secure = parsed.protocol === 'https:'
  const cookieName = secure ? '__Host-filamind_admin' : 'filamind_admin_dev'
  let dummyHashPromise
  const dummyHash = () => dummyHashPromise ||= hashAdminPassword(randomBytes(24).toString('base64url'))
  const cookie = (token, maxAge) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
  const cookieValue = (req) => {
    const matches = String(req.headers.cookie || '').split(';').map((part) => part.trim())
      .filter((part) => part.startsWith(`${cookieName}=`))
    return matches.length === 1 ? matches[0].slice(cookieName.length + 1) : ''
  }
  const sameOrigin = (req) => req.headers.origin === origin && req.headers.host === parsed.host &&
    (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin')

  return {
    sameOrigin,
    async login(req, input) {
      if (!sameOrigin(req)) return { status: 403 }
      const timestamp = new Date(now())
      const rawEmail = typeof input?.email === 'string' ? input.email.trim().toLowerCase().slice(0, 254) : ''
      let emailKey
      try { emailKey = normalizeAdminEmail(rawEmail) } catch { emailKey = null }
      const ipKey = digest(`ip:${String(req.socket.remoteAddress || '').slice(0, 100)}`)
      const accountKey = digest(`email:${rawEmail}`)
      if (!await store.reserveAttempt(ipKey, 30, timestamp) ||
          !await store.reserveAttempt(accountKey, 5, timestamp)) return { status: 429 }
      const user = emailKey ? await store.findUser(emailKey) : null
      const valid = await verifyAdminPassword(typeof input?.password === 'string' ? input.password : '',
        user?.active ? user.passwordHash : await dummyHash())
      if (!user?.active || !valid) {
        await store.recordAudit(user?.id || 'unknown', 'login_failed', 'admin_user', user?.id || null)
        return { status: 401 }
      }
      const token = randomBytes(32).toString('base64url')
      const csrfToken = randomBytes(32).toString('base64url')
      await store.createSession({ userId: user.id, tokenHash: digest(token), csrfToken,
        now: timestamp, expiresAt: new Date(timestamp.getTime() + sessionDurationMs), attemptKeys: [ipKey, accountKey] })
      return { status: 200, cookie: cookie(token, sessionDurationMs / 1000), csrfToken }
    },
    async authorize(req) {
      const token = cookieValue(req)
      if (!tokenPattern.test(token)) return null
      const tokenHash = digest(token)
      const session = await store.findSession(tokenHash, new Date(now()))
      return session ? { ...session, tokenHash } : null
    },
    validCsrf(req, session) {
      const header = req.headers['x-csrf-token']
      return Boolean(session && sameOrigin(req) && typeof header === 'string' &&
        tokenPattern.test(header) && same(header, session.csrfToken))
    },
    async logout(session) {
      await store.revokeSession(session.tokenHash, new Date(now()))
      return cookie('', 0)
    },
    async recordWriteAttempt(session, method, pathname) {
      const match = /^\/api\/admin\/(products|offers|images)(?:\/([a-f0-9-]{36}))?$/.exec(pathname)
      const targetType = match?.[1] || 'admin_route'
      const targetId = match?.[2] || null
      await store.recordAudit(session.userId, 'admin_write_attempt', targetType, targetId,
        { method, operation: targetType })
    },
  }
}
