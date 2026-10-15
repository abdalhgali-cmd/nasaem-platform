-- Staff-recorded start of service execution (ticket issuance, visa
-- processing, hotel confirmation, ...) after the payment is accepted.
ALTER TABLE "ContactRequest" ADD COLUMN "executionStartedAt" TIMESTAMP(3);
ALTER TABLE "ContactRequest" ADD COLUMN "executionStartedByUserId" TEXT;
ALTER TABLE "ContactRequest" ADD COLUMN "executionNote" TEXT;
