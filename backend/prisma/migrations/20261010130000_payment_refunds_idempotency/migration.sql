-- Payment refunds, actor and idempotency (additive; existing rows keep their
-- values and default to kind PAYMENT).
-- Rollback:
--   ALTER TABLE "Payment" DROP CONSTRAINT "Payment_refundOfPaymentId_fkey";
--   ALTER TABLE "Payment" DROP CONSTRAINT "Payment_createdByUserId_fkey";
--   DROP INDEX "Payment_idempotencyKey_key"; DROP INDEX "Payment_refundOfPaymentId_idx"; DROP INDEX "Payment_kind_idx";
--   ALTER TABLE "Payment" DROP COLUMN "kind", DROP COLUMN "refundOfPaymentId", DROP COLUMN "refundReason",
--     DROP COLUMN "createdByUserId", DROP COLUMN "idempotencyKey", DROP COLUMN "requestHash";
--   DROP TYPE "PaymentKind";
-- Roll back only before any REFUND row exists, or those rows would read as
-- received payments.
CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'REFUND');

ALTER TABLE "Payment"
  ADD COLUMN "kind" "PaymentKind" NOT NULL DEFAULT 'PAYMENT',
  ADD COLUMN "refundOfPaymentId" TEXT,
  ADD COLUMN "refundReason" TEXT,
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestHash" TEXT;

CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE INDEX "Payment_refundOfPaymentId_idx" ON "Payment"("refundOfPaymentId");
CREATE INDEX "Payment_kind_idx" ON "Payment"("kind");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refundOfPaymentId_fkey"
  FOREIGN KEY ("refundOfPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
