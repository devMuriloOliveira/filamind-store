import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile, mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'

export const categories = Object.freeze(['Filamentos', 'Impressoras 3D', 'Bicos e hotends', 'Peças de reposição', 'Ferramentas', 'Acessórios', 'Manutenção', 'Outros'])
export const marketplaces = Object.freeze(['mercado_livre', 'shopee', 'amazon'])
const priceMaxAgeMs = 24 * 60 * 60 * 1000
const allowedHosts = {
  mercado_livre: ['mercadolivre.com.br'],
  shopee: ['shopee.com.br'],
  amazon: ['amazon.com.br'],
}

export class CatalogError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}

const text = (value, field, max, min = 0) => {
  if (typeof value !== 'string') throw new CatalogError(`${field} deve ser texto.`)
  const result = value.trim()
  if (result.length < min || result.length > max) throw new CatalogError(`${field} deve ter entre ${min} e ${max} caracteres.`)
  return result
}
const date = (value, field) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new CatalogError(`${field} inválida.`)
  const parsed = new Date(value)
  if (parsed.getTime() > Date.now() + 5 * 60 * 1000) throw new CatalogError(`${field} não pode estar no futuro.`)
  return parsed.toISOString()
}
const boolean = (value, field) => {
  if (typeof value !== 'boolean') throw new CatalogError(`${field} deve ser verdadeiro ou falso.`)
  return value
}
const optional = (value, field, max) => text(value ?? '', field, max)
export const normalizedName = (value) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')

export function assertUniqueProduct(products, product, id = '') {
  if (products.some((item) => !item.deletedAt && item.id !== id && normalizedName(item.name) === normalizedName(product.name))) {
    throw new CatalogError('Já existe um produto com este nome. Edite o cadastro existente ou diferencie o produto.', 409)
  }
}

export function assertUniqueOffer(offers, offer, id = '') {
  if (offers.some((item) => !item.deletedAt && item.id !== id && item.affiliateUrl === offer.affiliateUrl)) {
    throw new CatalogError('Este link já está cadastrado. Revise a associação antes de criar outra oferta.', 409)
  }
}

export function validateAffiliateUrl(value, marketplace) {
  if (!allowedHosts[marketplace]) throw new CatalogError('Marketplace inválido.')
  let url
  try { url = new URL(value) } catch { throw new CatalogError('Link de afiliado inválido.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowedHosts[marketplace].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new CatalogError('O link deve usar HTTPS e apontar para o marketplace selecionado.')
  }
  if (url.href.length > 2048) throw new CatalogError('Link de afiliado muito longo.')
  return url.href
}

export function validateProduct(input, previous = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CatalogError('Produto inválido.')
  const name = text(input.name, 'Nome', 140, 3)
  const description = optional(input.description, 'Descrição', 500)
  if (!categories.includes(input.category)) throw new CatalogError('Categoria inválida.')
  const keywords = input.keywords ?? []
  if (!Array.isArray(keywords) || keywords.length > 10) throw new CatalogError('Termos de busca inválidos.')
  const cleanKeywords = keywords.map((keyword) => text(keyword, 'Termo de busca', 40, 1))
  const imageUrl = optional(input.imageUrl, 'Imagem', 120)
  if (imageUrl && !/^\/offer-images\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(imageUrl)) throw new CatalogError('Use uma imagem enviada pelo painel.')
  const imageRightsSource = optional(input.imageRightsSource, 'Origem da imagem', 160)
  if (imageUrl && !imageRightsSource) throw new CatalogError('Informe a origem e autorização da imagem.')
  return { ...previous, name, description, category: input.category, keywords: cleanKeywords, imageUrl, imageRightsSource, featured: boolean(input.featured, 'Destaque'), active: boolean(input.active, 'Status') }
}

export function validateOffer(input, products, previous = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CatalogError('Oferta inválida.')
  if (!products.some((product) => product.id === input.productId)) throw new CatalogError('Produto não encontrado.')
  if (!marketplaces.includes(input.marketplace)) throw new CatalogError('Marketplace inválido.')
  const affiliateUrl = validateAffiliateUrl(input.affiliateUrl, input.marketplace)
  const affiliateConfirmed = boolean(input.affiliateConfirmed, 'Confirmação do link de afiliado')
  const active = boolean(input.active, 'Status')
  if (active && !affiliateConfirmed) throw new CatalogError('Confirme que o link foi gerado na sua conta de afiliado antes de ativar.')
  const priceCents = input.priceCents ?? null
  let priceDisplayAuthorized = false
  let priceSource = ''
  let priceUpdatedAt = null
  if (priceCents !== null) {
    if (input.marketplace === 'amazon') throw new CatalogError('Preços Amazon exigem integração oficial específica; cadastro manual desabilitado.')
    if (!Number.isSafeInteger(priceCents) || priceCents <= 0) throw new CatalogError('Preço inválido.')
    priceDisplayAuthorized = boolean(input.priceDisplayAuthorized, 'Autorização de preço')
    if (!priceDisplayAuthorized) throw new CatalogError('Confirme a autorização para exibir o preço.')
    priceSource = text(input.priceSource, 'Origem do preço', 160, 3)
    priceUpdatedAt = date(input.priceUpdatedAt, 'Data do preço')
  }
  const availability = input.availability ?? 'unknown'
  if (!['unknown', 'available', 'unavailable'].includes(availability)) throw new CatalogError('Disponibilidade inválida.')
  if (input.marketplace === 'amazon' && availability !== 'unknown') throw new CatalogError('Disponibilidade Amazon exige integração oficial específica; cadastro manual desabilitado.')
  const availabilityConfirmedAt = availability === 'unknown' ? null : date(input.availabilityConfirmedAt, 'Data da disponibilidade')
  return { ...previous, productId: input.productId, marketplace: input.marketplace, affiliateUrl, affiliateConfirmed, active, priceCents, priceDisplayAuthorized, priceSource, priceUpdatedAt, availability, availabilityConfirmedAt }
}

const publicPrice = (offer, now) => {
  const updatedAt = Date.parse(offer.priceUpdatedAt)
  return offer.priceDisplayAuthorized && Number.isSafeInteger(offer.priceCents) && offer.priceCents > 0 && Number.isFinite(updatedAt) && updatedAt <= now + 5 * 60 * 1000 && now - updatedAt <= priceMaxAgeMs ? offer.priceCents : null
}
const safePublicOffer = (offer) => {
  try { return offer.affiliateConfirmed && validateAffiliateUrl(offer.affiliateUrl, offer.marketplace) === offer.affiliateUrl }
  catch { return false }
}

export function listPublicOffers(data, params, now = Date.now()) {
  const query = String(params.get('q') || '').trim().toLocaleLowerCase('pt-BR').slice(0, 100)
  const marketplace = String(params.get('marketplace') || '')
  const category = String(params.get('category') || '')
  const sort = String(params.get('sort') || 'recent')
  const page = Number(params.get('page') || 1)
  if (marketplace && !marketplaces.includes(marketplace)) throw new CatalogError('Marketplace inválido.')
  if (category && !categories.includes(category)) throw new CatalogError('Categoria inválida.')
  if (!['recent', 'name', 'price_asc', 'price_desc'].includes(sort)) throw new CatalogError('Ordenação inválida.')
  if (!Number.isSafeInteger(page) || page < 1) throw new CatalogError('Página inválida.')
  const productById = new Map(data.products.filter((p) => p.active).map((p) => [p.id, p]))
  let items = data.offers.filter((offer) => offer.active && safePublicOffer(offer) && productById.has(offer.productId)).map((offer) => {
    const product = productById.get(offer.productId)
    return {
      id: offer.id, productId: product.id, name: product.name, description: product.description,
      category: product.category, imageUrl: /^\/offer-images\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(product.imageUrl || '') ? product.imageUrl : '', marketplace: offer.marketplace,
      affiliateUrl: offer.affiliateUrl, featured: product.featured,
      priceCents: publicPrice(offer, now), priceUpdatedAt: publicPrice(offer, now) ? offer.priceUpdatedAt : null,
      priceSource: publicPrice(offer, now) ? offer.priceSource : '',
      availability: offer.availabilityConfirmedAt && now - Date.parse(offer.availabilityConfirmedAt) <= priceMaxAgeMs ? offer.availability : 'unknown',
      createdAt: offer.createdAt, keywords: product.keywords,
    }
  })
  const availableCategories = [...new Set(items.map((item) => item.category))]
  const hasPrices = items.some((item) => item.priceCents !== null)
  const hasAmazon = items.some((item) => item.marketplace === 'amazon')
  if (query) items = items.filter((item) => [item.name, item.description, item.category, ...item.keywords].some((part) => part.toLocaleLowerCase('pt-BR').includes(query)))
  if (marketplace) items = items.filter((item) => item.marketplace === marketplace)
  if (category) items = items.filter((item) => item.category === category)
  const minPrice = params.get('minPrice')
  const maxPrice = params.get('maxPrice')
  for (const [value, label] of [[minPrice, 'Preço mínimo'], [maxPrice, 'Preço máximo']]) {
    if (value !== null && (!/^\d+$/.test(value) || Number(value) > 100000000)) throw new CatalogError(`${label} inválido.`)
  }
  if (minPrice !== null) items = items.filter((item) => item.priceCents !== null && item.priceCents >= Number(minPrice))
  if (maxPrice !== null) items = items.filter((item) => item.priceCents !== null && item.priceCents <= Number(maxPrice))
  items.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id)
    if (sort.startsWith('price')) {
      if (a.priceCents === null) return b.priceCents === null ? a.id.localeCompare(b.id) : 1
      if (b.priceCents === null) return -1
      return (sort === 'price_asc' ? a.priceCents - b.priceCents : b.priceCents - a.priceCents) || a.id.localeCompare(b.id)
    }
    return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id)
  })
  const total = items.length
  const pageSize = 12
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, pages)
  return { items: items.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(({ keywords, ...item }) => item), total, page: currentPage, pageSize, pages, categories: availableCategories, hasPrices, hasAmazon }
}

export function adminSummary(data) {
  const products = data.products.filter((item) => !item.deletedAt)
  const offers = data.offers.filter((item) => !item.deletedAt)
  const productIds = new Set(products.map((product) => product.id))
  const byMarketplace = Object.fromEntries(marketplaces.map((marketplace) => [marketplace, new Set(offers.filter((offer) => offer.marketplace === marketplace && productIds.has(offer.productId)).map((offer) => offer.productId)).size]))
  return {
    products: products.length, offers: offers.length,
    activeOffers: offers.filter((offer) => offer.active).length,
    inactiveOffers: offers.filter((offer) => !offer.active).length,
    byMarketplace,
    productsWithoutImage: products.filter((product) => !product.imageUrl).length,
    offersWithoutPrice: offers.filter((offer) => !Number.isSafeInteger(offer.priceCents) || offer.priceCents <= 0).length,
    offersForReview: offers.filter((offer) => !safePublicOffer(offer)).length,
  }
}

export function listAdminRecords(data, kind, params) {
  if (!['products', 'offers'].includes(kind)) throw new CatalogError('Lista inválida.')
  const query = String(params.get('q') || '').trim().toLocaleLowerCase('pt-BR').slice(0, 100)
  const page = Number(params.get('page') || 1)
  if (!Number.isSafeInteger(page) || page < 1) throw new CatalogError('Página inválida.')
  const status = String(params.get('status') || '')
  if (status && !['active', 'inactive'].includes(status)) throw new CatalogError('Status inválido.')
  const marketplace = String(params.get('marketplace') || '')
  if (marketplace && !marketplaces.includes(marketplace)) throw new CatalogError('Marketplace inválido.')
  const category = String(params.get('category') || '')
  if (category && !categories.includes(category)) throw new CatalogError('Categoria inválida.')
  const productsById = new Map(data.products.map((product) => [product.id, product]))
  let items = data[kind].filter((item) => !item.deletedAt)
  if (kind === 'products') {
    if (category) items = items.filter((item) => item.category === category)
    if (marketplace) {
      const ids = new Set(data.offers.filter((offer) => !offer.deletedAt && offer.marketplace === marketplace).map((offer) => offer.productId))
      items = items.filter((item) => ids.has(item.id))
    }
    if (query) items = items.filter((item) => `${item.name} ${item.category} ${item.keywords.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query))
  } else {
    if (marketplace) items = items.filter((item) => item.marketplace === marketplace)
    if (category) items = items.filter((item) => productsById.get(item.productId)?.category === category)
    if (query) items = items.filter((item) => `${productsById.get(item.productId)?.name || ''} ${item.marketplace} ${productsById.get(item.productId)?.category || ''}`.toLocaleLowerCase('pt-BR').includes(query))
  }
  if (status) items = items.filter((item) => item.active === (status === 'active'))
  items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))
  const total = items.length
  const pageSize = 20
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, pages)
  const slice = items.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  return { items: kind === 'offers' ? slice.map((item) => ({ ...item, productName: productsById.get(item.productId)?.name || 'Produto indisponível' })) : slice, total, page: currentPage, pages }
}

export function createCatalogStore(filePath) {
  let pending = Promise.resolve()
  const read = async () => JSON.parse(await readFile(filePath, 'utf8'))
  const mutate = (fn) => {
    const operation = pending.then(async () => {
      const data = await read()
      const result = fn(data)
      await mkdir(path.dirname(filePath), { recursive: true })
      const temp = `${filePath}.${randomUUID()}.tmp`
      try {
        await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' })
        await rename(temp, filePath)
      } finally { await unlink(temp).catch(() => {}) }
      return result
    })
    pending = operation.catch(() => {})
    return operation
  }
  return { read, mutate }
}
