-- Adds an optional review lifecycle to individual Payment records
-- (PENDING/CONFIRMED/REJECTED, rejection reason, reviewer, reviewed-at).
-- Purely additive: existing rows get NULL reviewStatus, meaning "recorded
-- directly by staff, no review step used" (the pre-existing behavior).
--
-- NOTE: `prisma migrate dev` initially generated DROP TABLE statements for
-- flight_bookings / flight_inventory / flight_bank_accounts here. Those
-- tables are managed by hand-written SQL migrations and intentionally have
-- no Prisma model (see flight-bookings.service.js), so Prisma's schema diff
-- treated them as "unknown" and wanted to drop them. That would have
-- destroyed the flight booking system's data — removed by hand, never run.
-- CreateEnum
CREATE TYPE "PaymentReviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewStatus" "PaymentReviewStatus",
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "Payment_reviewStatus_idx" ON "Payment"("reviewStatus");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
