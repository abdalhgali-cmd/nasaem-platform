-- Platform 3.0 Phase 6: link ContactRequestDocument uploads to the
-- specific VisaRequirement checklist item they satisfy, so an upload can
-- be validated against that requirement's own allowedMimeTypes/
-- maxSizeBytes/maxFiles rules.
--
-- As with every migration in this project, `prisma migrate dev` also
-- proposed dropping flight_bank_accounts, flight_bookings and
-- flight_inventory (and their FKs) — those tables are managed by raw SQL
-- with no Prisma model, so Prisma always misreads them as removed. This
-- is the same recurring false-positive documented in
-- docs/PLATFORM-3-AUDIT.md; those DROP statements were removed by hand.
-- Only the additive requirementId change below is real.

-- AlterTable
ALTER TABLE "ContactRequestDocument" ADD COLUMN     "requirementId" TEXT;

-- CreateIndex
CREATE INDEX "ContactRequestDocument_requirementId_idx" ON "ContactRequestDocument"("requirementId");

-- AddForeignKey
ALTER TABLE "ContactRequestDocument" ADD CONSTRAINT "ContactRequestDocument_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "VisaRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
