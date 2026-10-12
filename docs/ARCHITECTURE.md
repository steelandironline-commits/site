# AutoPix — Architecture

## Processes

| Process | Entry | Responsibility |
|---------|-------|----------------|
| web/API | `apps/api/src/server.js` | REST API, SSE, payment webhooks, serves `apps/web/dist`. Never runs searches inside requests. |
| worker | `apps/worker/src/index.js` | Scheduler tick (60 s) + job consumer (3 s poll, concurrency 2). |
| PostgreSQL | — | Source of truth, job queue (`SearchJob`), realtime fan-out (`LISTEN/NOTIFY`). |

## Request lifecycle (API)

```
helmet → cors(/api) → /api/webhooks (raw body) → json(100kb) → cookies → rate limit
→ CSRF guard → loadSession → no-store → routes → errorHandler (safe messages)
```

## Account state machine

```
User:          PENDING_PAYMENT ──payment confirmed──▶ PENDING_ACTIVATION ──password set──▶ ACTIVE
Subscription:  PENDING ──payment──▶ ACTIVE ──period end──▶ PAST_DUE | CANCELED (if scheduled)
Payment:       PENDING ──▶ CONFIRMED | FAILED | EXPIRED | CANCELED ; CONFIRMED ──▶ REFUNDED
Session scope: ONBOARDING (onboarding + checkout only) ──activation──▶ FULL
```

## Payment confirmation transaction

1. `PaymentEvent` insert with `ON CONFLICT DO NOTHING` on `(provider, providerEventId)` → duplicate ⇒ stop.
2. `SELECT … FROM "Payment" … FOR UPDATE` → concurrent deliveries serialize.
3. If already `CONFIRMED` ⇒ mark event processed, stop (never activates twice).
4. Payment `CONFIRMED`, subscription `ACTIVE` (period extended from the later of now/current end).
5. Owner without password ⇒ `PENDING_ACTIVATION` + one-time activation token.
6. First `SearchJob` (trigger `PAYMENT`) + activity events.
7. Commit; then the activation e-mail is sent.

## Engine

```
SearchJob ─▶ AgentOrchestrator.runJob
   RADAR     OpportunityDiscoveryService  (adapters.discover)      AgentRun
   RESEARCH  CompanyResearchService       (adapters.research)      AgentRun
   SIGNAL    SignalDetectionService                                AgentRun
   SCORING   OpportunityScoringService    (threshold)              AgentRun
   SALES     SalesIntelligenceService  → Opportunity (+sources, contacts, signals) in one tx
every step ─▶ ActivityService.record → INSERT + pg_notify
```

Adapters are selected by `buildSourceAdapters(config)`: demo-only when `DEMO_MODE=true`,
real-only otherwise.

## Realtime

`ActivityService.record` → `pg_notify('autopix_activity', {id, companyId})` →
`ActivityHub` (API, dedicated `pg` client `LISTEN`) → loads the event → writes `event: activity`
to SSE clients of that company. Fallbacks: hub polling, client polling.

## Frontend

- Routes are lazy-loaded; Three.js (`three` chunk) loads only with the radar.
- `SessionProvider` bootstraps from `GET /api/session` + `GET /api/config`.
- `AppLayout` owns the single SSE connection and shares it through the router outlet context.
- Motion: Framer Motion with `MotionConfig reducedMotion="user"`; CSS respects
  `prefers-reduced-motion`; the radar switches to `frameloop="demand"` and stops when off-screen.
