<script setup>
import { systemUrl } from '../../config.js'
import BaseButton from '../ui/BaseButton.vue'
</script>

<template>
  <section class="signup" aria-labelledby="signup-title">
    <div class="page-container signup-inner">
      <div>
        <p class="eyebrow">SEU PRÓXIMO PASSO</p>
        <h2 id="signup-title">Organize sua produção 3D sem complicar seu negócio.</h2>
        <p>Comece com o plano gratuito e conheça a plataforma no seu ritmo.</p>
      </div>
      <div class="signup-action"><BaseButton :href="systemUrl" variant="white">Criar minha conta grátis</BaseButton><small>Cadastro na plataforma Filamind.</small></div>
    </div>
  </section>
</template>
