# Umrah — activation on staging (owner-approved prices, 2026-10-28)

Staging only. Production is not touched. Existing requests and customers are not changed.

| Package | Code | Price | Currency | Unit |
|---|---|---|---|---|
| تأشيرة عمرة فقط | SVC-UMRAH-VISA | 795 | SAR | per pilgrim |
| عمرة بالخدمات بالطيران | SVC-UMRAH-AIR | 3500 | SAR | per pilgrim |
| عمرة بالخدمات بالبحر | SVC-UMRAH-SEA | 2650 | SAR | per pilgrim |

## Production protection (owner decision 2026-10-28, option C)
The script cannot change production. Three checks, all required:
1. **Host:** a fixed allow-list (`adaptable-quietude-staging.up.railway.app`, `localhost`, `127.0.0.1`), HTTPS for the remote host, and no redirects.
2. **The server proves it is staging.** Before anything else, the script sends a fresh random nonce. Only a server holding staging's key can answer with a valid HMAC signature. A localhost tunnel to production fails here, because production has no key.
3. **The write is checked by the server that performs it.** Prices are applied only through `POST /api/admin/staging/umrah-pricing`. That route verifies a new signature on every request, including the timestamp (±2 minutes) and a single-use nonce. It applies the prices the server itself holds, in one transaction (all three or none), and records an audit entry. On any server not configured as staging, every `/api/admin/staging/*` route answers 404. This holds even if a proxy routed only the write to production. The generic `PATCH /api/services` is not used.

### One-time setup on staging (owner, Railway → staging → `adaptable-quietude` → Variables)
- `DEPLOYMENT_ENVIRONMENT=staging`. It must be exactly this value.
- `ENVIRONMENT_ATTESTATION_KEY=<at least 32 random characters>`. Generate it with `openssl rand -hex 32`.
  - Keep a copy offline.
  - **Never set it on production.** Production must not have `DEPLOYMENT_ENVIRONMENT=staging` either.
- Staging must run a backend that contains this change. The variables take effect on the next deploy or restart.
- **Assumption:** staging's `DATABASE_URL` points to the staging database only. The script cannot check this.

The script sets `pricingMode = FIXED`, `currency = SAR`, `priceUnit = PER_TRAVELER`, `basePrice` = the price above and `active = true`. The change is made by the staging server, in one transaction, and is audited (`UMRAH_PRICING_ACTIVATED`).

## Before
1. Staging must run a backend that has this PR's Umrah changes (the preferred travel date and the staff next step). Without them, the app still works, but the date rule is not enforced by the server.
2. If `SVC-UMRAH-AIR` or `SVC-UMRAH-SEA` does not exist on staging, run `node prisma/setup-umrah-packages.js` there once. It is additive and creates the packages inactive and unpriced.
3. Check each package's description: «يشمل» (included) and «لا يشمل» (not included). The current defaults are:
   - Visa only: includes the Umrah visa. Excludes travel tickets, accommodation and transport inside Saudi Arabia.
   - With flight services: includes the visa and flight tickets. Excludes accommodation and transport inside Saudi Arabia.
   - With sea services: includes the visa and ferry tickets. Excludes accommodation and transport inside Saudi Arabia.

   **To confirm:** whether the tickets are round trip, and the baggage allowance. The script never changes these descriptions; edit them in الإدارة → العمرة.
4. The SDG price is shown only when the SAR→SDG exchange rate is active (الإدارة → أسعار الصرف). No rate is invented.

## Run (from `backend/`, on a machine that can reach staging)
```bash
export NASAEM_API_BASE=https://adaptable-quietude-staging.up.railway.app/api
export NASAEM_ADMIN_EMAIL=...        # an ADMIN account of staging
read -rs NASAEM_ADMIN_PASSWORD && export NASAEM_ADMIN_PASSWORD
read -rs NASAEM_STAGING_ATTESTATION_KEY && export NASAEM_STAGING_ATTESTATION_KEY   # staging's ENVIRONMENT_ATTESTATION_KEY
node src/scripts/activate-umrah-pricing.js           # dry run: before / planned / description / exchange rate
node src/scripts/activate-umrah-pricing.js --apply   # applies, re-reads, checks the public catalog
```
- The dry run prints `environment: staging (verified by the server's signature)`, or `NOT VERIFIED` with the reason. `--apply` refuses to run unless staging is verified.
- If the write's outcome is unknown (for example, a lost response), the script re-reads and reports what is really stored, then exits with an error. Running it again is safe.
- It prints no password, token or customer data.
- It can be run again safely: a package that is already set is left as is.

## After
- `--apply` prints `saved yes · public yes` for each of the three codes. It also prints the SDG price when the exchange rate is active.
- In the Android QA app: «اختر باقة العمرة» lists the three types with these prices.
- In الإدارة → الحالات, filter «العمرة»: a test request shows its next step and its preferred travel date.
