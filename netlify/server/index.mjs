import { createConfiguredOffersServer } from '../../backend/src/server.js'

if (process.env.NODE_ENV !== 'production') throw new Error('Netlify Server exige NODE_ENV=production.')
if (process.env.FILAMIND_IMAGE_STORAGE !== 'supabase') throw new Error('Netlify Server exige imagens no Supabase Storage.')

const { server } = await createConfiguredOffersServer()

export default server
export const config = { path: ['/api/*', '/offer-images/*'] }
