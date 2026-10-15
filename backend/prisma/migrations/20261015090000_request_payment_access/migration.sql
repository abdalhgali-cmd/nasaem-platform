-- Request-scoped payment access (hash only). Additive: existing requests keep
-- NULL and are paid through tracking exactly as before.
ALTER TABLE "ContactRequest" ADD COLUMN "paymentAccessTokenHash" TEXT,
ADD COLUMN "paymentAccessExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ContactRequest_paymentAccessTokenHash_key" ON "ContactRequest"("paymentAccessTokenHash");
