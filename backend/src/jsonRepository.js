import { randomUUID } from 'node:crypto'
import { CatalogError, adminSummary, assertUniqueOffer, assertUniqueProduct, createCatalogStore, listAdminRecords, listPublicOffers, validateCompleteOffer, validateOffer, validateProduct } from './catalog.js'

export function createJsonRepository(catalogPath) {
  const store = createCatalogStore(catalogPath)
  return {
    mode: 'json',
    read: store.read,
    listPublic: async (params) => listPublicOffers(await store.read(), params),
    summary: async () => adminSummary(await store.read()),
    list: async (kind, params) => listAdminRecords(await store.read(), kind, params),
    get: async (kind, id) => (await store.read())[kind].find((item) => item.id === id && !item.deletedAt) || null,
    createCompleteOffer: (input, imageUrl = '') => store.mutate((data) => {
      const { product, offer } = validateCompleteOffer(input, imageUrl)
      assertUniqueProduct(data.products, product)
      const now = new Date().toISOString()
      const createdProduct = { ...product, id: randomUUID(), createdAt: now, updatedAt: now }
      const createdOffer = { ...validateOffer({ ...offer, productId: createdProduct.id }, [createdProduct]), id: randomUUID(), createdAt: now, updatedAt: now }
      assertUniqueOffer(data.offers, createdOffer)
      data.products.push(createdProduct)
      data.offers.push(createdOffer)
      return { product: createdProduct, offer: createdOffer }
    }),
    createProduct: (input) => store.mutate((data) => {
      const now = new Date().toISOString()
      const product = { ...validateProduct(input), id: randomUUID(), createdAt: now, updatedAt: now }
      assertUniqueProduct(data.products, product)
      data.products.push(product)
      return product
    }),
    updateProduct: (id, input) => store.mutate((data) => {
      const product = data.products.find((item) => item.id === id && !item.deletedAt)
      if (!product) throw new CatalogError('Produto não encontrado.', 404)
      const validated = validateProduct(input, product)
      assertUniqueProduct(data.products, validated, id)
      Object.assign(product, validated)
      product.updatedAt = new Date().toISOString()
      return product
    }),
    deleteProduct: (id) => store.mutate((data) => {
      const product = data.products.find((item) => item.id === id && !item.deletedAt)
      if (!product) throw new CatalogError('Produto não encontrado.', 404)
      product.active = false
      product.deletedAt = new Date().toISOString()
      for (const offer of data.offers.filter((item) => item.productId === id && item.active)) {
        offer.active = false
        offer.updatedAt = product.deletedAt
      }
      product.updatedAt = product.deletedAt
      return product
    }),
    createOffer: (input) => store.mutate((data) => {
      const now = new Date().toISOString()
      const offer = { ...validateOffer(input, data.products.filter((item) => !item.deletedAt)), id: randomUUID(), createdAt: now, updatedAt: now }
      assertUniqueOffer(data.offers, offer)
      data.offers.push(offer)
      return offer
    }),
    updateOffer: (id, input) => store.mutate((data) => {
      const offer = data.offers.find((item) => item.id === id && !item.deletedAt)
      if (!offer) throw new CatalogError('Oferta não encontrada.', 404)
      Object.assign(offer, validateOffer(input, data.products.filter((item) => !item.deletedAt), offer))
      assertUniqueOffer(data.offers, offer, id)
      offer.updatedAt = new Date().toISOString()
      return offer
    }),
    deleteOffer: (id) => store.mutate((data) => {
      const offer = data.offers.find((item) => item.id === id && !item.deletedAt)
      if (!offer) throw new CatalogError('Oferta não encontrada.', 404)
      offer.active = false
      offer.deletedAt = new Date().toISOString()
      offer.updatedAt = offer.deletedAt
      return offer
    }),
  }
}
