# Release runbook — PR #91 to Railway staging (plan only)

Status: **PLAN. Nothing here has been run against Railway.** Every live step needs the owner's explicit approval for that step. Claude has no Railway access; this environment's network blocks the Railway host.

Target: Railway project `spirited-luck`, service `adaptable-quietude`, PostgreSQL 18, persisted volume `/data/uploads`. Staging holds real data and is **not** a disposable database.

## 0. What deploying #91 changes

- The backend image runs `npm run prisma:migrate && npm start` (`backend/Dockerfile`). **A deploy applies the migrations immediately**, with no separate step.
- **Staging today** (owner's read-only inventory, 2026-10-12): the API `adaptable-quietude` runs `f2616659` (branch `ccr-1bb2ad1a-sa8ylm`, root `/backend`). That build already contains the admin-remediation migrations and the startup guard, and it is an ancestor of #91.
- **On staging, #91 applies 6 migrations:** `20261011090000_contact_request_payment_review_and_frozen_fx`, `20261011120000_contact_request_execution`, `20261012090000_deliverable_publish_and_coverage`, `20261013090000_request_kind_and_quote_version`, `20261014090000_case_task_system_key` and `20261014100000_explicit_pricing_mode`. All are additive: new columns, tables and indexes, plus defaulted backfills. Against `main` (`e28cdbe`) the count is **11**, which includes the admin-remediation set; that matters for production. Read `docs/admin-remediation-release.md` §3–§8 first.
- After these migrations the environment is **roll-forward only**. `release:rollback-check` refuses every earlier build: unknown migrations, plus the missing capabilities `migration-compatibility-guard-v1`, `staff-session-revocation-v1`, `admin-security-remediation-v1`, `payment-refund-settlement-v1` and `fixed-pricing-v1`. Verified with the drill below on a `main`-schema dump.
- The pricing migration sets every existing service and visa type to `QUOTE`. Nothing becomes fixed-price until staff change it, which they should not do before the new Android app is distributed (older apps cannot finish a priced request).

## 1. Pre-flight (read-only)

1. Confirm the commit staging runs (Railway → `adaptable-quietude` → Deployments). As of 2026-10-12 it is `f2616659`; if it has changed, recompute the migration list above.
2. Confirm green GitHub Actions on #91's **final** SHA: Backend tests, Frontend typecheck + build, Playwright E2E, backup drill, build-apk. Vercel's "Account is blocked" is an account issue, separate from #91.
3. Confirm the Railway variables exist (names only; see `docs/ENVIRONMENT-VARIABLES.md`). `PUBLIC_CONTACT_RATE_LIMIT` and `TRACKING_CODE_RATE_LIMIT` must **not** be set on staging or production; they are ignored there anyway.
4. Confirm the deploy health check points at `/api/health` and check the restart policy (`docs/admin-remediation-release.md` §6, §8.4).

## 2. Real backup of staging (owner, before any deploy)

Staging facts: the database service is `Postgres-_h_s`, running PostgreSQL 18 on volume `postgres-volume-MMtx`. Uploads are on `adaptable-quietude-volume` at `/data/uploads`. The database has **no public TCP proxy**, so `pg_dump` from an ordinary laptop cannot reach it. **Do not open public database access to take a backup.**

1. **Railway snapshots (first line).** In the Railway dashboard, select the **staging** environment only, then `Postgres-_h_s` → **Backups** → create a manual backup. Repeat on `adaptable-quietude` → **Backups**. Record both backup IDs, the timestamp and the retention period. Railway limits manual backups to volumes at no more than 50% usage. **Never select Restore or Deploy** on staging for a test: Restore stages a replacement volume and redeploys the service.
2. **Off-platform copies (required for the drill).** These are separate from Railway's snapshots, from a trusted machine and through an authorized **private** route, for example a one-off job or shell inside the Railway project:
   - a PostgreSQL 18 **custom-format** logical dump (`pg_dump -Fc --no-owner --no-acl`, client version ≥ 18);
   - a `tar.gz` of `/data/uploads`.

   Encrypt both with an owner-held public key, keep the private key offline, and store them outside Railway. Record sizes and SHA-256 hashes. Never put connection strings in chat, tickets or files.
3. A Railway snapshot alone is **not** a verified backup until the off-platform copy restores successfully (§3).

## 3. Restore drill on the real dump (local only)

```
DRILL_ADMIN_URL=<local postgres admin URL> \
  scripts/release-restore-drill.sh nasaem-staging-<date>.dump uploads-<date>.tar.gz
```

Run it with `ROLLBACK_REF=f2616659f3ae5a58b9b98a084e0118eed3cdf934`, the build staging runs today. The script refuses any non-local host. It restores into a new local database, records counts, applies #91's migrations as the container would, then re-counts. It checks pricing defaults and runs `release:rollback-check` against `ROLLBACK_REF`. It also checks that every request file the database references exists in the uploads archive.

The script **exits non-zero** if any check fails (`backend/src/release/drill-checks.js`): a changed row count or payment total; a FIXED service, visa type or request; a rollback-check exit code other than 2; or a referenced upload file missing from the archive. It also fails when no uploads archive is passed, unless that is accepted explicitly. CI runs the script on every PR twice: once where it must pass, and once on a dump with a FIXED service, where it must fail.

Accept only if **all** of these hold:
- the restore and `migrate deploy` complete without errors;
- users, customers, requests, invoices, payments, the payment total and request documents are **unchanged**;
- every service and visa type is `QUOTE`;
- `rollback-check` exits **2** (roll-forward only, expected);
- missing request files is **0**.

Then boot the candidate against the drill database and run the smoke checks in §5 there first.

Exercised in this repository on a synthetic `main`-schema dump. It has **not** been run on a real staging dump.

## 4. Deploy (owner approval required)

1. Choose a window when staff are not recording payments or refunds (deploy overlap, `docs/admin-remediation-release.md` §8.4).
2. Deploy #91's final SHA to `adaptable-quietude`. Migrations run on start; the startup guard then verifies the schema before opening the port.
3. Watch the logs for `[startup] Startup refused` and for migration errors. If startup is refused, **do not** redeploy the old commit. Roll forward instead (§6).

## 5. Smoke checks on staging (after approval)

1. `GET /api/health` returns 200.
2. Staff login; open the customer requests list and one request detail, which shows its progress label and allowed actions.
3. Back-office → الإدارة → الخدمات / التأشيرات: the pricing fields are present and show `بعرض سعر` (QUOTE).
4. One QUOTE request end to end with a test customer and a test phone, never a real customer: submit → issue quote → approve in the app (with version) → upload receipt → accept the payment → start execution → publish file → completed.
5. Upload a document, redeploy the **same** candidate, and confirm the document still downloads (volume persistence).
6. Do **not** switch any real service to FIXED during staging verification unless a dedicated test service is used.

## 6. If something goes wrong

- **Roll forward only.** Fix on the integration branch and deploy the new SHA; the startup guard and rollback check explain why going back is refused.
- **Data loss or corruption** (not a code bug): restore from §2 into a new database, verify it with the §3 criteria, then point the service at it. This is an owner decision.
- **Never** run the rollback SQL in the payments migration comment once a refund row exists.

## 7. Not covered here

- Production release. It is a separate approval gate and repeats §1–§5 against production.
- Android distribution (`android-release.yml`, owner-triggered) and real-device tests.
- Vercel deployment, which is currently blocked at the account level.
