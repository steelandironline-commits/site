# TemPix Pay — financial layer & Banco do Brasil

> TemPix controls the experience. The financial partner (Banco do Brasil)
> controls the money.

TemPix never holds customer money in an ordinary company account, never
fakes split, payout, protected payment or provider confirmations, and never
lets a browser, a WhatsApp button, a GPS event or an LLM move money.

## Components

| Piece | File | Responsibility |
|---|---|---|
| `PaymentProvider` | `packages/core/src/payments/PaymentProvider.js` | Contract + `getCapabilities()`; unsupported operations throw `PROVIDER_CAPABILITY_NOT_AVAILABLE` / `SPLIT_NOT_SUPPORTED` / `PAYOUT_NOT_SUPPORTED`. |
| `BancoDoBrasilPaymentProvider` | `packages/core/src/payments/providers/banco-do-brasil.provider.js` (re-exported at `apps/api/src/payments/providers/`) | BACEN Pix API: `PUT/GET/PATCH /cob/{txid}`, `PUT/GET /pix/{e2eid}/devolucao/{id}`, `PUT /webhook/{chave}`. |
| `BancoDoBrasilAuthService` | `…/banco-do-brasil.auth.js` | OAuth2 `client_credentials` (Basic auth); token cached in memory, refreshed 60 s before expiry, single-flight; never logged. |
| Errors / retries | `packages/core/src/payments/errors.js` | `FinancialError` codes with safe pt-BR messages; `withRetry` (exponential backoff) used only for idempotent calls. |
| `PaymentService` | `services/paymentService.js` | Charges (server-side amount), idempotent webhook processing, amount verification. |
| `MarketplaceTransactionService` | `finance/MarketplaceTransactionService.js` | Deals (SALES, FREIGHT, WORKFORCE, SERVICE), commission snapshot, lifecycle, timeline, reads. |
| `CommissionService` | `finance/CommissionService.js` | Contracts: value tiers from `COMMISSION_TIERS` (5% → 2%). Subscriptions: `CommissionRule` (most specific rule wins; min/max; round half-up). |
| `ProtectedPaymentService` | `finance/ProtectedPaymentService.js` | "Pagamento protegido" — active only with provider `protectedFlow` **and** `payout` or `split`. |
| `RefundService` | `finance/RefundService.js` | Full/partial refunds; COMPLETED only after provider confirmation. |
| `DisputeService` | `finance/DisputeService.js` | Freeze, both sides' statements, deterministic evidence summary, human admin decision. |
| `TripService` | `finance/TripService.js` | Consent-gated freight tracking, geofences (300 m arrival, 5 km near). Never releases money. |
| `ReconciliationService` | `finance/ReconciliationService.js` | Worker loop: missed webhooks, divergences, refunds in flight, payout failures. |
| `FinancialAuditService` | `finance/FinancialAuditService.js` | Append-only `FinancialAuditLog` (DB trigger blocks UPDATE/DELETE), hashed IPs. |
| `AdminService` | `finance/AdminService.js` | Restricted back office; read + audited annotations only. |

## Capability discovery

`GET /api/pay/capabilities` →

```json
{ "provider": "banco_do_brasil", "label": "Banco do Brasil", "sandbox": true,
  "capabilities": { "pix": true, "pixWebhook": true, "paymentStatus": true, "refund": true, "partialRefund": true,
                    "split": false, "payout": false, "bbPayRedirect": false, "recurringPix": false, "protectedFlow": false },
  "reasons": { "protectedFlow": "Pagamento protegido habilitado por configuração, mas a integração com o contrato BB correspondente ainda não foi implementada." },
  "protectedPayment": { "enabled": false, "mechanism": null, "reason": "…" } }
```

The UI renders only what is `true`. `BB_*_ENABLED` flags document what is
contracted; they do **not** turn a capability on until its integration exists.

## Flows

### Standard Pix (works with BB today)

```
CREATE_TRANSACTION (amount from reference or seller's deal value; commission snapshot)
→ CREATE_TRANSACTION_PIX / POST /api/payments/pix {transactionId}  (client amount ignored)
→ BB PUT /cob/{txid}  (txid deterministic per payment → idempotent)
→ customer pays → BB webhook → POST /api/webhooks/payment/banco-do-brasil[/pix]?token=…
→ token check → re-fetch GET /cob/{txid} (source of truth) → amount check
→ PaymentEvent (unique provider+eventId, payloadHash, processingStatus)
→ Payment CONFIRMED → MarketplaceTransaction PAID
→ settlementStatus = PENDING_PROVIDER_CAPABILITY (no split/payout at BB yet:
  the seller payable is flagged, never paid from an TemPix balance)
→ PAYMENT_RECEIVED (dashboard, SSE, WhatsApp "✅ Pix recebido", push)
```

Checkout states: `CREATED, WAITING_PAYMENT, PAID, EXPIRED, CANCELLED, REFUNDED, ERROR`
(`checkoutState` in `@autopix/shared`, returned as `payment.checkoutState`).

### Protected payment (only when the provider supports it)

```
PAID → PROTECTED (HELD_BY_PROVIDER) → REPORT_COMPLETION (seller)
→ CONFIRM_COMPLETION / CONFIRM_DELIVERY (buyer) → READY_TO_RELEASE
→ RELEASE_PAYMENT (buyer OWNER, sensitive: SensitiveActionChallenge + password, web/app only)
→ atomic reservation → provider createPayout / createSplit with idempotency key release-<id>
→ RELEASED + Payout/PaymentAllocation rows + PROTECTED_PAYMENT_RELEASED, PAYOUT_* / SPLIT_PROCESSED
```

A provider failure reverts to `RELEASE_FAILED`; an unknown outcome opens a
`ReconciliationIssue` and a retry reuses the same idempotency key.

### Freight (Santos → Campinas, R$ 4.800)

Amount comes from the accepted `FreightMatch.price`. The carrier consents to
location sharing per trip; geofence milestones (`DRIVER_ARRIVED_PICKUP`,
`CARGO_LOADED`, `TRIP_STARTED`, `NEAR_DESTINATION`, `DRIVER_ARRIVED_DESTINATION`)
notify the buyer ("🚛 O transporte chegou ao destino."). **Arrival is evidence,
not authorization**: the buyer confirms delivery, and release remains the
separate step-up action. The buyer never receives coordinates.

### Refunds

`REFUND_PAYMENT` (seller OWNER, sensitive) → `Refund REQUESTED` (idempotency
key) → BB `PUT /pix/{e2e}/devolucao/{id}` → `PROCESSING`. `COMPLETED` only
from the provider (webhook `devolucoes`, synchronous response, or
reconciliation `GET devolucao`). Partial refunds accumulate in
`Payment.refundedCents`; full refund → `REFUNDED`.

### Disputes

Either party opens (`OPEN_DISPUTE`) → transaction `DISPUTED` (release and
seller refunds frozen) → `RESPOND_DISPUTE` → admin `summary` (deterministic,
"decisão é sempre humana") → `RESOLVE_DISPUTE` (platform admin, sensitive):
`BUYER` → refund through `RefundService`; `SELLER` → back to the release path;
`CANCEL` → previous state.

### Reconciliation (worker, every 60 s)

| Situation | Action |
|---|---|
| PENDING locally, CONFIRMED at provider, same amount | apply via normal event path, `MISSED_WEBHOOK` issue `AUTO_REPAIRED` |
| Amount differs | `AMOUNT_MISMATCH` issue `OPEN`, no state change |
| CONFIRMED locally, provider disagrees | `STATUS_DIVERGENCE` `OPEN`, no state change |
| Confirmation after local expiry/cancel | `LATE_PAYMENT` `OPEN` |
| Refund not requested by TemPix | `EXTERNAL_REFUND` `OPEN` |
| Refund in flight | provider status → complete/fail |
| Payout failed | `PAYOUT_FAILED` `OPEN` (never auto re-sent) |

## Security rules (enforced in code)

- Amounts are computed server-side; the webhook path re-fetches the charge.
- `RELEASE_PAYMENT`, `REFUND_PAYMENT`, `CHANGE_BANK_DETAILS`,
  `RESOLVE_DISPUTE`, `UPDATE_COMMISSION_RULE` are sensitive (challenge +
  password) and not available on the WhatsApp channel. LLMs/bots can only
  propose actions that the ActionEngine authorizes.
- WhatsApp financial messages carry deep links only — never a money button.
- Every money-relevant step writes `FinancialAuditLog`
  (sources `WEB, PWA, WHATSAPP, SYSTEM, WORKER, ADMIN, API`).
- Provider errors map to safe codes; raw bank responses never reach customers.
- Logs never contain client secret, tokens, Pix secrets or bank credentials.
- Production refuses sandbox BB configuration (unless an explicit `DEMO_MODE`
  deployment, where every payment shows a `SANDBOX` badge).
- Seeds create commission rules only — never payments.

## Railway variables

| Variable | web | worker | Notes |
|---|:-:|:-:|---|
| `PAYMENT_PROVIDER=banco_do_brasil` | ✓ | ✓ | |
| `BB_ENVIRONMENT` (`sandbox`/`production`) | ✓ | ✓ | production refuses sandbox hosts |
| `BB_CLIENT_ID`, `BB_CLIENT_SECRET` | ✓ | ✓ | secret; never in source |
| `BB_DEVELOPER_APPLICATION_KEY` | ✓ | ✓ | sent as `gw-dev-app-key` / `gw-app-key` |
| `BB_PIX_KEY` | ✓ | ✓ | receiving key |
| `BB_API_BASE_URL`, `BB_OAUTH_URL`, `BB_OAUTH_SCOPES`, `BB_APP_KEY_PARAM` | opt | opt | defaults per environment — confirm in the BB portal |
| `BB_MTLS_CERT_BASE64`, `BB_MTLS_KEY_BASE64` | opt | opt | if your contract requires mTLS |
| `BB_WEBHOOK_SECRET` (≥ 32 chars) | ✓ | — | only the web service receives webhooks |
| `BB_PIX_EXPIRATION_SECONDS` | opt | — | default 3600 |
| `BB_PAY_ENABLED`, `BB_SPLIT_ENABLED`, `BB_PAYOUT_ENABLED`, `BB_PROTECTED_PAYMENT_ENABLED` | opt | opt | contract documentation; do not enable features |
| `PROCESS_ROLE` | `web` | `worker` | worker runs without webhook secrets |

After deploy: `npm run bb:register-webhook` (registers
`<API_URL>/api/webhooks/payment/banco-do-brasil?token=…` for `BB_PIX_KEY`).

## Going live with BB — checklist

1. Create the application at the BB developer portal; obtain sandbox credentials.
2. Confirm API/OAuth URLs, scopes and the app-key parameter for your app.
3. Set the variables above on Railway (sandbox first, `DEMO_MODE=true` labels).
4. Register the webhook; pay a sandbox cob; confirm `PAYMENT_RECEIVED`.
5. Request production credentials (and mTLS certificate if required).
6. Switch `BB_ENVIRONMENT=production`, new credentials, `DEMO_MODE=false`.
7. Split / payout / BB Pay / protected flow: contract the product with BB,
   implement the adapter methods against the contract's API, then flip the
   capability in `getCapabilities()` — with contract tests.
