-- Smart Case Operations — Release B (server-side intake drafts).
--
-- Hand-written, not `prisma migrate dev`'s raw output — same flight_*
-- migration-diff hazard as the Release A/C migrations before it (see their
-- comments and tests/migrationIntegrity.test.js). The auto-generated diff
-- also proposed dropping flight_bank_accounts, flight_bookings and
-- flight_inventory; those statements are deliberately excluded.
--
-- Additive: one new table, two new nullable columns on
-- ContactRequestDocument, and relaxing ContactRequestDocument.contactRequestId
-- from NOT NULL to NULL. Dropping a NOT NULL constraint is backward
-- compatible — every existing row keeps its value and every existing query
-- by contactRequestId is unaffected; only a draft-owned document (which no
-- pre-existing row is) may leave it null, until the draft is submitted and
-- the document is re-pointed at the created ContactRequest.

-- CreateTable
CREATE TABLE "IntakeDraft" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org_nasaem_default',
    "phoneNormalized" TEXT,
    "serviceKind" TEXT,
    "serviceId" TEXT,
    "visaTypeId" TEXT,
    "step" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "travelerCount" INTEGER,
    "notes" TEXT,
    "answers" JSONB,
    "travelers" JSONB,
    "documentTravelerRefs" JSONB,
    "submittedContactRequestId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntakeDraft_token_key" ON "IntakeDraft"("token");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeDraft_submittedContactRequestId_key" ON "IntakeDraft"("submittedContactRequestId");

-- CreateIndex
CREATE INDEX "IntakeDraft_phoneNormalized_idx" ON "IntakeDraft"("phoneNormalized");

-- CreateIndex
CREATE INDEX "IntakeDraft_expiresAt_idx" ON "IntakeDraft"("expiresAt");

-- AlterTable
ALTER TABLE "ContactRequestDocument" ADD COLUMN     "draftId" TEXT,
ALTER COLUMN "contactRequestId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ContactRequestDocument_draftId_idx" ON "ContactRequestDocument"("draftId");

-- AddForeignKey
ALTER TABLE "IntakeDraft" ADD CONSTRAINT "IntakeDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequestDocument" ADD CONSTRAINT "ContactRequestDocument_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "IntakeDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
