import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index.js'
import './assets/styles/landing.css'
import './assets/styles/offers.css'
import './assets/styles/admin-offers.css'

createApp(App).use(router).mount('#app')
