# Filamind Store

Site comercial Filamind em Vue 3, Vite e JavaScript. A landing permanece separada do sistema principal. A página de ofertas consulta somente a API local deste projeto; links de cadastro, login e assinatura continuam apontando para a plataforma existente. Não há checkout próprio.

## Estrutura ativa

```text
frontend/
  index.html                Entrada Vite e metadados básicos
  src/
    App.vue                 Layout e rotas
    main.js                 Inicialização Vue
    router/index.js         Home, ofertas e páginas informativas
    config.js               URLs públicas, vídeo opcional e versão de cookies
    components/layout/      Header e footer
    components/common/      Preferências de cookies
    components/home/        Seções da landing, incluindo planos e cards
    views/                  Home, ofertas, administração bloqueada e minutas
    assets/styles/          CSS da landing e estilos das ofertas
  public/assets/            Marca, fonte Inter e ícones locais
  public/_redirects         Fallback SPA e redirect legado para Netlify
  public/_headers           Headers de segurança para Netlify
  vercel.json               Fallback, redirect e headers para Vercel
backend/
  src/catalog.js            Validação, busca, filtros e persistência
  src/server.js             API e servidor local da SPA
  catalog.example.json      Catálogo vazio para preparar uma cópia nova
  data/catalog.json         Catálogo local real, fora do Git
  test/offers.test.js        Testes da API
```

Os antigos HTML das páginas secundárias, CSS, JS e a pasta `frontend/assets/` permanecem como referência. O Vite usa apenas `frontend/index.html`, `frontend/src/` e `frontend/public/`; os arquivos legados não entram no build.

## Desenvolvimento e build

Com Node.js 22.14 ou compatível, em uma cópia nova, crie o catálogo local vazio antes de iniciar o backend. No projeto atual, preserve `backend/data/catalog.json` e não execute a cópia abaixo sobre ele:

```powershell
New-Item -ItemType Directory -Force backend/data | Out-Null
Copy-Item backend/catalog.example.json backend/data/catalog.json
```

Depois instale a partir dos lockfiles e compile:

```powershell
cd frontend
npm ci
npm run build
cd ../backend
npm ci
npm start
```

Abra `http://127.0.0.1:4180/ofertas/`. Para desenvolvimento com recarregamento automático, inicie também `npm run dev` em `frontend/`; o Vite encaminha `/api` e `/offer-images` ao servidor local. Rode `npm test` em `backend/` para os testes da API.
Após `npm run build`, rode `npm test` em `frontend/` para os testes de navegador. O teste específico do catálogo real é pulado em cópias novas sem catálogo ou com o exemplo vazio. O painel usa páginas de 20 registros, filtros e indicadores; no modo JSON, o servidor ainda lê o arquivo completo. O modo PostgreSQL consulta o banco com paginação.
Os testes de navegador usam o Chrome instalado no computador; o build da Vercel não executa esses testes.
O backend também aceita `FILAMIND_STORAGE=postgres` com `DATABASE_URL`, após aplicação explícita da migration e importação em um destino vazio. O modo padrão continua JSON local; nenhuma troca automática dos dados é feita. Veja [as instruções do backend](backend/README.md).

Para habilitar o **painel apenas no computador de desenvolvimento**, compile o frontend e inicie o backend em outro terminal PowerShell:

```powershell
cd frontend
npm.cmd run build
cd ../backend
$env:FILAMIND_LOCAL_ADMIN = '1'
npm.cmd start
```

O terminal mostra um código aleatório novo a cada inicialização. Abra `http://127.0.0.1:4180/admin/ofertas/` e digite esse código. Se a porta 4180 já estiver ocupada, pare a instância anterior antes de iniciar esta. Use o endereço **127.0.0.1**, não a porta do Vite. O modo local só inicia em `127.0.0.1` fora de `NODE_ENV=production`; a sessão dura até oito horas ou até a reinicialização/saída. Para voltar ao modo fechado, encerre o servidor e execute `Remove-Item Env:FILAMIND_LOCAL_ADMIN` no terminal antes do próximo `npm.cmd start`. O catálogo local continua no disco após encerrar a sessão.

Rotas públicas: `/`, `/ofertas/`, `/privacidade/`, `/termos/`, `/cookies/` e `/reembolso/`. Sem o modo local e sem uma integração administrativa real, `/admin/ofertas/` responde 404, a API administrativa responde 503 e o Vue não carrega o painel. O servidor Node serve `frontend/dist/` e a API na mesma origem. As configurações estáticas antigas de Vercel/Netlify **não publicam a API** e não bastam para implantar a vitrine funcional. Hospedagem, HTTPS e armazenamento persistente de produção ainda precisam ser definidos. Não houve deploy.

As URLs da plataforma podem ser configuradas pelas variáveis públicas `VITE_SYSTEM_URL` e `VITE_PRO_URL`. `VITE_VIDEO_PATH` aceita um caminho local iniciado por `/`; `VITE_VIDEO_POSTER` é opcional. Nunca use `VITE_` para segredos. Os valores padrão preservam os destinos atuais. Não há vídeo autorizado configurado.

## GitHub e Vercel

O catálogo real, uploads, backups, relatórios locais, dependências, builds e configurações privadas ficam fora do Git. O exemplo `backend/catalog.example.json` contém somente listas vazias. Nunca adicione esses dados com `git add -f`.

Para um futuro preview estático na Vercel, selecione `frontend` como Root Directory, Vite como framework, `npm ci` para instalar, `npm run build` para compilar e `dist` como saída. `frontend/vercel.json` mantém as rotas da SPA em refresh. Esse preview exibe a landing e as páginas informativas; `/ofertas/` mostra falha de carregamento enquanto `/api/offers` não tiver backend na mesma origem. O painel administrativo não fica disponível. Não configure `DATABASE_URL`, segredo ou login local na Vercel do frontend.

## Limites de publicação

O modelo separa produtos de ofertas por marketplace; a vitrine tem busca, filtros, ordenação, paginação, estado vazio e divulgação de publicidade. O catálogo local fica fora do repositório. A API e o painel administrativos permanecem fechados em produção até integrar autenticação, autorização, auditoria e armazenamento persistente.

Todas as páginas mantêm `noindex,follow` até a validação comercial e jurídica. A renderização no cliente exige avaliação de indexação antes de remover `noindex`; não há SSR. As quatro páginas jurídicas continuam minutas. Não há rastreadores opcionais nem formulários públicos de coleta de dados.

A vitrine foi inspecionada localmente em 1440, 768, 390 e 320 px, sem overflow horizontal ou erros de console. Busca, filtro de marketplace, acesso direto à rota, estado vazio e card com dados temporários foram exercitados. A autenticação administrativa e a hospedagem de produção ainda não foram integradas. Não houve deploy.
