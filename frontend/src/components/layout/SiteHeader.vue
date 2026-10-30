<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { systemUrl } from '../../config.js'

const route = useRoute()
const menuOpen = ref(false)
const closeMenu = () => { menuOpen.value = false }
const onKeydown = (event) => { if (event.key === 'Escape') closeMenu() }
const onResize = () => { if (window.innerWidth > 700) closeMenu() }
onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <header class="site-header" id="inicio">
    <div class="page-container header-inner">
      <RouterLink class="brand" to="/#inicio" aria-label="Filamind, início" @click="closeMenu">
        <span class="brand-symbol"><img src="/assets/logoF-icon.png" alt="" width="34" height="34"></span>
        <span>Filamind</span>
      </RouterLink>
      <button class="menu-toggle" type="button" :aria-label="menuOpen ? 'Fechar menu' : 'Abrir menu'" :aria-expanded="menuOpen" aria-controls="main-nav" @click="menuOpen = !menuOpen"><span></span><span></span><span></span></button>
      <nav class="main-nav" :class="{ 'is-open': menuOpen }" id="main-nav" aria-label="Navegação principal" @click="closeMenu">
        <RouterLink to="/#funcionalidades">Funcionalidades</RouterLink>
        <RouterLink to="/#planos">Planos</RouterLink>
        <RouterLink to="/ofertas/" :aria-current="route.path === '/ofertas/' ? 'page' : undefined">Ofertas</RouterLink>
        <a :href="systemUrl" target="_blank" rel="noopener noreferrer">Entrar</a>
        <a class="button button-primary nav-cta" :href="systemUrl" target="_blank" rel="noopener noreferrer">Começar grátis</a>
      </nav>
      <a class="button button-primary header-cta" :href="systemUrl" target="_blank" rel="noopener noreferrer">Começar grátis</a>
    </div>
  </header>
</template>
