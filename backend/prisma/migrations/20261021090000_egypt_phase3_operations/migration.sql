-- Phase 3: staff priority on requests and deduplicated operational alerts.
-- Additive only: one column with a default (existing rows become NORMAL) and
-- one new table. Older app code ignores both, so rolling back the app is safe.
ALTER TABLE "ContactRequest" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL';

CREATE TABLE "OperationalAlert" (
    "id" TEXT NOT NULL,
    "contactRequestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cycleKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationalAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalAlert_contactRequestId_kind_cycleKey_key" ON "OperationalAlert"("contactRequestId", "kind", "cycleKey");
CREATE INDEX "OperationalAlert_kind_createdAt_idx" ON "OperationalAlert"("kind", "createdAt");

ALTER TABLE "OperationalAlert" ADD CONSTRAINT "OperationalAlert_contactRequestId_fkey" FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
