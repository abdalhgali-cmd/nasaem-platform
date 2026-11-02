-- Customer session revocation (additive; no existing row is modified).
-- Rollback: DROP TABLE "RevokedCustomerToken";
--           ALTER TABLE "Customer" DROP COLUMN "sessionVersion";
ALTER TABLE "Customer" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "RevokedCustomerToken" (
    "jti" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevokedCustomerToken_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "RevokedCustomerToken_customerId_idx" ON "RevokedCustomerToken"("customerId");
CREATE INDEX "RevokedCustomerToken_expiresAt_idx" ON "RevokedCustomerToken"("expiresAt");

ALTER TABLE "RevokedCustomerToken"
ADD CONSTRAINT "RevokedCustomerToken_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
