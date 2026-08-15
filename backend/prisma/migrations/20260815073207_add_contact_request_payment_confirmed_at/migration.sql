-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "paymentConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ContactRequest_paymentConfirmedAt_idx" ON "ContactRequest"("paymentConfirmedAt");

-- Best-effort backfill for rows confirmed before this column existed.
-- updatedAt is an *upper bound*, not the real confirmation time: any later
-- edit (a status change to CLOSED, a document review) moved it. Chosen
-- over leaving NULL because a NULL paymentConfirmedAt is silently excluded
-- by any dated revenue query (NULL never satisfies gte/lte), which would
-- make every historical confirmed payment vanish from every date-filtered
-- report. Chosen over createdAt because this platform is pre-launch and
-- the row count is small enough that an upper-bound approximation beats a
-- known-wrong one.
UPDATE "ContactRequest"
SET "paymentConfirmedAt" = "updatedAt"
WHERE "paymentStatus" = 'CONFIRMED' AND "paymentConfirmedAt" IS NULL;
