# AutoPix — HTTP API

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
POST /api/actions/CREATE_PIX            { "input": { "amountCents": 140000, "description": "Montagem" } }
POST /api/actions/RELEASE_PAYMENT       { "input": { "id": "pay_…" } }   → 202 challenge
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

Compatibility routes (delegate to the ActionEngine): `PATCH /opportunities/:id`,
`PUT /company`, `POST /agents/run`, `POST /agents/pause`, `POST /subscription/cancel|resume`,
`POST /payments/pix`.

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
| POST | `/webhooks/payment/:provider` (mercadopago, asaas; mock in dev) |
| GET | `/webhooks/whatsapp` — Meta verification (`hub.verify_token`) |
| POST | `/webhooks/whatsapp` — `X-Hub-Signature-256` |
