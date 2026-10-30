<script setup>
import { useCookiePreferences } from '../../composables/useCookiePreferences.js'

const { preferences, analytics, marketing, openDialog, closeDialog, onDialogClose, save } = useCookiePreferences()
</script>

<template>
  <section v-if="!preferences" class="cookie-banner" aria-label="Preferências de cookies">
    <div><strong>Suas preferências de cookies</strong><p>Este site usa armazenamento local para guardar sua escolha. Não há rastreadores opcionais ativos nesta versão. Você pode escolher agora e mudar depois no rodapé. <RouterLink to="/cookies/">Leia a Política de Cookies</RouterLink>.</p></div>
    <div class="cookie-actions"><button type="button" class="button button-primary" @click="save(true, true)">Aceitar opcionais</button><button type="button" class="button button-secondary" @click="save(false, false)">Rejeitar opcionais</button><button type="button" class="button button-secondary" @click="openDialog($event.currentTarget)">Personalizar</button></div>
  </section>
  <dialog class="cookie-dialog" aria-labelledby="cookie-dialog-title" @close="onDialogClose">
    <h2 id="cookie-dialog-title">Personalizar cookies</h2><p>Necessários: armazenamento da sua escolha. Estão sempre ativos. Analytics e marketing não são usados atualmente.</p>
    <label><input id="cookie-analytics" v-model="analytics" type="checkbox"> Analíticos <small>Permissão para uma integração futura; nenhuma está ativa.</small></label>
    <label><input id="cookie-marketing" v-model="marketing" type="checkbox"> Marketing <small>Permissão para uma integração futura; nenhuma está ativa.</small></label>
    <div class="cookie-actions"><button type="button" class="button button-primary" @click="save(analytics, marketing)">Salvar preferências</button><button type="button" class="button button-secondary" @click="closeDialog">Fechar</button></div>
  </dialog>
</template>
