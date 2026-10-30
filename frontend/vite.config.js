import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'vue-page-routes',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.method === 'GET' && /^\/(?:ofertas|promocoes|privacidade|termos|cookies|reembolso|admin\/ofertas)\/?$/.test(new URL(req.url, 'http://localhost').pathname)) {
            req.url = '/index.html'
          }
          next()
        })
      },
    },
  ],
  server: { proxy: { '/api': 'http://127.0.0.1:4180', '/offer-images': 'http://127.0.0.1:4180' } },
})
