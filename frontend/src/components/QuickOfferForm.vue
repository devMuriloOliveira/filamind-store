<script setup>
import { reactive, ref } from 'vue'

const props = defineProps({ request: { type: Function, required: true } })
const emit = defineEmits(['created'])
const categories = [
  { value: 'impressoras-3d', label: 'Impressoras 3D' },
  { value: 'filamentos', label: 'Filamentos' },
  { value: 'pecas-reposicao', label: 'Peças e reposição' },
  { value: 'acessorios-ferramentas', label: 'Acessórios e ferramentas' },
  { value: 'resinas', label: 'Resinas' },
  { value: 'kits-combos', label: 'Kits e combos' },
]
const marketplaces = [
  { value: 'mercado_livre', label: 'Mercado Livre' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'amazon', label: 'Amazon' },
]
const initial = () => ({ name: '', description: '', category: '', priceFrom: '', priceBy: '', marketplace: '', affiliateUrl: '' })
const fields = reactive(initial())
const errors = reactive({})
const busy = ref(false)
const notice = ref('')
const selectedImage = ref(null)
const preview = ref('')
const uploadedImageUrl = ref('')
const imageDecoded = ref(false)
const imageInput = ref(null)
let imageReader = null
let imageRevision = 0

function clearImage(resetInput = true) {
  imageRevision++
  if (imageReader?.readyState === FileReader.LOADING) imageReader.abort()
  imageReader = null
  selectedImage.value = null
  preview.value = ''
  imageDecoded.value = false
  uploadedImageUrl.value = ''
  if (resetInput && imageInput.value) imageInput.value.value = ''
}
function changeMarketplace() {
  if (fields.marketplace === 'amazon') { fields.priceFrom = ''; fields.priceBy = '' }
  delete errors.marketplace
  delete errors.priceFrom
  delete errors.priceBy
}
async function selectImage(event) {
  const file = event.target.files?.[0]
  clearImage(false)
  if (!file) return
  const revision = imageRevision
  selectedImage.value = file
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 2 * 1024 * 1024) {
    errors.image = 'Escolha PNG, JPEG ou WebP de até 2 MiB.'
    return
  }
  let bytes
  try { bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer()) }
  catch { errors.image = 'Não foi possível ler a imagem.'; return }
  if (revision !== imageRevision) return
  const png = file.type === 'image/png' && [137, 80, 78, 71, 13, 10, 26, 10].every((part, i) => bytes[i] === part)
  const jpeg = file.type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp = file.type === 'image/webp' && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (!png && !jpeg && !webp) { errors.image = 'O conteúdo não corresponde ao formato da imagem.'; return }
  imageReader = new FileReader()
  imageReader.onload = () => { if (revision === imageRevision && typeof imageReader.result === 'string') preview.value = imageReader.result }
  imageReader.onerror = () => { if (revision === imageRevision) errors.image = 'Não foi possível ler a imagem.' }
  imageReader.readAsDataURL(file)
  delete errors.image
}
function validate() {
  for (const key of Object.keys(errors)) delete errors[key]
  if (fields.name.trim().length < 3) errors.name = 'Informe o nome do produto (mínimo de 3 caracteres).'
  if (!categories.some((item) => item.value === fields.category)) errors.category = 'Selecione uma categoria.'
  if (!marketplaces.some((item) => item.value === fields.marketplace)) errors.marketplace = 'Selecione um marketplace.'
  try {
    const url = new URL(fields.affiliateUrl)
    const host = { mercado_livre: 'mercadolivre.com.br', shopee: 'shopee.com.br', amazon: 'amazon.com.br' }[fields.marketplace]
    if (!host || url.protocol !== 'https:' || url.username || url.password || url.port || !(url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new Error()
  } catch { errors.affiliateUrl = 'Use um link HTTPS do marketplace selecionado.' }
  const parse = (value, field) => {
    if (!value.trim()) return null
    if (!/^\d{1,7}(?:,\d{1,2})?$/.test(value.trim())) { errors[field] = 'Use reais e vírgula para centavos, como 199,90.'; return null }
    const [reais, cents = ''] = value.trim().split(',')
    const amount = Number(reais) * 100 + Number(cents.padEnd(2, '0'))
    if (amount < 1 || amount > 100000000) errors[field] = 'Informe um valor positivo de até R$ 1.000.000.'
    return amount
  }
  const from = parse(fields.priceFrom, 'priceFrom')
  const by = parse(fields.priceBy, 'priceBy')
  if (from !== null && (by === null || from <= by)) errors.priceFrom = 'O preço de deve ser maior que o preço por.'
  if (fields.marketplace === 'amazon' && (from !== null || by !== null)) errors.priceBy = 'Preço manual da Amazon não é permitido.'
  if (selectedImage.value && !imageDecoded.value) errors.image = 'Aguarde a prévia válida antes de cadastrar.'
  return Object.keys(errors).length === 0
}
async function submit() {
  if (busy.value) return
  notice.value = ''
  if (!validate()) return
  busy.value = true
  try {
    let imageUrl = uploadedImageUrl.value
    if (selectedImage.value && !imageUrl) {
      const dataBase64 = preview.value.split(',')[1]
      const image = await props.request('/api/admin/images', { method: 'POST', body: JSON.stringify({ mime: selectedImage.value.type, dataBase64, rightsSource: 'Uso autorizado declarado pelo administrador no cadastro' }) })
      imageUrl = image.imageUrl
      uploadedImageUrl.value = imageUrl
    }
    await props.request('/api/admin/complete-offers', { method: 'POST', body: JSON.stringify({ ...fields, imageUrl, affiliateConfirmed: true, priceAuthorized: true, imageAuthorized: true }) })
    Object.assign(fields, initial())
    clearImage()
    notice.value = 'Oferta cadastrada e ativa na vitrine.'
    emit('created')
  } catch (error) { notice.value = error.message }
  finally { busy.value = false }
}
</script>

<template>
  <form class="admin-offers-panel admin-quick-offer" :aria-busy="busy" novalidate @submit.prevent="submit">
    <h2>Nova oferta</h2>
    <p class="admin-offers-help">Cadastre produto e oferta juntos. Os campos com * são obrigatórios.</p>
    <label for="quick-name">Nome do produto * <input id="quick-name" v-model="fields.name" required minlength="3" maxlength="140" :aria-invalid="!!errors.name"></label>
    <p v-if="errors.name" class="admin-field-error" role="alert">{{ errors.name }}</p>
    <label for="quick-description">Descrição curta <textarea id="quick-description" v-model="fields.description" maxlength="500" rows="3"></textarea></label>
    <label for="quick-category">Categoria * <select id="quick-category" v-model="fields.category" required :aria-invalid="!!errors.category"><option value="">Selecione</option><option v-for="item in categories" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
    <p v-if="errors.category" class="admin-field-error" role="alert">{{ errors.category }}</p>
    <label for="quick-marketplace">Marketplace * <select id="quick-marketplace" v-model="fields.marketplace" required :aria-invalid="!!errors.marketplace" @change="changeMarketplace"><option value="">Selecione</option><option v-for="item in marketplaces" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
    <p v-if="errors.marketplace" class="admin-field-error" role="alert">{{ errors.marketplace }}</p>
    <div v-if="fields.marketplace !== 'amazon'" class="admin-quick-prices">
      <label for="quick-price-from">Preço de (R$) <input id="quick-price-from" v-model="fields.priceFrom" type="text" inputmode="decimal" placeholder="Ex.: 249,90" :aria-invalid="!!errors.priceFrom"></label>
      <p v-if="errors.priceFrom" class="admin-field-error" role="alert">{{ errors.priceFrom }}</p>
      <label for="quick-price-by">Preço por (R$) <input id="quick-price-by" v-model="fields.priceBy" type="text" inputmode="decimal" placeholder="Ex.: 199,90" :aria-invalid="!!errors.priceBy"></label>
      <p v-if="errors.priceBy" class="admin-field-error" role="alert">{{ errors.priceBy }}</p>
      <p class="admin-offers-help">Preços opcionais. Ao informar, confirme que você tem autorização para divulgá-los; eles deixam de aparecer após 24 horas sem atualização.</p>
    </div>
    <p v-else class="admin-offers-help">A Amazon não permite cadastrar preços manualmente nesta vitrine. O preço será consultado na loja.</p>
    <label for="quick-link">Link de afiliado HTTPS * <input id="quick-link" v-model="fields.affiliateUrl" type="url" required maxlength="2048" placeholder="Cole o link gerado na sua conta" :aria-invalid="!!errors.affiliateUrl"></label>
    <p v-if="errors.affiliateUrl" class="admin-field-error" role="alert">{{ errors.affiliateUrl }}</p>
    <label for="quick-image">Imagem do produto <input id="quick-image" ref="imageInput" type="file" accept="image/png,image/jpeg,image/webp" @change="selectImage"></label>
    <p class="admin-offers-help">PNG, JPEG ou WebP, até 2 MiB. Envie somente imagem própria ou com direito de uso para esta vitrine.</p>
    <p v-if="errors.image" class="admin-field-error" role="alert">{{ errors.image }}</p>
    <div v-if="preview" class="admin-offers-image-preview"><img :src="preview" alt="Prévia da imagem selecionada" @load="imageDecoded = true" @error="imageDecoded = false; errors.image = 'Não foi possível decodificar a imagem.'"></div>
    <p class="admin-offers-help">Ao cadastrar, você declara que o link foi gerado na sua conta de afiliado e que tem autorização para usar a imagem e divulgar os preços informados.</p>
    <p v-if="notice" class="admin-offers-message" :role="notice.startsWith('Oferta cadastrada') ? 'status' : 'alert'">{{ notice }}</p>
    <button class="button button-primary" type="submit" :disabled="busy">{{ busy ? 'Cadastrando…' : 'Cadastrar oferta' }}</button>
  </form>
</template>
