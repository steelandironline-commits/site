# Arquitetura · ETAPA 1 · Tem CNPJ / Tem CPF

Data: 2026-10-20 · Base: `321511e` · Plano: `docs/PLANO_DIVISAO.md` · Inventário: `docs/divisao/INVENTARIO.md`

Este documento é o contrato das ETAPAS 2 a 8. Tudo foi conferido no código real; as linhas `M` do inventário que pesam no desenho foram revalidadas (seção 2).

## 0. Decisões principais

1. **Modo legado por padrão.** Sem `PUBLIC_HOST_CNPJ` e `PUBLIC_HOST_CPF`, o servidor se comporta exatamente como hoje. O isolamento só liga com as duas variáveis.
2. **A área de um registro vem do dono.** `Company.accountType` já é o discriminador (`COMPANY` → CNPJ, `PERSON` → CPF). Só sessões e tokens ganham a coluna `area`, que faz o papel de `aud`.
3. **Três camadas independentes no servidor:** host → área (404 para o que não é da área), cookie e sessão com área (403 na área errada) e filtro de área nos serviços que consultam fora do próprio `companyId`.
4. **Builds separados por área**, cada um servido só no seu host, com um plugin que quebra o build se um arquivo da outra área entrar.
5. **Admin da plataforma é uma terceira área de sessão (`ADMIN`)**, porque a conta de admin é criada como `PERSON`.

## 1. Premissas adotadas

As 14 perguntas ainda não foram respondidas. Valem as recomendações do inventário, a seguir.

| Q | Premissa | Efeito no desenho | Estado |
|---|---|---|---|
| 1 | Colaborador entra no host CNPJ, login por CPF, papel `MEMBER`. Não tem conta CPF. | A área sai da empresa, não do tamanho do documento | Premissa |
| 2 | CPF, CNPJ e e-mail únicos no sistema todo. Um CPF, uma conta, uma área. | Quem tem PF e empresa precisa de dois e-mails | Premissa |
| 3 | Cada lado vê só o seu. Contato fora do site, só com aceite. CPF sem Cargas, Equipes, Intermediação e Pagamentos nesta versão. | Esses módulos ficam só no CNPJ | **Pendência de produto** |
| 4 | Pagador vê a cobrança no CNPJ; recebedor vê o repasse no CPF. Não implementar agora. | `/api/pay` só no CNPJ. Dono da conta de repasse em aberto | **Pendência de produto** |
| 5 | MEI (CNPJ) fica no CNPJ. Sem CNPJ, CPF. | Nada a mudar: MEI já é `COMPANY` | Premissa |
| 6 | Admin fora dos hosts públicos via `ADMIN_HOST` opcional. Sem ele, admin só pelo host CNPJ e só para `isPlatformAdmin`. | Área de sessão `ADMIN`, entrada de build própria | **Em aberto** |
| 7 | Áreas se chamam "Tem CNPJ" e "Tem CPF". "TemPix" fica no remetente de e-mail, no Web Push e nos textos jurídicos. | Um único módulo de marca (`packages/areas/src/brand.js`) | **Em aberto** |
| 8 | Cada host tem home e cadastro próprios. O tipo de conta é imposto no servidor. | `onboarding.start` ignora o `accountType` do corpo | Premissa |
| 9 | Post social tem a área do autor; o feed filtra pela área do host. | Filtro por `author.company.accountType` | Premissa |
| 10 | O catálogo operacional já filtra por `accountType`; a área usa esse filtro. | Catálogo dividido por área no build | Premissa |
| 11 | Uma conta técnica (convênio BB, número de WhatsApp, remetente). Textos por área. | Links e mensagens montados pela área do destinatário | Premissa |
| 12 | Cookie vira `__Host-ap_session`; o CPF tem nome próprio. A troca derruba as sessões uma vez, no go-live. | Seção 6.1 | Premissa |
| 13 | Cargas e Equipes só no CNPJ, com dados DEMO marcados. | Montagens só CNPJ | **Em aberto** |
| 14 | Hosts por variável de ambiente. Não supor domínio disponível. | Seção 4 | Premissa |

## 2. O que a conferência no código mudou

| Achado | Onde | Efeito |
|---|---|---|
| A conta de admin da plataforma é criada como `PERSON` | `platformAdminService.js:29` | Pela regra derivada, o admin seria da área CPF. Por isso existe a área de sessão `ADMIN` |
| `GET /api/me` aceita qualquer sessão (inclusive ONBOARDING), não só `requireAuth` | `routes/me.js:26` | O inventário dizia `requireAuth`. Fica COMUM |
| `GET /api/config` é público e devolve taxa de cadastro e comissões de empresa | `routes/system.js:39-52` | Resposta por área. O CPF não recebe dado de cobrança de empresa |
| Links absolutos usam `config.appUrl` em 7 pontos, inclusive no worker | `authService.js:269`, `onboardingService.js:237`, `teamService.js:55`, `paymentService.js:825, 861`, `NotificationRouter.js:155`, `whatsapp/index.js:13` | Trocar por `urlFor(area)`. O worker precisa das mesmas variáveis de host |
| O feed social é global | `socialService.js:26` (`visibleWhere`) | Filtro de área obrigatório (Q9) |
| A intermediação lista empresas e pessoas juntas | `intermediationService.js:51` | Filtrar candidatos por `accountType` |
| Reiniciar um rascunho troca o `accountType` | `onboardingService.js:47-51` | Na outra área, o reinício é recusado com mensagem neutra |
| O colaborador faz login com 11 dígitos dentro de uma empresa | `teamService.js:50`, `authService.js:110` | A área nunca é deduzida do documento |
| O deploy roda `prisma migrate deploy` antes de subir | `.railway/railway.ts:61` | Toda migração que for para a branch roda em produção. Seção 7 |
| O webhook do BB está registrado no domínio atual | `README.md:304-306` | Webhooks respondem em qualquer host |
| O catálogo de ações já tem `roles` por ação | `actions/definitions.js`, `ActionEngine.js:117` | Ganha `areas` por ação, verificado no mesmo ponto |
| Schemas compartilhados misturam textos de CNPJ e CPF | `packages/shared/src/schemas.js:49-138` | O teste de bundle vai acusar. A ETAPA 5 divide por área |

## 3. Produção inerte

**Regra.** O modo de áreas liga só quando `PUBLIC_HOST_CNPJ` e `PUBLIC_HOST_CPF` estão definidos juntos. Sem eles (hoje, no Railway), vale o **modo legado**:

- o host é ignorado: sem 301, sem 404 por host, o mesmo SPA em qualquer host;
- o cookie continua `ap_session`, com os mesmos atributos (`session.js:3-11`);
- CORS e CSRF continuam aceitando `APP_URL` e `API_URL` (`app.js:68-76`, `security.js:15-27`);
- os guardas de área não fazem nada, e o servidor entrega `apps/web/dist` (build legado, de `src/App.jsx`);
- os links continuam usando `APP_URL`.

Se só uma das duas variáveis estiver definida, a configuração falha na partida (`loadConfig`). No Railway, um deploy que não sobe não substitui o anterior. Mais vale falhar fechado do que isolar pela metade.

Também em modo legado, o código novo grava `area` nas sessões e nos tokens. O efeito não é visível ao usuário e deixa os dados prontos para a virada.

**Como é testado** (os testes T1 a T3 entram na ETAPA 3; T4 e T5, na ETAPA 4):

| Teste | O que prova |
|---|---|
| T1 `config` | Sem variáveis: `areas.enabled === false` e cookie `ap_session`. Com só uma: erro na partida |
| T2 regressão | Os 16 arquivos `*.test.js` de `apps/api/test` e os 4 de `apps/web/test` passam **sem mudar nada** e sem variáveis novas |
| T3 `legacy-inert.test.js` | Com `Host` igual a `x.up.railway.app`, `cpf.temcnpj.com.br` e `temcpf.com.br`: mesma resposta de hoje (SPA 200 em toda rota, `Set-Cookie: ap_session` com os mesmos atributos, CORS só para `APP_URL`, nenhum 301) |
| T4 lint de migração | As migrações posteriores a `20261016190000_public_tenders` não contêm `DROP`, `TRUNCATE`, `DELETE`, `RENAME`, `ALTER COLUMN ... TYPE` nem `SET NOT NULL` |
| T5 compatibilidade | A suíte do commit anterior roda contra o banco já migrado. Prova que o rollback de código funciona com o esquema novo |

## 4. Roteamento por hostname

**Variáveis** (as mesmas no `autopix-web` e no `autopix-worker`):

| Variável | Exemplo | Papel |
|---|---|---|
| `PUBLIC_HOST_CNPJ` | `temcnpj.com.br` | Área CNPJ |
| `PUBLIC_HOST_CPF` | `cpf.temcnpj.com.br` | Área CPF |
| `PUBLIC_HOST_CNPJ_REDIRECT` | `www.temcnpj.com.br` | 301 para o host CNPJ |
| `PUBLIC_HOST_CPF_REDIRECT` | `temcpf.com.br,www.temcpf.com.br` | 301 para o host CPF |
| `ADMIN_HOST` | vazio | Admin próprio (Q6) |

O valor é um host de URL (`nome[:porta]`). A comparação usa só o nome; a URL usa `https://` em produção e `http://` fora dela. Em desenvolvimento: `localhost:5173` e `cpf.localhost:5174`.

**Middleware `hostArea`** (`apps/api/src/middleware/area.js`), primeiro depois do `helmet`:

| Host recebido | Resultado |
|---|---|
| `PUBLIC_HOST_CNPJ` | `req.area = 'CNPJ'` |
| `PUBLIC_HOST_CPF` | `req.area = 'CPF'` |
| `ADMIN_HOST` | `req.area = 'ADMIN'` |
| `*_REDIRECT` | `301` para `https://<host da área>` + `req.originalUrl` (caminho e query preservados) |
| Qualquer outro (domínio `*.up.railway.app`, IP, host forjado) | `404` neutro |
| Exceção: `GET /api/health` e `/api/webhooks/*` | Qualquer host, `req.area = null` (infraestrutura) |

O healthcheck do Railway chega com um `Host` próprio (`healthcheck.railway.app`, conferir na ETAPA 7). Por isso `/api/health` não pode depender do host.

O host vem de `req.hostname` (Express com `trust proxy 1`), normalizado em minúsculas, sem porta e sem ponto final. Na ETAPA 3, registrar em teste quais cabeçalhos o Railway envia. **O host não é fronteira de segurança.** Ele escolhe o app e o cookie; quem autoriza é a área gravada na sessão (seção 6.3). Um `Host` forjado não dá acesso a nada.

**404 para rotas da outra área.** O manifesto (`packages/areas`) lista as páginas e montagens de API de cada área:

- **Páginas:** o servidor responde `200` com o `index.html` da área só para caminhos do manifesto daquela área. Qualquer outro caminho recebe `404` com o mesmo `index.html`, e o roteador da área mostra a sua `NotFound`. Nunca há redirecionamento para a outra área, e a `NotFound` é neutra.
- **API:** guarda por montagem (seção 6.5). A checagem de área vem **antes** da autenticação: uma rota CNPJ chamada no host CPF responde `404`, não `401`.
- **Roteador do cliente:** cada `App.jsx` de área declara só as suas rotas. `/app/*` desconhecido vira `NotFound`, não redirecionamento.
- **Recursos estáticos:** `/assets`, `sw.js`, `manifest.webmanifest`, `robots.txt`, `sitemap.xml` e `favicon` saem só do `dist` da área. Um chunk da outra área responde 404 porque o arquivo não existe naquele `dist`.

## 5. Entradas de build

**Estrutura:**

```
apps/web/areas/{cnpj,cpf,admin}/index.html + public/   (SEO, ícones, manifest, robots, sitemap por host)
apps/web/src/areas/{cnpj,cpf,admin}/main.jsx, App.jsx, theme.css
packages/ui/      template comum, sem texto de área
packages/areas/   manifesto, marca, textos e marcadores (só servidor, build e testes)
```

**Builds.** `vite build --mode cnpj|cpf|admin` gera `apps/web/dist-cnpj`, `dist-cpf` e `dist-admin`. O `vite build` simples continua gerando `apps/web/dist` (legado) até o go-live. Os diretórios ficam separados de propósito: se ficassem dentro de `dist/`, o modo legado os serviria. O admin usa `base: '/admin/'`. Cada build define `import.meta.env.VITE_AREA` e gera o próprio `sw.js` (a lista de pré-cache sai do próprio bundle) e um manifest PWA com `id` próprio.

Não usar um build único com várias entradas: os chunks dividiriam o mesmo `/assets` e ficariam acessíveis nos dois hosts.

**O que impede o vazamento:**

1. **Plugin `areaBoundary(area)`** no `vite.config.js`: no `resolveId`/`load`, o build falha se entrar módulo de `src/areas/<outra>/`, módulo classificado como da outra área no manifesto, ou `packages/areas/src/manifest.js`. O manifesto cita as duas áreas, então nunca vai para o navegador.
2. **Plugin `moduleList`**: grava em `dist-<área>/modules.json` todos os módulos de origem do grafo (`chunk.modules` do Rollup).
3. **Servidor**: cada host lê só o seu `dist`.
4. **CSP** atual com `connect-src 'self'` (`app.js:57`): a página de um host não consegue chamar a API do outro.

**Teste que prova** (`apps/web/test/bundle-isolation.test.js`, roda depois do build no CI):

- (a) uma fixture com import proibido faz o build falhar;
- (b) nenhum módulo de `dist-cpf/modules.json` é de classe CNPJ ou ADMIN, e vice-versa;
- (c) uma busca de texto em `dist-<área>/**/*.{js,css,html,json,webmanifest,txt,xml}` não acha os marcadores da outra área.

Os marcadores são escolhidos a dedo, nunca palavras soltas. Proibidos no CPF: `Tem CNPJ`, `CNPJ` (maiúsculas), `Licitações`, `Colaborador`, `/app/licitacoes`, `/api/team`, `/api/company`, `/api/pay`, `/checkout`. Proibidos no CNPJ: `Tem CPF`, `pessoa física`, `Meu perfil`, `/api/profile`. Proibidos nos dois: `/api/admin`, `Admin financeiro`. `CPF` não pode ser proibido no CNPJ, porque o colaborador entra com CPF (Q1). `temcnpj` não pode ser proibido no CPF, porque está no próprio host.

## 6. Sessão, tokens e guarda de área

### 6.1 Cookies

| Modo | CNPJ | CPF | ADMIN (com `ADMIN_HOST`) |
|---|---|---|---|
| Legado | `ap_session` | — | — |
| Áreas, produção | `__Host-ap_session` | `__Host-ap_session_cpf` | `__Host-ap_session_admin` |
| Áreas, dev (http) | `ap_session` | `ap_session_cpf` | `ap_session_admin` |

Atributos: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, **sem `Domain`**. O nome e as opções saem de `cookieFor(area)` em `session.js`.

O prefixo `__Host-` importa porque `cpf.temcnpj.com.br` é subdomínio do host CNPJ. Sem o prefixo, uma página do CPF poderia gravar um cookie com `Domain=temcnpj.com.br` que valeria no CNPJ (cookie tossing). O navegador recusa `__Host-` com `Domain`.

### 6.2 Token com área (`aud`)

Os tokens são opacos: 32 bytes aleatórios, guardados como HMAC (`authService.js:37-51`). O `aud` é a coluna `Session.area`.

- **Criação:** `createSession(userId, { scope, area })`, com `area = areaOfUser(user)`. Essa função devolve `ADMIN` quando `isPlatformAdmin`; senão, a área de `user.company.accountType`. A sessão só é criada se essa área estiver em `acceptedAreas(req.area)`. Isso vale para login, verificação por WhatsApp, ativação, `onboarding/start` e `native/*`.
- **`acceptedAreas(host)`:** CNPJ aceita `[CNPJ]`, ou `[CNPJ, ADMIN]` sem `ADMIN_HOST`. CPF aceita `[CPF]`. ADMIN aceita `[ADMIN]`.
- **Login na área errada:** mesma resposta e mesmo tempo da senha errada (verificação Argon2 feita ou queimada). Não revela que o documento existe na outra área.
- **`LoginChallenge.area`:** o código de WhatsApp só vale no host onde o login começou.
- **`ActivationToken.area` e `PasswordResetToken.area`:** o link é montado com `urlFor(area)`. Consumido em outro host, responde `404` "Link inválido", igual a um token inexistente. Quando `area` é nula (token antigo), vale a área do dono.
- **Esqueci a senha em outra área:** mesma resposta, nenhum e-mail enviado.
- **Cadastro:** o host impõe o tipo (CNPJ → `COMPANY`, CPF → `PERSON`). Um `accountType` diferente no corpo gera `400` genérico. Reiniciar um rascunho de outra área responde "Já existe um cadastro em andamento com este e-mail", sem citar a área.

### 6.3 Por que isso basta, e onde não basta

**Basta para sessões**, por três checagens independentes:

1. O navegador só manda o cookie ao host que o criou (host-only + `__Host-`).
2. Cada área lê só o seu nome de cookie.
3. O servidor só aceita a sessão se `session.area ∈ acceptedAreas(req.area)` **e** `session.area === areaOfUser(session.user)`. A primeira falha responde **403** `WRONG_AREA`. A segunda revoga a sessão.

A área está numa linha do banco que o cliente não altera. Isso equivale a um `aud` assinado, com uma vantagem: dá para revogar. Forjar o `Host` não ajuda, porque a checagem 3 usa a área gravada. Para tokens bearer (app nativo), só a checagem 3 vale, e ela basta pelo mesmo motivo. A empresa de um usuário não muda de área depois do cadastro. Por isso host == sessão == empresa vale para todo endpoint que filtra por `req.user.companyId`, que é a grande maioria.

**Não basta** nestes casos, que precisam de guarda nos serviços:

| Caso | Por quê | Guarda |
|---|---|---|
| Worker, webhooks, WhatsApp de entrada, e-mail e push | Não há host nem sessão | A área sai da empresa dona do registro. `ActionEngine` verifica `def.areas` contra a área do usuário em **todo** canal. Links e textos montados por `urlFor(area)` e `text(area)` |
| Consultas fora do próprio `companyId` | O filtro do dono não cobre | Filtro explícito: feed social, intermediação, contraparte em `MarketplaceTransaction`, matching de cargas e equipes, admin |
| Os dois hosts são *same-site* | `SameSite=Lax` não barra uma requisição de `cpf.` para o apex | CSRF exige `Origin` igual à origem da **própria** área, mais `X-Requested-With`. CORS só para a própria origem. CSP `connect-src 'self'` |
| Unicidade global (Q2) | `onboarding/check` responde "CPF já tem cadastro" mesmo se a conta é de colaborador no CNPJ | Mensagem neutra e idêntica nas duas áreas, com limitador. Risco aceito pela premissa Q2 |
| Contraparte de outra área em transações | O lado CNPJ vê nome e e-mail do comprador ou vendedor | Pendência de produto (Q3, Q4). Até lá, a API não devolve campos de contraparte de outra área |

### 6.4 Ordem dos middlewares (`apps/api/src/app.js`)

1. `helmet` (como hoje).
2. `hostArea`: 301, 404 ou `req.area`. Não faz nada no modo legado.
3. `cors` com delegate por requisição: aceita só a origem de `req.area`. No legado, `APP_URL`.
4. `/api/webhooks` (corpo bruto, assinatura). Infraestrutura, em qualquer host.
5. `express.json`, `cookieParser`.
6. `limiters.api`.
7. `csrfGuard(area)`: `Origin` igual à origem da própria área.
8. `loadSession(area)`: cookie da área, checagens da seção 6.3, 403 se a área estiver errada.
9. `Cache-Control: no-store`.
10. Montagens via `mountArea(app, path, areas, router)`. O helper aplica `onlyArea(areas)` (404) **antes** do router, que depois aplica `requireAuth` ou `requireOnboardingSession`. Ele recusa montagem sem área declarada e registra cada montagem para os testes.
11. `notFoundApi`, estáticos da área com 404 de página, `errorHandler`.

### 6.5 Montagens e guarda de cada uma

Hosts em que a montagem existe. Em qualquer outro host, responde 404.

| Linha | Montagem | Router | Hosts | Observação |
|---|---|---|---|---|
| 79-80 | `/api/webhooks` | `whatsappWebhookRoutes`, `webhookRoutes` | qualquer (infra) | Assinatura. Área vem do registro (Payment, WhatsAppConnection) |
| 82 | `/api/actions/PUBLISH_SOCIAL_POST` | `express.json` 750kb | — | Só parser |
| 93 | `/api` | `systemRoutes` | `/health` qualquer; `/session` CNPJ, CPF, ADMIN; `/cep` CNPJ, CPF; `/config` CNPJ, CPF | `/config` responde por área |
| 94 | `/api/auth` | `authRoutes` | CNPJ, CPF, ADMIN | Seção 6.2 |
| 95 | `/api/me` | `meRoutes` | CNPJ, CPF, ADMIN | Devolve `area` |
| 96 | `/api/onboarding` | `onboardingRoutes` | CNPJ, CPF | Tipo imposto pelo host |
| 97 | `/api/company` | `companyRoutes` | CNPJ | O CPF ganha `/api/profile` na ETAPA 5 |
| 98 | `/api/opportunities` | `opportunityRoutes` | CNPJ | |
| 99 | `/api/activity` | `activityRoutes` | CNPJ, CPF | Por `companyId`. O hub SSE já é por empresa |
| 100 | `/api/agents` | `agentRoutes` | CNPJ | |
| 101 | `/api/dashboard` | `dashboardRoutes` | CNPJ, CPF | KPIs montados por área |
| 102 | `/api/payments` | `paymentRoutes` | CNPJ | Taxa de cadastro |
| 103 | `/api/subscription` | `subscriptionRoutes` | CNPJ | |
| 104 | `/api/team` | `teamRoutes` | CNPJ | Papéis já checados pelas ações |
| 105 | `/api` | `actionRoutes` (`/actions`, `/challenges/*`) | CNPJ, CPF | Ação de outra área: 404 "Ação desconhecida" |
| 106 | `/api/whatsapp` | `whatsappRoutes` | CNPJ, CPF | Textos por área |
| 107 | `/api/notifications` | `notificationRoutes` | CNPJ, CPF | |
| 108 | `/api/freight` | `freightRoutes` | CNPJ | Q13 |
| 109 | `/api/tenders` | `tenderRoutes` | CNPJ | |
| 110 | `/api/workforce` | `workforceRoutes` | CNPJ | Q3, Q13 |
| 111 | `/api/events` | `eventRoutes` | CNPJ, CPF | Por `companyId` |
| 112 | `/api/pay` | `payRoutes` | CNPJ | Q4 pendente |
| 113 | `/api/social` | `socialRoutes` | CNPJ, CPF | Feed, comentário, repost e foto filtrados por área |
| 114 | `/api/intermediation` | `intermediationRoutes` | CNPJ | Só candidatos `COMPANY` |
| 115 | `/api/admin` | `adminRoutes` | `ADMIN_HOST`, ou CNPJ sem ele | Sessão `ADMIN` com `isPlatformAdmin`. Qualquer outra sessão: **404** |
| 116 | `/api` | `notFoundApi` | todos | |

Os números de linha são de `apps/api/src/app.js`.

### 6.6 Serviços que precisam de filtro explícito (ETAPA 4)

Todo serviço recebe `area` como parâmetro; nenhum lê a área de estado global. Precisam de filtro: `authService` e `onboardingService` (seção 6.2); `socialService` (feed, comentário, repost e `image()`, por `author.company.accountType`); `intermediationService.overview` (candidatos da mesma área); `dashboardService` (KPIs por área); `NotificationRouter`, `WhatsAppProvider`, `teamService` e `paymentService` (links por `urlFor(area)`); `ActionEngine` (`areas` em toda definição; sem o campo, a ação é negada no modo de áreas); e a rota `/config`.

Um "tripwire" de testes (extensão Prisma, só no CI) lista as consultas a modelos com dono que não filtram por `companyId`, `userId` ou área. Cada uma entra numa lista revisada.

## 7. Modelo de dados e migração

### 7.1 Área derivada

A área de um registro de negócio é a área da empresa dona: `areaOf(accountType)`, com `COMPANY` → CNPJ e `PERSON` → CPF. Não haverá coluna `area` em `Company` nem nas ~40 tabelas de negócio, por três motivos:

- `accountType` já é `NOT NULL` e já separa as duas áreas.
- Uma segunda coluna poderia divergir. O código antigo, num rollback, mudaria `accountType` sem mudar `area`.
- O backfill de tabelas grandes (`ActivityEvent`, `DomainEvent`) não seria necessário.

"Todo registro tem área" passa a ser "todo registro tem dono, e o dono tem área". O `accountType` fica imutável depois do rascunho, e o código novo garante isso.

### 7.2 Migração `AAAAMMDDhhmmss_area_isolation` (só aditiva, idempotente)

```sql
DO $$ BEGIN CREATE TYPE "Area" AS ENUM ('CNPJ', 'CPF', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Session"            ADD COLUMN IF NOT EXISTS "area" "Area";
ALTER TABLE "LoginChallenge"     ADD COLUMN IF NOT EXISTS "area" "Area";
ALTER TABLE "ActivationToken"    ADD COLUMN IF NOT EXISTS "area" "Area";
ALTER TABLE "PasswordResetToken" ADD COLUMN IF NOT EXISTS "area" "Area";
```

Colunas nulas, sem default: só metadado, lock curto. **Sem backfill:** no modo de áreas, sessão ou desafio com `area` nula é inválido (falha fechada; as sessões caem de qualquer forma, Q12), e token de link com `area` nula usa a área do dono. Se um backfill for preciso no futuro, será `UPDATE ... WHERE "area" IS NULL`, sem apagar nada. `NOT NULL` só numa migração futura aprovada à parte, depois de verificar zero nulos.

### 7.3 Backup antes do push que leva a migração

O `preDeploy` roda a migração no próximo deploy (`railway.ts:61`). Por isso, o commit com a migração só sobe depois destes passos:

1. Backup do Postgres no painel do Railway, se o plano tiver backup de volume.
2. `pg_dump --format=custom --no-owner` pela URL pública do banco, para um arquivo criptografado **fora do repositório** (contém dados pessoais, LGPD), com checksum.
3. Teste de restauração num banco local descartável: `pg_restore`, contagem de linhas de `User`, `Company`, `Payment` e `MarketplaceTransaction`.
4. Registro em `PROGRESSO.md` só da data e das contagens, sem dados.

### 7.4 Rollback

| Nível | Quando | Como | Perde dado? |
|---|---|---|---|
| R1 código | Erro depois do deploy | Redeploy da implantação anterior no Railway. O código antigo ignora as colunas novas (teste T5) | Não |
| R2 modo | Problema de isolamento depois do go-live | Apagar `PUBLIC_HOST_*`: volta o modo legado. **Atenção:** todos os hosts passam a servir o app misto. Só usar junto com a retirada dos domínios novos no Railway | Não. Sessões das áreas caem |
| R3 migração falhou no meio | `migrate deploy` com erro | As instruções são idempotentes: corrigir, rodar `prisma migrate resolve --rolled-back <nome>` e redeployar | Não |
| R4 dados | Corrupção | Restaurar o dump num banco **novo** e trocar `DATABASE_URL`. Só com aprovação explícita | Sim, o que foi gravado depois do backup |

Nenhum nível apaga coluna. Se um dia as colunas forem removidas, será outra migração, aprovada à parte.

## 8. Arquivos por área

Hoje o único arquivo de usuário é a foto do post social: data URL no banco, até 450 KB (`schema.prisma:1219`). Ela é servida por `GET /api/social/posts/:id/photo`, com `requireAuth` e `Cache-Control: private, no-store`.

**Agora**, a separação é lógica: o endpoint só existe nos hosts CNPJ e CPF, exige sessão da área, e `image(id)` usa o mesmo filtro de área do feed. Foto de outra área responde 404. Não há URL pública; a sessão faz o papel da assinatura. **Com armazenamento de objetos** no futuro: prefixo `cnpj/` e `cpf/` (ou bucket privado por área) e URL assinada de até 5 minutos, emitida só pela API da área depois da checagem. Certificados mTLS do BB e QR Pix são infraestrutura e cobrança CNPJ, não arquivos de usuário.

## 9. DNS e SSL (alvo; nada muda agora)

Todos os domínios entram como domínios personalizados do **mesmo** serviço `autopix-web`.

| Nome | Registro | Função |
|---|---|---|
| `temcnpj.com.br` (apex) | ALIAS ou CNAME com flattening para o alvo do Railway | Área CNPJ |
| `www.temcnpj.com.br` | CNAME | 301 para o apex |
| `cpf.temcnpj.com.br` | CNAME | Área CPF |
| `temcpf.com.br` (apex) | ALIAS ou CNAME com flattening | 301 para `https://cpf.temcnpj.com.br` + caminho + query |
| `www.temcpf.com.br` | CNAME | idem |
| `ADMIN_HOST` (opcional) | CNAME | Admin |
| TXT de verificação | conforme o Railway | Posse do domínio |

- **Certificados:** o Railway emite um certificado por domínio personalizado. Não é preciso curinga, e um curinga levaria qualquer `*.temcnpj.com.br` ao app.
- **Apex:** o Railway trabalha com CNAME. No apex é preciso um provedor de DNS com ALIAS ou flattening; o DNS do registro.br não oferece isso (conferir). Caminho provável: delegar os NS para um provedor que ofereça, em modo só DNS (sem proxy), para o Railway emitir o certificado.
- **HSTS:** o `helmet` já envia `includeSubDomains` em produção. No apex, isso cobre o `cpf.`. Sem `preload` até estabilizar.
- **301:** implementado no próprio app (seção 4), com `req.originalUrl`. Teste: `Host: temcpf.com.br`, `GET /onboarding?utm_source=x` → `301 Location: https://cpf.temcnpj.com.br/onboarding?utm_source=x`.
- **Domínio atual `*.up.railway.app`:** continua no serviço até o webhook do BB ser registrado de novo no host CNPJ (`npm run bb:register-webhook`). No modo de áreas, responde 404, exceto `/api/health` e `/api/webhooks/*`.
- **Conferir** o limite de domínios personalizados por serviço no plano do Railway (5 domínios, mais o admin). O remetente de e-mail continua em `tempix.com.br` (Q7); SPF e DKIM não mudam.

## 10. Adaptações à stack real (plano, seção 6, regra 6)

| Plano | Stack real | Decisão |
|---|---|---|
| `apps/web/areas/{cpf,cnpj}` | SPA Vite único em `apps/web` | `apps/web/src/areas/{cnpj,cpf,admin}` + `apps/web/areas/*/index.html` e `public/` |
| Middleware no `apps/web` | O Express de `apps/api` serve o SPA | `apps/api/src/middleware/area.js` |
| `packages/core` (regras comuns) | `packages/shared` já é isomórfico; `packages/core` é o backend | Regras comuns continuam em `packages/shared`. Não renomear |
| `packages/auth` | Autenticação é toda no servidor | Não criar. `packages/core/src/security/area.js` + middleware da API |
| `packages/areas` | Não existe | Criar: manifesto, `areaOf`, `urlFor`, marca, textos, marcadores. O manifesto nunca vai ao navegador |
| `packages/ui` | Não existe | Criar na ETAPA 2 com `components/ui`, `AuthShell`, `PageLoader`, `lib/api`, `hooks` e estilos |
| `api/` | `apps/api` + `packages/core` + `apps/worker` | Guarda nos três (seção 6) |
| `aud=cpf` no token | Token opaco com linha no banco | `Session.area` (seção 6.2) |
| Bucket por área | Só Postgres | Seção 8 |
| CI | Não existe | Criar na ETAPA 7, com Postgres de teste (os testes de API precisam de `DATABASE_URL`) |

## 11. Mudanças no plano

1. **ETAPA 2:** extrair só `packages/ui`. As regras genéricas já estão em `packages/shared`; mover para `packages/core` misturaria o código do navegador com o do servidor.
2. **`www.temcnpj.com.br` redireciona com 301 para o apex** em vez de servir a área. Com cookies host-only, servir nos dois nomes dividiria a sessão.
3. **Rodapé da ETAPA 6:** o texto "Tem CPF e Tem CNPJ não têm vínculo com a Receita Federal" cita a outra área, o que fere a seção 2. Proposta: "Tem CPF não tem vínculo com a Receita Federal." no CPF e "Tem CNPJ não tem vínculo com a Receita Federal." no CNPJ.
4. **Área `ADMIN`** e entrada de build `admin`, que o plano não previa (seção 2).
5. **Coluna `area` só em sessão e tokens.** Nos dados de negócio, a área vem do dono (seção 7.1).
6. **Build legado convive** com os builds de área até o go-live. O deploy fica mais lento; o legado sai depois da ETAPA 8.
7. **ETAPA 7 item 3:** são 5 hostnames, mais o admin opcional, não 3.
8. **`/api/health` e `/api/webhooks/*` respondem em qualquer host**, como infraestrutura sem sessão.

## 12. Riscos e o que pode quebrar

| Risco | Efeito | Mitigação |
|---|---|---|
| Push com migração dispara deploy e `migrate deploy` | Esquema muda em produção | Só aditiva (T4), idempotente, backup antes (7.3), rollback sem perda (7.4) |
| Variáveis de host só no web, não no worker | E-mails e WhatsApp do worker com link legado | Log "áreas: ligado/desligado" na partida dos dois serviços. Item do `GO_LIVE.md` |
| Links já enviados (ativação 48 h, reset 1 h, notificações) apontam para `APP_URL` | 404 depois do go-live | Go-live sem ativação pendente, ou reenvio. Domínio antigo mantido para webhooks |
| Troca de cookie (Q12) | Todo mundo entra de novo | Aviso. Uma vez só |
| Contas `PERSON` com transações, cargas ou equipes | Perdem a visão desses módulos no CPF (Q3, Q4) | Levantar antes do go-live se há dado real (Q13). Repasses seguem no worker |
| Conta de admin `PERSON` | Admin sem acesso se a área `ADMIN` falhar | Teste dedicado. `create-platform-admin.mjs` sem mudança |
| Unicidade global (Q2) | Existência de CPF detectável entre áreas. Exige dois e-mails para PF + empresa | Mensagem neutra, limitador. Decisão de produto |
| Marcadores de bundle | Falso positivo ou falso negativo | Lista curada no manifesto, revisada na ETAPA 5 |
| `cpf.temcnpj.com.br` contém "temcnpj" | O nome da outra marca aparece na URL do CPF | Consequência do plano. `temcpf.com.br` atenua (301) |
| Apex sem ALIAS no DNS atual | Apex não aponta para o Railway | Provedor de DNS com flattening (seção 9) |
| Limite de domínios no plano do Railway | Faltar domínio para o 301 | Conferir antes. Alternativa: 301 no provedor de DNS |
| `/api/config` e textos de erro com termos de empresa | Texto do CNPJ aparece no CPF | Resposta e mensagens por área (`text(area)`) |

## 13. Em aberto para você

- Q3 e Q4: o que a área CPF recebe de Pagamentos, Cargas, Equipes e Intermediação, e **de quem é a conta de repasse**.
- Q6: `ADMIN_HOST` próprio ou admin dentro do host CNPJ.
- Q7: marca. Define textos, título, remetente e o módulo `brand.js`.
- Q13: os dados atuais são reais? Cargas e Equipes (DEMO) vão ao ar?
- Q14: disponibilidade de `temcnpj.com.br` e `temcpf.com.br`, e provedor de DNS do apex.
- Aprovar as mudanças da seção 11, em especial o rodapé (item 3) e a área derivada (item 5).
