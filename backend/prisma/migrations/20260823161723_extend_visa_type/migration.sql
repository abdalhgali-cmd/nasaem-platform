-- Platform 3.0 Phase 4: extend VisaType with admin-configurable fields
-- (nameEn/type/processingTime/stayDuration/validity/entryType/sortOrder).
--
-- As with every migration in this project, `prisma migrate dev` also
-- proposed dropping flight_bank_accounts, flight_bookings and
-- flight_inventory (and their FKs) — those tables are managed by raw SQL
-- with no Prisma model, so Prisma always misreads them as removed. This
-- is the same recurring false-positive documented in
-- docs/PLATFORM-3-AUDIT.md; those DROP statements were removed by hand.
-- Only the additive VisaType changes below are real.

-- AlterTable
ALTER TABLE "VisaType" ADD COLUMN     "entryType" TEXT,
ADD COLUMN     "nameEn" TEXT,
ADD COLUMN     "processingTime" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stayDuration" TEXT,
ADD COLUMN     "type" TEXT,
ADD COLUMN     "validity" TEXT;

-- CreateIndex
CREATE INDEX "VisaType_sortOrder_idx" ON "VisaType"("sortOrder");
