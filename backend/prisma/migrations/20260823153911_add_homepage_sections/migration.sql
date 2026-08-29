-- Adds HomepageSection (Platform 3.0 Phase 1: admin-controlled homepage
-- service cards). Purely additive: one new table, no changes to any
-- existing table.
--
-- NOTE: `prisma migrate dev` again generated DROP TABLE statements for
-- flight_bookings / flight_inventory / flight_bank_accounts here — the
-- same recurring cause as every prior migration this project has added
-- (those tables are hand-written SQL with no Prisma model, so every schema
-- diff proposes dropping them). Removed by hand, never run — see
-- migrationIntegrity.test.js for the automated guard.
-- CreateTable
CREATE TABLE "HomepageSection" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "href" TEXT,
    "iconKey" TEXT,
    "imageKey" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomepageSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HomepageSection_key_key" ON "HomepageSection"("key");

-- CreateIndex
CREATE INDEX "HomepageSection_visible_idx" ON "HomepageSection"("visible");

-- CreateIndex
CREATE INDEX "HomepageSection_sortOrder_idx" ON "HomepageSection"("sortOrder");
