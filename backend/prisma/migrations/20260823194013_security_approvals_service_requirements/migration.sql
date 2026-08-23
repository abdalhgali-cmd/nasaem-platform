-- Platform 3.0 Phase 8: generalize VisaRequirement so it can attach to a
-- Service directly (not just a VisaType) — Security Approvals is modeled
-- as a Service, but needs the exact same requirements checklist engine.
-- Also adds Service.processingTime, mirroring VisaType's own field.
--
-- As with every migration in this project, `prisma migrate dev` also
-- proposed dropping flight_bank_accounts, flight_bookings and
-- flight_inventory (and their FKs) — those tables are managed by raw SQL
-- with no Prisma model, so Prisma always misreads them as removed. This
-- is the same recurring false-positive documented in
-- docs/PLATFORM-3-AUDIT.md; those DROP statements were removed by hand.
-- Only the additive changes below are real.

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "processingTime" TEXT;

-- AlterTable
ALTER TABLE "VisaRequirement" ADD COLUMN     "serviceId" TEXT,
ALTER COLUMN "visaTypeId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "VisaRequirement_serviceId_idx" ON "VisaRequirement"("serviceId");

-- AddForeignKey
ALTER TABLE "VisaRequirement" ADD CONSTRAINT "VisaRequirement_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
