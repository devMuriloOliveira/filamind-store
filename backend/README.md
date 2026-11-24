# Backend

API local da vitrine de ofertas. `npm start` serve a API e `frontend/dist/` em `127.0.0.1:4180`; execute `npm run build` em `frontend/` antes de iniciar. `npm test` executa testes com catálogos temporários. Em `frontend/`, `npm test` executa os testes de navegador após o build.

`data/catalog.json` guarda os produtos e ofertas locais já cadastrados; preserve esse arquivo. Por padrão, `FILAMIND_STORAGE=json` mantém esse modo local. Gravações usam substituição de arquivo serializada em um único processo. O modo `FILAMIND_STORAGE=postgres` exige `DATABASE_URL` e a migration 001; nele, filtros, paginação e indicadores são consultas SQL, sem carregar o catálogo inteiro na API. `GET /api/admin/catalog` devolve 410 nesse modo; o painel já usa as listagens paginadas. Nenhum banco é criado ou importado automaticamente ao iniciar o servidor.

Em uma cópia nova, sem catálogo real, crie um catálogo local vazio com `New-Item -ItemType Directory -Force data | Out-Null` e `Copy-Item catalog.example.json data/catalog.json`, executados em `backend/`. Não execute essa cópia no projeto que contém os dados reais. O exemplo não tem produtos ou ofertas e pode ser versionado.

No modo local de imagens, os arquivos ficam em `uploads/`, independentemente do modo do catálogo. `FILAMIND_UPLOADS_DIR` pode apontar para um diretório absoluto com volume persistente. Para hospedagem sem filesystem persistente, `FILAMIND_IMAGE_STORAGE=supabase` usa o Supabase Storage conforme descrito abaixo; nenhuma migração remota é automática.

### PostgreSQL e importação

Instale dependências com `npm ci`. Configure `DATABASE_URL` somente no ambiente privado; este projeto não carrega `.env` automaticamente. Antes de qualquer aplicação, confira o backup e o destino da conexão. `npm run db:init -- --apply` cria o schema dedicado `filamind_store` apenas se ele ainda não existir; não altera outro schema. `npm run db:import -- --source <catalog.json> --images <uploads>` valida dados e imagens sem acessar o banco. Acrescente `--apply` e `DATABASE_URL` somente para um destino autorizado e vazio. `--report <arquivo-novo>` grava contagens, IDs e hashes sem links de afiliado. Uma repetição com o mesmo hash não reimporta; um catálogo diferente ou um destino preenchido é recusado.

A migration está em `migrations/001_initial.sql`. O importador mantém IDs, relações, links, imagens referenciadas, preços opcionais e datas; verifica cada registro dentro da transação antes de confirmar. O JSON de origem nunca é alterado. Não execute esses comandos em banco remoto ou de produção sem plano de backup, restauração e autorização.

Por padrão, todas as rotas `/api/admin/*` ficam fechadas com 503 enquanto a autenticação administrativa não for habilitada; o painel responde 404. `createOffersServer({ authorizeAdmin })` permanece disponível para integração e testes. Para cadastro local, `FILAMIND_LOCAL_ADMIN=1` habilita uma sessão temporária com código gerado na inicialização, somente em `127.0.0.1` e fora de produção. O código não é salvo no projeto. Plano PRO não concede acesso administrativo.

### Autenticação administrativa PostgreSQL (preparada, ainda não ativada)

`FILAMIND_ADMIN_AUTH=off` é o padrão. A migration separada `migrations/002_admin_auth.sql` cria `admin_users`, `admin_sessions` e `admin_login_attempts` no schema `filamind_store` e registra a versão 2. Ela não altera produtos ou ofertas e não é executada na inicialização. Somente após confirmar destino, backup e autorização para a etapa futura, execute `node --env-file=.env scripts/init-admin-auth.js --apply` em `backend/`. O comando recusa uma estrutura já existente.

Depois da migration, crie a primeira conta exclusivamente em terminal interativo com `node --env-file=.env scripts/create-first-admin.js --create --email <seu-email>`. A senha é digitada sem eco, nunca por argumento ou arquivo; o comando recusa uma segunda conta. Use uma senha única de pelo menos 16 caracteres. Não execute esses comandos contra o Neon sem autorização específica.

Para habilitar a API posteriormente, configure `FILAMIND_ADMIN_AUTH=postgres` e `FILAMIND_ADMIN_ORIGIN=https://sua-origem-publica` no ambiente privado do backend. Em desenvolvimento, HTTP só é aceito em `127.0.0.1` com o servidor vinculado ao loopback. O modo por código local e o modo PostgreSQL não podem ser ligados juntos. Na publicação, o proxy HTTPS deve preservar o cabeçalho `Host` e manter o backend fora do acesso HTTP público direto.

`POST /api/admin/login` recebe JSON com `email` e `password`, exige `Origin` da origem configurada e devolve um cookie de sessão `HttpOnly`, `SameSite=Strict` e `Secure` em HTTPS, além de `csrfToken`. `GET /api/admin/status` devolve novo acesso ao token CSRF para uma sessão válida. Todas as rotas administrativas mutáveis exigem `Origin` correspondente e `X-CSRF-Token`; `POST /api/admin/logout` revoga a sessão no PostgreSQL. Sessões duram até 8 horas, guardam apenas o hash do token de sessão e sobrevivem ao reinício do processo. Senhas usam scrypt com sal aleatório e parâmetros gravados no hash. Tentativas são limitadas no banco por conta e endereço de rede, sem confiar em `X-Forwarded-For`. O audit existente registra criação da primeira conta, login, logout e tentativas autorizadas de escrita; resultados de alterações de catálogo ainda não são auditados atomicamente.

A interface Vue mostra o login por e-mail e senha quando `GET /api/admin/status` responde 401 no modo PostgreSQL; no modo local, mantém o acesso por código. O `csrfToken` retornado por login/status fica apenas na memória da página e segue em `X-CSRF-Token` nas operações mutáveis, inclusive logout. O cookie de sessão é `HttpOnly` e não é lido pelo JavaScript. Um 401 durante o uso limpa o estado do painel e volta ao login. Não há cadastro público de administradores.

Para qualquer PostgreSQL remoto, exija TLS com validação do certificado e do nome do servidor. Prefira `sslmode=verify-full` na URL privada, com a cadeia de certificados confiável. O `pg` 8.21.0 atualmente trata `sslmode=require` como `verify-full`, mas avisa que essa equivalência mudará na próxima versão principal; revise a URL antes de atualizar o driver, sem trocar credenciais nem reduzir a validação.

### Homologação HTTPS local, sem publicação

`Caddyfile.auth-validation` é uma configuração de exemplo para um Caddy instalado manualmente: escuta apenas em `127.0.0.1:8443`, termina HTTPS com uma CA local e encaminha todas as rotas ao backend em `127.0.0.1:4180`. O backend já serve `frontend/dist` e `/api` na mesma origem; faça o build do frontend antes. O Caddy preserva `Host` e encaminha `Origin`; o backend exige os dois iguais a `FILAMIND_ADMIN_ORIGIN=https://127.0.0.1:8443`. O backend não usa `X-Forwarded-Proto`, `X-Forwarded-Host` ou `X-Forwarded-For` para conceder acesso. Mantenha o backend no loopback e não exponha a porta 4180. `skip_install_trust` impede que o Caddy altere automaticamente a confiança do sistema: a CA local precisa ser confiada manualmente no navegador/sistema; não ignore avisos de certificado.

Para o teste completo em uma etapa autorizada, confirme primeiro que `backend/.env.auth-test` aponta exclusivamente à branch `auth-validation`, usa a conexão direta e não coincide com o host de produção. Inicie o backend em um processo com ambiente limpo, carregando apenas as variáveis dessa fonte isolada, `FILAMIND_STORAGE=postgres`, `FILAMIND_IMAGE_STORAGE=local`, `FILAMIND_ADMIN_AUTH=postgres`, `HOST=127.0.0.1`, `PORT=4180` e a origem HTTPS acima. Não herde uma `DATABASE_URL` do terminal, não carregue `.env` de produção nem envie a URL do banco ao frontend. Só depois de autorizado, execute o Caddy local com `caddy run --config Caddyfile.auth-validation --adapter caddyfile` a partir de `backend/`. Use apenas conta e registros fictícios na branch de testes; remova-os após a validação. Este arquivo não instala o Caddy, não abre túnel e não ativa a autenticação de produção.

O limite por IP usa `req.socket.remoteAddress`; atrás do proxy local, todos os acessos aparecem como `127.0.0.1` e compartilham o limite de 30 tentativas. O limite por e-mail continua separado. Para publicação com múltiplos administradores, defina antes uma política explícita de proxies confiáveis e de IP real, sem aceitar `X-Forwarded-For` fornecido pelo cliente.

### Neon PostgreSQL e Supabase Storage, sem migração remota automática

O JSON e `uploads/` continuam sendo o padrão local. Para usar o PostgreSQL Neon, configure `FILAMIND_STORAGE=postgres` e `DATABASE_URL` **somente no backend**. Obtenha a conexão no painel Neon, confirme a branch e o hostname, e exija `sslmode=verify-full` em produção. Mantenha a URL fora do Git e de variáveis `VITE_*`. Para migrations e backup, use a conexão direta do destino autorizado. A migration 001 cria apenas o schema `filamind_store`; não a execute antes de confirmar projeto, permissões, backup e destino.

Para imagens, `FILAMIND_IMAGE_STORAGE=local|supabase` seleciona o provedor sem mudar os caminhos `/offer-images/<uuid>.<ext>` já salvos nos produtos. O modo `supabase` exige `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET` e `SUPABASE_SECRET_KEY` no ambiente privado do backend. Use uma chave **`sb_secret_`**, não uma chave publicável ou a antiga `service_role`. Crie um bucket de imagens com **leitura pública** e sem políticas de escrita para visitantes; qualquer pessoa com a URL poderá ver a imagem. O backend valida PNG/JPEG/WebP e 2 MB antes de enviar, grava com nome novo sem sobrescrever e serve a imagem ao navegador pela rota local existente. O frontend não acessa a chave nem grava diretamente no Storage. O bucket deve permitir esses três tipos e pelo menos 2 MB por objeto. A troca de imagem no painel associa um novo objeto ao produto; o objeto anterior não é apagado automaticamente.

Antes de qualquer migração, guarde cópias verificadas de `data/catalog.json` e de **todo** `uploads/` fora do projeto. O comando abaixo apenas valida o catálogo e calcula hashes das imagens; não precisa de conta Supabase nem acessa a rede:

```powershell
npm run images:sync -- --source data/catalog.json --images uploads
```

Em uma etapa posterior, com projeto e backup definidos, `--apply` envia as imagens referenciadas ao bucket com os mesmos nomes. Ele verifica os hashes após o upload, aceita objetos já existentes somente se forem idênticos e nunca sobrescreve um objeto diferente. Não apaga nem modifica o catálogo ou os arquivos locais. Primeiro conclua essa cópia; depois faça a migration e a importação PostgreSQL com os comandos `db:init` e `db:import` acima. Confira IDs, contagens, imagens públicas e a vitrine em homologação **antes** de mudar `FILAMIND_STORAGE` e `FILAMIND_IMAGE_STORAGE` no serviço. Guarde o JSON e as imagens originais para reversão. Um upload que falha não muda o produto, mas um upload concluído sem posterior salvamento pode deixar um objeto órfão para limpeza futura.

O plano gratuito do Supabase tem limites e pode pausar por inatividade. Ele não oferece backup automático; programe exportações manuais do banco e cópias separadas dos objetos do Storage, com ensaio de restauração. Backup do banco não contém os arquivos do Storage.

### Preparação local para Netlify Server (sem deploy)

O projeto usa a raiz do repositório como diretório do site. `netlify.toml` instala as dependências de `backend/` e `frontend/`, compila o Vue em `frontend/dist` e seleciona Node 24. `netlify/server/index.mjs` exporta o mesmo `http.Server` usado localmente, sem abrir porta diretamente. A inicialização confere as migrations necessárias e exige `NODE_ENV=production`, PostgreSQL e imagens no Supabase; o modo de autenticação continua `off` até ser ativado explicitamente. O Netlify serve os arquivos estáticos do `dist`; as regras específicas de `_redirects` carregam `index.html` nas rotas Vue, enquanto `/api/*` e `/offer-images/*` chegam ao Node. O fallback geral `/*` foi removido porque interceptava a API.

Defina as variáveis abaixo no painel privado da hospedagem, com valores separados por contexto. No plano Free da Netlify, não é possível restringir variáveis aos escopos **Functions** ou **Builds**: segredos do contexto de preview também ficam disponíveis durante o build desse contexto. Use apenas credenciais isoladas e descartáveis no preview. Em planos com escopos, variáveis lidas pelo Netlify Server precisam incluir **Functions**, enquanto `VITE_*` precisa de **Builds**. Uma mudança nas variáveis do Server só entra em vigor em novo deploy. Não envie `.env`, `.env.auth-test` ou credenciais em `VITE_*`:

| Variável | Uso |
| --- | --- |
| `NODE_ENV=production` | Ativa as restrições de produção. |
| `FILAMIND_STORAGE=postgres` | Catálogo e sessões no PostgreSQL. |
| `DATABASE_URL` | Conexão Neon do ambiente correto, com `sslmode=verify-full`; o processo recusa outro modo TLS em produção. |
| `FILAMIND_IMAGE_STORAGE=supabase` | Impede dependência de arquivos graváveis na instância efêmera. |
| `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET`, `SUPABASE_SECRET_KEY` | Projeto, bucket e chave privada do Storage; somente no backend. |
| `FILAMIND_ADMIN_AUTH=off` | Padrão seguro enquanto a migration 002 e a primeira conta não existirem em produção. Posteriormente, `postgres`, em etapa autorizada. |
| `FILAMIND_ADMIN_ORIGIN` | Origem HTTPS canônica exata do painel quando `FILAMIND_ADMIN_AUTH=postgres`, sem barra final; aliases devem redirecionar à origem canônica. |
| `VITE_SYSTEM_URL`, `VITE_PRO_URL` | Links públicos do sistema principal, incorporados no build Vue; conferir os destinos antes da publicação. |

O Netlify atribui a porta do Server; não configure `PORT` ou `HOST` para ele. Para o backend local, `HOST=127.0.0.1` e `PORT=4180` continuam válidos. O Netlify Server documenta que `req.socket.remoteAddress` fornece o IP do visitante; o código não consulta `X-Forwarded-For`. Verifique isso no deploy de homologação antes de ativar login público. O backend exige `Host` e `Origin` iguais a `FILAMIND_ADMIN_ORIGIN` nas operações administrativas e mantém cookie `Secure`, `HttpOnly`, `SameSite=Strict` e CSRF. Os cabeçalhos do frontend em `_headers` não substituem os cabeçalhos que o próprio backend devolve para a API.

No plano Free, o Netlify Server ainda está em Early Access: uma instância `small` de 1 GB, desligamento após cinco minutos sem tráfego e prazo de 20 segundos para os primeiros cabeçalhos, incluindo inicialização a frio. Seu uso é gratuito durante o Early Access; após a disponibilidade geral, memória e CPU passarão a consumir créditos conforme preços ainda não publicados. O limite mensal do plano Free também pode pausar o projeto. Teste inicialização a frio, TLS e hostname do PostgreSQL, roteamento, cookies, cache e carga em um preview com segredos e dados isolados antes do deploy. Esta preparação não publica o projeto nem aplica migrations.
