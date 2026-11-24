import { randomUUID } from 'node:crypto'
import { CatalogError } from './catalog.js'
import { imageContentType, imageNameFromUrl } from './imageStorage.js'

const unavailable = () => new CatalogError('Armazenamento de imagens indisponível.', 503)

export function createSupabaseImageStorage({ projectUrl, bucket, secretKey, fetchImpl = fetch }) {
  let project
  try { project = new URL(projectUrl) } catch { throw new Error('SUPABASE_URL inválida.') }
  if (project.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(project.hostname) ||
      project.username || project.password || project.port || project.pathname !== '/' || project.search || project.hash) {
    throw new Error('SUPABASE_URL deve ser a origem HTTPS do projeto Supabase.')
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket || '')) throw new Error('SUPABASE_STORAGE_BUCKET inválido.')
  if (typeof secretKey !== 'string' || !secretKey.startsWith('sb_secret_')) throw new Error('SUPABASE_SECRET_KEY deve ser uma chave secreta do Supabase.')

  const objectPath = (name) => `${encodeURIComponent(bucket)}/${name}`
  const publicUrl = (name) => `${project.origin}/storage/v1/object/public/${objectPath(name)}`
  const uploadUrl = (name) => `${project.origin}/storage/v1/object/${objectPath(name)}`
  const request = async (url, options) => {
    try { return await fetchImpl(url, { ...options, signal: AbortSignal.timeout(15000) }) }
    catch { throw unavailable() }
  }
  const missingObject = async (response) => {
    if (response.status === 404) return true
    if (response.status !== 400) return false
    try { return (await response.json()).code === 'NoSuchKey' }
    catch { return false }
  }
  const saveNamed = async (buffer, name) => {
    const contentType = imageContentType(name)
    const response = await request(uploadUrl(name), {
      method: 'POST',
      headers: { apikey: secretKey, 'Content-Type': contentType, 'x-upsert': 'false' },
      body: buffer,
    })
    if (!response.ok) throw unavailable()
    return `/offer-images/${name}`
  }

  return {
    async exists(url) {
      const name = imageNameFromUrl(url)
      const response = await request(publicUrl(name), { method: 'HEAD' })
      if (response.status === 400) {
        const details = await request(publicUrl(name), { method: 'GET' })
        if (await missingObject(details)) return false
        if (details.ok) return true
        throw unavailable()
      }
      if (await missingObject(response)) return false
      if (!response.ok) throw unavailable()
      return true
    },
    async save(buffer, extension) {
      if (!['.png', '.jpg', '.webp'].includes(extension)) throw new CatalogError('Formato de imagem inválido.')
      return saveNamed(buffer, `${randomUUID()}${extension}`)
    },
    saveNamed,
    async read(url) {
      const name = imageNameFromUrl(url)
      const response = await request(publicUrl(name), { method: 'GET' })
      if (await missingObject(response)) throw new CatalogError('Imagem não encontrada.', 404)
      if (!response.ok) throw unavailable()
      try { return { body: Buffer.from(await response.arrayBuffer()), contentType: imageContentType(name) } }
      catch { throw unavailable() }
    },
  }
}
