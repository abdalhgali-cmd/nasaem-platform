-- Add an optional ownership link for authenticated Customer accounts.
-- Existing ContactRequest rows remain valid with customerId = NULL.
ALTER TABLE "ContactRequest" ADD COLUMN "customerId" TEXT;

CREATE INDEX "ContactRequest_customerId_idx" ON "ContactRequest"("customerId");

ALTER TABLE "ContactRequest"
ADD CONSTRAINT "ContactRequest_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
