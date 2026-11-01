-- Payment settlement (issue #132). Additive only: an agency opt-in flag on
-- payment accounts, the validated settlement snapshot on transfer receipts,
-- and the settled currency/amount on paid receipts. No row is rewritten.

-- AlterTable
ALTER TABLE "ContactRequestDocument" ADD COLUMN     "paymentSettlement" JSONB;

-- AlterTable
ALTER TABLE "PaymentAccount" ADD COLUMN     "acceptsForeignInvoices" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PaymentReceipt" ADD COLUMN     "settlementAmount" DECIMAL(14,2),
ADD COLUMN     "settlementCurrency" TEXT;
