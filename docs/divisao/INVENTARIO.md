# Inventário · ETAPA 0 · Tem CNPJ / Tem CPF

Data: 2026-10-19 · Branch: `claude/autopix-production-saas-yk053p` · Base: `f675110`

Fonte: mapa do repositório (agente Explore, rascunho fora do repo) conferido por grep nos pontos de decisão.

## Como ler

**Classe**

| Classe | Significado |
|---|---|
| `CPF` | Só pessoa física. Vai para `cpf.temcnpj.com.br`. |
| `CNPJ` | Só empresa. Vai para `temcnpj.com.br`. |
| `COMUM` | Só componente genérico (template, infra, tabela com campo `area`). |
| `DÚVIDA` | Cruza as áreas ou depende de decisão sua. Veja a seção **Perguntas**. |

**Confiança**

- `V` = conferido no código nesta etapa.
- `M` = veio do mapa. Revalidar na ETAPA 1.

**Adaptação à stack real** (plano, seção 6, regra 6)

| Plano | Stack real | Efeito |
|---|---|---|
| `apps/web/areas/cpf` e `areas/cnpj` | Um SPA Vite em `apps/web/src/pages/` com `App.jsx` único | Criar duas entradas de build (ETAPA 3) |
| `api/` | `apps/api` (Express) + `packages/core` (serviços) + `apps/worker` | Guarda de área fica no middleware de `apps/api` e nos serviços de `packages/core` |
| `packages/ui`, `packages/auth`, `packages/areas` | Não existem | Criar na ETAPA 2 e 3 |
| Cookie host-only | `ap_session` já sem `Domain` (`apps/api/src/middleware/session.js`) | Bom ponto de partida. Trocar para `__Host-` na ETAPA 4 (Q12) |
| CORS | Só `APP_URL` (`apps/api/src/app.js`) | Precisa aceitar os dois hosts, sem curinga (ETAPA 4) |
| CSRF | Aceita `APP_URL` e `API_URL` (`middleware/security.js`) | Ajustar para os dois hosts (ETAPA 4) |
| Armazenamento | Só PostgreSQL. Fotos sociais são data URL no banco | "Separado por área" vira coluna `area` + filtro, não bucket (Q13) |
| Deploy | Railway: serviço `autopix-web`, `autopix-worker`, Postgres | Um serviço web atende os dois hosts. DNS depois, no Railway |
| Testes | 38 arquivos vitest. Sem CI em `.github/` | Suíte de isolamento nova (ETAPA 7) |

---

## 1. Rotas do frontend

| Rota | Componente | Classe | Motivo | Conf. |
|---|---|---|---|---|
| `/` | `pages/landing/Landing.jsx` | DÚVIDA | 17 termos de empresa e pessoa misturados. Cada host terá sua home (Q8) | V |
| `/onboarding` | `pages/onboarding/Onboarding.jsx` | DÚVIDA | Escolha de tipo de conta na mesma tela (32 termos). Dividir em dois ramos (Q8) | V |
| `/checkout` | `pages/checkout/Checkout.jsx` | CNPJ | Taxa de cadastro só para `COMPANY` (`paymentService.js:139, 210`) | V |
| `/login` | `pages/auth/Login.jsx` | DÚVIDA | Campo único CPF/CNPJ ou e-mail (`authService.js:105`). Cada host aceita só o seu documento | V |
| `/activate/:token` | `pages/auth/Activate.jsx` | DÚVIDA | Ativação de dono (CNPJ) ou de colaborador (CPF, Q1) | M |
| `/forgot-password` | `pages/auth/ForgotPassword.jsx` | COMUM | Fluxo genérico. E-mail precisa de texto por área | M |
| `/reset-password/:token` | `pages/auth/ResetPassword.jsx` | COMUM | Fluxo genérico | M |
| `/app` | `pages/app/Overview.jsx` | DÚVIDA | Painel. Conteúdo depende dos módulos de cada área | M |
| `/app/radar` | `pages/app/RadarPage.jsx` | CNPJ | "Ao redor da sua empresa" (`RadarPage.jsx:40, 65`) | V |
| `/app/licitacoes` | `pages/app/Tenders.jsx` | CNPJ | Item `companyOnly` no menu (`AppLayout.jsx:46`). Rota não bloqueia PF hoje | V |
| `/app/opportunities` | `pages/app/Opportunities.jsx` | CNPJ | Oportunidades para empresa | M |
| `/app/opportunities/:id` | `pages/app/OpportunityDetail.jsx` | CNPJ | "Somente dados empresariais" (`OpportunityDetail.jsx:285`) | V |
| `/app/social` | `pages/app/Social.jsx` | DÚVIDA | Feed compartilhado? (Q9) | M |
| `/app/operacao` | `pages/app/Operations.jsx` | DÚVIDA | Catálogo com itens de um tipo e de outro (Q10) | V |
| `/app/intermediacao` | `pages/app/Intermediation.jsx` | DÚVIDA | Compradores e fornecedores: cruza empresas e pessoas (Q3) | V |
| `/app/activity` | `pages/app/Activity.jsx` | COMUM | Feed de eventos. Precisa filtrar por área | M |
| `/app/agents` | `pages/app/Agents.jsx` | CNPJ | Pesquisa comercial e radar (`engine/CompanyResearchService.js`, `SalesIntelligenceService.js`) | M |
| `/app/company` | `pages/app/Company.jsx` | CNPJ | "Empresa" (16 termos). PF vê "Meu perfil": tela própria CPF (`AppLayout.jsx:65`) | V |
| `/app/subscription` | `pages/app/Subscription.jsx` | CNPJ | `company = accountType !== 'PERSON'` (`Subscription.jsx:182`) | V |
| `/app/settings` | `pages/app/Settings.jsx` | COMUM | Configurações de conta. `TeamCard` só para empresa (`Settings.jsx:106`) | V |
| `/app/pay` | `pages/app/Pay.jsx` | DÚVIDA | Marketplace: pagador e recebedor podem estar em áreas diferentes (Q4) | V |
| `/app/pay/transactions/:id` | `pages/app/TransactionDetail.jsx` | DÚVIDA | Mesmo caso de `/app/pay` (Q4) | V |
| `/app/payments` | redirect para `/app/pay` | DÚVIDA | Acompanha a rota de destino | M |
| `/app/payments/:id` | `pages/app/PaymentDetail.jsx` | DÚVIDA | Redireciona para transação (Q4) | M |
| `/app/admin` | `pages/app/Admin.jsx` | DÚVIDA | Admin da plataforma, fora das áreas (Q6) | V |
| `/app/freight` | `pages/app/Freight.jsx` | DÚVIDA | Cargas: transportadora (CNPJ) e motorista (pode ser CPF). Dados demo (Q3, Q13) | V |
| `/app/freight/matches/:id` | `Freight.jsx` (`FreightMatchDetail`) | DÚVIDA | Mesmo caso de `/app/freight` | M |
| `/app/workforce` | `pages/app/Workforce.jsx` | DÚVIDA | Empresa contrata profissional PF (`Workforce.jsx:221, 233`). Cruza áreas (Q3) | V |
| `/app/workforce/matches/:id` | `Workforce.jsx` (`WorkforceMatchDetail`) | DÚVIDA | Mesmo caso de `/app/workforce` | M |
| `/app/confirm/:id` | `pages/app/ConfirmChallenge.jsx` | COMUM | Desafio de confirmação genérico | M |
| `/app/*` (demais) | redirect para `/app` | COMUM | Genérico | M |
| `*` | `pages/NotFound.jsx` | COMUM | Genérico. Para rota da outra área, o plano exige 404 | M |

## 2. Telas, componentes e textos

| Item | Arquivo | Classe | Motivo | Conf. |
|---|---|---|---|---|
| Shell do painel e menu | `pages/app/AppLayout.jsx` | COMUM | Shell genérico. Menu precisa de itens por área (`navFor`, `companyOnly`) | V |
| Componentes de estado | `PageLoader.jsx`, `components/ui/*` | COMUM | Genéricos | M |
| Layout de auth | `auth/AuthShell.jsx`, `auth/PasswordInput.jsx` | COMUM | Genéricos | M |
| Login | `auth/Login.jsx` | DÚVIDA | "Entrar no TemPix" (marca, Q7). Documento por host | M |
| Landing | `landing/Landing.jsx`, `PhoneChat.jsx`, `ProductStage.jsx` | DÚVIDA | Home única (Q8) | M |
| Landing setores | `landing/sectors/Sectors.jsx`, `copy.js` (8 "empresa"), `PortArt.jsx`, `SiteArt.jsx`, `iso.jsx` | DÚVIDA | Textos de empresa. Ilustrações genéricas (Q8) | M |
| Landing 3D | `landing/descent/*` | COMUM | Ilustração genérica (verificar textos) | M |
| Cadastro: escolha de tipo | `onboarding/AccountStartFields.jsx` | DÚVIDA | "Cadastro Pessoa Física" e tipo de conta (Q8) | V |
| Cadastro: localização PF | `onboarding/PersonWhereFields.jsx` | CPF | Campos de endereço da pessoa física (CEP, bairro, cidade). Nome e uso `M` | M |
| Cadastro: operação | `onboarding/operations/OperationFields.jsx`, `ProfileOverview.jsx` | DÚVIDA | Catálogo misto (Q10) | M |
| Equipe (colaboradores) | `app/TeamCard.jsx` (20 termos) | CNPJ | Colaborador é do dono da empresa. `teamService.js:45` só `COMPANY` | V |
| Ajustes da plataforma | `app/SettingsPlatform.jsx` | DÚVIDA | Ver linhas abaixo | V |
| ↳ InstallCard, NotificationPrefsCard | idem | COMUM | Genéricos | M |
| ↳ PayoutCard | idem (`:261`) | DÚVIDA | Conta para repasse. De quem é a conta? (Q4) | V |
| ↳ WhatsAppCard | idem | COMUM | Conexão por usuário. Mensagens por área (Q11) | M |
| Checkout (texto "TEMPIX") | `checkout/Checkout.jsx` (23 termos) | CNPJ | Título mantido. Taxa de cadastro é de empresa | V |
| Textos de pessoa física | `PersonWhereFields`, `AccountStartFields`, `Onboarding.jsx`, `Landing.jsx`, `authService.js`, `shared/schemas.js`, `shared/operations/modules.js`, `onboarding.module.css` | CPF | 12 ocorrências de "pessoa física" (M) | M |
| Textos de profissional | `workforceService.js` (9), `actions/definitions.js` (7), `Onboarding.jsx` (4), `Workforce.jsx` (3), `Landing.jsx` (3) | CPF | 34 ocorrências de "profissional" (M) | M |
| Textos de colaborador | `teamService.js` (4), `TeamCard.jsx` (3), `actions/definitions.js` (2) | CNPJ | Colaborador trabalha para uma empresa (Q1) | M |
| Textos de empresa | 46 arquivos, 138 ocorrências | CNPJ | Maioria em telas de empresa (M) | M |
| Textos de CNPJ | 39 arquivos, 183 ocorrências | CNPJ | Maioria em pagamento e cadastro de empresa (M) | M |
| Textos de CPF | 25 arquivos, 93 ocorrências | CPF | `shared/schemas.js` e `shared/format.js` são genéricos, com uso dos dois (`COMUM` para o código, CPF para o texto) | M |
| Textos de MEI | `AccountStartFields.jsx` (2), `shared/operations/modules.js` (2) | DÚVIDA | Pertence a qual área? (Q5) | M |
| Textos de admin | `platformAdminService.js` (8 CPF) | DÚVIDA | Administração (Q6) | M |
| Títulos e marca | "Entrar no TemPix", "TemPix" em `document.title` | DÚVIDA | Marca de cada área ou TemPix (Q7) | V |
| SEO | `apps/web/index.html`, `apps/web/public/robots.txt`, `manifest.webmanifest` | COMUM | Um só para os dois hosts. Precisa de um por host (ETAPA 3) | V |
| Favicon e ícones | `apps/web/public/favicon.svg`, `icons/` | COMUM | Tema próprio por área (ETAPA 3) | V |
| Service worker | `apps/web/pwa/sw-template.js` | COMUM | Uma origem por host. `/api/*` sempre rede (`:9-10, 54`) | M |

## 3. Endpoints da API

Guardas: `requireAuth` = sessão FULL e ACTIVE. `requireOnboardingSession` = qualquer sessão. Pública = sem guarda.

### Sistema e infraestrutura

| Endpoint | Guarda | Classe | Motivo | Conf. |
|---|---|---|---|---|
| `GET /api/health` | pública | COMUM | Healthcheck do Railway | M |
| `GET /api/session` | pública | COMUM | Devolve `session` e precisará devolver a área (ETAPA 4) | M |
| `GET /api/config` | pública | COMUM | Não pode expor dado de uma área | M |
| `GET /api/cep/:cep` | pública | COMUM | Usado pelos dois cadastros | M |
| `POST /api/webhooks/payment/:provider` e `/pix` | assinatura | COMUM | Infra. A área vem do registro de pagamento | M |
| `GET/POST /api/webhooks/whatsapp` | handshake e assinatura | COMUM | Infra (Q11) | M |

### Autenticação e conta

| Endpoint | Guarda | Classe | Motivo | Conf. |
|---|---|---|---|---|
| `POST /api/auth/login` | pública, limiter | DÚVIDA | Aceita CPF, CNPJ ou e-mail (`authService.js:105`). Cada host aceita só o seu (Q1, Q2) | V |
| `POST /api/auth/login/verify-whatsapp` | pública | DÚVIDA | Mesmo caso do login (Q11) | M |
| `POST /api/auth/native/login` e `/native/verify-whatsapp` | pública | DÚVIDA | Token para app nativo. Precisa levar a área (ETAPA 4) | M |
| `POST /api/auth/logout` | pública | COMUM | Revoga a sessão | M |
| `GET /api/auth/activate/:token`, `POST /activate` | token | DÚVIDA | Dono (CNPJ) ou colaborador (CPF) (Q1) | M |
| `POST /api/auth/forgot-password`, `GET/POST /reset-password` | limiter | COMUM | Fluxo genérico. E-mail por área | M |
| `GET /api/me`, `PUT /api/me/password`, `GET/DELETE /api/me/sessions` | `requireAuth` | COMUM | Conta do próprio usuário | M |
| `POST /api/onboarding/start` e `/check` | pública, limiter | DÚVIDA | `accountType` vem do corpo (`onboardingService.js:31`). Host deve impor o tipo (Q8) | V |
| `GET /api/onboarding`, `PUT /step`, `POST /finish` | onboarding | DÚVIDA | Mesmo caso (Q8) | M |
| `GET /api/actions` e `POST /api/actions/:name` | `requireAuth` e onboarding | DÚVIDA | Catálogo misto: contém ações de colaborador e de PF (`actions/definitions.js`) | V |
| `GET /api/challenges/:id`, `POST /confirm`, `/confirm-whatsapp`, `/cancel` | `requireAuth` | COMUM | Desafio genérico. Área vem do dono | M |

### Pagamento de cadastro (assinatura)

| Endpoint | Guarda | Classe | Motivo | Conf. |
|---|---|---|---|---|
| `POST /api/payments/pix`, `GET /:id`, `POST /:id/activation` | onboarding | CNPJ | Taxa de cadastro só para `COMPANY` (`onboardingService.js:152`, `paymentService.js:139, 210`) | V |
| `POST /api/payments/:id/simulate` | onboarding | CNPJ | Simulação. Confirmar que está desligada em produção (`DEMO_MODE` false) | M |
| `GET /api/payments` | `requireAuth` | CNPJ | Lista de pagamentos da empresa | M |

### Recursos do painel

| Endpoint | Guarda | Classe | Motivo | Conf. |
|---|---|---|---|---|
| `GET/PUT /api/company` | `requireAuth` | CNPJ | `companyService.js:80` apaga CNPJ se PF. Mesmo endpoint serve "Meu perfil" (CPF) | V |
| `GET /api/opportunities`, `GET /:id`, `PATCH /:id` | `requireAuth` | CNPJ | Oportunidades para empresa | M |
| `GET /api/activity`, `GET /stream` (SSE) | `requireAuth` | COMUM | Filtrar por área (ETAPA 4) | M |
| `GET /api/agents`, `/runs`, `POST /run`, `/pause` | `requireAuth` | CNPJ | Pesquisa comercial (M) | M |
| `GET /api/dashboard` | `requireAuth` | DÚVIDA | `dashboardService.js` monta KPIs de ambos | M |
| `GET/POST/DELETE /api/subscription` (`GET /`, `/cancel`, `/resume`) | `requireAuth` | CNPJ | Plano só para empresa | M |
| `GET/POST/DELETE /api/team` | `requireAuth` | CNPJ | `teamService.js:45` | V |
| `GET /api/tenders`, `/api/tenders/cities` | `requireAuth` | CNPJ | Licitações são da empresa. Dado público (PNCP), gravado como `COMUM` | V |
| `GET /api/freight`, `GET /matches/:id` | `requireAuth` | DÚVIDA | Cruza transportadora (CNPJ) e motorista (Q3) | M |
| `GET /api/workforce`, `GET /matches/:id` | `requireAuth` | DÚVIDA | Empresa e profissional PF (Q3) | M |
| `GET /api/events` | `requireAuth` | COMUM | Eventos com área (ETAPA 4) | M |
| `GET /api/intermediation` | `requireAuth` | DÚVIDA | `intermediationService.js` (Q3) | M |
| `GET /api/social/posts`, `/eligible`, `/posts/:id/comments`, `/posts/:id/photo` | `requireAuth` | DÚVIDA | Feed: área do autor (Q9) | M |
| `GET/PUT /api/notifications/preferences` | `requireAuth` | COMUM | Por usuário | M |
| `GET /api/notifications/push/public-key`, `POST/DELETE /push/subscriptions` | `requireAuth` | COMUM | Por usuário. Subject de Web Push é `suporte@tempix.com.br` (`config.js:281`) (Q7) | M |
| `GET /api/whatsapp`, `POST/DELETE /connection`, `GET /messages` | `requireAuth` | COMUM | Conexão por usuário. Mensagens por área (Q11) | M |

### Pagamentos (marketplace) e administração

| Endpoint | Guarda | Classe | Motivo | Conf. |
|---|---|---|---|---|
| `GET /api/pay/capabilities`, `/summary`, `/transactions`, `/transactions/:id`, `/commission/quote`, `/trips/:matchId` | `requireAuth` | DÚVIDA | Transação tem dois lados (Q4) | V |
| `GET /api/admin/*` (overview, payments, transactions, provider-events, failed-webhooks, reconciliation, refunds, disputes, payout-failures, commission-rules, audit) | `requireAuth` + `isPlatformAdmin` | DÚVIDA | Fora das duas áreas (Q6) | V |
| `POST /api/admin/disputes/:id/summary`, `/review` | `requireAuth` + `isPlatformAdmin` | DÚVIDA | Mesmo caso (Q6) | V |

## 4. Modelos do banco

Regra proposta: toda tabela de dono recebe a coluna `area` (`CPF` | `CNPJ`) e toda consulta filtra por ela (plano, seção 2).

| Modelo | Classe | Observação | Conf. |
|---|---|---|---|
| `Company` | COMUM | Coluna `accountType` (`COMPANY` / `PERSON`) já é o discriminador. Mapear para `area` (Q13) | V |
| `User` | DÚVIDA | `loginId` é CPF ou CNPJ, único no sistema todo. Colaborador tem CPF dentro de empresa (Q1, Q2) | V |
| `User.role` (`OWNER`, `ADMIN`, `MEMBER`) | COMUM | Usado no time. `requireRole` existe e não é usado (M) | M |
| `User.isPlatformAdmin` | DÚVIDA | Admin da plataforma (Q6) | V |
| `Session`, `LoginChallenge`, `ActivationToken`, `PasswordResetToken`, `SensitiveActionChallenge` | COMUM | Sessão e verificação. Ganham `area` (ETAPA 4) | M |
| `Subscription` | CNPJ | Plano de empresa | M |
| `Payment`, `PaymentEvent` | CNPJ | Cadastro (taxa). `payerDocument` pode ser CPF (`bb-pay.provider.js:369`) | V |
| `Opportunity`, `OpportunitySource`, `Agent`, `AgentRun`, `CompanySignal`, `Contact`, `SearchJob` | CNPJ | Dados de empresa e pesquisa comercial | M |
| `ActivityEvent`, `DomainEvent`, `ActionLog` | COMUM | Log com `area` | M |
| `WhatsAppConnection`, `WhatsAppMessage`, `WhatsAppPendingCommand` | COMUM | Conta do usuário (Q11) | M |
| `NotificationPreference`, `NotificationDelivery`, `PushSubscription` | COMUM | Por usuário | M |
| `FreightRequest`, `FreightMatch` | DÚVIDA | Cruza transportadora e motorista (Q3) | M |
| `WorkforceDemand`, `WorkforceMatch` | DÚVIDA | Empresa e profissional PF (Q3) | M |
| `MarketplaceTransaction`, `TransactionEvent`, `CommissionRule`, `PaymentAllocation`, `Refund`, `Payout`, `TransactionDispute`, `FinancialAuditLog`, `ReconciliationIssue`, `TripEvent` | DÚVIDA | Dois lados de áreas diferentes (Q4) | M |
| `SocialPost`, `SocialComment` | DÚVIDA | Feed (Q9). Foto em data URL, até 450 KB (`schema.prisma:1219`) | M |
| `PublicTender` | CNPJ | Feature de empresa. Dado público, `agencyCnpj` do órgão | V |
| `SyncState` | COMUM | Lease do worker (`pncp-open`) | V |
| `Company.postalCode`, `User.pendingExpiresAt` | COMUM | Campos genéricos | V |

## 5. Autenticação, sessão e segurança

| Item | Classe | Observação | Conf. |
|---|---|---|---|
| Cookie `ap_session` | COMUM | httpOnly, secure em produção, sameSite lax, path `/`, sem `Domain` (`config.js:286`). Trocar para `__Host-ap_session` (Q12) | V |
| TTL de sessão | COMUM | FULL 7 dias, ONBOARDING 14 dias (`config.js:287-288`) | V |
| Token de sessão | COMUM | 32 bytes, HMAC-SHA256 no banco (`security/tokens.js`). Sem `aud` hoje (ETAPA 4) | V |
| Token de API para app nativo | DÚVIDA | Bearer sem área (ETAPA 4). Precisa de `aud` | M |
| `aud` (área no token) | COMUM | A criar | — |
| Senha | COMUM | Argon2id (`security/password.js`) | V |
| MFA por WhatsApp | COMUM | Login cria `LoginChallenge` (5 min, 5 tentativas) (`authService.js:134-183`) | M |
| CORS | COMUM | Origem única `APP_URL`, `credentials true` (`app.js`). Precisa dos dois hosts, sem curinga | M |
| CSRF | COMUM | `X-Requested-With` e `Origin` contra `APP_URL` e `API_URL` (`security.js`) | M |
| Front: API | COMUM | `credentials include` e `X-Requested-With` (`apps/web/src/lib/api.js:42-47`). Sem token em localStorage | M |
| localStorage | COMUM | Só flags de UI e rascunho do onboarding (`hooks.js:90-96`, `Onboarding.jsx:348-375`) | M |

## 6. Infraestrutura, deploy e configuração

| Item | Classe | Observação | Conf. |
|---|---|---|---|
| Serviço `autopix-web` (Railway) | COMUM | Um deploy atende os dois hosts (plano, seção 4) | V |
| Serviço `autopix-worker` | COMUM | Jobs por área (licitações, cargas, pesquisa) | V |
| Postgres `postgres` | COMUM | Único armazenamento persistente | M |
| Domínio | COMUM | Não há domínio fixo. `APP_URL` obrigatório em produção (`config.js:324`) | M |
| `APP_URL`, `API_URL` | COMUM | Precisam de dois hosts (ETAPA 4) | M |
| `VITE_API_URL` | COMUM | Mesma origem por host | M |
| Remetente de e-mail | DÚVIDA | `TemPix <nao-responda@tempix.com.br>` (`config.js:252`) (Q7) | M |
| User-Agent de coleta | DÚVIDA | `tempix.com.br/bot` (`safeFetch.js:48`) (Q7) | M |
| `PAYMENT_*`, `BILLING_MODEL`, `COMPANY_SIGNUP_FEE_CENTS` | CNPJ | Taxa de cadastro é de empresa. Hoje no Railway: 100 centavos. Alvo antes dos anúncios: 20000 | V |
| `BB_*` (convênio, mTLS, scopes) | DÚVIDA | Um convênio para as duas áreas? (Q11) | M |
| `WHATSAPP_*` | DÚVIDA | Um número ou dois? (Q11) | M |
| `EMAIL_PROVIDER`, `EMAIL_API_KEY` | COMUM | Provedor único. Texto por área | M |
| `TENDERS_SYNC_ENABLED`, `TENDERS_SYNC_MINUTES` | CNPJ | Sincronização de licitações (empresa) | V |
| `DEMO_MODE` | COMUM | Deve ser `false` em produção | M |
| Certificado mTLS BB | COMUM | `packages/core/src/payments/providers/certs/` | M |
| Build | COMUM | `npm run build` gera um SPA. ETAPA 3 passa a gerar duas entradas | M |
| CI | COMUM | Não existe em `.github/`. Criar com o teste de isolamento (ETAPA 7) | M |

## 7. Testes

| Item | Classe | Observação | Conf. |
|---|---|---|---|
| `apps/api/test` (21 arquivos) | COMUM | Inclui `signupWindow`, `identity`, `tenders`, `pay`, `personWhere` | M |
| `packages/core/test` (9), `packages/shared/test` (4), `apps/web/test` (4) | COMUM | Genéricos | M |
| Testes de isolamento entre áreas | COMUM | Não existem. Criar na ETAPA 7 | — |

---

## Perguntas para você responder

Cada uma tem a minha recomendação. Uma resposta curta por número basta (por exemplo, "1A, 2 sim, 3 A").

### Pessoa, empresa e cruzamentos

**Q1. Colaborador (CPF que trabalha numa empresa).** Hoje ele entra com CPF e a conta pertence à empresa (`teamService.js`).
- **A (recomendado):** entra pelo host da empresa (`temcnpj.com.br`), com login por CPF e papel `MEMBER`. Não tem conta na área `cpf`.
- B: entra pelo `cpf.temcnpj.com.br` e vê só a própria conta. Perde o acesso à empresa.
- C: remover colaboradores do produto.

**Q2. Unicidade de documento e e-mail.** Hoje CPF, CNPJ e e-mail são únicos no sistema inteiro.
- **Recomendado:** continuar únicos no sistema todo. Uma pessoa com CPF e empresa tem dois logins, cada um com seu documento, como a regra do plano diz. O mesmo CPF não pode ter conta nas duas áreas.

**Q3. Cruzamentos entre áreas** (Equipes, Cargas, Intermediação). A empresa precisa encontrar o profissional, o transportador ou o comprador. A regra absoluta proíbe que uma área mostre dados da outra.
- **A (recomendado):** cada lado vê só o seu. O contato acontece fora do site (WhatsApp ou telefone), liberado somente quando há aceite.
- B: um ponto neutro compartilhado, com dados que nenhuma área é dona.
- C: tirar a função de uma das áreas no go-live.

**Q4. Pagamentos do marketplace.** A transação tem pagador (quase sempre CNPJ) e recebedor (CPF ou CNPJ). Também existe a conta de repasse (`PayoutCard`).
- **Recomendado:** o pagador vê a cobrança, o recebedor vê o repasse, cada um na sua área. Confirmar de quem é a conta de repasse.

**Q5. MEI e autônomos.** MEI tem CNPJ. Caminhoneiro autônomo e profissional autônomo sem CNPJ aparecem no catálogo de operação.
- **Recomendado:** MEI entra em `temcnpj.com.br`. Quem não tem CNPJ entra em `cpf.temcnpj.com.br`.

**Q6. Administração da plataforma** (`/app/admin`, admin financeiro, criação de admin por CPF).
- **A (recomendado):** fora das duas áreas públicas, em um host próprio e restrito.
- B: dentro da área CNPJ, só para `isPlatformAdmin`.

### Produto, marca e conteúdo

**Q7. Marca.** O site continua como "TemPix" (e-mails em `tempix.com.br`, "Entrar no TemPix") ou passa a se chamar "Tem CNPJ" e "Tem CPF"? Isso afeta textos, remetente, Web Push e WhatsApp. Também pesa a dúvida jurídica do nome com "Pix", ainda aberta.
- Preciso da sua decisão antes da ETAPA 6 (textos).

**Q8. Home e cadastro.** Cada host terá home e cadastro próprios.
- **Recomendado:** `temcnpj.com.br` com a home de empresa e cadastro só de empresa. `cpf.temcnpj.com.br` com home e cadastro de pessoa física. A home atual, com setores para os dois públicos, deixa de existir. Confirmar.

**Q9. Social.** Feed único ou separado por área?
- **Recomendado:** separado. Post de empresa aparece só no CNPJ, post de pessoa só no CPF.

**Q10. Perfil operacional.** O catálogo tem itens para os dois tipos (`operations/catalog.js`).
- **Recomendado:** cada área recebe só o catálogo do seu tipo. Itens que servem aos dois são duplicados com rótulo próprio.

**Q11. Contas técnicas.** Um convênio BB, um número de WhatsApp e um remetente de e-mail para as duas áreas, ou um de cada?
- **Recomendado:** uma conta técnica, com mensagens e textos separados por área.

**Q12. Cookie.** Trocar `ap_session` por `__Host-ap_session` derruba todas as sessões ativas, e todo mundo precisa entrar de novo.
- **Recomendado:** aceitar uma vez, no go-live da ETAPA 4, com aviso aos usuários.

**Q13. Dados atuais.** Contas `COMPANY` vão para `temcnpj.com.br`, `PERSON` para `cpf.temcnpj.com.br`. Colaboradores seguem a Q1.
- Preciso saber: os dados atuais são reais ou de teste? Cargas e Equipes estão com dados DEMO (`DemoFreightSource`, nomes "(DEMO)"). Vão ao ar nas áreas ou saem do go-live? Nenhuma migração ou exclusão será feita sem sua aprovação (plano, seção 6).

**Q14. Domínios.** `temcnpj.com.br` e `temcpf.com.br` não foram confirmados como disponíveis. A consulta RDAP no registro.br retornou 403 deste ambiente. Confira no registro.br antes de comprar.

---

## Resumo da classificação

Contagem das 148 linhas de classificação nas seções 1 a 7:

| Classe | Linhas | Leitura |
|---|---|---|
| `CNPJ` | 28 | Telas e endpoints de empresa (checkout, radar, licitações, plano, agentes, equipe) |
| `CPF` | 4 | Quase nada é exclusivo de pessoa física hoje. O CPF usa o mesmo app com variações (`accountType`) |
| `COMUM` | 63 | Template, auth, infra, notificações, tabelas com campo `area` |
| `DÚVIDA` | 53 | Cruzamentos entre áreas, landing, cadastro, admin, marca |

**Leitura principal:** a área CPF ainda não tem conteúdo próprio. A maior parte do que é de pessoa física está misturada no app de empresa, com `if (accountType === 'PERSON')`. Por isso a ETAPA 3 vai criar mais tela do que mover código. A maioria das dúvidas (53) vem de cruzamentos e de telas compartilhadas, não de falta de informação.

Pontos que mais pesam no plano:
1. **Cruzamentos** (Equipes, Cargas, Intermediação, Pagamentos, Social): são o maior risco para a regra de isolamento. Dependem de Q3, Q4 e Q9.
2. **Colaborador** (CPF dentro de empresa): fica entre as duas áreas. Depende de Q1.
3. **Admin da plataforma**: precisa de lugar próprio. Depende de Q6.
4. **Marca**: define textos e domínio de e-mail. Depende de Q7.
