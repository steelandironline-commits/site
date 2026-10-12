# AutoPix

**Procuramos vendas e serviços pra você.**
*Sua empresa trabalha. O AutoPix procura oportunidades.*

AutoPix is a Brazilian autonomous commercial-opportunity discovery platform. A business
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
- [Payments (Pix)](#payments-pix)
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
| Checkout (`/checkout`) | Mobile-first Pix page: QR code, *copia e cola* with COPIAR PIX, expiry countdown, status polling (pauses in background tabs) + provider reconciliation, PAGAMENTO CONFIRMADO → “Ativando seu AutoPix…” → `/activate/:token`. |
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
```

Renewals: one-off Pix charges cover 30 days. From 5 days before the end, *Assinatura → Renovar
com Pix* creates a new charge that extends the period. Expired subscriptions become `PAST_DUE`
(or `CANCELED` if cancellation was scheduled) and agents pause.

---

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
   EMAIL_FROM=AutoPix <nao-responda@seu-dominio.com.br>
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
│           ├── components/      # brand, ui, cards, activity, radar (Three.js)
│           ├── pages/           # landing, onboarding, checkout, auth, app/*
│           ├── lib/             # api client, session, hooks, SSE stream, toasts
│           └── styles/          # design tokens + global CSS
├── packages/
│   ├── shared/                  # constants, formatters, Zod schemas
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

AutoPix is **one platform with multiple clients** — web/PWA, WhatsApp and
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
  `CHANGE_BANK_DETAILS` require a `SensitiveActionChallenge` confirmed with the
  password in an authenticated web/PWA session. A WhatsApp number alone never
  authorizes them.
- **Protected Pix charges** — created from web or WhatsApp; funds are held
  until a step-up-confirmed release.
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
4. (Recommended) Approve templates for business-initiated notifications and set
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
- Fund release is implemented for Asaas (`/transfers`) and the mock provider;
  the Mercado Pago adapter reports it as unsupported.
- The LLM intent parser is a boundary (`LlmIntentParser({ generate })`) and is
  not wired to a model by default; the deterministic pt-BR parser is used.
- WhatsApp notifications outside the 24-hour window require Meta-approved
  templates. iOS Web Push requires the PWA to be installed (iOS 16.4+).
- Step-up uses the account password; PIN/passkey/OTP mechanisms are modelled
  (`SensitiveActionChallenge.mechanism`) but not implemented.
