import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { CatalogError } from './catalog.js'

const fileNamePattern = /^[a-f0-9-]{36}\.(png|jpg|webp)$/
const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

export function imageNameFromUrl(url) {
  const match = /^\/offer-images\/(.+)$/.exec(url || '')
  if (!match || !fileNamePattern.test(match[1])) throw new CatalogError('Imagem inválida.')
  return match[1]
}

export function imageContentType(name) {
  if (!fileNamePattern.test(name)) throw new CatalogError('Imagem inválida.')
  return mime[name.slice(name.lastIndexOf('.') + 1)]
}

export function createLocalImageStorage(root) {
  return {
    async exists(url) {
      try { await access(path.join(root, imageNameFromUrl(url))); return true }
      catch { return false }
    },
    async save(buffer, extension) {
      if (!['.png', '.jpg', '.webp'].includes(extension)) throw new CatalogError('Formato de imagem inválido.')
      const name = `${randomUUID()}${extension}`
      await mkdir(root, { recursive: true })
      await writeFile(path.join(root, name), buffer, { flag: 'wx' })
      return `/offer-images/${name}`
    },
    async read(url) {
      const name = imageNameFromUrl(url)
      const body = await readFile(path.join(root, name))
      return { body, contentType: imageContentType(name) }
    },
  }
}
