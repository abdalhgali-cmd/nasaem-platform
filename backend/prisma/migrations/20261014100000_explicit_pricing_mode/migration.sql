-- Explicit pricing configuration per catalog item. Every existing service
-- and visa type stays "QUOTE" (today's behaviour) until the agency
-- explicitly switches it to "FIXED" in the admin.
ALTER TABLE "Service" ADD COLUMN "pricingMode" TEXT NOT NULL DEFAULT 'QUOTE',
ADD COLUMN "priceUnit" TEXT NOT NULL DEFAULT 'PER_REQUEST',
ADD COLUMN "paymentAfterDocumentReview" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "VisaType" ADD COLUMN "pricingMode" TEXT NOT NULL DEFAULT 'QUOTE',
ADD COLUMN "priceUnit" TEXT NOT NULL DEFAULT 'PER_REQUEST',
ADD COLUMN "paymentAfterDocumentReview" BOOLEAN NOT NULL DEFAULT false;

-- Per-request record of the mode in force and the accepted price snapshot.
-- Existing requests stay NULL (treated as QUOTE).
ALTER TABLE "ContactRequest" ADD COLUMN "pricingMode" TEXT,
ADD COLUMN "pricingSnapshot" JSONB;

-- A fixed catalog price accepted at submission has no staff author.
ALTER TABLE "Invoice" ALTER COLUMN "createdByUserId" DROP NOT NULL;
