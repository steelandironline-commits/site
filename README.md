# TemPix

**Tem emprego, tem rota, tem serviço. TemPix.**
*Clientes, cargas, profissionais e Pix numa tela só.*

TemPix is a Brazilian autonomous commercial-opportunity discovery platform. A business
subscribes (R$597/mês via Pix), describes what it sells, who it wants to reach and where it
operates, and a pipeline of agents continuously searches the market, researches companies,
detects commercial signals (expansions, construction, purchases, hiring, new projects,
demand), scores each candidate and delivers qualified opportunities with a suggested
commercial approach to a realtime dashboard.

---

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation & local development](#installation--local-development)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Scripts](#scripts)
- [Demo mode](#demo-mode)
- [Fees (taxas)](#fees-taxas)
- [Operational profile & intermediation](#operational-profile--intermediation)
- [Payments (Pix)](#payments-pix)
- [TemPix Pay](#autopix-pay)
- [Banco do Brasil Integration](#banco-do-brasil-integration)
- [Agents & the autonomous engine](#agents--the-autonomous-engine)
- [Realtime](#realtime)
- [Deploy on Railway](#deploy-on-railway)
- [Security](#security)
- [Tests](#tests)
- [Project structure](#project-structure)
- [Platform layer: ActionEngine, events, WhatsApp, PWA](#platform-layer-actionengine-events-whatsapp-pwa)
- [Known limitations](#known-limitations)

---

## Features

| Area | What ships |
|------|------------|
| Landing (`/`) | Full-viewport hero, Three.js **Opportunity Radar** (lazy, DPR-capped, pauses off-screen, reduced-motion aware), live **ATIVIDADE** stream + SOURCE→RESEARCH→SIGNAL→SCORE→OPPORTUNITY pulse flow (both labelled **DEMO**), interactive “Como funciona”, embedded opportunity preview, single-plan pricing. |
| Onboarding (`/onboarding`) | 10 progressive steps, persisted server-side after every step (resumable after reload), “Entendendo seu mercado…” analysis sequence, “PAGAR COM PIX”. |
| Checkout (`/checkout`) | Mobile-first Pix page: QR code, *copia e cola* with COPIAR PIX, expiry countdown, status polling (pauses in background tabs) + provider reconciliation, PAGAMENTO CONFIRMADO → “Ativando seu TemPix…” → `/activate/:token`. |
| Auth | `/login`, `/activate/:token`, `/forgot-password`, `/reset-password/:token`; HTTP-only cookie sessions, Argon2id, one-time expiring tokens. |
| Dashboard (`/app`) | Visão Geral (DB-backed metrics, 2.5D business-flow visualization pulsing on real events, top opportunities, live activity), Radar (Three.js with real opportunities), Oportunidades (filters, search, sort, cards/list, actions), detail page (score breakdown, reasons, sources, public contacts, approach, timeline, notes, status), Atividade (SSE feed, filters, history paging), Agentes, Empresa, Assinatura, Configurações. |
| Backend | Express 5 REST API, Prisma/PostgreSQL, Zod validation, Postgres-backed job queue, separate worker, SSE over `LISTEN/NOTIFY`, vendor-independent payment layer. |

---

## Architecture

```
                         ┌────────────────────────── Railway ───────────────────────────┐
 Browser (React/Vite) ──▶│  autopix-web  (apps/api)                                      │
   SPA + SSE             │   Express: /api/*  + serves apps/web/dist                     │
                         │   ActivityHub: LISTEN autopix_activity → SSE subscribers      │
 Pix provider ──webhook─▶│   /api/webhooks/payment/:provider (raw body, signature check) │
                         │                │                                              │
                         │                ▼                                              │
                         │           PostgreSQL ◀──── autopix-worker (apps/worker)       │
                         │   SearchJob queue (FOR UPDATE SKIP LOCKED), pg_notify         │
                         └───────────────────────────────────────────────────────────────┘
```

- **`packages/shared`** — isomorphic constants, formatters and Zod schemas (used by web *and* api).
- **`packages/core`** — server domain: config, Prisma client, security, services, payment providers, engine.
- **`packages/ui`** — shared front-end template (`@autopix/ui`): generic components, logo, auth shell, API client, session, hooks, PWA helpers and the base CSS tokens. No area-specific text, routes or endpoints.
- **`apps/api`** — HTTP layer only (routes, middleware, SSE hub). Never runs search workflows in a request.
- **`apps/worker`** — scheduler + job consumer. Can be scaled horizontally (jobs are claimed with `SKIP LOCKED`).
- **`apps/web`** — React 19 + Vite + Framer Motion + Lucide; CSS Modules over a token system; Three.js/R3F only for the radar.

Design principle: a premium **2D interface with a 2.5D command-center feel**. WebGL is used only for the
radar; everything else (including checkout) is accessible HTML/CSS.

---

## Requirements

- Node.js **≥ 20.11** (22 recommended, see `.nvmrc`)
- npm 10+
- PostgreSQL **14+**

Redis is **not** required.

---

## Installation & local development

```bash
git clone <repo> autopix && cd autopix
cp .env.example .env            # set DATABASE_URL at minimum
npm install                     # also runs `prisma generate`
npm run db:migrate              # apply migrations
npm run db:seed                 # agents (+ demo account when DEMO_MODE=true)
npm run dev                     # api :3000 + worker + web :5173 (Vite proxies /api)
```

Open http://localhost:5173.

With `DEMO_MODE=true`, `npm run db:seed` creates `demo@autopix.example` with an active
subscription and demo data, and prints a **one-time activation link** — you define the
password yourself (no password is ever generated).

To try the full purchase flow locally: go to `/onboarding`, finish the steps, and on
`/checkout` use **“Simular confirmação do pagamento”** (only shown with the mock provider
outside production). It sends a *signed webhook* through the exact same code path as real
providers.

---

## Environment variables

See `.env.example` for the annotated list.

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | yes | `development`, `test` or `production`. |
| `DATABASE_URL` | yes | PostgreSQL connection string. |
| `APP_URL` | prod | Public URL of the web app (links in e-mails, CORS/CSRF origin). |
| `API_URL` | no | Public API URL (Mercado Pago `notification_url`). Defaults to `APP_URL`. |
| `SESSION_SECRET` | prod | ≥ 32 chars. HMAC key for session token hashes. |
| `ACTIVATION_TOKEN_SECRET` | prod | ≥ 32 chars. HMAC key for activation tokens. |
| `PASSWORD_RESET_SECRET` | prod | ≥ 32 chars. HMAC key for reset tokens. |
| `PAYMENT_PROVIDER` | yes | `mock` (dev/test only), `mercadopago` or `asaas`. |
| `PAYMENT_ACCESS_TOKEN` | prod | Provider API token. |
| `PAYMENT_WEBHOOK_SECRET` | prod | Mercado Pago webhook secret / Asaas webhook access token. |
| `PAYMENT_API_URL` | no | Override provider base URL (e.g. Asaas sandbox). |
| `DEMO_MODE` | no | `true` = fictional data, `false` = real sources only. |
| `PORT` | no | HTTP port (Railway injects it). |
| `EMBEDDED_WORKER` | no | Run the worker inside the API process (single-service deploys). |
| `SEARCH_INTERVAL_MINUTES` | no | Minutes between scheduled searches per company (default 60). |
| `OPPORTUNITY_SCORE_THRESHOLD` | no | Minimum score to create an opportunity (default 60). |
| `SEARCH_PROVIDER`, `SEARCH_API_KEY` | no | Web search discovery (`brave`). |
| `NEWS_SOURCE_ENABLED` | no | Google News RSS discovery. |
| `PUBLIC_BUSINESS_SOURCE_ENABLED` | no | BrasilAPI CNPJ registry enrichment. |
| `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` | prod | `resend` for transactional e-mail. `console` (dev) prints messages locally. |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The API refuses to boot in production with missing/short secrets, a missing payment token or
`PAYMENT_PROVIDER=mock`.

---

## Areas: Tem CNPJ and Tem CPF (area mode)

One deploy serves two isolated areas, chosen by the host the request came in on:

| Variable | Example value | Meaning |
|----------|---------------|---------|
| `PUBLIC_HOST_CNPJ` | `temcnpj.com.br` | Host of the company area (Tem CNPJ). |
| `PUBLIC_HOST_CPF` | `cpf.temcnpj.com.br` | Host of the person area (Tem CPF). |
| `PUBLIC_HOST_CNPJ_REDIRECT` | `www.temcnpj.com.br` | Comma-separated hosts that answer 301 to the CNPJ host. |
| `PUBLIC_HOST_CPF_REDIRECT` | `temcpf.com.br,www.temcpf.com.br` | Comma-separated hosts that answer 301 to the CPF host (path and query kept). |
| `ADMIN_HOST` | (empty) | Optional own host for the platform admin. |

The values above are examples, not production settings. `PUBLIC_HOST_CNPJ` and `PUBLIC_HOST_CPF` turn area mode on **together**: with only one of them set, the server refuses to start. With both empty, the server keeps the legacy behaviour and ignores the host. Set the same values on the web and the worker services.

Development: `PUBLIC_HOST_CNPJ=localhost:5173` and `PUBLIC_HOST_CPF=cpf.localhost:5174`, then `npm run dev:cnpj` and `npm run dev:cpf` (the API runs with `npm run dev` or `npm start`). Production builds of both areas: `npm run build:areas`, which writes `apps/web/dist-cnpj` and `apps/web/dist-cpf`.

---

## Database

Prisma schema: `prisma/schema.prisma`. Models: `User`, `Session`, `Company`, `Subscription`,
`Payment`, `PaymentEvent`, `Opportunity`, `OpportunitySource`, `ActivityEvent`, `Agent`,
`AgentRun`, `CompanySignal`, `Contact`, `ActivationToken`, `PasswordResetToken`, `SearchJob`.

Key constraints and indexes:

- `PaymentEvent @@unique([provider, providerEventId])` — webhook idempotency.
- `Payment @@unique([provider, providerPaymentId])`, `idempotencyKey @unique`.
- `Opportunity @@unique([companyId, targetKey])` — no duplicate opportunities per target.
- `ActivityEvent` indexed by `companyId`, `createdAt`, `type`, `(companyId, createdAt)`.
- `SearchJob @@index([status, runAt])` — queue scans.
- Token tables store only HMAC hashes (`tokenHash @unique`).

```bash
npm run db:migrate        # prisma migrate deploy (production-safe)
npm run db:migrate:dev    # create a new migration during development
npm run db:seed
npm run db:studio
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm install` | Install all workspaces and generate the Prisma client. |
| `npm run dev` | API (watch) + worker (watch) + Vite dev server. |
| `npm run build` | Prisma generate + production build of the web app. |
| `npm run build:areas` | Production build of the Tem CNPJ and Tem CPF areas (`apps/web/dist-cnpj`, `apps/web/dist-cpf`). |
| `npm run dev:cnpj` | Vite dev server of the Tem CNPJ area (port 5173). |
| `npm run dev:cpf` | Vite dev server of the Tem CPF area (port 5174). |
| `npm run lint` | `node --check` on every `.js` file of the API, the worker and the packages. |
| `npm run start` | Start the API (serves the built SPA). |
| `npm run start:worker` | Start the background worker. |
| `npm test` | Unit + integration tests (shared, core, api). |
| `npm run db:migrate` | Apply migrations. |
| `npm run db:seed` | Seed agents (+ demo data in DEMO mode). |

---

## Demo mode

`DEMO_MODE=true`:

- the engine uses **only** `DemoSourceAdapter`, which generates clearly fictional companies on
  the reserved `.example` TLD, tailored to the subscriber profile;
- every demo opportunity, signal and activity event is stored with `isDemo = true` and the UI
  shows a **DEMO** badge (top bar, cards, radar, activity);
- events are paced so the live stream is readable.

`DEMO_MODE=false`:

- the demo adapter is never instantiated; only real adapters run;
- if no real source is configured the worker records a single real warning
  (“Nenhuma fonte de dados configurada”) and creates nothing — **no fake activity, no fake
  opportunities**.

The landing page showcase (radar and activity) is marketing content generated in the browser,
never persisted, and always labelled DEMO.

---

## Fees (taxas)

TemPix has no subscription. What each side pays:

| Who | Fee | When |
| --- | --- | --- |
| Professional (pessoa física, CPF) | Free signup | — |
| Company (CNPJ or MEI) | Free in production while `COMPANY_SIGNUP_FEE_CENTS=0` (default is R$ 200,00) | Before activation |
| Contracts (obras, serviços, rotas, transportes) | 5% up to R$ 10.000, 4% up to R$ 100.000, 3% up to R$ 1.000.000, 2% above, by contract value (`COMMISSION_TIERS`), deducted from what is released to whoever did the work | When the payment is released |
| **Hiring company** | **R$ 1,00 interview scheduling fee** | When the interview is scheduled |
| **Hiring company** | **2% of the successfully intermediated value through TemPix Pay; no additional hiring charge** | After confirmed completion |

Hiring example: agreed salary of R$ 3.000,00 → the estimated success fee is R$ 60,00 (2%), applied only to a completed intermediation;
the company also pays R$ 1,00 when scheduling the interview. Candidates never pay to interview.

Interview fees are charged through Pix by the configured payment provider. Hiring agreements do not generate a separate charge. Marketplace payments use
provider confirmation, idempotency, server-calculated amounts, and audit logs. Production has
`PAYMENT_PROVIDER=none` until Banco do Brasil or another supported provider is configured, so
these charges remain unavailable there. Production company signup is free while
`COMPANY_SIGNUP_FEE_CENTS=0` is set.

The interview scheduling fee is billed to the hiring company. This keeps the cost of recruitment
off the candidate, consistent with the Ministry of Public Labour's enforcement action against
charging workers to be referred to interviews and jobs: <https://www.prt4.mpt.mp.br/procuradorias/prt-porto-alegre/12608-mpt-obtem-decisao-judicial-contra-empresa-de-recursos-humanos-por-cobranca-de-taxa-de-inscricao>.

---

## Operational profile & intermediation

Signup asks *what the company is and can do*, not only "what do you sell".

- **Model** — `Company.operationalProfile` (JSONB), validated by
  `operationalProfileSchema` in `packages/shared/src/operations/`: operation types,
  objectives, roles, industrial services, equipment (type, capacity t, Ø/length mm,
  height/reach m, with/without operator, rental/sale, availability, regions), fleet,
  containers, routes/ports/terminals, maritime supply, terminal purchasing,
  construction capabilities, buyer needs (detailed requests) and documents.
  Catalog ids are stored; labels are pt-BR display only (i18n-ready).
- **Question engine** — `modules.js` declares small question groups that appear only
  when they apply (by operation type, objective or account type). The web renders
  them generically (`apps/web/src/pages/onboarding/operations/`), so a new category
  is a new module, not a new screen.
- **Matching** — `matching.js` checks real capacity: service, equipment ≥ required
  capacity, container type, route, location/region/port, emergency, port access,
  teams and availability (hard constraints), plus buyer ↔ supplier matching from
  detailed needs. Tests cover the Ø500 shaft, 40 HC pickup, steel-truss warehouse,
  12 t munck and 50 t crane examples.
- **API** — `PUT /api/company` / onboarding steps accept `operationalProfile`;
  `GET /api/intermediation` returns capabilities, completeness, counts and compatible
  buyers/suppliers (anonymous: type + city only; contact goes through TemPix).
- **Web** — `/app/operacao` (edit per module, completeness) and `/app/intermediacao`.
  Home sections: ecosystem, TemPix Marítimo and obras/equipamentos pesados (lazy 3D).
  Quotes are not modelled yet (shown as "em breve").

---

## Payments (Pix)

`PaymentProvider` (`packages/core/src/payments/PaymentProvider.js`) is the vendor-independent
contract:

```
createPixCharge()  getPaymentStatus()  handleWebhook()  cancelSubscription()  getSubscriptionStatus()
```

Adapters:

| Adapter | Notes |
|---------|-------|
| `MockPaymentProvider` | Dev/test only. Valid-format BR Code pointing to a non-existent key (cannot be paid). Confirmation only via an HMAC-signed webhook. Refused in production by config validation and `supportsSimulation=false`. |
| `MercadoPagoPaymentProvider` | `/v1/payments` with `payment_method_id=pix` + `X-Idempotency-Key`. Webhook `x-signature` (HMAC-SHA256 over `id;request-id;ts`) is verified, then the status is **re-fetched from the API**. |
| `AsaasPaymentProvider` | Customer + `/v3/payments` (`billingType=PIX`) + `/pixQrCode`. Webhook verified by `asaas-access-token`, status re-fetched. Subscription methods ready for Pix Automático. |
| `BancoDoBrasilPaymentProvider` | BACEN Pix API (`/cob`, `/devolucao`, webhook). OAuth client_credentials with cached token. Webhook authenticated by a URL token and the charge is **re-fetched** from BB. See [Banco do Brasil Integration](#banco-do-brasil-integration). |

Flow:

```
LANDING → ONBOARDING (pending user + company, onboarding-scoped session)
→ /checkout → POST /api/payments/pix → QR + copia e cola
→ provider webhook → POST /api/webhooks/payment/:provider
   transaction: dedupe event (ON CONFLICT DO NOTHING) → lock payment (FOR UPDATE)
                → mark CONFIRMED → activate/extend subscription (once per payment)
                → create one-time activation token → enqueue first search → commit
→ activation e-mail (after commit) + the paying browser claims a fresh one-time token
→ /activate/:token → user sets password (Argon2id) → token consumed → /app
```

The checkout also reconciles with the provider (`getPaymentStatus`, throttled) if a webhook is
delayed. Webhook URL to configure at the provider:

```
https://<your-domain>/api/webhooks/payment/mercadopago
https://<your-domain>/api/webhooks/payment/asaas
https://<your-domain>/api/webhooks/payment/banco-do-brasil?token=<BB_WEBHOOK_SECRET>   (npm run bb:register-webhook)
```

Renewals: one-off Pix charges cover 30 days. From 5 days before the end, *Assinatura → Renovar
com Pix* creates a new charge that extends the period. Expired subscriptions become `PAST_DUE`
(or `CANCELED` if cancellation was scheduled) and agents pause.

---

## TemPix Pay

Marketplace payments on top of the same provider abstraction (details:
[`docs/AUTOPIX_PAY.md`](docs/AUTOPIX_PAY.md)).

- `/app/pay` — tabs Visão Geral, Cobranças, Pagamentos, A Receber, A Liberar,
  Comissões, Histórico, Configurações; metrics RECEBIDO, A LIBERAR,
  EM PROCESSAMENTO, COMISSÕES AUTOPIX; "Pagamentos processados por instituições
  financeiras parceiras." and a `SANDBOX` badge outside production.
- `/app/pay/transactions/:id` — values (gross, commission by tier, seller net),
  Pix, timeline, freight trip panel, and only the actions the server allows
  for your role and the current state.
- `MarketplaceTransaction` with server-side amounts and a commission snapshot
  (by value tier: R$ 1.400 at 5% → R$ 70 + R$ 1.330).
- Protected payment, split and payout appear **only** when the provider
  reports the capability. Without them the seller payable is tracked as
  `PENDING_PROVIDER_CAPABILITY` — TemPix never acts as unofficial escrow.
- Refunds complete only on provider confirmation; disputes are decided by a
  platform admin (`User.isPlatformAdmin`), with AI limited to summarizing.
- `PaymentReconciliationJob` in the worker; append-only `FinancialAuditLog`;
  restricted `/app/admin` back office (read + audited annotations).

## Banco do Brasil Integration

`PAYMENT_PROVIDER=banco_do_brasil` (or `banco-do-brasil`).

| Implemented (BACEN Pix standard) | Not implemented (contract-specific) |
|---|---|
| OAuth2 client_credentials, token cache/refresh | Split |
| `PUT /cob/{txid}` (idempotent), `GET`, `PATCH` cancel | Payout / transfers |
| Status normalization (ATIVA, CONCLUIDA, REMOVIDA_*, expiry by calendar, refunded) | BB Pay redirect |
| Refunds `PUT/GET /pix/{e2eid}/devolucao/{id}` (full and partial) | Protected/escrow flows |
| Webhook (`{pix:[…]}`) with token + re-fetch; `PUT /webhook/{chave}` | Pix Automático |
| Optional mTLS, retries with backoff on idempotent calls | |

Variables: `BB_ENVIRONMENT`, `BB_CLIENT_ID`, `BB_CLIENT_SECRET`,
`BB_DEVELOPER_APPLICATION_KEY`, `BB_PIX_KEY`, `BB_WEBHOOK_SECRET`,
`BB_API_BASE_URL`, `BB_OAUTH_URL`, `BB_PAY_ENABLED`, `BB_SPLIT_ENABLED`,
`BB_PAYOUT_ENABLED`, `BB_PROTECTED_PAYMENT_ENABLED` (+ optional scopes, app-key
parameter, mTLS, Pix expiration). See `.env.example` and the Railway table in
`docs/AUTOPIX_PAY.md`. Production refuses sandbox configuration. The default
URLs follow BB's public documentation — confirm them for your application.

Setup: create the app in the BB developer portal → set the variables →
deploy → `npm run bb:register-webhook` → pay a sandbox cob and watch
`PAYMENT_RECEIVED` arrive. Contract tests (`packages/core/test/bb.provider.test.js`)
run against an in-memory fake of the BB API — no live banking calls in tests.

## Agents & the autonomous engine

Services (`packages/core/src/engine`):

| Service | Responsibility |
|---------|----------------|
| `OpportunityDiscoveryService` | Runs discovery adapters, dedupes, filters own company/excluded industries. |
| `CompanyResearchService` | Enriches candidates (website, registry); website first to reveal CNPJ. |
| `SignalDetectionService` | Deterministic pt-BR phrase rules → typed signals with strength. |
| `OpportunityScoringService` | Explainable 0–100 score: industry 25, services 25, location 15, signal 25, value 10; confidence; priority; value estimate. |
| `SalesIntelligenceService` | Approach recommendation (context, why now, message, channel, next step). |
| `ActivityService` | Single write path for events (persist → `pg_notify`). |
| `AgentOrchestrator` | Runs a `SearchJob`: one `AgentRun` per agent with start/end/status/errors/metrics. |

Source adapters (`SourceAdapter` interface): `DemoSourceAdapter`, `SearchSourceAdapter`
(Brave Search API), `WebsiteSourceAdapter` (SSRF-guarded fetch of public sites, keeps only
role-based business mailboxes such as `contato@`/`comercial@`), `NewsSourceAdapter` (Google
News RSS), `PublicBusinessSourceAdapter` (BrasilAPI CNPJ). Only legitimate public business
information is used — no leaked databases, no private phone scraping, no personal-data
acquisition.

Workflow: `CREATE JOB → DISCOVER → RESEARCH → DETECT SIGNALS → SCORE → (score ≥ threshold) →
CREATE OPPORTUNITY → ACTIVITY EVENTS`. Jobs are created by the scheduler (every
`SEARCH_INTERVAL_MINUTES`), on payment confirmation, on profile changes and by *Buscar agora*.
Failed jobs retry with exponential backoff; jobs of crashed workers are recovered.

---

## Realtime

`GET /api/activity/stream` is a Server-Sent Events endpoint. Every activity event is stored
first and then announced with `pg_notify('autopix_activity', {id, companyId})`; the API's
`ActivityHub` `LISTEN`s, loads the stored event and pushes it to that company's subscribers
only. Works across replicas and the separate worker. `Last-Event-ID` replays missed events.
If `LISTEN` is unavailable the hub falls back to polling; if SSE fails in the browser the
client falls back to polling `/api/activity`.

---

## Deploy on Railway

Railway project = **PostgreSQL + `autopix-web` + `autopix-worker`**, both services from this
repository. The configuration lives in [`.railway/railway.ts`](.railway/railway.ts)
(Railway Infrastructure as Code — `railway.json` *Config as Code* is deprecated by Railway and
cannot be used for new services).

### Option A — Infrastructure as Code (recommended)

```bash
npm i -g @railway/cli        # or see https://docs.railway.com/cli
npm i -D railway             # SDK used to evaluate .railway/railway.ts
railway login
railway link                 # choose/create the project
railway config plan          # review: postgres, autopix-web, autopix-worker
railway config apply
```

Then set the `preserve()` variables in the dashboard (they are never stored in git).

### Option B — Dashboard

1. **New project → Deploy PostgreSQL.**
2. **New service → GitHub repo** (this repo) → name it `autopix-web`:
   - Build command: `npm run build`
   - Start command: `npm run start`
   - Pre-deploy command: `npm run db:migrate`
   - Healthcheck path: `/api/health`
   - Generate a domain (Settings → Networking).
3. **New service → same repo** → `autopix-worker`:
   - Build command: `npm run build`
   - Start command: `npm run start:worker`
   - No domain.
4. Variables (both services; use *Shared Variables* where convenient):

   ```
   NODE_ENV=production
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   APP_URL=https://<autopix-web domain>
   API_URL=https://<autopix-web domain>
   SESSION_SECRET=<48+ random chars>
   ACTIVATION_TOKEN_SECRET=<48+ random chars>
   PASSWORD_RESET_SECRET=<48+ random chars>
   PAYMENT_PROVIDER=mercadopago            # or asaas
   PAYMENT_ACCESS_TOKEN=<provider token>
   PAYMENT_WEBHOOK_SECRET=<provider webhook secret>
   DEMO_MODE=false
   EMAIL_PROVIDER=resend
   EMAIL_API_KEY=<resend key>
   EMAIL_FROM=TemPix <nao-responda@seu-dominio.com.br>
   ```

   Worker extras (optional real sources): `SEARCH_PROVIDER=brave`, `SEARCH_API_KEY=…`,
   `NEWS_SOURCE_ENABLED=true`, `PUBLIC_BUSINESS_SOURCE_ENABLED=true`.
5. Configure the provider webhook to `https://<domain>/api/webhooks/payment/<provider>`.
6. Deploy. `npm run db:seed` (Railway shell) creates the agent rows; the API also ensures them
   at boot.

**Single-service variant:** skip the worker service and set `EMBEDDED_WORKER=true` on
`autopix-web`.

**Note on demos in production:** the mock provider is refused when `NODE_ENV=production`. For a
public demo deployment, use a provider sandbox (e.g. `PAYMENT_API_URL=https://api-sandbox.asaas.com/v3`)
with `DEMO_MODE=true`.

---

## Security

- **Passwords:** Argon2id (19 MiB, t=2). Never generated, logged, e-mailed or stored in plaintext.
- **Sessions:** 256-bit random token in an `HttpOnly`, `SameSite=Lax`, `Secure` (prod) cookie;
  only an HMAC-SHA256 hash is stored; 7-day sliding expiration; logout revokes server-side;
  password reset/change revokes other sessions. Onboarding sessions have a restricted scope.
- **Tokens:** activation (48 h) and reset (1 h) tokens are random, HMAC-hashed at rest,
  one-time (atomic `UPDATE … WHERE usedAt IS NULL`), and invalidate their siblings.
- **CSRF:** SameSite cookies + mandatory `X-Requested-With: autopix` on state-changing requests
  (forces a CORS preflight) + Origin allow-list. Webhooks are exempt and signature-verified.
- **Headers:** Helmet with a strict CSP (`script-src 'self'`, `frame-ancestors 'none'`), HSTS in
  production; CORS limited to `APP_URL`.
- **Rate limiting:** global API, login (10/15 min), sensitive token endpoints, onboarding,
  payments.
- **Validation:** Zod on every input; Prisma parameterized queries (raw SQL uses tagged templates).
- **Authorization:** every query is scoped to the session's `companyId`; role guards for
  company edits and subscription cancellation.
- **Payments:** signature verification, status re-fetch from the provider, idempotent event
  table, row lock, single transaction, safe metadata only.
- **Errors:** generic messages; no stack traces to clients; logger redacts secret-like keys.
- **Outbound fetches:** SSRF guard (DNS resolve + private-range block), timeouts, size caps.
- **Data ethics:** only public business contact data; role mailboxes only.

---

## Tests

```bash
npm test
```

- `packages/shared` — formatters, CNPJ, schemas.
- `packages/core` — signal detection, scoring, sources (demo isolation, SSRF), BR Code CRC,
  Mock/Mercado Pago/Asaas signature verification, production config guards, tokens.
- `apps/api` (PostgreSQL required) — login, logout, password hashing, session expiry,
  activation token (hashing, reuse, expiry, siblings), forgot/reset password, authorization
  (anonymous, onboarding scope, cross-company isolation, CSRF), company update + search
  re-queue, opportunity list/detail/update, activity events, dashboard metrics, SSE over
  LISTEN/NOTIFY, Pix charge creation, webhook signature validation, idempotency (duplicate
  and concurrent deliveries), subscription activation, cancellation, job claiming, agent run
  creation, DEMO isolation.
- `apps/api/test/platform.test.js` — the two end-to-end acceptance scenarios
  (WhatsApp link → opportunity → notification → ABORDAR → state/activity on the
  dashboard; “gere Pix de 1400” → confirm → charge → reply → provider webhook →
  PAYMENT_RECEIVED on the dashboard), unverified numbers and bad signatures,
  step-up release/bank details, ActionEngine validation/audit, Bearer clients,
  notification preferences, freight/workforce commands.
- `packages/core/test/whatsapp.unit.test.js` — intent parser, LLM output
  validation, Cloud API signature/handshake/payloads, templates, phone variants.

The API suite uses `TEST_DATABASE_URL`, or `DATABASE_URL` with the database name suffixed
`_test`. It refuses to run against a database whose name does not contain `test`, applies
migrations with `prisma migrate deploy` and truncates tables between tests. Without a
database the DB suites are skipped with a warning.

---

## Project structure

```
.
├── .railway/railway.ts          # Railway IaC (Postgres + web + worker)
├── apps/
│   ├── api/                     # Express app, routes, middleware, SSE hub, tests
│   ├── worker/                  # background worker entrypoint
│   └── web/                     # React + Vite SPA
│       └── src/
│           ├── components/      # cards, activity, radar (Three.js)
│           ├── pages/           # landing, onboarding, checkout, auth, app/*
│           └── lib/             # toasts, actions client, time formatters, demo feed
├── packages/
│   ├── shared/                  # constants, formatters, Zod schemas
│   ├── ui/                      # @autopix/ui: shared template (components, brand, auth shell,
│   │                            # api client, session, hooks, PWA, design tokens + global CSS)
│   └── core/                    # config, db, security, services, payments, engine,
│                                # actions (ActionEngine), events (EventEngine),
│                                # whatsapp, notifications, domains (freight, workforce)
├── prisma/                      # schema, migrations, seed
├── docs/                        # architecture & operations notes
├── .env.example
└── package.json                 # npm workspaces
```

---

## Platform layer: ActionEngine, events, WhatsApp, PWA

TemPix is **one platform with multiple clients** — web/PWA, WhatsApp and
(future) native apps all use the same business layer in `packages/core`.
Full description: [`docs/PLATFORM.md`](docs/PLATFORM.md); endpoints:
[`docs/API.md`](docs/API.md).

- **ActionEngine** — every business mutation (`POST /api/actions/:name`) runs
  authentication → authorization → validation → business rules → step-up for
  sensitive actions → audit (`ActionLog`) → execution → domain events.
- **EventEngine** — stored `DomainEvent`s drive the dashboard feed and the
  notification channels (WhatsApp, Web Push, e-mail) with per-user
  `NotificationPreference`s and idempotent deliveries.
- **WhatsApp Business Platform (Cloud API)** — number linking by inbound code,
  decision buttons (ANALISAR, ABORDAR, DESCARTAR, TENHO INTERESSE, VER ROTA,
  CONVIDAR, RECUSAR, ABRIR AUTOPIX) and pt-BR commands (“gere um Pix de 1400”,
  “procura carga de Santos para São Paulo amanhã”, “preciso de 3 soldadores
  segunda”, …) — always through the ActionEngine, with confirmation.
- **Step-up authentication** — `RELEASE_PAYMENT`, `REFUND_PAYMENT`,
  `CHANGE_BANK_DETAILS`, `RESOLVE_DISPUTE`, `UPDATE_COMMISSION_RULE` require a `SensitiveActionChallenge` confirmed with the
  password in an authenticated web/PWA session. A WhatsApp number alone never
  authorizes them.
- **TemPix Pay charges** — created from web or WhatsApp (“gere um Pix de
  1400” creates a SERVICE transaction); protection only when the provider
  supports it.
- **Freight & workforce** — routes/demands and matches with deep links
  (`/app/freight/matches/:id`, `/app/workforce/matches/:id`).
- **PWA** — installable (`manifest.webmanifest`, standalone, `start_url=/app`),
  versioned service worker that never caches `/api`, offline shell, install
  and update prompts, Web Push with deep-link clicks, mobile tab bar, back
  headers and native-style transitions.
- **Native-ready auth** — `POST /api/auth/native/login` + `Authorization: Bearer`.

### Configure WhatsApp (Meta)

1. Create a Meta app with the WhatsApp product; get a permanent access token,
   the phone number id and the app secret.
2. Set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`,
   `WHATSAPP_VERIFY_TOKEN` (any random string), `WHATSAPP_BUSINESS_NUMBER`.
3. Webhook URL: `https://<domain>/api/webhooks/whatsapp`, verify token =
   `WHATSAPP_VERIFY_TOKEN`, subscribe to `messages`.
4. Approve an **Authentication** template with a copy-code OTP button and five-minute
   expiry, then set `WHATSAPP_TEMPLATE_AUTH` to its name. Login and sensitive-action
   codes always use this template, including outside Meta's customer-service window.
5. (Recommended) Approve templates for business-initiated notifications and set
   `WHATSAPP_TEMPLATE_OPPORTUNITY|PAYMENT|FREIGHT|WORKFORCE` (quick-reply buttons
   in the order shown above).

Without credentials the provider is `disabled` in production (nothing is sent)
and `mock` in development/test.

### Configure Web Push

`npx web-push generate-vapid-keys` → `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`,
`WEB_PUSH_SUBJECT`. Users enable push per device in *Configurações*.

## Known limitations

- Pix is one-off per 30-day period; **Pix Automático** needs the provider’s recurring API — the
  `PaymentProvider` subscription methods and `Subscription.providerSubscriptionId` are in place
  for that migration.
- Real discovery depends on configured sources (search API key, news RSS, registry). Signal
  detection and scoring are deterministic rules, not ML; company extraction from news
  headlines is heuristic.
- Transactional e-mail ships with a Resend transport; without it, production cannot deliver
  activation/reset e-mails (the paying browser still receives its activation link directly).
- Single plan, single user per company (the schema supports more users/roles).
- Rate limiting is in-memory per instance (use a shared store if you run many API replicas).
- `npm audit` reports advisories in dev-only tooling (vitest mocker, Prisma CLI config).
- Freight and workforce have no real marketplace source yet: outside DEMO mode,
  requests and demands are stored and no matches are invented. Plug sources into
  `FreightService`/`WorkforceService` (`find(request)` contract).
- Money movement after payment (split, payout, protected release) is not
  implemented for any real provider yet: it requires the partner's contracted
  product (e.g. a BB split/payout contract). Until then the seller payable is
  flagged `PENDING_PROVIDER_CAPABILITY`. The former Asaas `/transfers` release
  was removed because it would make an TemPix account an unofficial escrow.
- BB API/OAuth default URLs and scopes follow public documentation and must be
  confirmed against the real BB application before go-live.
- The LLM intent parser is a boundary (`LlmIntentParser({ generate })`) and is
  not wired to a model by default; the deterministic pt-BR parser is used.
- WhatsApp notifications outside the 24-hour window require Meta-approved
  templates. iOS Web Push requires the PWA to be installed (iOS 16.4+).
- Step-up uses the account password; PIN/passkey/OTP mechanisms are modelled
  (`SensitiveActionChallenge.mechanism`) but not implemented.


## Social

`/app/social` is the feed of completed services. After the buyer confirms delivery,
either participant can opt in to publish an opinion and one photo, including later
from the contract history. Comments, replies and reposts are authenticated. The
backend verifies payment and delivery, ownership and disputes. One publication
per person/contract; one repost per person/original. Feed payloads never include
contract amounts, email, documents, locations or private descriptions. Demo and
sandbox posts are separated from real deliveries and explicitly labeled.
Photos are resized/re-encoded by the browser to JPEG (no EXIF), capped at 450 KB,
stored durably in Postgres and served from authenticated image routes.
