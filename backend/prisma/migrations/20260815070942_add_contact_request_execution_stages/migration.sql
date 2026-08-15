-- CreateEnum
CREATE TYPE "ContactRequestExecutionStage" AS ENUM ('AWAITING_EXECUTION', 'IN_PROGRESS', 'SUBMITTED_TO_AUTHORITY', 'VISA_ISSUED', 'VISA_REJECTED', 'TICKETS_BOOKED', 'TICKETS_ISSUED', 'UMRAH_DOCUMENTS_PREPARED', 'UMRAH_PACKAGE_READY', 'BOOKING_CONFIRMED_WITH_SUPPLIER', 'VOUCHER_ISSUED', 'DELIVERED_TO_CUSTOMER', 'CANCELLED');

-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "executionStage" "ContactRequestExecutionStage";

-- CreateTable
CREATE TABLE "ContactRequestExecutionHistory" (
    "id" TEXT NOT NULL,
    "contactRequestId" TEXT NOT NULL,
    "oldStage" "ContactRequestExecutionStage",
    "newStage" "ContactRequestExecutionStage" NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "notes" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactRequestExecutionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactRequestExecutionHistory_contactRequestId_idx" ON "ContactRequestExecutionHistory"("contactRequestId");

-- CreateIndex
CREATE INDEX "ContactRequestExecutionHistory_changedByUserId_idx" ON "ContactRequestExecutionHistory"("changedByUserId");

-- CreateIndex
CREATE INDEX "ContactRequest_executionStage_idx" ON "ContactRequest"("executionStage");

-- AddForeignKey
ALTER TABLE "ContactRequestExecutionHistory" ADD CONSTRAINT "ContactRequestExecutionHistory_contactRequestId_fkey" FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequestExecutionHistory" ADD CONSTRAINT "ContactRequestExecutionHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
