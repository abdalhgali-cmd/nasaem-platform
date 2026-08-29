CREATE TABLE "PaymentAccount" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "accountNumber" TEXT,
  "iban" TEXT,
  "currency" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentAccount_currency_idx" ON "PaymentAccount"("currency");
CREATE INDEX "PaymentAccount_active_idx" ON "PaymentAccount"("active");
CREATE INDEX "PaymentAccount_sortOrder_idx" ON "PaymentAccount"("sortOrder");
