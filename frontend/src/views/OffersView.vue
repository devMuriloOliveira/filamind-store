<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const marketplaces = [
  { value: '', label: 'Todos' },
  { value: 'mercado_livre', label: 'Mercado Livre' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'amazon', label: 'Amazon' },
]
const categories = [
  { value: 'impressoras-3d', label: 'Impressoras 3D' },
  { value: 'filamentos', label: 'Filamentos' },
  { value: 'pecas-reposicao', label: 'Peças e reposição' },
  { value: 'acessorios-ferramentas', label: 'Acessórios e ferramentas' },
  { value: 'resinas', label: 'Resinas' },
  { value: 'kits-combos', label: 'Kits e combos' },
]
const legacyCategoryIds = { 'Impressoras 3D': 'impressoras-3d', Filamentos: 'filamentos', 'Bicos e hotends': 'pecas-reposicao', 'Peças de reposição': 'pecas-reposicao', Ferramentas: 'acessorios-ferramentas', Acessórios: 'acessorios-ferramentas' }
const sortOptions = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'name', label: 'Nome A–Z' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
]
const result = ref({ items: [], total: 0, page: 1, pages: 1, hasPrices: false, hasAmazon: false })
const loading = ref(true)
const error = ref('')
const searchInput = ref('')
const retryToken = ref(0)
const failedImages = ref(new Set())
const value = (key, fallback = '') => typeof route.query[key] === 'string' ? route.query[key] : fallback
const labelFor = (marketplace) => marketplaces.find((item) => item.value === marketplace)?.label || marketplace
const labelForCategory = (category) => categories.find((item) => item.value === category)?.label || category
const selectedCategory = computed(() => {
  const category = route.query.categoria !== undefined ? value('categoria') : value('category')
  return legacyCategoryIds[category] || category
})
const hasFilters = computed(() => ['q', 'categoria', 'category', 'marketplace', 'minPrice', 'maxPrice'].some((key) => value(key)))
const money = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
const dateLabel = (date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(date))

function setQuery(key, next) {
  router.push({ path: '/ofertas/', query: { ...route.query, [key]: next || undefined, page: undefined } })
}
function setPage(page) { router.push({ path: '/ofertas/', query: { ...route.query, page: page === 1 ? undefined : String(page) } }) }
function submitSearch() { setQuery('q', searchInput.value.trim()) }
function setCategory(category) {
  router.push({ path: '/ofertas/', query: { ...route.query, category: undefined, categoria: category || undefined, page: undefined } })
}
function clearFilters() { router.push({ path: '/ofertas/' }) }

watch([() => route.query, retryToken], async ([query], _old, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  loading.value = true
  error.value = ''
  searchInput.value = value('q')
  const params = new URLSearchParams()
  for (const key of ['q', 'marketplace', 'categoria', 'category', 'sort', 'page', 'minPrice', 'maxPrice']) {
    if (typeof query[key] === 'string' && query[key]) params.set(key, query[key])
  }
  try {
    const response = await fetch(`/api/offers?${params}`, { signal: controller.signal })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Não foi possível carregar as ofertas.')
    result.value = body
  } catch (failure) {
    if (failure.name !== 'AbortError') error.value = 'Não foi possível carregar as ofertas. Tente novamente.'
  } finally {
    if (!controller.signal.aborted) loading.value = false
  }
}, { immediate: true })
</script>

<template>
  <main id="conteudo" class="offers-main">
    <div class="page-container">
      <div class="offers-heading">
        <p class="eyebrow">VITRINE FILAMIND</p>
        <h1>Ofertas para impressão 3D</h1>
        <p>Equipamentos, materiais e peças para impressão 3D. Confira cada oferta na loja de origem.</p>
      </div>

      <div class="offers-layout">
        <aside class="offers-filters" aria-label="Filtros de ofertas">
          <h2>Filtros</h2>
          <label for="offers-marketplace">Marketplace</label>
          <select id="offers-marketplace" :value="value('marketplace')" @change="setQuery('marketplace', $event.target.value)"><option v-for="item in marketplaces" :key="item.value" :value="item.value">{{ item.label }}</option></select>
          <label for="offers-category">Categoria</label>
          <select id="offers-category" :value="selectedCategory" @change="setCategory($event.target.value)"><option value="">Todas as categorias</option><option v-for="category in categories" :key="category.value" :value="category.value">{{ category.label }}</option><option v-if="selectedCategory && !categories.some((item) => item.value === selectedCategory)" :value="selectedCategory">Categoria anterior: {{ selectedCategory }}</option></select>
          <button v-if="hasFilters" class="button button-secondary offers-clear" type="button" @click="clearFilters">Limpar filtros</button>
        </aside>

        <div class="offers-results">
          <form class="offers-toolbar" role="search" @submit.prevent="submitSearch">
            <label for="offers-search">Buscar produtos</label>
            <div class="offers-search-row"><input id="offers-search" v-model="searchInput" type="search" maxlength="100" placeholder="Nome ou termo"><button class="button button-primary" type="submit">Buscar</button></div>
            <label for="offers-sort">Ordenar por</label>
            <select id="offers-sort" :value="value('sort', 'recent')" @change="setQuery('sort', $event.target.value)"><option v-for="option in sortOptions" :key="option.value" :value="option.value" :disabled="option.value.startsWith('price') && !result.hasPrices">{{ option.label }}</option></select>
          </form>
          <p class="offers-count" aria-live="polite">{{ result.total }} {{ result.total === 1 ? 'oferta encontrada' : 'ofertas encontradas' }}</p>
          <p v-if="loading" class="offers-state" role="status">Carregando ofertas…</p>
          <div v-else-if="error" class="offers-state" role="alert"><p>{{ error }}</p><button class="button button-secondary" type="button" @click="retryToken++">Tentar novamente</button></div>
          <div v-else-if="!result.items.length" class="offers-state"><h2>Nenhuma oferta encontrada</h2><p>{{ hasFilters ? 'Não há ofertas para esta combinação de filtros.' : 'Não há ofertas no momento.' }}</p><button v-if="hasFilters" class="button button-secondary" type="button" @click="clearFilters">Limpar filtros</button></div>
          <div v-else class="offers-grid">
            <article v-for="item in result.items" :key="item.id" class="offer-card">
              <div class="offer-card-image">
                <img v-if="item.imageUrl && !failedImages.has(item.id)" :src="item.imageUrl" :alt="item.name" loading="lazy" @error="failedImages.add(item.id)">
                <span v-else class="offer-card-image-empty"><svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="5" y="8" width="38" height="32" rx="3"/><circle cx="17" cy="19" r="3"/><path d="m8 35 12-11 7 6 5-5 9 9"/></svg>Imagem indisponível</span>
              </div>
              <div class="offer-card-body">
                <p class="offer-card-meta"><span>{{ item.categoryLabel || labelForCategory(item.category) }}</span><span>{{ labelFor(item.marketplace) }}</span></p>
                <h2 :title="item.name">{{ item.name }}</h2>
                <p v-if="item.description" class="offer-card-description">{{ item.description }}</p>
                <div class="offer-card-footer">
                  <div v-if="item.priceCents !== null" class="offer-card-price-group"><del v-if="item.originalPriceCents" class="offer-card-old-price">De {{ money(item.originalPriceCents) }}</del><p class="offer-card-price">{{ item.originalPriceCents ? 'Por ' : '' }}{{ money(item.priceCents) }}</p></div>
                  <p v-else class="offer-card-price-unavailable">Consulte o preço na loja</p>
                  <p v-if="item.priceUpdatedAt" class="offer-card-price-note">{{ item.priceSource }} · {{ dateLabel(item.priceUpdatedAt) }}. O preço pode mudar na loja.</p>
                  <p class="offer-card-affiliate-note">Link de afiliado</p>
                  <a class="button button-primary" :href="item.affiliateUrl" target="_blank" rel="sponsored noopener noreferrer">Ver na {{ labelFor(item.marketplace) }} <span aria-hidden="true">↗</span></a>
                </div>
              </div>
            </article>
          </div>
          <nav v-if="!loading && !error && result.pages > 1" class="offers-pagination" aria-label="Páginas de ofertas"><button type="button" :disabled="result.page <= 1" @click="setPage(result.page - 1)">Anterior</button><span>Página {{ result.page }} de {{ result.pages }}</span><button type="button" :disabled="result.page >= result.pages" @click="setPage(result.page + 1)">Próxima</button></nav>
        </div>
      </div>
      <div class="offers-footer-note"><p v-if="result.hasAmazon" class="offers-amazon-disclosure">Como associado da Amazon, eu recebo por compras qualificadas.</p><p>Os links levam às lojas indicadas. Confira preço e disponibilidade antes de comprar.</p></div>
    </div>
  </main>
</template>
