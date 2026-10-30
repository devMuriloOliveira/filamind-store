<script setup>
import { ref } from 'vue'
import { systemUrl, videoPath, videoPoster } from '../../config.js'
import BaseButton from '../ui/BaseButton.vue'

const videoAvailable = ref(/^\/[^/]/.test(videoPath))
const videoMessage = ref('O vídeo do Filamind estará disponível em breve.')
const onVideoError = () => {
  videoAvailable.value = false
  videoMessage.value = 'O vídeo está indisponível no momento.'
}
</script>

<template>
<section class="hero" aria-labelledby="hero-title">
      <div class="page-container hero-inner">
        <div class="hero-message">
          <p class="eyebrow">GESTÃO PARA IMPRESSÃO 3D</p>
          <h1 id="hero-title">Deixe as planilhas para trás. Gerencie suas impressões 3D <span>com mais controle.</span></h1>
          <p class="hero-lead">Calcule custos, organize suas vendas e acompanhe os resultados do seu negócio de impressão 3D em um só lugar.</p>
          <div class="hero-actions">
            <BaseButton :href="systemUrl">Começar grátis <img src="/assets/figma/desktop-arrow-right.svg" alt="" width="17" height="17"></BaseButton>
            <a class="button button-secondary" href="#funcionalidades">Conhecer a plataforma</a>
          </div>
          <p class="hero-assurances">Plano gratuito disponível. O cadastro acontece na plataforma Filamind.</p>
        </div>

        <div class="product-preview" aria-label="Demonstração em vídeo do Filamind">
          <div class="product-frame">
            <div class="video-stage" id="video-stage">
              <video v-if="videoAvailable" id="product-video" :src="videoPath" :poster="videoPoster || undefined" controls preload="none" playsinline aria-label="Vídeo de demonstração do Filamind" @error="onVideoError"></video>
              <div v-else class="video-pending" id="video-pending" role="status">
                <span class="video-pending-icon" aria-hidden="true">▶</span>
                <strong>Demonstração em vídeo</strong>
                <p>{{ videoMessage }}</p>
              </div>
            </div>
          </div>
          <p class="preview-note">A demonstração será publicada quando houver um vídeo autorizado.</p>
        </div>
      </div>
    </section>
</template>
