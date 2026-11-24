import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import OffersView from '../views/OffersView.vue'
import PrivacyView from '../views/PrivacyView.vue'
import TermsView from '../views/TermsView.vue'
import CookiesView from '../views/CookiesView.vue'
import RefundView from '../views/RefundView.vue'

async function canOpenAdmin() {
  try {
    const response = await fetch('/api/admin/status', { credentials: 'same-origin' })
    if (!response.headers.get('content-type')?.includes('application/json')) return true
    const body = await response.json()
    return body.authorized === true || response.status === 401 ? true : '/'
  } catch { return true }
}

const routes = [
  { path: '/', component: HomeView, meta: { title: 'Filamind | Gestão para negócios de impressão 3D', description: 'Gerencie seu negócio de impressão 3D com mais controle. Organize custos, vendas, estoque, produção e clientes com a Filamind.' } },
  { path: '/ofertas/', component: OffersView, meta: { title: 'Ofertas para impressão 3D | Filamind', description: 'Encontre produtos selecionados para impressão 3D e acesse as ofertas diretamente nas lojas de origem.' } },
  { path: '/privacidade/', component: PrivacyView, meta: { title: 'Política de Privacidade | Filamind', description: 'Minuta de privacidade da landing page Filamind, pendente de validação.' } },
  { path: '/termos/', component: TermsView, meta: { title: 'Termos de Serviço | Filamind', description: 'Minuta dos termos de serviço Filamind, pendente de validação.' } },
  { path: '/cookies/', component: CookiesView, meta: { title: 'Política de Cookies | Filamind', description: 'Preferências de cookies e armazenamento local na landing page Filamind.' } },
  { path: '/reembolso/', component: RefundView, meta: { title: 'Política de Reembolso e Cancelamento | Filamind', description: 'Minuta de reembolso e cancelamento Filamind, pendente de validação.' } },
  { path: '/admin/ofertas/', component: () => import('../views/AdminOffersView.vue'), beforeEnter: canOpenAdmin, meta: { title: 'Gerenciar ofertas | Filamind', description: 'Área administrativa de ofertas Filamind.' } },
  { path: '/promocoes/:pathMatch(.*)*', redirect: '/ofertas/' },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    if (to.path !== from.path) return { top: 0 }
  },
})

router.afterEach((to) => {
  document.title = to.meta.title
  document.querySelector('meta[name="description"]').content = to.meta.description
})

export default router
