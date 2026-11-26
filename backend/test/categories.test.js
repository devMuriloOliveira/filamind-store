import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { categories, legacyCategories, listPublicOffers, validateProduct } from '../src/catalog.js'

const now = Date.now()
const names = ['impressoras-3d', 'filamentos', 'pecas-reposicao', 'acessorios-ferramentas', 'resinas', 'kits-combos', 'Filamentos', 'Bicos e hotends', 'Outros']
const prices = [5000, 5001, 15000, 15001, 50000, 50001, 150000, 150001, null]
const products = names.map((category, index) => ({ id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name: `Produto ${index}`, description: '', category, keywords: [], imageUrl: '', active: true, featured: false, createdAt: new Date(now - index * 1000).toISOString() }))
const offers = products.map((product, index) => ({
  id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`, productId: product.id,
  marketplace: index === 8 ? 'amazon' : index % 2 ? 'shopee' : 'mercado_livre',
  affiliateUrl: index === 8 ? 'https://www.amazon.com.br/test?tag=test' : index % 2 ? `https://s.shopee.com.br/test-${index}` : `https://www.mercadolivre.com.br/test-${index}`,
  affiliateConfirmed: true, active: true, priceCents: prices[index], priceDisplayAuthorized: index !== 8,
  priceSource: index === 8 ? '' : 'Fonte de teste', priceUpdatedAt: index === 8 ? null : new Date(now).toISOString(),
  availability: 'unknown', availabilityConfirmedAt: null, createdAt: new Date(now - index * 1000).toISOString(),
}))
const data = { products, offers }
const list = (query) => listPublicOffers(data, new URLSearchParams(query), now)

test('six stable categories preserve legacy records without reclassifying them', () => {
  assert.deepEqual(categories, ['impressoras-3d', 'filamentos', 'pecas-reposicao', 'acessorios-ferramentas', 'resinas', 'kits-combos'])
  for (const category of categories) assert.ok(list(`categoria=${category}`).total >= 1, category)
  assert.equal(list('categoria=filamentos').total, 2)
  assert.equal(list('category=Filamentos').total, 2)
  assert.equal(list('categoria=pecas-reposicao').total, 2)
  assert.equal(list('categoria=Outros').total, 1)
  assert.equal(list('').total, 9)
  assert.ok(list('categoria=filamentos').items.some((item) => item.category === 'Filamentos'))
  assert.equal(validateProduct({ name: 'Resina de teste', category: 'resinas', description: '', keywords: [], imageUrl: '', featured: false, active: true }).category, 'resinas')
  assert.equal(validateProduct({ name: 'Legado de teste', category: 'Filamentos', description: '', keywords: [], imageUrl: '', featured: false, active: true }).category, 'Filamentos')
})

test('marketplaces, price ranges, combinations, search, sorting and pagination', () => {
  for (const marketplace of ['mercado_livre', 'shopee', 'amazon']) assert.ok(list(`marketplace=${marketplace}`).total > 0)
  const ranges = ['maxPrice=5000', 'minPrice=5001&maxPrice=15000', 'minPrice=15001&maxPrice=50000', 'minPrice=50001&maxPrice=150000', 'minPrice=150001']
  const groups = ranges.map((range) => list(range).items.map((item) => item.id))
  assert.deepEqual(groups.map((group) => group.length), [1, 2, 2, 2, 1])
  assert.equal(new Set(groups.flat()).size, 8)
  assert.equal(list('marketplace=amazon').items[0].priceCents, null)
  assert.equal(list('marketplace=amazon&maxPrice=5000').total, 0)
  assert.equal(list('categoria=filamentos&marketplace=shopee&minPrice=5001&maxPrice=15000').total, 1)
  assert.equal(list('q=Acessórios').total, 1)
  assert.equal(list('sort=price_asc').items.at(-1).priceCents, null)
  assert.equal(list('sort=name&page=2').page, 1)
})

test('migration 003 adds stable identifiers while retaining legacy values and no data update', async () => {
  const sql = await readFile(new URL('../migrations/003_product_categories.sql', import.meta.url), 'utf8')
  for (const value of [...categories, ...legacyCategories]) assert.ok(sql.includes(`'${value}'`), value)
  assert.match(sql, /ADD CONSTRAINT products_category_check CHECK/)
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|TRUNCATE)\s+filamind_store\.products\b/i)
  assert.match(sql, /schema_migrations \(version\) VALUES \(3\)/)
})
