-- Platform 3.0 (Visa Categorization): give VisaType its own authoritative
-- `category` classification (INTERNATIONAL / UMRAH / FAMILY_VISIT / OTHER)
-- so public endpoints can filter server-side instead of the frontend
-- hiding cards for categories it shouldn't show.
--
-- As with every migration in this project, `prisma migrate dev` also
-- proposed dropping flight_bank_accounts, flight_bookings and
-- flight_inventory (and their FKs) — those tables are managed by raw SQL
-- with no Prisma model, so Prisma always misreads them as removed. This
-- is the same recurring false-positive documented in
-- docs/PLATFORM-3-AUDIT.md; those DROP statements were removed by hand.
-- Only the additive VisaType changes below (column + backfill + index)
-- are real.

-- AlterTable
ALTER TABLE "VisaType" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'OTHER';

-- Backfill existing rows from their linked Service.category, where one
-- exists, so already-seeded/admin-created visa types are classified
-- correctly on deploy instead of silently landing in OTHER. Only the
-- three named categories are mapped explicitly; every other linked
-- service category (work_visa, egypt_clearance, ...) is intentionally
-- left as the OTHER default.
UPDATE "VisaType" vt
SET "category" = CASE s."category"
  WHEN 'intl_visa' THEN 'INTERNATIONAL'
  WHEN 'umrah' THEN 'UMRAH'
  WHEN 'family_visit' THEN 'FAMILY_VISIT'
  ELSE vt."category"
END
FROM "Service" s
WHERE vt."serviceId" = s."id"
  AND s."category" IN ('intl_visa', 'umrah', 'family_visit');

-- CreateIndex
CREATE INDEX "VisaType_category_idx" ON "VisaType"("category");
