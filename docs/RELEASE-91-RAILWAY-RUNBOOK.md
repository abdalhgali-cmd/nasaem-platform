# Release runbook — PR #91 to Railway staging (plan only)

Status: **PLAN. Nothing here has been run against Railway.** Every live step needs the owner's explicit approval for that step. Claude has no Railway access; this environment's network blocks the Railway host.

Target: Railway project `spirited-luck`, service `adaptable-quietude`, PostgreSQL 18, persisted volume `/data/uploads`. Staging holds real data and is **not** a disposable database.

## 0. What deploying #91 changes

- The backend image runs `npm run prisma:migrate && npm start` (`backend/Dockerfile`). **A deploy applies the migrations immediately**, with no separate step.
- Against `main` (`e28cdbe`), #91 adds **11 migrations**. All are additive (new columns, tables and indexes, plus defaulted backfills), but they include the admin-remediation set: `20261010120000_staff_session_revocation` and `20261010130000_payment_refunds_idempotency`. Read `docs/admin-remediation-release.md` §3–§8 first.
- After these migrations the environment is **roll-forward only**. `release:rollback-check` refuses every earlier build: unknown migrations, plus the missing capabilities `migration-compatibility-guard-v1`, `staff-session-revocation-v1`, `admin-security-remediation-v1`, `payment-refund-settlement-v1` and `fixed-pricing-v1`. Verified with the drill below on a `main`-schema dump.
- The pricing migration sets every existing service and visa type to `QUOTE`. Nothing becomes fixed-price until staff change it, which they should not do before the new Android app is distributed (older apps cannot finish a priced request).

## 1. Pre-flight (read-only)

1. Note the commit staging currently runs (Railway → service → Deployments). `docs/admin-remediation-release.md` §9 says `5e9bf2e`; confirm it.
2. Confirm green GitHub Actions on #91's **final** SHA: Backend tests, Frontend typecheck + build, Playwright E2E, backup drill, build-apk. Vercel's "Account is blocked" is an account issue, separate from #91.
3. Confirm the Railway variables exist (names only; see `docs/ENVIRONMENT-VARIABLES.md`). `PUBLIC_CONTACT_RATE_LIMIT` and `TRACKING_CODE_RATE_LIMIT` must **not** be set on staging or production; they are ignored there anyway.
4. Confirm the deploy health check points at `/api/health` and check the restart policy (`docs/admin-remediation-release.md` §6, §8.4).

## 2. Real backup of staging (owner, before any deploy)

From a trusted machine with the Railway CLI, linked to `spirited-luck`:

1. **Database.** Take a custom-format dump using the staging database's connection string, read from Railway's variables at run time. Do not paste it into chat, tickets or files.
   `pg_dump -Fc --no-owner --no-acl "$STAGING_DATABASE_URL" -f nasaem-staging-<date>.dump`
   Use a `pg_dump` at least as new as the server (PostgreSQL 18).
2. **Uploads.** Archive the volume: open a shell in the service with the Railway CLI and `tar -czf /tmp/uploads-<date>.tar.gz -C /data uploads`, then copy the archive off the service. Alternatively use Railway's volume backup feature, if it is enabled for the project; check in the Railway UI.
3. Store both files encrypted, outside Railway, and record their sizes and SHA-256 hashes.

## 3. Restore drill on the real dump (local only)

```
DRILL_ADMIN_URL=<local postgres admin URL> \
  scripts/release-restore-drill.sh nasaem-staging-<date>.dump uploads-<date>.tar.gz
```

The script refuses any non-local host. It restores into a new local database, records counts, applies #91's migrations as the container would, re-counts, checks pricing defaults, runs `release:rollback-check` against `origin/main` and checks that every request file the database references exists in the uploads archive.

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
