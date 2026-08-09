-- CreateEnum
CREATE TYPE "ContactRequestPaymentStatus" AS ENUM ('NOT_REQUIRED', 'AWAITING_TRANSFER', 'UNDER_REVIEW', 'CONFIRMED');

-- AlterTable
ALTER TABLE "ContactRequest"
  ADD COLUMN "referenceNumber" TEXT,
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "paymentAmount" DECIMAL(12,2),
  ADD COLUMN "paymentStatus" "ContactRequestPaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "passportImagePath" TEXT,
  ADD COLUMN "paymentReceiptPath" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ContactRequest_referenceNumber_key" ON "ContactRequest"("referenceNumber");

-- CreateIndex
CREATE INDEX "ContactRequest_paymentStatus_idx" ON "ContactRequest"("paymentStatus");
