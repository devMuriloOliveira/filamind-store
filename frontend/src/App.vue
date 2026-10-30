<script setup>
import SiteHeader from './components/layout/SiteHeader.vue'
import SiteFooter from './components/layout/SiteFooter.vue'
import CookiePreferences from './components/common/CookiePreferences.vue'
</script>

<template>
  <a class="skip-link" href="#conteudo">Ir para o conteúdo</a>
  <SiteHeader />
  <RouterView />
  <SiteFooter />
  <CookiePreferences />
</template>
