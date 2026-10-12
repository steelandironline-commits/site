# AutoPix — Operations

## Health

`GET /api/health` → `{ status, db, realtime }` (`realtime` is `listen` or `poll`). Used as the
Railway healthcheck.

## Logs

JSON lines on stdout/stderr. Keys matching password/token/secret/cookie/pix codes are redacted.
Useful messages: `job started`, `job completed`, `job failed`, `scheduler tick`,
`payment webhook processed`, `pix charge creation failed`.

## Common tasks

| Task | How |
|------|-----|
| Apply migrations | `npm run db:migrate` (runs automatically as Railway pre-deploy). |
| Force a search for a company | User clicks *Buscar agora*, or insert a `SearchJob` row with `status='QUEUED'`. |
| Re-send activation | The paying browser can claim a new token on `/checkout`; otherwise the user uses `/forgot-password` after activation, or issue a token via `AuthService.issueActivationToken` from a Railway shell. |
| Webhook replay | Providers retry automatically; replays are idempotent. |
| Stuck job | Jobs `RUNNING` for more than 15 min are re-queued by the scheduler. |
| Scale workers | Add replicas of `autopix-worker`; jobs are claimed with `SKIP LOCKED`. |
| Grant platform admin | `UPDATE "User" SET "isPlatformAdmin" = true WHERE email = '…'` from a Railway shell (no API for it, by design). |
| Financial divergences | `/app/admin` → Reconciliação. Acknowledge/resolve with a note (audited). Money is never adjusted from the admin screens. |
| Register BB webhook | `npm run bb:register-webhook` on the web service shell. |
| Audit trail | `FinancialAuditLog` is append-only (trigger rejects UPDATE/DELETE). |

## Switching providers

Banco do Brasil: see [`AUTOPIX_PAY.md`](AUTOPIX_PAY.md#railway-variables).

Set `PAYMENT_PROVIDER` (`mercadopago` | `asaas`), `PAYMENT_ACCESS_TOKEN`,
`PAYMENT_WEBHOOK_SECRET` and configure the webhook URL
`https://<domain>/api/webhooks/payment/<provider>`. Only the configured provider's webhook route
is accepted.

## Enabling real sources (DEMO_MODE=false)

- `SEARCH_PROVIDER=brave` + `SEARCH_API_KEY` — web search discovery.
- `NEWS_SOURCE_ENABLED=true` — Google News RSS discovery.
- `PUBLIC_BUSINESS_SOURCE_ENABLED=true` — BrasilAPI CNPJ enrichment.
- Website research is always on (SSRF-guarded).
