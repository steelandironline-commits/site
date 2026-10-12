# TemPix — HTTP API

Base: `/api`. JSON. Errors: `{ "error": { "code", "message", "fields?" } }` (messages in pt-BR, no stack traces).

**Auth.** Browser: HTTP-only `ap_session` cookie + header `X-Requested-With: autopix`
on state-changing requests. Native/other clients: `Authorization: Bearer <token>`
from `POST /auth/native/login` (no CSRF header needed).

## Session & auth
| Method | Path | Notes |
|---|---|---|
| GET | `/session` | `{ session \| null }` — never 401 (SPA bootstrap) |
| GET | `/me` | current session; 401 when anonymous |
| POST | `/auth/login` | `{ email, password }` → cookie |
| POST | `/auth/native/login` | `{ email, password }` → `{ token, tokenType, expiresAt, user }` |
| POST | `/auth/logout` | revokes cookie or bearer session |
| GET/POST | `/auth/activate/:token`, `/auth/activate` | one-time activation |
| POST | `/auth/forgot-password`, `/auth/reset-password` | GET `/auth/reset-password/:token` inspects |
| PUT | `/me/password` | `{ currentPassword, newPassword }` |
| GET/DELETE | `/me/sessions` | list / revoke others |

## Actions (all business mutations)
| Method | Path | Notes |
|---|---|---|
| GET | `/actions` | catalog `{ name, description, kind, channels, sensitive, input }` |
| POST | `/actions/:name` | body `{ input }` → 200 `{ status: "SUCCEEDED", action, result }` or 202 `{ status: "CONFIRMATION_REQUIRED", challenge: { id, expiresAt, summary, confirmPath } }` |
| GET | `/challenges/:id` | challenge status |
| POST | `/challenges/:id/confirm` | `{ password }` — FULL session required; executes the action |
| POST | `/challenges/:id/cancel` | |

Examples:
```http
POST /api/actions/CONTACT_OPPORTUNITY   { "input": { "id": "opp_…" } }
POST /api/actions/CREATE_TRANSACTION    { "input": { "grossCents": 140000, "description": "Montagem", "buyerEmail": "cliente@x.com" } }
POST /api/actions/CREATE_TRANSACTION    { "input": { "referenceType": "freightMatch", "referenceId": "fm_…" } }   (amount from the freight)
POST /api/actions/CREATE_TRANSACTION_PIX { "input": { "id": "tx_…" } }
POST /api/actions/CREATE_PIX            { "input": { "amountCents": 140000, "description": "Montagem" } }   (SERVICE transaction + Pix)
POST /api/actions/RELEASE_PAYMENT       { "input": { "id": "tx_…" } }   → 202 challenge (web/app only)
POST /api/actions/REFUND_PAYMENT        { "input": { "id": "tx_…", "amountCents": 40000 } }   → 202 challenge
POST /api/actions/RECORD_LOCATION       { "input": { "matchId": "fm_…", "latitude": -22.9, "longitude": -47.06, "accuracyM": 20 } }
```

## Read endpoints
| Method | Path |
|---|---|
| GET | `/dashboard` — metrics, pipeline, flow |
| GET | `/opportunities?status&priority&q&sort&page&pageSize`, `/opportunities/:id` |
| GET | `/activity?type&q&before&limit`, `/activity/stream` (SSE, `Last-Event-ID`) |
| GET | `/events?limit&before` — domain events |
| GET | `/agents`, `/agents/runs?agent&limit` |
| GET | `/company` |
| GET | `/payments?kind=CHARGE\|SUBSCRIPTION`, `/payments/:id` |
| GET | `/subscription` |
| GET | `/freight`, `/freight/matches/:id` |
| GET | `/workforce`, `/workforce/matches/:id` |
| GET | `/config`, `/health` |
| GET | `/pay/capabilities` — provider capabilities + reasons, protected-payment status |
| GET | `/pay/summary` — RECEBIDO, A LIBERAR, EM PROCESSAMENTO, COMISSÕES |
| GET | `/pay/transactions?view=all\|charges\|payments\|receivable\|toRelease\|commissions\|history`, `/pay/transactions/:id` (role, allowedActions, timeline, trip) |
| GET | `/pay/commission/quote?grossCents&type` |
| GET | `/pay/trips/:matchId` (carrier only) |

Platform admin only (`User.isPlatformAdmin`, 403 otherwise; read-only):
`/admin/overview`, `/admin/payments`, `/admin/transactions`,
`/admin/provider-events`, `/admin/failed-webhooks`, `/admin/reconciliation`,
`/admin/refunds`, `/admin/disputes` (+ `POST /admin/disputes/:id/summary|review`),
`/admin/payout-failures`, `/admin/commission-rules`, `/admin/audit`.

Compatibility routes (delegate to the ActionEngine): `PATCH /opportunities/:id`,
`PUT /company`, `POST /agents/run`, `POST /agents/pause`, `POST /subscription/cancel|resume`,
`POST /payments/pix` (body `{ transactionId? }` — amount is always computed on the server).

## WhatsApp & notifications
| Method | Path | Notes |
|---|---|---|
| GET | `/whatsapp` | connection (masked), provider availability |
| POST | `/whatsapp/connection` | `{ phoneNumber }` → verification code + wa.me link |
| DELETE | `/whatsapp/connection` | unlink |
| GET | `/whatsapp/messages` | recent message log (metadata only) |
| GET/PUT | `/notifications/preferences` | matrix channel × category; PUT `{ changes: [{ channel, category, enabled }] }` |
| GET | `/notifications/push/public-key` | VAPID key or null |
| POST/DELETE | `/notifications/push/subscriptions` | Web Push subscription |

## Webhooks (public, signature-verified)
| Method | Path |
|---|---|
| POST | `/webhooks/payment/:provider` (mercadopago, asaas, banco-do-brasil; mock in dev) |
| POST | `/webhooks/payment/banco-do-brasil/pix?token=…` — BACEN suffix; token + charge re-fetch |
| GET | `/webhooks/whatsapp` — Meta verification (`hub.verify_token`) |
| POST | `/webhooks/whatsapp` — `X-Hub-Signature-256` |
