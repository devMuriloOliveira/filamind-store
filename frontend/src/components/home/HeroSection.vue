<script setup>
import { ref } from 'vue'
import { systemUrl, videoPath, videoPoster } from '../../config.js'
import BaseButton from '../ui/BaseButton.vue'

const videoAvailable = ref(/^\/[^/]/.test(videoPath))
const onVideoError = () => { videoAvailable.value = false }
</script>

<template>
  <section class="hero" aria-labelledby="hero-title">
    <div class="page-container hero-inner">
      <div class="hero-message">
        <p class="eyebrow">GESTÃO PARA NEGÓCIOS DE IMPRESSÃO 3D</p>
        <h1 id="hero-title">Controle seus custos. Organize suas vendas. <span>Faça sua impressão 3D crescer.</span></h1>
        <p class="hero-lead">Calcule o preço das suas peças, acompanhe pedidos, controle materiais e gerencie sua produção em um só lugar.</p>
        <div class="hero-actions">
          <BaseButton :href="systemUrl">Começar grátis</BaseButton>
          <a class="button button-secondary" href="#funcionalidades">Explorar funcionalidades</a>
        </div>
        <p class="hero-assurances">Plano gratuito disponível. Cadastro na plataforma Filamind.</p>
      </div>
      <figure class="product-preview">
        <div class="capture-shell capture-shell-hero">
          <div class="capture-bar"><span>Filamind</span><span>Visão do produto</span></div>
          <video v-if="videoAvailable" :src="videoPath" :poster="videoPoster || undefined" controls preload="none" playsinline aria-label="Vídeo de demonstração do Filamind" @error="onVideoError"></video>
          <div v-else class="capture-empty" role="img" aria-label="Espaço reservado para captura real do dashboard Filamind">
            <span class="capture-mark">F</span>
            <strong>O Filamind por dentro</strong>
            <span>Captura real do dashboard em preparação</span>
          </div>
        </div>
        <figcaption>Visão do sistema — inserir captura autorizada do dashboard antes da publicação.</figcaption>
      </figure>
    </div>
  </section>
</template>
