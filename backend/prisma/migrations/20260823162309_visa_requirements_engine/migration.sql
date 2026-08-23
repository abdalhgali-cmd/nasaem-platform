-- Platform 3.0 Phase 5: Visa Requirements Engine — a new VisaRequirement
-- table (per-visa-type checklist template) plus a requirementsSnapshot
-- column on ContactRequest (point-in-time copy of the checklist captured
-- at submission, so later edits to the templates never rewrite history).
--
-- As with every migration in this project, `prisma migrate dev` also
-- proposed dropping flight_bank_accounts, flight_bookings and
-- flight_inventory (and their FKs) — those tables are managed by raw SQL
-- with no Prisma model, so Prisma always misreads them as removed. This
-- is the same recurring false-positive documented in
-- docs/PLATFORM-3-AUDIT.md; those DROP statements were removed by hand.
-- Only the additive changes below are real.

-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "requirementsSnapshot" JSONB;

-- CreateTable
CREATE TABLE "VisaRequirement" (
    "id" TEXT NOT NULL,
    "visaTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "attachmentType" TEXT,
    "maxFiles" INTEGER NOT NULL DEFAULT 1,
    "allowedMimeTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxSizeBytes" INTEGER,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT true,
    "ocrEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisaRequirement_visaTypeId_idx" ON "VisaRequirement"("visaTypeId");

-- CreateIndex
CREATE INDEX "VisaRequirement_active_idx" ON "VisaRequirement"("active");

-- CreateIndex
CREATE INDEX "VisaRequirement_sortOrder_idx" ON "VisaRequirement"("sortOrder");

-- AddForeignKey
ALTER TABLE "VisaRequirement" ADD CONSTRAINT "VisaRequirement_visaTypeId_fkey" FOREIGN KEY ("visaTypeId") REFERENCES "VisaType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
