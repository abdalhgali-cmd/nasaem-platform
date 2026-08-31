-- Smart Case Operations — Release F (provider operations).
--
-- Hand-written, not `prisma migrate dev`'s raw output — same flight_*
-- migration-diff hazard as every other migration on this branch (see
-- tests/migrationIntegrity.test.js). The auto-generated diff again proposed
-- dropping flight_bank_accounts, flight_bookings and flight_inventory;
-- those statements are deliberately excluded.
--
-- Additive: four new nullable columns on the existing Supplier (extended
-- rather than adding a parallel Provider model), one defaulted column on
-- ContactRequestDocument whose default describes exactly what every
-- existing row already is, three new enums and two new tables.


-- CreateEnum
CREATE TYPE "ProviderChannel" AS ENUM ('EMAIL', 'MANUAL_PORTAL', 'API', 'OFFLINE');

-- CreateEnum
CREATE TYPE "ProviderSubmissionStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentClassification" AS ENUM ('CUSTOMER_DOCUMENT', 'INTERNAL_DOCUMENT', 'FINANCIAL_DOCUMENT', 'PROVIDER_DOCUMENT');

-- AlterTable
ALTER TABLE "ContactRequestDocument" ADD COLUMN     "classification" "DocumentClassification" NOT NULL DEFAULT 'CUSTOMER_DOCUMENT';

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "expectedProcessingDays" INTEGER,
ADD COLUMN     "portalUrl" TEXT,
ADD COLUMN     "submissionChannel" "ProviderChannel",
ADD COLUMN     "submissionEmail" TEXT;

-- CreateTable
CREATE TABLE "ProviderSubmission" (
    "id" TEXT NOT NULL,
    "contactRequestId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "channel" "ProviderChannel" NOT NULL,
    "status" "ProviderSubmissionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdByUserId" TEXT NOT NULL,
    "recipient" TEXT,
    "externalReference" TEXT,
    "notes" TEXT,
    "failureReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderSubmissionDocument" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "ProviderSubmissionDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderSubmission_contactRequestId_idx" ON "ProviderSubmission"("contactRequestId");

-- CreateIndex
CREATE INDEX "ProviderSubmission_supplierId_idx" ON "ProviderSubmission"("supplierId");

-- CreateIndex
CREATE INDEX "ProviderSubmission_status_idx" ON "ProviderSubmission"("status");

-- CreateIndex
CREATE INDEX "ProviderSubmission_createdByUserId_idx" ON "ProviderSubmission"("createdByUserId");

-- CreateIndex
CREATE INDEX "ProviderSubmissionDocument_submissionId_idx" ON "ProviderSubmissionDocument"("submissionId");

-- CreateIndex
CREATE INDEX "ProviderSubmissionDocument_documentId_idx" ON "ProviderSubmissionDocument"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderSubmissionDocument_submissionId_documentId_key" ON "ProviderSubmissionDocument"("submissionId", "documentId");

-- AddForeignKey
ALTER TABLE "ProviderSubmission" ADD CONSTRAINT "ProviderSubmission_contactRequestId_fkey" FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderSubmission" ADD CONSTRAINT "ProviderSubmission_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderSubmission" ADD CONSTRAINT "ProviderSubmission_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderSubmissionDocument" ADD CONSTRAINT "ProviderSubmissionDocument_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ProviderSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderSubmissionDocument" ADD CONSTRAINT "ProviderSubmissionDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ContactRequestDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

