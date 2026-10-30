// URLs públicas do sistema principal. Variáveis VITE_ são visíveis no navegador.
const secureUrl = (value, fallback) => /^https:\/\/[^\s]+$/.test(value || '') ? value : fallback

export const systemUrl = secureUrl(import.meta.env.VITE_SYSTEM_URL, 'https://filamind.com.br/')
export const proUrl = secureUrl(import.meta.env.VITE_PRO_URL, new URL('/configuracoes/assinatura', systemUrl).href)
export const videoPath = import.meta.env.VITE_VIDEO_PATH || ''
export const videoPoster = import.meta.env.VITE_VIDEO_POSTER || ''
export const cookiePolicyVersion = '2026-10-27-draft'
