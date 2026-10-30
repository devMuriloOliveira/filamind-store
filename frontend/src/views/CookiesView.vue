<script setup>
import { useCookiePreferences } from '../composables/useCookiePreferences.js'

const { openDialog } = useCookiePreferences()
</script>

<template>
<main class="simple-main" id="conteudo"><div class="page-container">
    <p class="eyebrow">MINUTA PARA REVISÃO</p><h1>Política de Cookies</h1>
    <p class="lead">Nesta versão da landing page, somente a escolha de preferências é guardada no navegador. Não há Analytics, pixels ou publicidade carregados.</p>
    <div class="simple-panel">
      <h2>O que este site usa</h2>
      <p>A chave de armazenamento local <code>filamind-cookie-preferences</code> guarda as categorias escolhidas, a versão da política e a data da decisão. Ela permite lembrar sua escolha. Não identificamos cookies próprios adicionais nem scripts de análise ou marketing neste frontend estático. O provedor de hospedagem e eventuais cookies de infraestrutura precisam ser verificados antes da publicação.</p>
      <h2>Categorias</h2>
      <ul><li><strong>Necessários:</strong> armazenamento da preferência, sem opção de desativar dentro do site.</li><li><strong>Analíticos:</strong> nenhum script ativo.</li><li><strong>Marketing:</strong> nenhum script ativo.</li></ul>
      <p>Aceitar uma categoria opcional nesta versão apenas registra sua escolha; não instala um rastreador. Qualquer integração futura exigirá revisão desta política, configuração técnica de bloqueio até consentimento e nova validação.</p>
      <h2>Como mudar sua escolha</h2>
      <p>Use “Preferências de cookies” no rodapé a qualquer momento. Você também pode limpar os dados do site nas configurações do navegador. A plataforma acessada pelos links desta landing usa um cookie de autenticação próprio; seus detalhes e condições de uso precisam ser descritos na política definitiva da plataforma.</p>
      <p>Versão da minuta: 27/10/2026. Prazo de conservação da preferência e responsáveis pelo tratamento: <strong>[PENDENTES DE VALIDAÇÃO]</strong>.</p>
      <button type="button" class="button button-secondary" @click="openDialog($event.currentTarget)">Alterar preferências de cookies</button>
    </div>
  </div></main>
</template>
