<script setup>
import { systemUrl } from '../../config.js'
import BaseButton from '../ui/BaseButton.vue'
</script>

<template>
<section class="signup" aria-labelledby="signup-title">
      <div class="page-container"><div class="signup-card">
        <span class="signup-symbol"><img src="/assets/logoF-icon.png" alt="" width="30" height="30"></span>
        <h2 id="signup-title">Seu próximo passo não precisa ser mais uma planilha.</h2>
        <p>Comece a organizar seu negócio de impressão 3D com mais clareza. Crie sua conta gratuita no Filamind.</p>
        <BaseButton :href="systemUrl" variant="white">Criar minha conta grátis <img src="/assets/figma/desktop-arrow-right2.svg" alt="" width="17" height="17"></BaseButton>
        <small>O cadastro e as condições do PRO são apresentados na plataforma.</small>
      </div></div>
    </section>
</template>
