import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CatalogError } from './catalog.js'
import { createJsonRepository } from './jsonRepository.js'
import { createLocalImageStorage } from './imageStorage.js'
import { createLocalAdminAccess } from './localAdmin.js'
import { createPostgresPool, createPostgresRepository } from './postgresRepository.js'
import { loadRuntimeConfig } from './runtimeConfig.js'

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = path.resolve(backendRoot, '../frontend/dist')
const defaultCatalogPath = path.join(backendRoot, 'data/catalog.json')
const defaultUploadsPath = path.join(backendRoot, 'uploads')
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' }

const sendJson = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(value))
}
const readJson = async (req, maxBytes = 1024 * 1024) => {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new CatalogError('Envie JSON.', 415)
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) throw new CatalogError('Arquivo ou dados muito grandes.', 413)
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new CatalogError('JSON inválido.') }
}
const sendFile = async (res, file) => {
  const body = await readFile(file)
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' })
  res.end(body)
}
const imageTypes = {
  'image/png': { ext: '.png', valid: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/jpeg': { ext: '.jpg', valid: (b) => b[0] === 255 && b[1] === 216 && b[2] === 255 },
  'image/webp': { ext: '.webp', valid: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
}

export function createOffersServer({ catalogPath = defaultCatalogPath, repository = null, uploadsPath = defaultUploadsPath, imageStorage = null, authorizeAdmin = null, localAdminAccess = null, frontendPath = distRoot } = {}) {
  if (authorizeAdmin && localAdminAccess) throw new Error('Configure apenas uma forma de autorização administrativa.')
  const store = repository || createJsonRepository(catalogPath)
  const images = imageStorage || createLocalImageStorage(uploadsPath)
  return http.createServer(async (req, res) => {
    try {
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
      const url = new URL(req.url, 'http://localhost')
      let pathname
      try { pathname = decodeURIComponent(url.pathname) }
      catch { throw new CatalogError('URL inválida.') }

      if (req.method === 'GET' && (pathname === '/promocoes' || pathname === '/promocoes/')) {
        res.writeHead(301, { Location: `/ofertas/${url.search}` })
        return res.end()
      }
      if (req.method === 'GET' && pathname === '/ofertas') {
        res.writeHead(301, { Location: `/ofertas/${url.search}` })
        return res.end()
      }

      if (req.method === 'GET' && pathname === '/api/offers') {
        return sendJson(res, 200, await store.listPublic(url.searchParams))
      }

      if (pathname.startsWith('/api/admin/')) {
        if (localAdminAccess && !localAdminAccess.isLocalRequest(req)) return sendJson(res, 404, { error: 'Rota não encontrada.' })
        if (localAdminAccess && !['GET', 'HEAD'].includes(req.method) && !localAdminAccess.hasSameOrigin(req)) {
          return sendJson(res, 403, { error: 'Origem não autorizada.' })
        }
        if (localAdminAccess && req.method === 'POST' && pathname === '/api/admin/login') {
          if (localAdminAccess.isRateLimited()) return sendJson(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' })
          const body = await readJson(req, 4096)
          const cookie = localAdminAccess.login(body?.code)
          if (!cookie) return sendJson(res, localAdminAccess.isRateLimited() ? 429 : 401, { error: localAdminAccess.isRateLimited() ? 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' : 'Código de acesso inválido.' })
          res.setHeader('Set-Cookie', cookie)
          return sendJson(res, 200, { authorized: true })
        }
        if (localAdminAccess && req.method === 'POST' && pathname === '/api/admin/logout') {
          if (!localAdminAccess.authorize(req)) return sendJson(res, 401, { error: 'Sessão administrativa expirada.' })
          res.setHeader('Set-Cookie', localAdminAccess.logout())
          return sendJson(res, 200, { authorized: false })
        }
        if (!authorizeAdmin && !localAdminAccess) return sendJson(res, 503, { error: 'A integração com a autenticação administrativa ainda não foi configurada.' })
        const authorized = localAdminAccess ? localAdminAccess.authorize(req) : await authorizeAdmin(req)
        if (req.method === 'GET' && pathname === '/api/admin/status' && localAdminAccess) {
          return sendJson(res, authorized ? 200 : 401, { authorized, localLogin: !authorized, localAdmin: true })
        }
        if (!authorized) return sendJson(res, localAdminAccess ? 401 : 403, { error: 'Acesso administrativo não autorizado.' })
        if (req.method === 'GET' && pathname === '/api/admin/status') return sendJson(res, 200, { authorized: true })
        if (req.method === 'GET' && pathname === '/api/admin/catalog') return sendJson(res, 200, await store.read())
        if (req.method === 'GET' && pathname === '/api/admin/summary') return sendJson(res, 200, await store.summary())
        if (req.method === 'GET' && (pathname === '/api/admin/products' || pathname === '/api/admin/offers')) {
          return sendJson(res, 200, await store.list(pathname.endsWith('products') ? 'products' : 'offers', url.searchParams))
        }
        const recordMatch = pathname.match(/^\/api\/admin\/(products|offers)\/([a-f0-9-]{36})$/)
        if (req.method === 'GET' && recordMatch) {
          const record = await store.get(recordMatch[1], recordMatch[2])
          return record ? sendJson(res, 200, record) : sendJson(res, 404, { error: 'Registro não encontrado.' })
        }

        if (req.method === 'POST' && pathname === '/api/admin/images') {
          const body = await readJson(req, 4 * 1024 * 1024)
          const type = imageTypes[body?.mime]
          if (!type || typeof body.dataBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.dataBase64)) throw new CatalogError('Imagem inválida. Use PNG, JPEG ou WebP.')
          if (typeof body.rightsSource !== 'string' || body.rightsSource.trim().length < 3 || body.rightsSource.length > 160) throw new CatalogError('Informe a origem e a autorização da imagem.')
          const buffer = Buffer.from(body.dataBase64, 'base64')
          if (!buffer.length || buffer.length > 2 * 1024 * 1024 || !type.valid(buffer)) throw new CatalogError('Imagem inválida ou acima de 2 MB.')
          return sendJson(res, 201, { imageUrl: await images.save(buffer, type.ext) })
        }

        const productMatch = pathname.match(/^\/api\/admin\/products(?:\/([a-f0-9-]{36}))?$/)
        if (productMatch && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
          if (req.method === 'POST' && !productMatch[1]) {
            const input = await readJson(req)
            if (input?.imageUrl && !await images.exists(input.imageUrl)) throw new CatalogError('Imagem enviada não encontrada.')
            const result = await store.createProduct(input)
            return sendJson(res, 201, result)
          }
          if (!productMatch[1]) throw new CatalogError('Produto não encontrado.', 404)
          const input = req.method === 'PUT' ? await readJson(req) : null
          if (input?.imageUrl && !await images.exists(input.imageUrl)) throw new CatalogError('Imagem enviada não encontrada.')
          const result = req.method === 'DELETE' ? await store.deleteProduct(productMatch[1]) : await store.updateProduct(productMatch[1], input)
          return sendJson(res, 200, result)
        }

        const offerMatch = pathname.match(/^\/api\/admin\/offers(?:\/([a-f0-9-]{36}))?$/)
        if (offerMatch && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
          if (req.method === 'POST' && !offerMatch[1]) {
            const input = await readJson(req)
            const result = await store.createOffer(input)
            return sendJson(res, 201, result)
          }
          if (!offerMatch[1]) throw new CatalogError('Oferta não encontrada.', 404)
          const input = req.method === 'PUT' ? await readJson(req) : null
          const result = req.method === 'DELETE' ? await store.deleteOffer(offerMatch[1]) : await store.updateOffer(offerMatch[1], input)
          return sendJson(res, 200, result)
        }
        return sendJson(res, 404, { error: 'Rota administrativa não encontrada.' })
      }

      if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Rota não encontrada.' })
      if (pathname === '/admin/ofertas' && localAdminAccess?.isLocalRequest(req)) {
        res.writeHead(301, { Location: `/admin/ofertas/${url.search}` })
        return res.end()
      }
      if (/^\/admin\/ofertas(?:\/|$)/.test(pathname)) {
        if (localAdminAccess) {
          if (!localAdminAccess.isLocalRequest(req)) return sendJson(res, 404, { error: 'Página não encontrada.' })
        } else if (!authorizeAdmin || !(await authorizeAdmin(req))) return sendJson(res, 404, { error: 'Página não encontrada.' })
        res.setHeader('Cache-Control', 'no-store')
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Método não permitido.' })

      if (pathname.startsWith('/offer-images/')) {
        const fileName = pathname.slice('/offer-images/'.length)
        if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(fileName)) return sendJson(res, 404, { error: 'Imagem não encontrada.' })
        const image = await images.read(`/offer-images/${fileName}`)
        res.writeHead(200, { 'Content-Type': image.contentType, 'X-Content-Type-Options': 'nosniff' })
        return res.end(image.body)
      }
      const relative = pathname.replace(/^\/+/, '')
      const asset = path.resolve(frontendPath, relative)
      if (relative && asset.startsWith(frontendPath + path.sep) && path.extname(asset)) {
        try { return await sendFile(res, asset) } catch { return sendJson(res, 404, { error: 'Arquivo não encontrado.' }) }
      }
      return await sendFile(res, path.join(frontendPath, 'index.html'))
    } catch (error) {
      if (error instanceof CatalogError) return sendJson(res, error.status, { error: error.message })
      if (error?.code === 'ENOENT') return sendJson(res, 404, { error: 'Arquivo não encontrado.' })
      if (error?.code === '23505') return sendJson(res, 409, { error: 'Produto ou link já cadastrado.' })
      if (['23503', '23514', '22P02', '22003'].includes(error?.code)) return sendJson(res, 400, { error: 'Dados inválidos ou associação indisponível.' })
      if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01', '57P03', '53300', '08000', '08001', '08003', '08006'].includes(error?.code)) return sendJson(res, 503, { error: 'Banco de dados indisponível.' })
      console.error('Erro no servidor de ofertas. Código:', error?.code || 'unknown')
      return sendJson(res, 500, { error: 'Erro interno.' })
    }
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let pool
  try {
    const config = loadRuntimeConfig()
    const localAdminAccess = process.env.FILAMIND_LOCAL_ADMIN === '1' ? createLocalAdminAccess(config.host) : null
    const repository = config.storage === 'postgres' ? createPostgresRepository(pool = createPostgresPool(config.databaseUrl)) : createJsonRepository(defaultCatalogPath)
    if (repository.assertReady) await repository.assertReady()
    const server = createOffersServer({ repository, localAdminAccess, uploadsPath: config.uploadsPath || defaultUploadsPath })
    server.listen(config.port, config.host, () => {
      console.log(`Filamind comercial: http://${config.host}:${config.port}/`)
      if (localAdminAccess) {
        console.log(`Painel local: http://${config.host}:${config.port}/admin/ofertas/`)
        console.log(`Código temporário de acesso: ${localAdminAccess.code}`)
      }
    })
  } catch (error) {
    console.error('Falha ao iniciar Filamind Store. Código:', error?.code || error?.message?.replace(/DATABASE_URL=[^\s]+/g, 'DATABASE_URL=[REDACTED]') || 'unknown')
    await pool?.end()
    process.exitCode = 1
  }
}
