<script setup>
import { systemUrl } from '../../config.js'
import { useCookiePreferences } from '../../composables/useCookiePreferences.js'

const { openDialog } = useCookiePreferences()
const year = new Date().getFullYear()
</script>

<template>
  <footer class="site-footer">
    <div class="page-container">
      <div class="footer-main">
        <div class="footer-brand"><RouterLink class="brand" to="/#inicio" aria-label="Filamind, voltar ao início"><span class="brand-symbol"><img src="/assets/logoF-icon.png" alt="" width="34" height="34"></span><span>Filamind</span></RouterLink><p>Gestão de custos, vendas e produção para negócios de impressão 3D.</p></div>
        <div class="footer-links"><div><strong>PLATAFORMA</strong><RouterLink to="/#funcionalidades">Funcionalidades</RouterLink><RouterLink to="/#planos">Planos</RouterLink><RouterLink to="/ofertas/">Ofertas</RouterLink></div><div><strong>SUA CONTA</strong><a :href="systemUrl" target="_blank" rel="noopener noreferrer">Entrar</a><a class="footer-start" :href="systemUrl" target="_blank" rel="noopener noreferrer">Começar grátis →</a></div></div>
      </div>
      <div class="footer-bottom"><span>© <span>{{ year }}</span> Filamind. Dados legais do fornecedor: pendentes de validação.</span><div class="legal-links"><RouterLink to="/privacidade/">Privacidade</RouterLink><RouterLink to="/termos/">Termos de serviço</RouterLink><RouterLink to="/cookies/">Cookies</RouterLink><RouterLink to="/reembolso/">Reembolso e cancelamento</RouterLink><button type="button" @click="openDialog($event.currentTarget)">Preferências de cookies</button></div></div>
    </div>
  </footer>
</template>
