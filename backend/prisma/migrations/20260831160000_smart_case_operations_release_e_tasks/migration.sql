-- Smart Case Operations — Release E (internal work management: tasks + SLA).
--
-- Hand-written, not `prisma migrate dev`'s raw output — same flight_*
-- migration-diff hazard as every other migration on this branch (see
-- tests/migrationIntegrity.test.js). The auto-generated diff again proposed
-- dropping flight_bank_accounts, flight_bookings and flight_inventory;
-- those statements are deliberately excluded.
--
-- Additive: three new enums, one new table (CaseTask), and one nullable
-- column on ContactRequest (dueAt). Nothing existing is altered or dropped.


-- CreateEnum
CREATE TYPE "CaseTaskType" AS ENUM ('REVIEW_DOCUMENTS', 'CHECK_PAYMENT', 'PROCESS_APPLICATION', 'FOLLOW_UP_PROVIDER', 'OTHER');

-- CreateEnum
CREATE TYPE "CaseTaskStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CaseTaskSource" AS ENUM ('SYSTEM', 'MANUAL');

-- CreateTable
CREATE TABLE "CaseTask" (
    "id" TEXT NOT NULL,
    "contactRequestId" TEXT NOT NULL,
    "type" "CaseTaskType" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "CaseTaskStatus" NOT NULL DEFAULT 'OPEN',
    "source" "CaseTaskSource" NOT NULL DEFAULT 'SYSTEM',
    "assignedUserId" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseTask_contactRequestId_idx" ON "CaseTask"("contactRequestId");

-- CreateIndex
CREATE INDEX "CaseTask_assignedUserId_idx" ON "CaseTask"("assignedUserId");

-- CreateIndex
CREATE INDEX "CaseTask_status_idx" ON "CaseTask"("status");

-- CreateIndex
CREATE INDEX "CaseTask_dueAt_idx" ON "CaseTask"("dueAt");

-- AddForeignKey
ALTER TABLE "CaseTask" ADD CONSTRAINT "CaseTask_contactRequestId_fkey" FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseTask" ADD CONSTRAINT "CaseTask_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseTask" ADD CONSTRAINT "CaseTask_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseTask" ADD CONSTRAINT "CaseTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "dueAt" TIMESTAMP(3);
