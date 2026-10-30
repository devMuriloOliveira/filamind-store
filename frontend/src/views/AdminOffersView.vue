<script setup>
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'

const categories = ['Filamentos', 'Impressoras 3D', 'Bicos e hotends', 'Peças de reposição', 'Ferramentas', 'Acessórios', 'Manutenção', 'Outros']
const marketplaces = [{ id: 'mercado_livre', name: 'Mercado Livre' }, { id: 'shopee', name: 'Shopee' }, { id: 'amazon', name: 'Amazon' }]
const status = ref('loading')
const message = ref('')
const localMode = ref(false)
const loginCode = ref('')
const catalog = ref({ products: [], offers: [] })
const summary = ref(null)
const productPage = ref(1)
const offerPage = ref(1)
const pages = reactive({ products: 1, offers: 1 })
const totals = reactive({ products: 0, offers: 0 })
const categoryFilter = ref('')
const marketplaceFilter = ref('')
const statusFilter = ref('')
const productSearch = ref('')
const productChoices = ref([])
const search = ref('')
const productId = ref('')
const offerId = ref('')
const imageInput = ref(null)
const selectedImage = ref(null)
const selectedImageValid = ref(false)
const uploadedImageUrl = ref('')
const previewDataUrl = ref('')
const imageMessage = ref('')
const imagePreviewFailed = ref(false)
const uploadingImage = ref(false)
let imageReader = null
let imageSelection = 0
const product = reactive({ name: '', description: '', category: 'Filamentos', keywords: '', imageUrl: '', imageRightsSource: '', featured: false, active: false })
const offer = reactive({ productId: '', marketplace: 'mercado_livre', affiliateUrl: '', affiliateConfirmed: false, active: false, price: '', priceDisplayAuthorized: false, priceSource: '', priceUpdatedAt: '', availability: 'unknown', availabilityConfirmedAt: '' })
async function request(path, options = {}) {
  let response
  try { response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }) }
  catch { throw new Error('Falha de conexão. Confira o servidor e tente novamente.') }
  let body
  try { body = await response.json() }
  catch { throw new Error('Resposta inesperada do servidor. Tente novamente.') }
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/admin/login') status.value = 'login'
    throw new Error(body.error || 'Não foi possível concluir a operação.')
  }
  return body
}
let loadRevision = 0
async function load() {
  const revision = ++loadRevision
  const filters = new URLSearchParams({ q: search.value, category: categoryFilter.value, marketplace: marketplaceFilter.value, status: statusFilter.value })
  const [stats, products, offers] = await Promise.all([
    request('/api/admin/summary'),
    request(`/api/admin/products?${filters}&page=${productPage.value}`),
    request(`/api/admin/offers?${filters}&page=${offerPage.value}`),
  ])
  if (revision !== loadRevision) return
  summary.value = stats
  catalog.value = { products: products.items, offers: offers.items }
  Object.assign(pages, { products: products.pages, offers: offers.pages })
  Object.assign(totals, { products: products.total, offers: offers.total })
  productPage.value = products.page
  offerPage.value = offers.page
}
async function loadProductChoices() {
  const response = await request(`/api/admin/products?q=${encodeURIComponent(productSearch.value)}&page=1`)
  const selected = productChoices.value.find((item) => item.id === offer.productId)
  productChoices.value = selected && !response.items.some((item) => item.id === selected.id) ? [selected, ...response.items] : response.items
}
function changePage(kind, next) {
  if (kind === 'products') productPage.value = next
  else offerPage.value = next
  load().catch((error) => { message.value = error.message })
}
let filterTimer
watch([search, categoryFilter, marketplaceFilter, statusFilter], () => {
  productPage.value = 1; offerPage.value = 1
  clearTimeout(filterTimer)
  filterTimer = setTimeout(() => { if (status.value === 'authorized') load().catch((error) => { message.value = error.message }) }, 250)
})
let productSearchTimer
watch(productSearch, () => {
  clearTimeout(productSearchTimer)
  productSearchTimer = setTimeout(() => { if (status.value === 'authorized') loadProductChoices().catch((error) => { message.value = error.message }) }, 250)
})
onUnmounted(() => { clearTimeout(filterTimer); clearTimeout(productSearchTimer) })
onMounted(async () => {
  try {
    const response = await fetch('/api/admin/status', { credentials: 'same-origin' })
    const access = await response.json()
    localMode.value = access.localAdmin === true
    if (response.status === 401 && access.localLogin === true) status.value = 'login'
    else if (response.ok && access.authorized === true) { status.value = 'authorized'; await Promise.all([load(), loadProductChoices()]) }
    else throw new Error(access.error || 'Acesso administrativo indisponível.')
  } catch (error) { if (status.value !== 'login') status.value = 'unavailable'; message.value = error.message }
})
async function login() {
  message.value = ''
  try {
    await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ code: loginCode.value }) })
    loginCode.value = ''
    status.value = 'authorized'
    await Promise.all([load(), loadProductChoices()])
  } catch (error) { message.value = error.message }
}
async function logout() {
  try {
    await request('/api/admin/logout', { method: 'POST' })
    catalog.value = { products: [], offers: [] }; summary.value = null; productChoices.value = []
    status.value = 'login'
    message.value = ''
  } catch (error) { message.value = error.message }
}
const clearSelectedImage = () => {
  imageSelection++
  if (imageReader?.readyState === FileReader.LOADING) imageReader.abort()
  imageReader = null
  if (imageInput.value) imageInput.value.value = ''
  previewDataUrl.value = ''
  selectedImage.value = null
  selectedImageValid.value = false
  uploadedImageUrl.value = ''
}
onUnmounted(clearSelectedImage)
const resetProduct = () => { clearSelectedImage(); imageMessage.value = ''; imagePreviewFailed.value = false; productId.value = ''; Object.assign(product, { name: '', description: '', category: 'Filamentos', keywords: '', imageUrl: '', imageRightsSource: '', featured: false, active: false }) }
const resetOffer = () => { offerId.value = ''; Object.assign(offer, { productId: '', marketplace: 'mercado_livre', affiliateUrl: '', affiliateConfirmed: false, active: false, price: '', priceDisplayAuthorized: false, priceSource: '', priceUpdatedAt: '', availability: 'unknown', availabilityConfirmedAt: '' }) }
const onMarketplaceChange = () => {
  offer.affiliateUrl = ''
  offer.affiliateConfirmed = false
  offer.price = ''
  offer.priceDisplayAuthorized = false
  offer.priceSource = ''
  offer.priceUpdatedAt = ''
  offer.availability = 'unknown'
  offer.availabilityConfirmedAt = ''
}
const editProduct = (item) => { clearSelectedImage(); imagePreviewFailed.value = false; imageMessage.value = item.imageUrl ? 'Imagem já cadastrada. Selecione outra para substituir.' : 'Este produto ainda não tem imagem cadastrada.'; productId.value = item.id; Object.assign(product, item, { keywords: item.keywords.join(', ') }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
const editOffer = (item) => { offerId.value = item.id; if (!productChoices.value.some((p) => p.id === item.productId)) productChoices.value = [{ id: item.productId, name: item.productName }, ...productChoices.value]; Object.assign(offer, item, { price: item.priceCents === null ? '' : String(item.priceCents / 100), priceUpdatedAt: item.priceUpdatedAt ? item.priceUpdatedAt.slice(0, 16) : '', availabilityConfirmedAt: item.availabilityConfirmedAt ? item.availabilityConfirmedAt.slice(0, 16) : '' }); window.scrollTo({ top: 0, behavior: 'smooth' }) }

async function saveProduct() {
  message.value = ''
  if (uploadingImage.value || (selectedImage.value && !uploadedImageUrl.value)) { imageMessage.value = 'Conclua o envio da imagem antes de salvar o produto.'; return }
  try {
    const body = { ...product, keywords: product.keywords.split(',').map((item) => item.trim()).filter(Boolean) }
    const saved = await request(productId.value ? `/api/admin/products/${productId.value}` : '/api/admin/products', { method: productId.value ? 'PUT' : 'POST', body: JSON.stringify(body) })
    resetProduct(); await Promise.all([load(), loadProductChoices()]); message.value = saved.imageUrl ? 'Produto salvo com imagem.' : 'Produto salvo sem imagem. Você pode editar e enviar uma imagem depois.'
  } catch (error) { message.value = error.message }
}
async function saveOffer() {
  message.value = ''
  try {
    if (offer.price && !offer.priceUpdatedAt) throw new Error('Informe a data de atualização do preço.')
    if (offer.availability !== 'unknown' && !offer.availabilityConfirmedAt) throw new Error('Informe a data de confirmação da disponibilidade.')
    const body = { ...offer, priceCents: offer.marketplace !== 'amazon' && offer.price !== '' ? Math.round(Number(offer.price) * 100) : null, priceUpdatedAt: offer.price ? new Date(offer.priceUpdatedAt).toISOString() : null, availabilityConfirmedAt: offer.availability !== 'unknown' ? new Date(offer.availabilityConfirmedAt).toISOString() : null }
    delete body.price
    await request(offerId.value ? `/api/admin/offers/${offerId.value}` : '/api/admin/offers', { method: offerId.value ? 'PUT' : 'POST', body: JSON.stringify(body) })
    resetOffer(); await load(); message.value = 'Oferta salva.'
  } catch (error) { message.value = error.message }
}
async function remove(kind, id) {
  if (!window.confirm(`Remover este ${kind === 'products' ? 'produto e desativar suas ofertas' : 'link de oferta'}?`)) return
  try { await request(`/api/admin/${kind}/${id}`, { method: 'DELETE' }); await Promise.all([load(), loadProductChoices()]); message.value = 'Registro removido da vitrine.' }
  catch (error) { message.value = error.message }
}
const hasImageSignature = (fileType, bytes) => {
  if (fileType === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  if (fileType === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (fileType === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  return false
}
async function selectImage(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const selection = ++imageSelection
  if (imageReader?.readyState === FileReader.LOADING) imageReader.abort()
  imageReader = null
  previewDataUrl.value = ''
  selectedImage.value = file
  selectedImageValid.value = false
  uploadedImageUrl.value = ''
  imagePreviewFailed.value = false
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { imageMessage.value = 'Selecione uma imagem PNG, JPEG ou WebP.'; return }
  if (!file.size) { imageMessage.value = 'O arquivo selecionado está vazio.'; return }
  if (file.size > 2 * 1024 * 1024) { imageMessage.value = 'A imagem deve ter no máximo 2 MB.'; return }
  imageMessage.value = 'Verificando imagem…'
  try {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    if (selection !== imageSelection) return
    if (!hasImageSignature(file.type, header)) { imageMessage.value = 'O conteúdo do arquivo não corresponde ao formato PNG, JPEG ou WebP informado.'; return }
    imageReader = new FileReader()
    imageReader.onload = () => {
      if (selection !== imageSelection) return
      if (typeof imageReader.result !== 'string') { imageMessage.value = 'Não foi possível ler o arquivo selecionado.'; return }
      previewDataUrl.value = imageReader.result
      imageMessage.value = 'Carregando prévia…'
    }
    imageReader.onerror = () => { if (selection === imageSelection) imageMessage.value = 'Não foi possível ler o arquivo selecionado.' }
    imageReader.readAsDataURL(file)
  } catch { if (selection === imageSelection) imageMessage.value = 'Não foi possível ler o arquivo selecionado.' }
}
function onImagePreviewLoad() {
  if (selectedImage.value && previewDataUrl.value && !imagePreviewFailed.value) {
    selectedImageValid.value = true
    imageMessage.value = 'Prévia pronta. Clique em Enviar imagem para concluir o upload.'
  }
}
function onImagePreviewError() {
  imagePreviewFailed.value = true
  if (selectedImage.value) { selectedImageValid.value = false; uploadedImageUrl.value = '' }
  imageMessage.value = selectedImage.value ? 'O navegador não conseguiu decodificar a imagem. O arquivo pode estar danificado ou com formato incorreto.' : 'A imagem cadastrada não pôde ser carregada. Envie outra imagem.'
}
async function uploadImage() {
  const file = selectedImage.value
  if (!file || uploadingImage.value) return
  if (!selectedImageValid.value) { imageMessage.value = 'Escolha uma imagem PNG, JPEG ou WebP válida de até 2 MB.'; return }
  if (!product.imageRightsSource.trim()) { imageMessage.value = 'Informe a origem e autorização da imagem antes de enviá-la.'; return }
  uploadingImage.value = true
  imageMessage.value = 'Enviando imagem…'
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    const body = await request('/api/admin/images', { method: 'POST', body: JSON.stringify({ mime: file.type, dataBase64: btoa(binary), rightsSource: product.imageRightsSource }) })
    product.imageUrl = body.imageUrl
    uploadedImageUrl.value = body.imageUrl
    imageMessage.value = 'Upload concluído. A imagem está pronta; salve o produto para associá-la.'
  } catch (error) { imageMessage.value = error instanceof TypeError ? 'Falha de conexão no upload. Verifique se o backend está em execução e tente novamente.' : `Falha no upload: ${error.message} Tente novamente.` }
  finally { uploadingImage.value = false }
}
</script>

<template>
  <main id="conteudo" class="admin-offers-main page-container">
    <p class="eyebrow">ADMINISTRAÇÃO COMERCIAL</p><h1>Gerenciar ofertas</h1>
    <p v-if="status === 'loading'" role="status">Verificando permissão administrativa…</p>
    <div v-else-if="status === 'unavailable'" class="admin-offers-notice" role="status"><h2>Acesso administrativo indisponível</h2><p>{{ message }}</p><p>A integração com a autenticação do sistema principal será definida antes de habilitar cadastros. Nenhum usuário PRO recebe acesso automaticamente.</p></div>
    <form v-else-if="status === 'login'" class="admin-offers-panel admin-offers-login" @submit.prevent="login">
      <h2>Acesso local de desenvolvimento</h2>
      <p>Digite o código temporário exibido no terminal que iniciou o servidor. Ele vale apenas neste computador e nesta execução.</p>
      <label>Código temporário <input v-model="loginCode" type="password" autocomplete="one-time-code" required autofocus></label>
      <p v-if="message" class="admin-offers-message" role="alert">{{ message }}</p>
      <button class="button button-primary" type="submit">Acessar painel</button>
    </form>
    <template v-else>
      <p class="admin-offers-notice">Cadastre apenas produtos reais, imagens autorizadas e links gerados nos programas de afiliados. Ative produto e oferta para aparecerem na página pública.</p>
      <button v-if="localMode" class="button button-secondary admin-offers-logout" type="button" @click="logout">Encerrar acesso local</button>
      <p class="admin-offers-message" role="status">{{ message }}</p>
      <section v-if="summary" class="admin-offers-summary" aria-label="Resumo do catálogo">
        <div><strong>{{ summary.products }}</strong><span>Produtos</span></div>
        <div><strong>{{ summary.offers }}</strong><span>Ofertas</span></div>
        <div><strong>{{ summary.activeOffers }}</strong><span>Ofertas ativas</span></div>
        <div><strong>{{ summary.inactiveOffers }}</strong><span>Ofertas inativas</span></div>
        <div><strong>{{ summary.byMarketplace.shopee }}</strong><span>Produtos Shopee</span></div>
        <div><strong>{{ summary.byMarketplace.mercado_livre }}</strong><span>Produtos Mercado Livre</span></div>
        <div><strong>{{ summary.byMarketplace.amazon }}</strong><span>Produtos Amazon</span></div>
        <div><strong>{{ summary.productsWithoutImage }}</strong><span>Produtos sem imagem</span></div>
        <div><strong>{{ summary.offersWithoutPrice }}</strong><span>Ofertas sem preço</span></div>
        <div><strong>{{ summary.offersForReview }}</strong><span>Links a revisar</span></div>
      </section>
      <div class="admin-offers-forms">
        <form class="admin-offers-panel" @submit.prevent="saveProduct">
          <h2>{{ productId ? 'Editar produto' : 'Novo produto' }}</h2>
          <label>Nome <input v-model="product.name" required minlength="3" maxlength="140"></label>
          <label>Descrição curta <textarea v-model="product.description" maxlength="500" rows="3"></textarea></label>
          <label>Categoria <select v-model="product.category"><option v-for="category in categories" :key="category">{{ category }}</option></select></label>
          <label>Termos de busca, separados por vírgula <input v-model="product.keywords" maxlength="400"></label>
          <label>Origem e autorização da imagem <input v-model="product.imageRightsSource" maxlength="160" placeholder="Ex.: imagem própria ou licença documentada"></label>
          <label>Imagem PNG, JPEG ou WebP (até 2 MB) <input ref="imageInput" type="file" accept="image/png,image/jpeg,image/webp" :disabled="uploadingImage" @change="selectImage"></label>
          <p v-if="selectedImage" class="admin-offers-image-path">Arquivo selecionado: {{ selectedImage.name }}</p>
          <div class="admin-offers-image-preview"><img v-if="(previewDataUrl || product.imageUrl) && !imagePreviewFailed" :src="previewDataUrl || product.imageUrl" alt="Prévia da imagem do produto" @load="onImagePreviewLoad" @error="onImagePreviewError"><p v-else>{{ product.imageUrl ? 'Imagem cadastrada indisponível. Envie outra imagem para substituí-la.' : 'Nenhuma imagem cadastrada.' }}</p></div>
          <button v-if="selectedImage && !uploadedImageUrl" class="button button-secondary admin-offers-upload" type="button" :disabled="uploadingImage || !selectedImageValid" @click="uploadImage">{{ uploadingImage ? 'Enviando…' : 'Enviar imagem' }}</button>
          <p v-if="imageMessage" class="admin-offers-image-status" role="status">{{ imageMessage }}</p>
          <p v-if="product.imageUrl" class="admin-offers-image-path">Imagem cadastrada: {{ product.imageUrl }}</p>
          <label class="admin-offers-check"><input v-model="product.featured" type="checkbox"> Destaque</label>
          <label class="admin-offers-check"><input v-model="product.active" type="checkbox"> Produto ativo</label>
          <div class="admin-offers-actions"><button class="button button-primary" type="submit" :disabled="uploadingImage">Salvar produto</button><button class="button button-secondary" type="button" :disabled="uploadingImage" @click="resetProduct">Limpar</button></div>
        </form>
        <form class="admin-offers-panel" @submit.prevent="saveOffer">
          <h2>{{ offerId ? 'Editar oferta' : 'Nova oferta' }}</h2>
          <label>Buscar produto para associar <input v-model="productSearch" type="search" placeholder="Digite o nome do produto"></label>
          <label>Produto <select v-model="offer.productId" required><option value="">Selecione</option><option v-for="item in productChoices" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
          <p class="admin-offers-help">Confira se o link corresponde exatamente ao produto selecionado. A busca mostra até 20 produtos por vez.</p>
          <label>Marketplace <select v-model="offer.marketplace" @change="onMarketplaceChange"><option v-for="item in marketplaces" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
          <label>Link de afiliado HTTPS <input v-model="offer.affiliateUrl" type="url" required maxlength="2048" placeholder="Cole o link real da sua conta"></label>
          <label class="admin-offers-check"><input v-model="offer.affiliateConfirmed" type="checkbox"> Confirmo que o link é meu e foi gerado no programa de afiliados</label>
          <template v-if="offer.marketplace !== 'amazon'">
            <label>Preço em R$ (opcional) <input v-model="offer.price" type="number" min="0.01" step="0.01" inputmode="decimal"></label>
            <template v-if="offer.price"><label class="admin-offers-check"><input v-model="offer.priceDisplayAuthorized" type="checkbox"> Tenho autorização para exibir este preço</label><label>Origem do preço <input v-model="offer.priceSource" maxlength="160" required></label><label>Atualizado em <input v-model="offer.priceUpdatedAt" type="datetime-local" required></label></template>
          </template>
          <p v-else class="admin-offers-help">Preço e disponibilidade da Amazon exigem integração oficial e não são cadastrados manualmente aqui.</p>
          <label>Disponibilidade <select v-model="offer.availability" :disabled="offer.marketplace === 'amazon'"><option value="unknown">Não confirmada</option><option value="available">Confirmada disponível</option><option value="unavailable">Confirmada indisponível</option></select></label>
          <label v-if="offer.availability !== 'unknown' && offer.marketplace !== 'amazon'">Confirmada em <input v-model="offer.availabilityConfirmedAt" type="datetime-local" required></label>
          <label class="admin-offers-check"><input v-model="offer.active" type="checkbox"> Oferta ativa</label>
          <div class="admin-offers-actions"><button class="button button-primary" type="submit">Salvar oferta</button><button class="button button-secondary" type="button" @click="resetOffer">Limpar</button></div>
        </form>
      </div>
      <section class="admin-offers-list"><h2>Registros</h2>
        <div class="admin-offers-filters">
          <label>Buscar cadastrados <input v-model="search" type="search" placeholder="Produto, categoria ou marketplace"></label>
          <label>Categoria <select v-model="categoryFilter"><option value="">Todas</option><option v-for="category in categories" :key="category">{{ category }}</option></select></label>
          <label>Marketplace <select v-model="marketplaceFilter"><option value="">Todos</option><option v-for="item in marketplaces" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
          <label>Status <select v-model="statusFilter"><option value="">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
        </div>
        <h3>Produtos ({{ totals.products }})</h3><p v-if="!catalog.products.length">Nenhum produto encontrado.</p><ul><li v-for="item in catalog.products" :key="item.id"><span>{{ item.name }} · {{ item.category }} · {{ item.active ? 'Ativo' : 'Inativo' }}</span><div><button type="button" :disabled="uploadingImage" @click="editProduct(item)">Editar</button><button type="button" @click="remove('products', item.id)">Remover</button></div></li></ul>
        <nav v-if="pages.products > 1" class="admin-offers-pagination" aria-label="Páginas de produtos"><button type="button" :disabled="productPage <= 1" @click="changePage('products', productPage - 1)">Anterior</button><span>Página {{ productPage }} de {{ pages.products }}</span><button type="button" :disabled="productPage >= pages.products" @click="changePage('products', productPage + 1)">Próxima</button></nav>
        <h3>Ofertas ({{ totals.offers }})</h3><p v-if="!catalog.offers.length">Nenhuma oferta encontrada.</p><ul><li v-for="item in catalog.offers" :key="item.id"><span>{{ item.productName }} · {{ marketplaces.find((m) => m.id === item.marketplace)?.name }} · {{ item.active ? 'Ativa' : 'Inativa' }}</span><div><button type="button" @click="editOffer(item)">Editar</button><button type="button" @click="remove('offers', item.id)">Remover</button></div></li></ul>
        <nav v-if="pages.offers > 1" class="admin-offers-pagination" aria-label="Páginas de ofertas"><button type="button" :disabled="offerPage <= 1" @click="changePage('offers', offerPage - 1)">Anterior</button><span>Página {{ offerPage }} de {{ pages.offers }}</span><button type="button" :disabled="offerPage >= pages.offers" @click="changePage('offers', offerPage + 1)">Próxima</button></nav>
      </section>
    </template>
  </main>
</template>
