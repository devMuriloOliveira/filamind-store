<script setup>
import { systemUrl, proUrl } from '../../config.js'
import BaseButton from '../ui/BaseButton.vue'
</script>

<template>
<section class="section plans" id="planos" aria-labelledby="plans-title">
      <div class="page-container plans-container">
        <div class="section-intro"><p class="eyebrow">DO SEU PRIMEIRO PASSO À PRÓXIMA FASE</p><h2 id="plans-title">Comece grátis. Evolua com o PRO.</h2><p>Para pessoas físicas, profissionais autônomos, pequenos negócios e empresas que trabalham com impressão 3D. O cadastro aceita CPF ou CNPJ.</p></div>
        <div class="plan-grid">
          <article class="plan-card">
            <div class="plan-intro"><h3>Gratuito</h3><p>Comece a organizar sua produção e conheça o Filamind.</p></div>
            <p class="plan-price">R$ 0 <small>gratuito</small></p>
            <BaseButton :href="systemUrl" variant="secondary">Começar grátis</BaseButton>
            <p class="plan-summary">Até 5 produtos cadastrados, calculadora de custos e operações básicas. Ao atingir o limite, conheça o PRO.</p>
          </article>
          <article class="plan-card plan-pro">
            <div class="plan-intro"><h3>PRO</h3><p>Mais recursos para acompanhar e gerenciar seu negócio de impressão 3D.</p></div>
            <p class="plan-price">R$ 19,90 <small>/mês</small></p>
            <BaseButton :href="proUrl">Assinar PRO</BaseButton>
            <p class="plan-summary">Inclui os recursos do Gratuito, integração com marketplaces e conexão de impressoras via Agent. Algumas conexões dependem de configuração; Shopee e Amazon estão em desenvolvimento.</p>
          </article>
        </div>
        <p class="plan-note" id="pro-price-note"><span>PRO: cobrança recorrente mensal pelo Mercado Pago. Para assinar, entre ou crie sua conta e acesse Minha conta → Assinatura. O cancelamento da renovação é solicitado na plataforma; o acesso PRO continua até o fim do período pago. Consulte <RouterLink to="/reembolso/">cancelamento e reembolso</RouterLink>. Esta página não processa pagamentos.</span></p>
        <div class="plan-comparison-wrap">
          <table class="plan-comparison">
            <caption>Recursos e limites configurados nos planos</caption>
            <thead><tr><th scope="col">Recurso</th><th scope="col">Gratuito</th><th scope="col">PRO</th></tr></thead>
            <tbody>
              <tr><th scope="row">Calculadora de custos</th><td>Disponível</td><td>Disponível</td></tr>
              <tr><th scope="row">Clientes</th><td>Até 20</td><td>Sem cota numérica definida</td></tr>
              <tr><th scope="row">Produtos</th><td>Até 5</td><td>Sem cota numérica configurada no plano PRO</td></tr>
              <tr><th scope="row">Pedidos</th><td>Até 15 por mês</td><td>Sem cota numérica definida</td></tr>
              <tr><th scope="row">Impressoras manuais</th><td>Até 1</td><td>Sem cota numérica definida</td></tr>
              <tr><th scope="row">Filamentos</th><td>Até 5</td><td>Sem cota numérica definida</td></tr>
              <tr><th scope="row">Metas</th><td>Até 1</td><td>Sem cota numérica definida</td></tr>
              <tr><th scope="row">Vendas, despesas e estoque</th><td>Operações básicas</td><td>Operações básicas</td></tr>
              <tr><th scope="row">Exportação financeira avançada</th><td>Não incluída</td><td>Incluída</td></tr>
              <tr><th scope="row">Conexão de impressoras via Agent</th><td>Não incluída</td><td>Incluída; requer instalação e configuração</td></tr>
              <tr><th scope="row">Equipe</th><td>Não incluída</td><td>Até 8 usuários</td></tr>
              <tr><th scope="row">Marketplaces</th><td>Não incluídos</td><td>Mercado Livre mediante autorização; Shopee e Amazon em desenvolvimento</td></tr>
            </tbody>
          </table>
        </div>
        <p class="plan-note">O limite de 5 produtos é a regra comercial informada para o Gratuito; a configuração local do sistema principal ainda registra 10 e precisa ser alinhada antes da publicação. “Sem cota numérica” descreve o plano PRO no código examinado; não é promessa de uso ilimitado. A disponibilidade efetiva das integrações deve ser confirmada no ambiente de uso.</p>
      </div>
    </section>
</template>
