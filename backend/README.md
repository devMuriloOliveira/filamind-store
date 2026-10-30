# Backend

API local da vitrine de ofertas. `npm start` serve a API e `frontend/dist/` em `127.0.0.1:4180`; execute `npm run build` em `frontend/` antes de iniciar. `npm test` executa testes com catálogos temporários. Em `frontend/`, `npm test` executa os testes de navegador após o build.

`data/catalog.json` guarda os produtos e ofertas locais já cadastrados; preserve esse arquivo. Por padrão, `FILAMIND_STORAGE=json` mantém esse modo local. Gravações usam substituição de arquivo serializada em um único processo. O modo `FILAMIND_STORAGE=postgres` exige `DATABASE_URL` e a migration 001; nele, filtros, paginação e indicadores são consultas SQL, sem carregar o catálogo inteiro na API. `GET /api/admin/catalog` devolve 410 nesse modo; o painel já usa as listagens paginadas. Nenhum banco é criado ou importado automaticamente ao iniciar o servidor.

Em uma cópia nova, sem catálogo real, crie um catálogo local vazio com `New-Item -ItemType Directory -Force data | Out-Null` e `Copy-Item catalog.example.json data/catalog.json`, executados em `backend/`. Não execute essa cópia no projeto que contém os dados reais. O exemplo não tem produtos ou ofertas e pode ser versionado.

As imagens ficam em `uploads/`, independentemente do modo do catálogo. `FILAMIND_UPLOADS_DIR` pode apontar para um diretório absoluto com volume persistente, mas esta etapa não implementa S3 nem comprova persistência de imagens em hospedagem. `src/imageStorage.js` concentra a implementação local para futura substituição.

### PostgreSQL e importação

Instale dependências com `npm ci`. Configure `DATABASE_URL` somente no ambiente privado; este projeto não carrega `.env` automaticamente. Antes de qualquer aplicação, confira o backup e o destino da conexão. `npm run db:init -- --apply` cria o schema dedicado `filamind_store` apenas se ele ainda não existir; não altera outro schema. `npm run db:import -- --source <catalog.json> --images <uploads>` valida dados e imagens sem acessar o banco. Acrescente `--apply` e `DATABASE_URL` somente para um destino autorizado e vazio. `--report <arquivo-novo>` grava contagens, IDs e hashes sem links de afiliado. Uma repetição com o mesmo hash não reimporta; um catálogo diferente ou um destino preenchido é recusado.

A migration está em `migrations/001_initial.sql`. O importador mantém IDs, relações, links, imagens referenciadas, preços opcionais e datas; verifica cada registro dentro da transação antes de confirmar. O JSON de origem nunca é alterado. Não execute esses comandos em banco remoto ou de produção sem plano de backup, restauração e autorização.

Por padrão, todas as rotas `/api/admin/*` ficam fechadas com 503 enquanto `createOffersServer({ authorizeAdmin })` não receber uma integração que valide uma sessão real e a permissão de administrador **no servidor**. O painel responde 404. Para cadastro local, `FILAMIND_LOCAL_ADMIN=1` habilita uma sessão temporária com código gerado na inicialização, somente em `127.0.0.1` e fora de produção. O código não é salvo no projeto. Plano PRO não concede acesso administrativo.
