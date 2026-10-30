<script setup>
import FeatureCard from '../common/FeatureCard.vue'

const cards = [
  {
    "icon": "/assets/figma/desktop-calculator2.svg",
    "title": "Calculadora 3D",
    "description": "Considere material, tempo e custos para formar seu preço."
  },
  {
    "icon": "/assets/figma/desktop-shopping-bag2.svg",
    "title": "Vendas",
    "description": "Organize pedidos e acompanhe cada etapa da venda."
  },
  {
    "icon": "/assets/figma/desktop-box1.svg",
    "title": "Produtos",
    "description": "Mantenha seu catálogo e os detalhes das peças em ordem."
  },
  {
    "icon": "/assets/figma/desktop-users1.svg",
    "title": "Clientes",
    "description": "Reúna contatos e histórico para um atendimento próximo."
  },
  {
    "icon": "/assets/figma/desktop-store.svg",
    "title": "Marketplaces",
    "description": "Recurso PRO. Mercado Livre depende de autorização e configuração; Shopee e Amazon: em desenvolvimento."
  },
  {
    "icon": "/assets/figma/desktop-printer1.svg",
    "title": "Impressoras",
    "description": "Cadastre máquinas manualmente. A fila com Agent é um recurso PRO."
  },
  {
    "icon": "/assets/figma/desktop-package2.svg",
    "title": "Estoque",
    "description": "Acompanhe materiais e planeje suas reposições."
  },
  {
    "icon": "/assets/figma/desktop-receipt.svg",
    "title": "Despesas",
    "description": "Registre gastos e entenda o que pesa na operação."
  },
  {
    "icon": "/assets/figma/desktop-chart-no-axes-combined2.svg",
    "title": "Relatórios",
    "description": "Transforme seus registros em uma visão do negócio."
  },
  {
    "icon": "/assets/figma/desktop-target.svg",
    "title": "Metas",
    "description": "Defina objetivos e acompanhe sua evolução."
  }
]
</script>

<template>
<section class="section features" id="funcionalidades" aria-labelledby="features-title">
      <div class="page-container">
        <div class="section-intro"><p class="eyebrow">TUDO CONECTADO</p><h2 id="features-title">Do cálculo ao resultado, tudo no mesmo lugar.</h2><p>Cadastre produtos, clientes e materiais e acompanhe pedidos na mesma plataforma.</p></div>
        <div class="feature-grid">
          <FeatureCard v-for="card in cards" :key="card.title" v-bind="card" />
        </div>
        <p class="feature-footnote"><img src="/assets/logoF-icon.png" alt="" width="24" height="24"> Uma rotina conectada. Sem precisar alternar entre várias planilhas.</p>
      </div>
    </section>
</template>
