# Admin remediation: release preparation

Covers PRs #82 → #86, stacked on #77 → #81.

**Status.** This is a plan only. Nothing in it has been deployed to staging or production.

**Network limit.** This environment's network policy blocks the Railway host, so staging could not be inspected from here.

## 1. What is being released

| PR | Branch | Contents |
|---|---|---|
| #82 | `ccr-1bb2ad1a-sa8ylm-p1-security` | User isolation and role hierarchy, revocable staff sessions (503 vs 401), CSRF protection, escaping, flight pages that work under the CSP |
| #83 | `ccr-1bb2ad1a-sa8ylm-p2-finance` | Currency-safe settlement, refunds, idempotent and concurrency-safe payments, read-only finance diagnostics |
| #84 | `ccr-1bb2ad1a-sa8ylm-p3-workflows` | Customer requests, orders and flight bookings: separate sections, details, deep links, search; contact-request state machine; server-priced flight bookings |
| #85 | `ccr-1bb2ad1a-sa8ylm-p4-reliability` | Rate limits suitable for one office IP, phone layout, accessibility, Arabic error messages |
| #86 | `ccr-1bb2ad1a-sa8ylm-p5-consolidation` | A single back-office source (the `web/public` copy is generated), customer balances per currency, legacy deep links, this document |

**Merge order.** Each PR's base is the previous one, so merge in this order:

#77 → #78 → #79 → #80 → #81 → #82 → #83 → #84 → #85 → #86

The integration branch `ccr-1bb2ad1a-sa8ylm` holds the complete result for end-to-end checks.

## 2. Environment variables

Names only, no values. All of these are optional unless marked.

| Variable | Purpose | Default |
|---|---|---|
| `CORS_ORIGIN` (**existing, required for cross-origin pages**) | Origins that may call the API with cookies. It is now also the CSRF trusted-origin list. It must include the Vercel site, any staff UI origin and the mobile WebView origin if that origin uses cookies. | — |
| `CSRF_TRUSTED_ORIGINS` | Extra trusted origins for cookie-authenticated writes that should not get CORS. | empty |
| `API_RATE_LIMIT` | Anonymous `/api` requests per IP per 15 minutes. | 200 |
| `API_SESSION_RATE_LIMIT` | Requests per signed-in user per 15 minutes. | 1500 |
| `LOGIN_IP_FAILURE_LIMIT` | Failed staff logins per IP per 15 minutes. | 50 |
| `PUBLIC_ORGANIZATION_ID` (existing) | Organization that owns public flight bookings and guest requests. | `org_nasaem_default` |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `DATABASE_URL`, `UPLOAD_ROOT` (existing) | Unchanged. | — |

## 3. Database migrations

Both migrations are additive. Neither changes existing rows, and each file contains its rollback SQL.

1. **`20261010120000_staff_session_revocation`**
   - Adds `User.sessionVersion` (default 0) and the `RevokedStaffToken` table.
   - Existing staff tokens have no `sv` claim and count as version 0, **so nobody is signed out by the release**.
2. **`20261010130000_payment_refunds_idempotency`**
   - Adds `PaymentKind` (`PAYMENT`/`REFUND`) and these `Payment` columns: `kind`, `refundOfPaymentId`, `refundReason`, `createdByUserId`, `idempotencyKey` (unique) and `requestHash`.
   - Existing payments become `kind = PAYMENT`.
   - Its rollback is safe only **before any refund row exists**.

The image runs `prisma migrate deploy` before it starts (see `backend/Dockerfile`). A migration that fails stops the new revision from starting, and the previous revision keeps serving.

## 4. Compatibility notes

**API clients**
- `POST /api/payments` no longer accepts `status: PARTIAL` or `REFUNDED`. It returns 400 with an Arabic explanation.
- A payment in a currency other than the order's returns 400 `CURRENCY_MISMATCH`.
- Overpayment returns 409 `OVERPAYMENT`.
- Refunds use the new `POST /api/payments/:id/refund`.

**Flight booking (public)**
- The server computes the price. A client `amount` that differs returns 409 `PRICE_CHANGED`. The web flight page already sends the same sum, so it keeps working.
- Uploads must be a real PDF, JPEG, PNG or WEBP.
- Customer responses expose `*_path` fields as booleans only.

**Contact requests**
- `CONTACTED → NEW` is refused.
- Re-opening a closed request needs SUPER_ADMIN or ADMIN and a written `reason`.
- Completing a priced request needs a confirmed payment and a delivered file.

**Reports**
- The finance report adds `totalsByCurrency`. Its money totals are `null` when currencies are mixed. The Next.js reports page already shows `—` for null.
- The dashboard summary period gains `paidByCurrency`. `paid` is `null` when several currencies exist.
- Customer detail gains `summary.balancesByCurrency`, with the same null rule.

**Clients without `Origin`**
- Scripts, Postman and test harnesses that write with a session **cookie** must send `X-Requested-With`. Bearer-token clients, including the mobile app, are unaffected.

**Static back-office on Vercel**
- `web/public/*` is regenerated from `backend/public` (§7).

## 5. Release order (when separately authorized)

1. Back up the target database and confirm the backup restores (§8).
2. Run `npm run finance:diagnose` (read-only) against a **copy** of the target data. Review the result with the accountant before the release, because balances for mismatched-currency payments change (see `docs/financial-remediation-proposal.md`).
3. Deploy the backend (with its migrations) to **staging**, then run the acceptance checklist in the handoff report.
4. Deploy the web site. It is compatible with the old and new backend for everything except the regenerated static admin, which needs the new backend.
5. No mobile release is required. The app uses Bearer tokens and its flows are unchanged. Re-check guest flight booking and receipt upload on a device.
6. Production follows the same order, only after staging sign-off.

## 6. Health checks and monitoring

**Health checks**
- `GET /api/health` returns 200 with `database: connected`.
- Railway decides whether to use it; it is configured in the Railway service settings, not in the Dockerfile. Confirm in Railway that the deploy health check points at `/api/health`. A missing Docker `HEALTHCHECK` does not mean the platform has none.

**Signals to watch after a release:**
- 503 responses with code `SESSION_CHECK_UNAVAILABLE`. This means database trouble; staff stay on the page with a retry panel.
- 403 with `CSRF_REJECTED`. A spike means a legitimate origin is missing from `CORS_ORIGIN`/`CSRF_TRUSTED_ORIGINS`.
- 429 with `RATE_LIMITED` / `LOGIN_RATE_LIMITED`.
- 409 with `OVERPAYMENT` / `CURRENCY_MISMATCH` / `PRICE_CHANGED`. These are expected occasionally; a sudden rise points to bad data entry or a pricing change.

These codes appear in the JSON bodies and in morgan's access log (status codes). Any 5xx is logged by `error.middleware.js` with its stack.

**Recommendation.** Forward the Railway logs to an alerting tool and alert on the 5xx rate and on the codes above. This is **not implemented**: no external service was configured.

## 7. One maintained back-office source

| Location | Status after #86 |
|---|---|
| `backend/public/` | **Maintained source.** The API serves it same-origin on Railway. |
| `web/public/{*.html,assets/*}` | **Generated** by `node scripts/sync-static-admin.mjs`. Only the API-host selection in `api.js` differs. `backend/tests/staticAdminSync.test.js` fails CI if the copy drifts. |
| `frontend/` (on `main`) | Removed by #80 (moved to `backend/public`). |
| `web/src/app/admin/` | A separate Next.js admin, which this work did not change. It links into the static back-office (`?order=`, `?customerRequest=`, `?customer=`); those links now open the record. |

## 8. Rollback and recovery

**Application rollback**
- Redeploy the previous Railway deployment. In a Railway staging environment that is the `5e9bf2e`/`4bb8a73` image, whichever was live.
- The added columns and tables are ignored by older code, so an application rollback needs **no database change**.

**Database**
- Prefer **roll-forward**: fix the code and redeploy, keeping the additive schema.
- Roll a migration back only with its rollback SQL, after a backup.
- Never roll back the payments migration after refunds were recorded.

**Before any live data change** (including the remediation proposal):
1. Take a fresh logical backup (`pg_dump -Fc`).
2. Restore it into a disposable database and compare row counts. This is the CI drill (`backup_restore` job).
3. Run the change in a transaction, logging old and new values to `ActivityLog`.

## 9. Checklist for pending Railway changes not made by this work

The audit found a pending Railway source change for #81. Before applying anything in Railway, record and review each of these:

- [ ] Which branch or commit the staging service will build. It must be an explicit SHA, not a moving branch.
- [ ] Every pending variable change, with the reason for it.
- [ ] That `UPLOAD_ROOT` still points at the mounted volume (`/data/uploads`) and the volume is attached.
- [ ] That `CORS_ORIGIN` lists every legitimate page origin (§2) before the CSRF release.
- [ ] That a database backup was taken in the same hour.
- [ ] Who approved the change, and the rollback target (previous deployment id).
