# AutoPix — One platform, multiple clients

```
             ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  ┌─────────────┐
 Clients     │ Web / PWA    │  │ WhatsApp     │  │ Android / iOS      │  │ Worker      │
             │ (React)      │  │ Cloud API    │  │ (future, Bearer)   │  │ (agents)    │
             └──────┬───────┘  └──────┬───────┘  └─────────┬─────────┘  └──────┬──────┘
                    │ REST + SSE      │ signed webhook      │ REST              │
             ┌──────▼─────────────────▼─────────────────────▼───────────────────▼──────┐
 API layer   │ Express: auth (cookie | Bearer), CSRF, rate limit, Zod, /api/actions…   │
             └──────────────────────────────┬───────────────────────────────────────────┘
             ┌──────────────────────────────▼───────────────────────────────────────────┐
 Business    │ ActionEngine ── authn → authz → validation → rules → step-up → audit     │
 logic       │   └─ domain services: opportunities, payments, freight, workforce, …     │
 (packages/  │ EventEngine ── DomainEvent (stored) → handlers (NotificationRouter)      │
  core)      │   └─ channels: in-app activity · WhatsApp · Web Push · e-mail           │
             └──────────────────────────────┬───────────────────────────────────────────┘
                                     PostgreSQL (state, queue, events, LISTEN/NOTIFY)
```

No client contains business rules. The web app, WhatsApp and any future
native app call the same `ActionEngine` through the same API.

## ActionEngine (`packages/core/src/actions`)

`actions.execute({ action, input, channel, actor, challengeId })`:

1. **Authentication** — WEB/API: live session (cookie or Bearer), FULL scope
   (onboarding scope only where the action allows it). WHATSAPP: a VERIFIED
   `WhatsAppConnection` owned by the user. SYSTEM: internal only.
2. **Authorization** — role (`OWNER`/`ADMIN`/`MEMBER`) and channel allow-list
   per action; every domain query is scoped to the user's company.
3. **Validation** — Zod schema per action.
4. **Business rules** — global (active subscription where required) and in
   the domain services.
5. **Step-up** — `sensitive` actions return `CONFIRMATION_REQUIRED` with a
   `SensitiveActionChallenge`; they execute only after the challenge is
   confirmed in an authenticated web session with the account password
   (`/app/confirm/:id`). WhatsApp can never complete them.
6. **Audit** — every attempt is written to `ActionLog` (redacted input,
   status `SUCCEEDED | FAILED | REJECTED | CONFIRMATION_REQUIRED`, channel,
   duration).
7. **Execution + events** — handlers delegate to domain services, which
   publish domain events.

Registered actions: `ANALYZE_OPPORTUNITY`, `CONTACT_OPPORTUNITY`,
`ARCHIVE_OPPORTUNITY`, `MARK_OPPORTUNITY_INTERESTED`, `SET_OPPORTUNITY_STATUS`,
`UPDATE_OPPORTUNITY_NOTES`, `GENERATE_APPROACH`, `LIST_TODAY_OPPORTUNITIES`,
`GET_OPEN_PIPELINE_VALUE`, `CREATE_FREIGHT_REQUEST`, `ACCEPT_FREIGHT_MATCH`,
`REJECT_FREIGHT_MATCH`, `MARK_DRIVER_ARRIVED`, `COMPLETE_FREIGHT`,
`CREATE_WORKFORCE_DEMAND`, `INVITE_PROFESSIONAL`, `REJECT_PROFESSIONAL`,
`COMPLETE_WORKFORCE_SERVICE`, `CREATE_SUBSCRIPTION_PIX`, `CREATE_PIX`,
`CREATE_TRANSACTION`, `CREATE_TRANSACTION_PIX`, `START_SERVICE`,
`REPORT_COMPLETION`, `REQUEST_RELEASE`, `CONFIRM_COMPLETION`,
`RELEASE_PAYMENT`*, `REFUND_PAYMENT`*, `OPEN_DISPUTE`, `RESPOND_DISPUTE`,
`RESOLVE_DISPUTE`* (platform admin), `CANCEL_TRANSACTION`,
`CONSENT_TRIP_TRACKING`, `REVOKE_TRIP_TRACKING`, `START_TRIP`,
`MARK_CARGO_LOADED`, `RECORD_LOCATION`, `CONFIRM_DELIVERY`,
`UPDATE_COMMISSION_RULE`* (platform admin), `RESOLVE_RECONCILIATION_ISSUE`
(platform admin), `GET_TRANSACTION`, `CHANGE_BANK_DETAILS`*, `START_AGENT`, `PAUSE_AGENT`,
`UPDATE_COMPANY_PROFILE`, `CANCEL_SUBSCRIPTION`, `RESUME_SUBSCRIPTION`
(\* sensitive). `GET /api/actions` returns the live catalog.

## EventEngine (`packages/core/src/events`)

`events.publish({ type, companyId, aggregateType, aggregateId, payload, activity }, tx)`
stores a `DomainEvent` **in the caller's transaction** and, optionally, the
dashboard `ActivityEvent` (which reaches browsers through SSE immediately).
Handlers run asynchronously: the API "kicks" dispatch after each request and
the worker polls every 2 s; claiming uses `FOR UPDATE SKIP LOCKED`, retries up
to 5 times. `NotificationRouter` fans out to WhatsApp / Web Push / e-mail per
`NotificationPreference`; `NotificationDelivery (event, user, channel)` is
unique, so retries never double-send.

Event types: `OPPORTUNITY_CREATED`, `OPPORTUNITY_HIGH_PRIORITY`,
`FREIGHT_MATCH_CREATED`, `RETURN_LOAD_FOUND`, `WORKFORCE_MATCH_CREATED`,
`PAYMENT_CREATED`, `PAYMENT_RECEIVED`, `PAYMENT_PROTECTED`, `DRIVER_ARRIVED`,
`SERVICE_COMPLETED`, `PAYMENT_RELEASE_REQUESTED`, `PAYMENT_RELEASED`,
`PAYMENT_REFUNDED`, `PAYMENT_DISPUTED`, `AGENT_ERROR` and internal
(silent) ones (`*_UPDATED`, `AGENTS_PAUSED`, …). See `packages/shared/src/platform.js`.

## WhatsApp (`packages/core/src/whatsapp`)

- `WhatsAppProvider` — `sendText`, `sendInteractiveMessage`, `sendTemplate`,
  `sendPaymentNotification`, `sendOpportunityNotification`,
  `sendFreightMatchNotification`, `sendWorkforceMatchNotification`,
  `handleWebhook`. Implementations: `CloudApiWhatsAppProvider` (official
  WhatsApp Business Platform Cloud API, `X-Hub-Signature-256`),
  `MockWhatsAppProvider` (dev/test), `DisabledWhatsAppProvider` (no credentials).
  No browser automation, no unofficial libraries.
- **Linking** — the signed-in user registers a number and receives a 6-digit
  code (hashed at rest, 15 min, 5 attempts). Ownership is proven when a
  message containing the code arrives **from that number** via the signed
  webhook. Brazilian numbers match with or without the extra 9.
- **Decisions** — interactive buttons carry `ap1:<DECISION>:<kind>:<id>`;
  the inbound service maps them (`WHATSAPP_DECISIONS`) to ActionEngine actions:
  ANALISAR, ABORDAR, DESCARTAR, TENHO INTERESSE, CONVIDAR, RECUSAR; VER ROTA
  and ABRIR AUTOPIX only reply with deep links.
- **Commands** — `WhatsAppCommandService`: intent parsing (deterministic
  pt-BR `RuleBasedIntentParser`; optional `LlmIntentParser` boundary whose
  output is schema-validated and can only *propose* intents) → parameter
  validation → confirmation (buttons or “sim”) for state changes →
  ActionEngine. Pix replies include amount, reference, copia-e-cola and the
  `/app/payments/:id` link — never credentials.
- **Business-initiated messages** outside the 24-hour window require approved
  templates (`WHATSAPP_TEMPLATE_*`); without them notifications use
  interactive messages, which Meta only delivers inside an open window.

## Payments

Two kinds share one `PaymentProvider` abstraction:

- `SUBSCRIPTION` — the AutoPix plan (activates the account).
- `CHARGE` — AutoPix Pay charges, always linked to a `MarketplaceTransaction`
  (server-side amount). Everything after payment — protection, release,
  refunds, disputes, trips, reconciliation — is described in
  [`AUTOPIX_PAY.md`](AUTOPIX_PAY.md). Release and refunds are sensitive actions
  and never run from WhatsApp.

## Deep links

`/app/opportunities/:id`, `/app/freight/matches/:id`, `/app/workforce/matches/:id`,
`/app/payments/:id`, `/app/pay/transactions/:id`, `/app/confirm/:challengeId`. Links contain only object
ids; access always requires the user's session. Unauthenticated visits keep
the destination through `/login?next=…`.

## PWA

`manifest.webmanifest` (standalone, `start_url=/app`, maskable icons,
shortcuts), `sw.js` generated at build (versioned precache of hashed assets).
Policy: `/api/*` network-only — private responses are never cached; hashed
assets cache-first; navigations network-first with the public app shell as
offline fallback; caches are dropped on logout. Install prompt
(`beforeinstallprompt`, iOS instructions), update prompt, Web Push
(`push`/`notificationclick` open deep links).

## Native-app readiness

- `POST /api/auth/native/login` returns a Bearer session token (same session
  table, revocable, sliding expiry); `Authorization: Bearer` works on every
  endpoint and is exempt from CSRF (no ambient credentials).
- Everything a screen needs is a documented REST call (see `docs/API.md`);
  mutations are `POST /api/actions/:name`.
- Push is behind `PushService.sendToUser` — FCM/APNs providers can be added
  next to Web Push without touching domain code.
