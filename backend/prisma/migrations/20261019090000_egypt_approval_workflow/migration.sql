-- Egypt security approval workflow. Additive only: new nullable columns,
-- columns with defaults, two new tables. No row is deleted or rewritten
-- except the two explicit backfills at the end (both idempotent).

-- CreateEnum
CREATE TYPE "DeliverableKind" AS ENUM ('GENERAL', 'APPROVAL', 'CIRCULAR', 'TICKET');

-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "circularProcessingAt" TIMESTAMP(3),
ADD COLUMN     "linkKind" TEXT,
ADD COLUMN     "parentRequestId" TEXT,
ADD COLUMN     "travelEntryDate" DATE,
ADD COLUMN     "travelScheduleRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ContactRequestDeliverable" ADD COLUMN     "issuedOn" DATE,
ADD COLUMN     "kind" "DeliverableKind" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "supersededAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ContactRequestDocument" ADD COLUMN     "qualitySignal" JSONB;

-- CreateTable
CREATE TABLE "TravelReminder" (
    "id" TEXT NOT NULL,
    "contactRequestId" TEXT NOT NULL,
    "travelDate" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReceipt" (
    "id" TEXT NOT NULL,
    "contactRequestId" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "exchangeRateToSdg" DECIMAL(18,6),
    "amountSdg" DECIMAL(14,2),
    "rateFixedAt" TIMESTAMP(3),
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "serviceName" TEXT NOT NULL,
    "travelerCount" INTEGER NOT NULL DEFAULT 1,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "confirmedByUserId" TEXT,
    "pdfStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "storagePath" TEXT,
    "sizeBytes" INTEGER,
    "pdfAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TravelReminder_status_dueAt_idx" ON "TravelReminder"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "TravelReminder_contactRequestId_travelDate_kind_key" ON "TravelReminder"("contactRequestId", "travelDate", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceipt_contactRequestId_key" ON "PaymentReceipt"("contactRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceipt_receiptNo_key" ON "PaymentReceipt"("receiptNo");

-- CreateIndex
CREATE INDEX "PaymentReceipt_pdfStatus_idx" ON "PaymentReceipt"("pdfStatus");

-- CreateIndex
CREATE INDEX "ContactRequest_travelEntryDate_idx" ON "ContactRequest"("travelEntryDate");

-- CreateIndex
CREATE UNIQUE INDEX "ContactRequest_parentRequestId_linkKind_key" ON "ContactRequest"("parentRequestId", "linkKind");

-- CreateIndex
CREATE INDEX "ContactRequestDeliverable_contactRequestId_kind_idx" ON "ContactRequestDeliverable"("contactRequestId", "kind");

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_parentRequestId_fkey" FOREIGN KEY ("parentRequestId") REFERENCES "ContactRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelReminder" ADD CONSTRAINT "TravelReminder_contactRequestId_fkey" FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_contactRequestId_fkey" FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1: the files already published on an Egypt clearance request were
-- its security approval (the only final file that service had). Classify
-- them explicitly instead of inferring it in code.
UPDATE "ContactRequestDeliverable" d
SET "kind" = 'APPROVAL'
WHERE d."kind" = 'GENERAL'
  AND d."publishedAt" IS NOT NULL
  AND d."contactRequestId" IN (
    SELECT cr."id" FROM "ContactRequest" cr
    JOIN "VisaType" v ON v."id" = cr."visaTypeId"
    WHERE upper(v."code") IN ('VISA-EGYPT-CLEARANCE', 'VISA-EGYPT-CLEARANCE-AIR', 'VISA-EGYPT-CLEARANCE-BORDER')
  );

-- Backfill 2: the canonical travel date from a valid stored travel plan
-- (YYYY-MM-DD only; anything else stays null and shows as «بلا تاريخ»).
UPDATE "ContactRequest" cr
SET "travelEntryDate" = to_date(cr."intakeData"->'egyptTravel'->>'entryDate', 'YYYY-MM-DD')
WHERE cr."travelEntryDate" IS NULL
  AND cr."intakeData"->'egyptTravel'->>'entryDate' ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'
  AND to_char(to_date(cr."intakeData"->'egyptTravel'->>'entryDate', 'YYYY-MM-DD'), 'YYYY-MM-DD') = cr."intakeData"->'egyptTravel'->>'entryDate';
