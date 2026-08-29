-- Adds UmrahGroup / UmrahGroupMember for the group Umrah batch workflow.
-- Purely additive: two new tables, no changes to any existing table.
--
-- NOTE: `prisma migrate dev` again generated DROP TABLE statements for
-- flight_bookings / flight_inventory / flight_bank_accounts here, for the
-- same reason documented in
-- 20260823132043_add_payment_review_status/migration.sql (those tables are
-- hand-written SQL with no Prisma model, so every schema diff proposes
-- dropping them). Removed by hand, never run — see migrationIntegrity.test.js
-- for the automated guard against this.
-- CreateTable
CREATE TABLE "UmrahGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "travelDate" TIMESTAMP(3),
    "airline" TEXT,
    "hotel" TEXT,
    "transport" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UmrahGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UmrahGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UmrahGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UmrahGroup_code_key" ON "UmrahGroup"("code");

-- CreateIndex
CREATE INDEX "UmrahGroup_travelDate_idx" ON "UmrahGroup"("travelDate");

-- CreateIndex
CREATE INDEX "UmrahGroupMember_groupId_idx" ON "UmrahGroupMember"("groupId");

-- CreateIndex
CREATE INDEX "UmrahGroupMember_customerId_idx" ON "UmrahGroupMember"("customerId");

-- CreateIndex
CREATE INDEX "UmrahGroupMember_orderId_idx" ON "UmrahGroupMember"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "UmrahGroupMember_groupId_customerId_key" ON "UmrahGroupMember"("groupId", "customerId");

-- AddForeignKey
ALTER TABLE "UmrahGroupMember" ADD CONSTRAINT "UmrahGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UmrahGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UmrahGroupMember" ADD CONSTRAINT "UmrahGroupMember_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UmrahGroupMember" ADD CONSTRAINT "UmrahGroupMember_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
