import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { CatalogError, categories, marketplaces, normalizedName, validateOffer, validateProduct } from './catalog.js'

const productColumns = `p.id, p.name, p.description, p.category, p.keywords, p.image_url AS "imageUrl", p.image_rights_source AS "imageRightsSource", p.featured, p.active, p.created_at AS "createdAt", p.updated_at AS "updatedAt", p.deleted_at AS "deletedAt"`
const offerColumns = `o.id, o.product_id AS "productId", o.marketplace, o.affiliate_url AS "affiliateUrl", o.affiliate_confirmed AS "affiliateConfirmed", o.active, o.price_cents AS "priceCents", o.price_display_authorized AS "priceDisplayAuthorized", o.price_source AS "priceSource", o.price_updated_at AS "priceUpdatedAt", o.availability, o.availability_confirmed_at AS "availabilityConfirmedAt", o.created_at AS "createdAt", o.updated_at AS "updatedAt", o.deleted_at AS "deletedAt"`
const publicBase = `FROM filamind_store.offers o JOIN filamind_store.products p ON p.id = o.product_id
  WHERE o.deleted_at IS NULL AND p.deleted_at IS NULL AND o.active AND p.active AND o.affiliate_confirmed
  AND NOT (o.availability = 'unavailable' AND o.availability_confirmed_at >= $1::timestamptz - interval '24 hours')
  AND ((o.marketplace = 'shopee' AND o.affiliate_url ~* '^https://([a-z0-9-]+\\.)*shopee\\.com\\.br(/|$)')
    OR (o.marketplace = 'mercado_livre' AND o.affiliate_url ~* '^https://([a-z0-9-]+\\.)*mercadolivre\\.com\\.br(/|$)')
    OR (o.marketplace = 'amazon' AND o.affiliate_url ~* '^https://([a-z0-9-]+\\.)*amazon\\.com\\.br(/|$)'))`
const priceExpression = `CASE WHEN o.price_display_authorized AND o.price_cents > 0
  AND o.price_updated_at BETWEEN $1::timestamptz - interval '24 hours' AND $1::timestamptz + interval '5 minutes'
  THEN o.price_cents ELSE NULL END`
const visibleSql = `SELECT o.id, p.id AS "productId", p.name, p.description, p.category,
  p.image_url AS "imageUrl", o.marketplace, o.affiliate_url AS "affiliateUrl", p.featured,
  ${priceExpression} AS "priceCents",
  CASE WHEN ${priceExpression} IS NOT NULL THEN o.price_updated_at ELSE NULL END AS "priceUpdatedAt",
  CASE WHEN ${priceExpression} IS NOT NULL THEN o.price_source ELSE '' END AS "priceSource",
  CASE WHEN o.availability_confirmed_at >= $1::timestamptz - interval '24 hours'
    THEN o.availability ELSE 'unknown' END AS availability,
  o.created_at AS "createdAt"
  ${publicBase}`
const like = (value) => `%${value.replace(/[\\%_]/g, '\\$&')}%`
const positivePage = (params) => {
  const page = Number(params.get('page') || 1)
  if (!Number.isSafeInteger(page) || page < 1) throw new CatalogError('Página inválida.')
  return page
}
const count = (value) => Number(value || 0)

async function inTransaction(pool, work) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}

export function createPostgresPool(connectionString) {
  if (!connectionString || typeof connectionString !== 'string') throw new Error('DATABASE_URL é obrigatória no modo PostgreSQL.')
  const url = new URL(connectionString)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL deve usar PostgreSQL.')
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000 })
  pool.on('error', (error) => console.error('Conexão PostgreSQL ociosa indisponível. Código:', error?.code || 'unknown'))
  return pool
}

export function createPostgresRepository(pool) {
  return {
    mode: 'postgres',
    async assertReady() {
      const result = await pool.query('SELECT version FROM filamind_store.schema_migrations WHERE version = 1')
      if (result.rowCount !== 1) throw new Error('Migração PostgreSQL 001 não aplicada.')
    },
    async read() { throw new CatalogError('Use as listagens paginadas no modo PostgreSQL.', 410) },
    async listPublic(params) {
      const page = positivePage(params)
      const marketplace = String(params.get('marketplace') || '')
      const category = String(params.get('category') || '')
      const sort = String(params.get('sort') || 'recent')
      const minPrice = params.get('minPrice')
      const maxPrice = params.get('maxPrice')
      if (marketplace && !marketplaces.includes(marketplace)) throw new CatalogError('Marketplace inválido.')
      if (category && !categories.includes(category)) throw new CatalogError('Categoria inválida.')
      if (!['recent', 'name', 'price_asc', 'price_desc'].includes(sort)) throw new CatalogError('Ordenação inválida.')
      for (const [value, label] of [[minPrice, 'Preço mínimo'], [maxPrice, 'Preço máximo']]) {
        if (value !== null && (!/^\d+$/.test(value) || Number(value) > 100000000)) throw new CatalogError(`${label} inválido.`)
      }
      const query = String(params.get('q') || '').trim().slice(0, 100)
      const values = [new Date(), like(query), marketplace, category, minPrice === null ? null : Number(minPrice), maxPrice === null ? null : Number(maxPrice)]
      const filters = `WHERE ($2 = '%%' OR (name ILIKE $2 OR description ILIKE $2 OR category ILIKE $2 OR EXISTS (
        SELECT 1 FROM filamind_store.products kp WHERE kp.id = "productId" AND array_to_string(kp.keywords, ' ') ILIKE $2)))
        AND ($3 = '' OR marketplace = $3) AND ($4 = '' OR category = $4)
        AND ($5::integer IS NULL OR "priceCents" >= $5) AND ($6::integer IS NULL OR "priceCents" <= $6)`
      const meta = await pool.query(`WITH visible AS (${visibleSql}) SELECT array_agg(DISTINCT category) AS categories,
        bool_or("priceCents" IS NOT NULL) AS "hasPrices", bool_or(marketplace = 'amazon') AS "hasAmazon" FROM visible`, [values[0]])
      const totalResult = await pool.query(`WITH visible AS (${visibleSql}) SELECT count(*) AS total FROM visible ${filters}`, values)
      const total = count(totalResult.rows[0].total)
      const pageSize = 12
      const pages = Math.max(1, Math.ceil(total / pageSize))
      const currentPage = Math.min(page, pages)
      const order = sort === 'name' ? 'name ASC, id ASC' : sort === 'price_asc' ? '"priceCents" ASC NULLS LAST, id ASC' : sort === 'price_desc' ? '"priceCents" DESC NULLS LAST, id ASC' : '"createdAt" DESC, id ASC'
      const result = await pool.query(`WITH visible AS (${visibleSql}) SELECT * FROM visible ${filters} ORDER BY ${order} LIMIT $7 OFFSET $8`, [...values, pageSize, (currentPage - 1) * pageSize])
      return { items: result.rows, total, page: currentPage, pageSize, pages, categories: meta.rows[0].categories || [], hasPrices: Boolean(meta.rows[0].hasPrices), hasAmazon: Boolean(meta.rows[0].hasAmazon) }
    },
    async summary() {
      const products = await pool.query(`SELECT count(*) AS products, count(*) FILTER (WHERE image_url = '') AS "productsWithoutImage"
        FROM filamind_store.products WHERE deleted_at IS NULL`)
      const offers = await pool.query(`SELECT count(*) AS offers, count(*) FILTER (WHERE o.active) AS "activeOffers",
        count(*) FILTER (WHERE NOT o.active) AS "inactiveOffers",
        count(*) FILTER (WHERE o.price_cents IS NULL) AS "offersWithoutPrice",
        count(*) FILTER (WHERE NOT o.affiliate_confirmed) AS "offersForReview",
        count(DISTINCT o.product_id) FILTER (WHERE o.marketplace = 'shopee' AND p.deleted_at IS NULL) AS shopee,
        count(DISTINCT o.product_id) FILTER (WHERE o.marketplace = 'mercado_livre' AND p.deleted_at IS NULL) AS mercado_livre,
        count(DISTINCT o.product_id) FILTER (WHERE o.marketplace = 'amazon' AND p.deleted_at IS NULL) AS amazon
        FROM filamind_store.offers o JOIN filamind_store.products p ON p.id = o.product_id WHERE o.deleted_at IS NULL`)
      const p = products.rows[0], o = offers.rows[0]
      return { products: count(p.products), offers: count(o.offers), activeOffers: count(o.activeOffers), inactiveOffers: count(o.inactiveOffers),
        byMarketplace: { shopee: count(o.shopee), mercado_livre: count(o.mercado_livre), amazon: count(o.amazon) },
        productsWithoutImage: count(p.productsWithoutImage), offersWithoutPrice: count(o.offersWithoutPrice), offersForReview: count(o.offersForReview) }
    },
    async list(kind, params) {
      if (!['products', 'offers'].includes(kind)) throw new CatalogError('Lista inválida.')
      const page = positivePage(params)
      const query = String(params.get('q') || '').trim().slice(0, 100)
      const category = String(params.get('category') || '')
      const marketplace = String(params.get('marketplace') || '')
      const status = String(params.get('status') || '')
      if (category && !categories.includes(category)) throw new CatalogError('Categoria inválida.')
      if (marketplace && !marketplaces.includes(marketplace)) throw new CatalogError('Marketplace inválido.')
      if (status && !['active', 'inactive'].includes(status)) throw new CatalogError('Status inválido.')
      const values = [like(query), category, marketplace, status]
      const isProduct = kind === 'products'
      const from = isProduct ? `FROM filamind_store.products p WHERE p.deleted_at IS NULL` : `FROM filamind_store.offers o JOIN filamind_store.products p ON p.id = o.product_id WHERE o.deleted_at IS NULL`
      const filters = isProduct
        ? `AND ($1 = '%%' OR (p.name ILIKE $1 OR p.category ILIKE $1 OR array_to_string(p.keywords, ' ') ILIKE $1))
          AND ($2 = '' OR p.category = $2)
          AND ($3 = '' OR EXISTS (SELECT 1 FROM filamind_store.offers fo WHERE fo.product_id = p.id AND fo.marketplace = $3 AND fo.deleted_at IS NULL))
          AND ($4 = '' OR p.active = ($4 = 'active'))`
        : `AND ($1 = '%%' OR (p.name ILIKE $1 OR p.category ILIKE $1 OR o.marketplace ILIKE $1))
          AND ($2 = '' OR p.category = $2) AND ($3 = '' OR o.marketplace = $3)
          AND ($4 = '' OR o.active = ($4 = 'active'))`
      const total = count((await pool.query(`SELECT count(*) AS total ${from} ${filters}`, values)).rows[0].total)
      const pages = Math.max(1, Math.ceil(total / 20))
      const currentPage = Math.min(page, pages)
      const columns = isProduct ? productColumns : `${offerColumns}, p.name AS "productName"`
      const result = await pool.query(`SELECT ${columns} ${from} ${filters} ORDER BY ${isProduct ? 'p' : 'o'}.created_at DESC, ${isProduct ? 'p' : 'o'}.id ASC LIMIT $5 OFFSET $6`, [...values, 20, (currentPage - 1) * 20])
      return { items: result.rows, total, page: currentPage, pages }
    },
    async get(kind, id) {
      if (!['products', 'offers'].includes(kind)) throw new CatalogError('Lista inválida.')
      const table = kind === 'products' ? 'products' : 'offers'
      const columns = kind === 'products' ? productColumns : offerColumns
      return (await pool.query(`SELECT ${columns} FROM filamind_store.${table} ${kind === 'products' ? 'p' : 'o'} WHERE id = $1 AND deleted_at IS NULL`, [id])).rows[0] || null
    },
    async createProduct(input) {
      const product = validateProduct(input)
      const now = new Date()
      const values = [randomUUID(), product.name, normalizedName(product.name), product.description, product.category, product.keywords, product.imageUrl, product.imageRightsSource, product.featured, product.active, now]
      const result = await pool.query(`INSERT INTO filamind_store.products AS p
        (id, name, name_key, description, category, keywords, image_url, image_rights_source, featured, active, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING ${productColumns}`, values)
      return result.rows[0]
    },
    async updateProduct(id, input) {
      return inTransaction(pool, async (client) => {
        const current = (await client.query(`SELECT ${productColumns} FROM filamind_store.products p WHERE p.id = $1 AND p.deleted_at IS NULL FOR UPDATE`, [id])).rows[0]
        if (!current) throw new CatalogError('Produto não encontrado.', 404)
        const product = validateProduct(input, current)
        const values = [id, product.name, normalizedName(product.name), product.description, product.category, product.keywords, product.imageUrl, product.imageRightsSource, product.featured, product.active]
        return (await client.query(`UPDATE filamind_store.products AS p SET name=$2, name_key=$3, description=$4, category=$5, keywords=$6,
          image_url=$7, image_rights_source=$8, featured=$9, active=$10, updated_at=now() WHERE id=$1 RETURNING ${productColumns}`, values)).rows[0]
      })
    },
    async deleteProduct(id) {
      return inTransaction(pool, async (client) => {
        const result = await client.query(`UPDATE filamind_store.products AS p SET active=false, deleted_at=now(), updated_at=now()
          WHERE id=$1 AND deleted_at IS NULL RETURNING ${productColumns}`, [id])
        if (!result.rowCount) throw new CatalogError('Produto não encontrado.', 404)
        await client.query(`UPDATE filamind_store.offers SET active=false, updated_at=now() WHERE product_id=$1 AND active AND deleted_at IS NULL`, [id])
        return result.rows[0]
      })
    },
    async createOffer(input) {
      return inTransaction(pool, async (client) => {
        const product = (await client.query(`SELECT ${productColumns} FROM filamind_store.products p WHERE p.id=$1 AND p.deleted_at IS NULL FOR KEY SHARE`, [input?.productId])).rows[0]
        const offer = validateOffer(input, product ? [product] : [])
        const now = new Date()
        const values = [randomUUID(), offer.productId, offer.marketplace, offer.affiliateUrl, offer.affiliateConfirmed, offer.active, offer.priceCents, offer.priceDisplayAuthorized, offer.priceSource, offer.priceUpdatedAt, offer.availability, offer.availabilityConfirmedAt, now]
        return (await client.query(`INSERT INTO filamind_store.offers AS o (id, product_id, marketplace, affiliate_url, affiliate_confirmed, active,
          price_cents, price_display_authorized, price_source, price_updated_at, availability, availability_confirmed_at, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING ${offerColumns}`, values)).rows[0]
      })
    },
    async updateOffer(id, input) {
      return inTransaction(pool, async (client) => {
        const current = (await client.query(`SELECT ${offerColumns} FROM filamind_store.offers o WHERE o.id=$1 AND o.deleted_at IS NULL FOR UPDATE`, [id])).rows[0]
        if (!current) throw new CatalogError('Oferta não encontrada.', 404)
        const product = (await client.query(`SELECT ${productColumns} FROM filamind_store.products p WHERE p.id=$1 AND p.deleted_at IS NULL FOR KEY SHARE`, [input?.productId])).rows[0]
        const offer = validateOffer(input, product ? [product] : [], current)
        const values = [id, offer.productId, offer.marketplace, offer.affiliateUrl, offer.affiliateConfirmed, offer.active, offer.priceCents, offer.priceDisplayAuthorized, offer.priceSource, offer.priceUpdatedAt, offer.availability, offer.availabilityConfirmedAt]
        return (await client.query(`UPDATE filamind_store.offers AS o SET product_id=$2, marketplace=$3, affiliate_url=$4, affiliate_confirmed=$5,
          active=$6, price_cents=$7, price_display_authorized=$8, price_source=$9, price_updated_at=$10, availability=$11,
          availability_confirmed_at=$12, updated_at=now() WHERE id=$1 RETURNING ${offerColumns}`, values)).rows[0]
      })
    },
    async deleteOffer(id) {
      const result = await pool.query(`UPDATE filamind_store.offers AS o SET active=false, deleted_at=now(), updated_at=now()
        WHERE id=$1 AND deleted_at IS NULL RETURNING ${offerColumns}`, [id])
      if (!result.rowCount) throw new CatalogError('Oferta não encontrada.', 404)
      return result.rows[0]
    },
  }
}
