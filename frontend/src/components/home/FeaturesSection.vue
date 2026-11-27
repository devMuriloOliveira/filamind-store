<script setup>
const resources = [
  { title: 'Produtos', description: 'Catálogo e detalhes das peças.' },
  { title: 'Clientes', description: 'Contatos e histórico em um lugar.' },
  { title: 'Impressoras', description: 'Cadastro manual de máquinas. Fila com Agent no PRO.' },
  { title: 'Estoque', description: 'Materiais e reposições.' },
  { title: 'Despesas', description: 'Registros dos gastos da operação.' },
  { title: 'Relatórios', description: 'Visão dos dados registrados.' },
  { title: 'Metas', description: 'Objetivos e acompanhamento.' },
  { title: 'Marketplaces · PRO', description: 'Mercado Livre exige autorização e configuração. Shopee e Amazon estão em desenvolvimento.' },
]
</script>

<template>
  <section class="section features" id="funcionalidades" aria-labelledby="features-title">
    <div class="page-container features-layout">
      <div class="section-intro">
        <p class="eyebrow">RECURSOS DO FILAMIND</p>
        <h2 id="features-title">O essencial para acompanhar sua operação.</h2>
        <p>A calculadora 3D e a gestão de vendas se conectam aos registros do restante do negócio.</p>
        <a class="text-link" href="#planos">Comparar os planos</a>
      </div>
      <div class="feature-list">
        <div class="feature-highlight"><strong>Calculadora 3D</strong><p>Considere material, tempo e custos para formar seu preço.</p></div>
        <div class="feature-highlight"><strong>Vendas</strong><p>Organize pedidos e acompanhe as etapas da venda.</p></div>
        <ul>
          <li v-for="resource in resources" :key="resource.title"><strong>{{ resource.title }}</strong><span>{{ resource.description }}</span></li>
        </ul>
      </div>
    </div>
  </section>
</template>
