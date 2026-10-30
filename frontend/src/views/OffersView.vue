<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const marketplaces = [
  { value: '', label: 'Todos os marketplaces' },
  { value: 'mercado_livre', label: 'Mercado Livre' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'amazon', label: 'Amazon' },
]
const categories = ['Filamentos', 'Impressoras 3D', 'Bicos e hotends', 'Peças de reposição', 'Ferramentas', 'Acessórios', 'Manutenção', 'Outros']
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
const minPriceInput = ref('')
const maxPriceInput = ref('')
const retryToken = ref(0)
const failedImages = ref(new Set())
const value = (key, fallback = '') => typeof route.query[key] === 'string' ? route.query[key] : fallback
const labelFor = (marketplace) => marketplaces.find((item) => item.value === marketplace)?.label || marketplace
const money = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
const dateLabel = (date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(date))

function setQuery(key, next) {
  router.replace({ path: '/ofertas/', query: { ...route.query, [key]: next || undefined, page: undefined } })
}
function setPage(page) { router.push({ path: '/ofertas/', query: { ...route.query, page: page === 1 ? undefined : String(page) } }) }
function submitSearch() { setQuery('q', searchInput.value.trim()) }
function submitPrice() {
  const query = { ...route.query, minPrice: minPriceInput.value ? String(Math.round(Number(minPriceInput.value) * 100)) : undefined, maxPrice: maxPriceInput.value ? String(Math.round(Number(maxPriceInput.value) * 100)) : undefined, page: undefined }
  router.replace({ path: '/ofertas/', query })
}

watch([() => route.query, retryToken], async ([query], _old, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  loading.value = true
  error.value = ''
  searchInput.value = value('q')
  minPriceInput.value = value('minPrice') ? String(Number(value('minPrice')) / 100) : ''
  maxPriceInput.value = value('maxPrice') ? String(Number(value('maxPrice')) / 100) : ''
  const params = new URLSearchParams()
  for (const key of ['q', 'marketplace', 'category', 'sort', 'page', 'minPrice', 'maxPrice']) {
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
        <p class="eyebrow">EQUIPAMENTOS E MATERIAIS PARA IMPRESSÃO 3D</p>
        <h1>Ofertas para impressão 3D</h1>
        <p>Explore produtos selecionados e confira os detalhes diretamente no marketplace antes de comprar.</p>
      </div>
      <p class="offers-disclosure"><strong>Publicidade:</strong> esta página pode conter links de afiliados. O Filamind pode receber uma comissão quando você compra por esses links, sem custo adicional decorrente dessa comissão. A compra é concluída na loja de origem.</p>
      <p v-if="result.hasAmazon" class="offers-amazon-disclosure">Como associado da Amazon, eu recebo por compras qualificadas.</p>

      <div class="offers-layout">
        <aside class="offers-filters" aria-label="Filtros de ofertas">
          <h2>Filtrar ofertas</h2>
          <label for="offers-marketplace">Marketplace</label>
          <select id="offers-marketplace" :value="value('marketplace')" @change="setQuery('marketplace', $event.target.value)"><option v-for="item in marketplaces" :key="item.value" :value="item.value">{{ item.label }}</option></select>
          <label for="offers-category">Categoria</label>
          <select id="offers-category" :value="value('category')" @change="setQuery('category', $event.target.value)"><option value="">Todas as categorias</option><option v-for="category in categories" :key="category" :value="category">{{ category }}</option></select>
          <form v-if="result.hasPrices" class="offers-price-filter" @submit.prevent="submitPrice">
            <p>Faixa de preço (R$)</p>
            <div><label>De <input v-model="minPriceInput" type="number" min="0" step="0.01" inputmode="decimal"></label><label>Até <input v-model="maxPriceInput" type="number" min="0" step="0.01" inputmode="decimal"></label></div>
            <button class="button button-secondary" type="submit">Aplicar preço</button>
          </form>
        </aside>

        <div class="offers-results">
          <form class="offers-toolbar" role="search" @submit.prevent="submitSearch">
            <label for="offers-search">Buscar produtos</label>
            <div class="offers-search-row"><input id="offers-search" v-model="searchInput" type="search" maxlength="100" placeholder="Nome, categoria ou termo"><button class="button button-primary" type="submit">Buscar</button></div>
            <label for="offers-sort">Ordenar por</label>
            <select id="offers-sort" :value="value('sort', 'recent')" @change="setQuery('sort', $event.target.value)"><option v-for="option in sortOptions" :key="option.value" :value="option.value" :disabled="option.value.startsWith('price') && !result.hasPrices">{{ option.label }}</option></select>
          </form>
          <p class="offers-count" aria-live="polite">{{ result.total }} {{ result.total === 1 ? 'oferta encontrada' : 'ofertas encontradas' }}</p>
          <p v-if="loading" class="offers-state" role="status">Carregando ofertas…</p>
          <div v-else-if="error" class="offers-state" role="alert"><p>{{ error }}</p><button class="button button-secondary" type="button" @click="retryToken++">Tentar novamente</button></div>
          <div v-else-if="!result.items.length" class="offers-state"><h2>Nenhuma oferta encontrada</h2><p>Não há produtos para estes filtros no momento. Ajuste a busca ou volte mais tarde.</p></div>
          <div v-else class="offers-grid">
            <article v-for="item in result.items" :key="item.id" class="offer-card">
              <div class="offer-card-image"><img v-if="item.imageUrl && !failedImages.has(item.id)" :src="item.imageUrl" :alt="item.name" loading="lazy" @error="failedImages.add(item.id)"><span v-else class="offer-card-image-empty">Imagem indisponível</span></div>
              <div class="offer-card-body">
                <p class="offer-card-label">Publicidade · {{ labelFor(item.marketplace) }} · {{ item.category }}</p>
                <h2 :title="item.name">{{ item.name }}</h2>
                <p v-if="item.description" class="offer-card-description">{{ item.description }}</p>
                <div class="offer-card-footer">
                  <p v-if="item.priceCents !== null" class="offer-card-price">{{ money(item.priceCents) }}</p>
                  <p v-if="item.priceUpdatedAt" class="offer-card-price-note">{{ item.priceSource }} · {{ dateLabel(item.priceUpdatedAt) }} · O preço pode mudar na loja.</p>
                  <p v-else class="offer-card-price-note">Consultar preço na loja</p>
                  <a class="button button-primary" :href="item.affiliateUrl" target="_blank" rel="sponsored noopener noreferrer">Ver na {{ labelFor(item.marketplace) }} <span aria-hidden="true">↗</span></a>
                </div>
              </div>
            </article>
          </div>
          <nav v-if="!loading && !error && result.pages > 1" class="offers-pagination" aria-label="Páginas de ofertas"><button type="button" :disabled="result.page <= 1" @click="setPage(result.page - 1)">Anterior</button><span>Página {{ result.page }} de {{ result.pages }}</span><button type="button" :disabled="result.page >= result.pages" @click="setPage(result.page + 1)">Próxima</button></nav>
        </div>
      </div>
      <p class="offers-footer-note">Os links levam às lojas indicadas. O Filamind não processa a compra nesta página e não informa vendas ou comissões geradas por cliques.</p>
    </div>
  </main>
</template>
