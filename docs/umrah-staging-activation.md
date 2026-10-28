# Umrah — activation on staging (owner-approved prices, 2026-10-28)

Staging only. Production is not touched. Existing requests and customers are not changed.

| Package | Code | Price | Currency | Unit |
|---|---|---|---|---|
| تأشيرة عمرة فقط | SVC-UMRAH-VISA | 795 | SAR | per pilgrim |
| عمرة بالخدمات بالطيران | SVC-UMRAH-AIR | 3500 | SAR | per pilgrim |
| عمرة بالخدمات بالبحر | SVC-UMRAH-SEA | 2650 | SAR | per pilgrim |

The script sets `pricingMode = FIXED`, `currency = SAR`, `priceUnit = PER_TRAVELER`, `basePrice` = the price above and `active = true`. It uses the admin endpoint `PATCH /api/services/:id`, which is validated and audited like the back-office screen. It does not write to the database directly.

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
node src/scripts/activate-umrah-pricing.js           # dry run: before / planned / description / exchange rate
node src/scripts/activate-umrah-pricing.js --apply   # applies, re-reads, checks the public catalog
```
- The script runs only against a fixed list of hosts: `adaptable-quietude-staging.up.railway.app`, `localhost` and `127.0.0.1`. There is no override. Redirects are refused. Never point `localhost` at a tunnel to production.
- If one change fails, the script stops, re-reads and reports what is really stored for all three packages, and exits with an error. Running it again completes the rest.
- It prints no password, token or customer data.
- It can be run again safely: a package that is already set is left as is.

## After
- `--apply` prints `saved yes · public yes` for each of the three codes. It also prints the SDG price when the exchange rate is active.
- In the Android QA app: «اختر باقة العمرة» lists the three types with these prices.
- In الإدارة → الحالات, filter «العمرة»: a test request shows its next step and its preferred travel date.
