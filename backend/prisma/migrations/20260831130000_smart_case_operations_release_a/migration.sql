-- Smart Case Operations — Release A (Smart Requirements + Travelers).
--
-- Hand-written, not `prisma migrate dev`'s raw output: the auto-generated
-- diff also proposed dropping `flight_bank_accounts`, `flight_bookings` and
-- `flight_inventory` (and their foreign keys) purely because those
-- hand-written-SQL tables have no Prisma model — the same pre-existing
-- migration-diff hazard documented atop
-- prisma/migrations/20260823132043_add_payment_review_status/migration.sql
-- and guarded by tests/migrationIntegrity.test.js. Those statements are
-- deliberately excluded below; every flight_* table and its data is
-- untouched by this migration.
--
-- Every change here is additive: two new nullable/defaulted columns on
-- ContactRequestDocument, six new nullable/defaulted columns on
-- VisaRequirement (defaults chosen to exactly match every existing row's
-- prior implicit behavior — type DOCUMENT, scope CASE), and one new table.
-- No existing column, table, or row is altered or dropped.

-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'YES_NO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "RequirementScope" AS ENUM ('CUSTOMER', 'TRAVELER', 'CASE');

-- CreateEnum
CREATE TYPE "RequirementConditionOperator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN');

-- AlterTable
ALTER TABLE "ContactRequestDocument" ADD COLUMN     "supersededAt" TIMESTAMP(3),
ADD COLUMN     "travelerId" TEXT;

-- AlterTable
ALTER TABLE "VisaRequirement" ADD COLUMN     "conditionOperator" "RequirementConditionOperator",
ADD COLUMN     "conditionRequirementId" TEXT,
ADD COLUMN     "conditionValue" TEXT,
ADD COLUMN     "options" JSONB,
ADD COLUMN     "scope" "RequirementScope" NOT NULL DEFAULT 'CASE',
ADD COLUMN     "type" "RequirementType" NOT NULL DEFAULT 'DOCUMENT';

-- CreateTable
CREATE TABLE "Traveler" (
    "id" TEXT NOT NULL,
    "contactRequestId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passportNo" TEXT,
    "nationality" TEXT,
    "birthDate" TIMESTAMP(3),
    "gender" "Gender",
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Traveler_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Traveler_contactRequestId_idx" ON "Traveler"("contactRequestId");

-- CreateIndex
CREATE INDEX "ContactRequestDocument_travelerId_idx" ON "ContactRequestDocument"("travelerId");

-- CreateIndex
CREATE INDEX "VisaRequirement_conditionRequirementId_idx" ON "VisaRequirement"("conditionRequirementId");

-- AddForeignKey
ALTER TABLE "VisaRequirement" ADD CONSTRAINT "VisaRequirement_conditionRequirementId_fkey" FOREIGN KEY ("conditionRequirementId") REFERENCES "VisaRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traveler" ADD CONSTRAINT "Traveler_contactRequestId_fkey" FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequestDocument" ADD CONSTRAINT "ContactRequestDocument_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "Traveler"("id") ON DELETE SET NULL ON UPDATE CASCADE;
