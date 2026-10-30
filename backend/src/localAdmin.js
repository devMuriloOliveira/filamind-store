import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const cookieName = 'filamind_local_admin'
const sessionDurationMs = 8 * 60 * 60 * 1000
const digest = (value) => createHash('sha256').update(String(value)).digest()
const matches = (left, right) => timingSafeEqual(digest(left), digest(right))

export function createLocalAdminAccess(host = '127.0.0.1') {
  if (host !== '127.0.0.1' || process.env.NODE_ENV === 'production') {
    throw new Error('O acesso administrativo local exige 127.0.0.1 e ambiente de desenvolvimento.')
  }

  const code = randomBytes(24).toString('base64url')
  let session = ''
  let expiresAt = 0
  let failedLogins = 0
  let lockedUntil = 0

  const isLocalRequest = (req) => req.socket.remoteAddress === '127.0.0.1'
    && req.headers.host === `127.0.0.1:${req.socket.localPort}`
  const hasSameOrigin = (req) => req.headers.origin === `http://127.0.0.1:${req.socket.localPort}`
  const cookieValue = (req) => String(req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || ''

  return {
    code,
    isLocalRequest,
    hasSameOrigin,
    isRateLimited: () => Date.now() < lockedUntil,
    authorize(req) {
      return isLocalRequest(req) && Boolean(session) && Date.now() < expiresAt && matches(cookieValue(req), session)
    },
    login(value) {
      if (Date.now() < lockedUntil) return ''
      if (!matches(value, code)) {
        failedLogins++
        if (failedLogins >= 5) { lockedUntil = Date.now() + 15 * 60 * 1000; failedLogins = 0 }
        return ''
      }
      failedLogins = 0
      session = randomBytes(32).toString('base64url')
      expiresAt = Date.now() + sessionDurationMs
      return `${cookieName}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionDurationMs / 1000}`
    },
    logout() {
      session = ''
      expiresAt = 0
      return `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
    },
  }
}
