import { createHash } from 'node:crypto'
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizedName, validateOffer, validateProduct } from '../src/catalog.js'
import { createPostgresPool } from '../src/postgresRepository.js'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const imagePath = /^\/offer-images\/([a-f0-9-]{36}\.(?:png|jpg|webp))$/
const digest = (value) => createHash('sha256').update(value).digest('hex')
const sameDate = (actual, expected) => actual === null && !expected || (actual && expected && new Date(actual).getTime() === new Date(expected).getTime())

export async function prepareCatalogImport(sourcePath, imagesPath) {
  const source = await readFile(sourcePath)
  const data = JSON.parse(source.toString('utf8'))
  if (data?.version !== 1 || !Array.isArray(data.products) || !Array.isArray(data.offers)) throw new Error('Formato de catálogo não suportado.')
  const productIds = new Set(), names = new Set(), offerIds = new Set(), links = new Set(), images = new Map()
  for (const product of data.products) {
    if (!uuid.test(product.id) || productIds.has(product.id)) throw new Error('ID de produto inválido ou repetido.')
    productIds.add(product.id)
    validateProduct(product)
    const key = normalizedName(product.name)
    if (!product.deletedAt && names.has(key)) throw new Error('Produto duplicado no arquivo de origem.')
    if (!product.deletedAt) names.add(key)
    if (!Number.isFinite(Date.parse(product.createdAt)) || !Number.isFinite(Date.parse(product.updatedAt))) throw new Error('Datas de produto inválidas.')
    if (product.imageUrl) {
      const match = product.imageUrl.match(imagePath)
      if (!match) throw new Error('Caminho de imagem inválido no catálogo.')
      const file = path.join(imagesPath, match[1])
      await access(file)
      images.set(match[1], digest(await readFile(file)))
    }
  }
  for (const offer of data.offers) {
    if (!uuid.test(offer.id) || offerIds.has(offer.id)) throw new Error('ID de oferta inválido ou repetido.')
    offerIds.add(offer.id)
    validateOffer(offer, data.products)
    if (!offer.deletedAt && links.has(offer.affiliateUrl)) throw new Error('Link de oferta duplicado no arquivo de origem.')
    if (!offer.deletedAt) links.add(offer.affiliateUrl)
    if (!Number.isFinite(Date.parse(offer.createdAt)) || !Number.isFinite(Date.parse(offer.updatedAt))) throw new Error('Datas de oferta inválidas.')
  }
  return { data, catalogSha256: digest(source), images: [...images].map(([name, sha256]) => ({ name, sha256 })) }
}

export async function importCatalog(pool, plan) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('LOCK TABLE filamind_store.products, filamind_store.offers, filamind_store.catalog_imports IN EXCLUSIVE MODE')
    const previous = await client.query('SELECT catalog_sha256 FROM filamind_store.catalog_imports LIMIT 1')
    if (previous.rowCount) {
      if (previous.rows[0].catalog_sha256 !== plan.catalogSha256) throw new Error('Já existe outra importação. Nenhum dado foi alterado.')
      await client.query('ROLLBACK')
      return { status: 'already_imported', products: plan.data.products.length, offers: plan.data.offers.length }
    }
    const existing = await client.query(`SELECT (SELECT count(*) FROM filamind_store.products) AS products,
      (SELECT count(*) FROM filamind_store.offers) AS offers`)
    if (Number(existing.rows[0].products) || Number(existing.rows[0].offers)) throw new Error('O catálogo no banco não está vazio. Nenhum dado foi alterado.')
    for (const product of plan.data.products) {
      await client.query(`INSERT INTO filamind_store.products
        (id, name, name_key, description, category, keywords, image_url, image_rights_source, featured, active, created_at, updated_at, deleted_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [product.id, product.name, normalizedName(product.name), product.description, product.category, product.keywords,
        product.imageUrl, product.imageRightsSource, product.featured, product.active, product.createdAt, product.updatedAt, product.deletedAt || null])
    }
    for (const offer of plan.data.offers) {
      await client.query(`INSERT INTO filamind_store.offers
        (id, product_id, marketplace, affiliate_url, affiliate_confirmed, active, price_cents, price_display_authorized,
          price_source, price_updated_at, availability, availability_confirmed_at, created_at, updated_at, deleted_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [offer.id, offer.productId, offer.marketplace, offer.affiliateUrl, offer.affiliateConfirmed, offer.active, offer.priceCents,
        offer.priceDisplayAuthorized, offer.priceSource, offer.priceUpdatedAt, offer.availability, offer.availabilityConfirmedAt,
        offer.createdAt, offer.updatedAt, offer.deletedAt || null])
    }
    const verified = await client.query(`SELECT (SELECT count(*) FROM filamind_store.products) AS products,
      (SELECT count(*) FROM filamind_store.offers) AS offers,
      (SELECT count(*) FROM filamind_store.offers o JOIN filamind_store.products p ON p.id=o.product_id) AS joined`)
    if (Number(verified.rows[0].products) !== plan.data.products.length || Number(verified.rows[0].offers) !== plan.data.offers.length || Number(verified.rows[0].joined) !== plan.data.offers.length) {
      throw new Error('A contagem ou relação de produtos e ofertas não confere; importação revertida.')
    }
    const productRows = (await client.query(`SELECT id, name, description, category, keywords, image_url, image_rights_source,
      featured, active, created_at, updated_at, deleted_at FROM filamind_store.products`)).rows
    const offerRows = (await client.query(`SELECT id, product_id, marketplace, affiliate_url, affiliate_confirmed, active,
      price_cents, price_display_authorized, price_source, price_updated_at, availability, availability_confirmed_at,
      created_at, updated_at, deleted_at FROM filamind_store.offers`)).rows
    const productsById = new Map(productRows.map((item) => [item.id, item]))
    const offersById = new Map(offerRows.map((item) => [item.id, item]))
    for (const source of plan.data.products) {
      const saved = productsById.get(source.id)
      if (!saved || saved.name !== source.name || saved.description !== source.description || saved.category !== source.category ||
        JSON.stringify(saved.keywords) !== JSON.stringify(source.keywords) || saved.image_url !== source.imageUrl ||
        saved.image_rights_source !== source.imageRightsSource || saved.featured !== source.featured || saved.active !== source.active ||
        !sameDate(saved.created_at, source.createdAt) || !sameDate(saved.updated_at, source.updatedAt) || !sameDate(saved.deleted_at, source.deletedAt)) {
        throw new Error('Produto importado não confere com a origem; importação revertida.')
      }
    }
    for (const source of plan.data.offers) {
      const saved = offersById.get(source.id)
      if (!saved || saved.product_id !== source.productId || saved.marketplace !== source.marketplace ||
        saved.affiliate_url !== source.affiliateUrl || saved.affiliate_confirmed !== source.affiliateConfirmed ||
        saved.active !== source.active || saved.price_cents !== source.priceCents ||
        saved.price_display_authorized !== source.priceDisplayAuthorized || saved.price_source !== source.priceSource ||
        !sameDate(saved.price_updated_at, source.priceUpdatedAt) || saved.availability !== source.availability ||
        !sameDate(saved.availability_confirmed_at, source.availabilityConfirmedAt) ||
        !sameDate(saved.created_at, source.createdAt) || !sameDate(saved.updated_at, source.updatedAt) ||
        !sameDate(saved.deleted_at, source.deletedAt)) {
        throw new Error('Oferta importada não confere com a origem; importação revertida.')
      }
    }
    await client.query('INSERT INTO filamind_store.catalog_imports (catalog_sha256, products_count, offers_count) VALUES ($1,$2,$3)',
      [plan.catalogSha256, plan.data.products.length, plan.data.offers.length])
    await client.query('COMMIT')
    return { status: 'imported', products: plan.data.products.length, offers: plan.data.offers.length }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const option = (name) => { const index = args.indexOf(name); return index < 0 ? '' : args[index + 1] || '' }
  const sourcePath = option('--source'), imagesPath = option('--images'), reportPath = option('--report')
  const apply = args.includes('--apply')
  if (!sourcePath || !imagesPath || (apply && !process.env.DATABASE_URL)) {
    console.error('Uso: npm run db:import -- --source <catalog.json> --images <uploads> [--report <arquivo>] [--apply]. Sem --apply, apenas valida os dados. --apply exige DATABASE_URL.')
    process.exitCode = 2
  } else {
    let pool
    try {
      const plan = await prepareCatalogImport(sourcePath, imagesPath)
      if (apply) pool = createPostgresPool(process.env.DATABASE_URL)
      const result = apply ? await importCatalog(pool, plan) : { status: 'validated', products: plan.data.products.length, offers: plan.data.offers.length }
      const report = { ...result, catalogSha256: plan.catalogSha256, productIds: plan.data.products.map((item) => item.id), offerIds: plan.data.offers.map((item) => item.id), images: plan.images, sourcePath: path.resolve(sourcePath) }
      if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
      console.log(JSON.stringify(report))
    } catch (error) {
      console.error('Falha na validação/importação. Nenhum arquivo de origem foi modificado. Código:', error.code || error.name)
      process.exitCode = 1
    } finally { await pool?.end() }
  }
}
