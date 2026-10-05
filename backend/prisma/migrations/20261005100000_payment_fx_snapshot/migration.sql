-- Additive: two nullable columns + a deterministic backfill. No row is deleted
-- or has its amount/currency changed.
-- Rollback: ALTER TABLE "Payment" DROP COLUMN "fxRate", DROP COLUMN "convertedAmount";
ALTER TABLE "Payment" ADD COLUMN "fxRate" DECIMAL(18,8);
ALTER TABLE "Payment" ADD COLUMN "convertedAmount" DECIMAL(14,2);

-- Same-currency payments convert at exactly 1. Payments whose currency differs
-- from their order's are LEFT NULL on purpose: the historical rate is unknown and
-- inventing one would falsify the books. They are reported by
-- backend/scripts/audit-payment-currencies.js for a human decision.
UPDATE "Payment" p
SET "fxRate" = 1, "convertedAmount" = p."amount"
FROM "Order" o
WHERE o."id" = p."orderId" AND o."currency" = p."currency";
