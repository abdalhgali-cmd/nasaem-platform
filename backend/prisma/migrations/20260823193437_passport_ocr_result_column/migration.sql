-- Platform 3.0 Phase 7: store the passport OCR extraction result (when a
-- requirement has ocrEnabled) on the ContactRequestDocument it belongs to.
--
-- As with every migration in this project, `prisma migrate dev` also
-- proposed dropping flight_bank_accounts, flight_bookings and
-- flight_inventory (and their FKs) — those tables are managed by raw SQL
-- with no Prisma model, so Prisma always misreads them as removed. This
-- is the same recurring false-positive documented in
-- docs/PLATFORM-3-AUDIT.md; those DROP statements were removed by hand.
-- Only the additive ocrResult column below is real.

-- AlterTable
ALTER TABLE "ContactRequestDocument" ADD COLUMN     "ocrResult" JSONB;
