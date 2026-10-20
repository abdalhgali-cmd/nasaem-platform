# Activating the Egypt security approval on staging

Staging only (Railway project `spirited-luck`, service `adaptable-quietude`, the
backend the QA APK calls: `https://adaptable-quietude-staging.up.railway.app/api`).
Never production. Nothing here is run until each step before it has passed.

## Why the app shows both entry methods as unavailable

The seed creates `VISA-EGYPT-CLEARANCE-AIR` and `VISA-EGYPT-CLEARANCE-BORDER`
**inactive and QUOTE-priced**. The public catalog (`GET /api/services/public`)
lists only active visa types, so the app has no bookable variant and says
«غير متاحة للحجز حاليًا». That is correct for an unconfigured service; the
fix is to deploy this branch and configure both variants. Older app builds
also showed «غير متاحة» when the catalog could not be fetched; the current
app shows a connection error with «إعادة المحاولة» instead.

Check on staging (read-only):

```
curl -s https://adaptable-quietude-staging.up.railway.app/api/health
curl -s https://adaptable-quietude-staging.up.railway.app/api/services/public | jq '.data.visaTypes[] | select(.code|test("EGYPT")) | {code,active,pricingMode,basePrice,currency,priceUnit,priceSdg}'
```

No Egypt variant in the output = not activated (expected before step 5).

## Steps

1. **Identify** the running deployment (Railway → `adaptable-quietude` →
   Deployments: commit SHA, branch). Note it as the rollback target.
2. **Backup** (required before any migration): Railway snapshot of the
   PostgreSQL volume and of `/data/uploads`, plus an off-platform
   `pg_dump -Fc` and an uploads archive.
3. **Restore drill** into an isolated database (never Railway “Restore” on
   staging): `scripts/release-restore-drill.sh` with the dump; it must exit 0.
   No verified restore → stop here.
4. **Deploy** the branch of PR “Egypt activation” to the same staging service
   (not a new service). The container runs `prisma migrate deploy` on start;
   this applies `20261019090000_egypt_approval_workflow` (additive; backfills
   are exception-safe). After it, the database requires capability
   `egypt-approval-workflow-v1`: roll **forward** only (see
   `docs/admin-remediation-release.md`).
5. **Configure** (approved values), either in the back-office
   (Egypt tab → «ضبط الخدمة والأسعار»: 85 / 155 USD, 9200, both active, save)
   or once from the service shell:
   `npm run egypt:configure -- --air 85 --border 155 --usd 9200`.
   Both are the same audited transaction. The USD rate is shared with every
   USD-priced service; stored flight SDG prices are refreshed.
6. **Verify**: the catalog query above shows both variants `FIXED`, `USD`,
   `PER_TRAVELER`, `basePrice` 85 / 155, `priceSdg` 782000 / 1426000; the QA
   APK shows both entry methods and reaches the passport step; a test request
   with one traveler gets an approved invoice of 85 USD with no quote stage.

Existing requests keep the price frozen on their invoice; nothing above
reprices them.
