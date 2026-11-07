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
| #86 | `ccr-1bb2ad1a-sa8ylm-p5-consolidation` | A single back-office source (the `web/public` copy is generated), customer balances per currency, legacy deep links, rollback safety (startup guard, `release:rollback-check`), this document |

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
| `DB_COMPAT_ACKNOWLEDGED_MIGRATIONS` | Comma-separated names of later migrations an operator has reviewed and accepts for this build (startup guard, §8). Leave unset. | empty |
| `STARTUP_DB_ATTEMPTS` | How many times startup tries to reach the database for the compatibility check before exiting non-zero. | 5 |
| `STARTUP_DB_RETRY_DELAY_MS` | Delay between those attempts. | 3000 |
| `PUBLIC_ORGANIZATION_ID` (existing) | Organization that owns public flight bookings and guest requests. | `org_nasaem_default` |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `DATABASE_URL`, `UPLOAD_ROOT` (existing) | Unchanged. | — |

## 3. Database migrations

Both migrations are additive: neither changes existing rows. **Additive does not mean an application rollback is safe** (see §8): the old code starts against the new schema, but it misreads the rows the new code writes.

1. **`20261010120000_staff_session_revocation`**
   - Adds `User.sessionVersion` (default 0) and the `RevokedStaffToken` table.
   - Existing staff tokens have no `sv` claim and count as version 0, **so nobody is signed out by the release**.
2. **`20261010130000_payment_refunds_idempotency`**
   - Adds `PaymentKind` (`PAYMENT`/`REFUND`) and these `Payment` columns: `kind`, `refundOfPaymentId`, `refundReason`, `createdByUserId`, `idempotencyKey` (unique) and `requestHash`.
   - Existing payments become `kind = PAYMENT`.
   - The rollback SQL in the file comment must **never** be run once a refund row exists (§8).

The image runs `prisma migrate deploy` before it starts (see `backend/Dockerfile`). A migration that fails stops the new revision from starting, and the previous revision keeps serving.

After migrating, the server checks that the database contains no migration this build does not know. If it does, the server refuses to start (§8).

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

**Startup**
- The backend opens its port only after it has verified the database (§8.3).
- If it cannot verify the database it exits non-zero, logging `[startup] Startup refused: …`. This covers an unknown migration, a missing migration history, an unexpected error, and a database still unreachable after the bounded retries.

**Static back-office on Vercel**
- `web/public/*` is regenerated from `backend/public` (§7).

## 5. Release order (when separately authorized)

1. Back up the target database and confirm **that** backup restores (§8.5).
   - The CI `backup_restore` job proves only that the procedure works on CI's synthetic data. It is not a backup of staging.
   - Deploy **only the integration SHA** (the whole stack #82–#86).
   - A partial stack, for example #82–#85, lacks the startup guard and the rollback check.
2. Run `npm run finance:diagnose` (read-only) against a **copy** of the target data. Review the result with the accountant before the release, because balances for mismatched-currency payments change (see `docs/financial-remediation-proposal.md`).
3. Deploy the backend (with its migrations) to **staging**, then run the acceptance checklist in the handoff report.
   - From that point the environment is **roll-forward only** (§8).
   - From a checkout of the candidate, with `DATABASE_URL` pointing at staging, run `npm run release:rollback-check -- --ref 4bb8a73` (read-only). It must exit 2.
   - Record its output with the release notes.
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
- A startup log line `[startup] Startup refused: …` together with Railway restarting the service:
  - **"does not know"**: someone deployed an older build. Do not override it; roll forward.
  - **"unreachable after N attempt(s)"**: the database is down. The service comes back on its own once the database is reachable.
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

### 8.1 Why the old backend must not come back

Do **not** roll back to the pre-remediation backend (`4bb8a73`, or the `5e9bf2e` deployment built from it). The schema is additive, so it starts, **but it misreads the data this release writes**. This was verified locally by running `4bb8a73` against a copy of a database written by this release (synthetic data):

| | Correct (this release) | Old backend `4bb8a73` |
|---|---|---|
| 1000 USD order: 400 received, 100 refunded (net paid) | 300 | 500 (counts the refund as money received) |
| 200 USD order paid and fully refunded | net 0, `REFUNDED` | 400; the next payment marks the order `PAID` |
| Finance report: paid / refunds / outstanding | 600 / 300 / 700 | 1200 / 0 / 500 |
| Customer balance: paid / outstanding | 600 / 900 | 1200 / 500 |
| Signed-out staff token; token of a suspended-then-reactivated account | 401 `SESSION_REVOKED` | accepted again |

**The cause.** A refund is a `Payment` row with `kind = REFUND` and `status = PAID`. The old code sums every `PAID` row and has no `kind` column in its client. It also does not know `RevokedStaffToken` or `User.sessionVersion`. It would bring back every security issue fixed in #82, including the missing CSRF protection.

**Rules**
- Once this release has served traffic, rolling back to `4bb8a73`/`5e9bf2e` is **prohibited**.
- Once any refund exists, the prohibition is **absolute**: there is no exception and no override.
- Never run the rollback SQL in the payments migration comment after a refund exists. Dropping `kind` turns every refund into a received payment.
- Never delete, rewrite or convert payment, refund or session records to make older code work. Recovery reads the records; it does not change them.
- **Partial stacks** are refused by `release:rollback-check` too: #82 alone lacks refund handling, and #82–#85 lack the startup guard and the capability file.

### 8.2 Recovery strategy

**1. Roll forward (preferred).**
- Keep the database as it is.
- Fix the problem in a new commit on top of the release candidate.
- Run CI, then deploy that commit.
- A plain restart, or a redeploy of the same candidate image, is also safe.
- This path is tested in `backend/tests/rollbackSafety.test.js` and in the local drill. After a restart, balances for partial and full refunds read correctly, revoked sessions stay revoked, and the payment rows are byte-for-byte unchanged.

**2. Roll back to an earlier build, only when the check allows it.**
- Before redeploying any earlier build, run this from the current candidate against the target database:

  ```
  DATABASE_URL=<target db> npm run release:rollback-check -- --ref <target-sha>
  ```

- The check is read-only. It prints counts and migration names, no customer data.
- **Exit codes:**
  - `0`: the target knows every applied migration and declares the capabilities the data needs (`backend/release-compatibility.json`: refund settlement, session revocation, security remediation, startup guard).
  - `2`: the target is unsafe. Do not deploy it.
  - `1`: the check could not run. Treat the target as unsafe.
- **For this first release no earlier build passes**, so in practice it is roll-forward only.
- From this release on, a later build can be rolled back to this candidate only if the later build added no migration the candidate does not know. Otherwise the candidate's startup guard refuses to start.

**3. Rollback build.** None is provided, because none is needed. Any acceptable rollback target must contain the refund-aware settlement, session revocation and the #82 security fixes, which means it must contain this release. A future build that wants to be a rollback target declares the same capabilities and passes the check.

### 8.3 Startup guard (fails closed)

At boot (`backend/src/startup.js`, called from `server.js`) the backend compares the database's applied migrations with its own.

**Nothing is served before the check passes.** Neither the HTTP port nor the background worker (customer-confirmation reconciler) starts until the check has **succeeded**.

**Outcomes**

| What the check finds | What the backend does |
|---|---|
| Every applied migration is known | Opens the port, then starts the worker. |
| An unknown migration (a later build wrote the schema) | Exits with code 1 at once. |
| No `_prisma_migrations` table | Exits with code 1 at once. |
| Any other unexpected error | Exits with code 1 at once. |
| Database unreachable | Retries `STARTUP_DB_ATTEMPTS` times (default 5), `STARTUP_DB_RETRY_DELAY_MS` apart (default 3 s), then exits with code 1. |

**What is never treated as compatible:** an unreachable database or an unexpected error.

**Recovery is by restart.**
- Railway restarts the exited process, and every restart runs the full check again.
- A database that comes back becomes reachable to the next attempt or restart, and traffic starts only after the check passes on it.
- A database that comes back **incompatible** keeps the service down.

**Acknowledging a later migration.** `DB_COMPAT_ACKNOWLEDGED_MIGRATIONS` can name specific later migrations after review. There is no blanket switch.

**After a successful start nothing changes.**
- A later database outage is handled per request: staff get 503 `SESSION_CHECK_UNAVAILABLE` and stay signed in.
- Refund accounting, session revocation and CSRF protection are unchanged.

**Tests:** `backend/tests/startupGuard.test.js` drives the real start sequence and the `server.js` process. It injects failures through a TCP proxy and uses synthetic databases.

### 8.4 Limitations

- **The old backend has no guard.** `4bb8a73` itself has no startup guard: it **will start** if someone redeploys it. The only protections are this document, the pre-flight check, and Railway access control. Treat "Redeploy" on the `5e9bf2e` deployment in Railway as a prohibited action for this environment.
- **Deploy overlap.** During a Railway deploy, the old revision may keep serving for a short time after migrations ran. This is safe only while the new code has not yet written refunds or revocations. Release when staff are not recording payments, and do not record refunds until the old revision has stopped.
- **A long outage means a down service.** If the database stays unreachable for longer than the retries, the service exits and Railway's restart policy decides how often it tries again. Check that policy in Railway (it is not visible from here). With a "never restart" policy the service would stay down until someone redeploys **the same candidate** (never `5e9bf2e`).
- **The check is not enforced by Railway.** `release:rollback-check` is a procedure, not a platform gate.
- **Derived values written by the old code.** If the old code ever ran after refunds existed, it may have written a wrong `Order.paymentStatus`. `npm run finance:diagnose` (read-only) lists orders whose stored status differs from the computed settlement. Correct them only through the application, or through a reviewed script under a fresh backup. Never by editing payment rows.

### 8.5 Backups: a CI exercise is not a staging backup

**What CI proves.** The CI `backup_restore` job dumps and restores a database that CI seeds itself. It proves the **procedure and tooling** (`pg_dump -Fc` → `pg_restore` → row counts). It says nothing about staging or production data.

**A verified backup of staging** exists only when all of these are true:
1. Someone with access took a fresh `pg_dump -Fc` of the **staging** database (`Postgres-_h_s`) in the same hour as the change.
2. They restored it into a disposable database.
3. They compared row counts per table, at least `Payment`, `Order`, `User` and `RevokedStaffToken`, against the source.
4. They recorded who did it, when, and where the dump is kept.

**Current state.** None of this has been done for staging. The network policy here blocks the Railway host, so it could not be done from here.

### 8.6 Before any live data change

1. Take a verified backup as in §8.5.
2. Run the change in a transaction, logging old and new values to `ActivityLog`.

## 9. Checklist for pending Railway changes not made by this work

> **Do not apply the pending Railway source change.**
> - Staging (`adaptable-quietude`) currently runs **`5e9bf2e`**.
> - Its pending source change points at **`4bb8a73`**, the pre-remediation code. That is **not** the release candidate.
> - Applying it would deploy a backend that is prohibited by §8.1 once this release has run, and that misses every fix in #82–#86.
> - Discard or replace it. The staging service must build the integration candidate's **explicit SHA** (see the handoff report), and only under a separate deployment authorization.

The audit found this pending source change for #81. Before applying anything in Railway, record and review each of these:

- [ ] Which branch or commit the staging service will build. It must be an explicit SHA, not a moving branch.
- [ ] Every pending variable change, with the reason for it.
- [ ] That `UPLOAD_ROOT` still points at the mounted volume (`/data/uploads`) and the volume is attached.
- [ ] That `CORS_ORIGIN` lists every legitimate page origin (§2) before the CSRF release.
- [ ] That a **verified staging backup** (§8.5, not the CI exercise) was taken in the same hour.
- [ ] Who approved the change.
- [ ] The recovery plan is **roll forward**.
- [ ] The previous deployment id (`5e9bf2e`) is recorded as **do not redeploy**.
- [ ] `release:rollback-check` output is attached.
