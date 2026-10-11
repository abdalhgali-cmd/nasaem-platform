-- Final files can be prepared (draft) before they are published to the
-- customer, and record which travelers they are the output for.
ALTER TABLE "ContactRequestDeliverable" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "ContactRequestDeliverable" ADD COLUMN "publishedByUserId" TEXT;
ALTER TABLE "ContactRequestDeliverable" ADD COLUMN "travelerIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Every file uploaded before this change was shown to the customer the
-- moment it was uploaded: it stays published, with its upload time and
-- uploader. Its traveler coverage is unknown and stays empty (the request
-- as a whole). Nothing else about existing requests changes: a request
-- already CLOSED/COMPLETED stays exactly as it is.
UPDATE "ContactRequestDeliverable"
SET "publishedAt" = "createdAt", "publishedByUserId" = "uploadedByUserId"
WHERE "publishedAt" IS NULL;
