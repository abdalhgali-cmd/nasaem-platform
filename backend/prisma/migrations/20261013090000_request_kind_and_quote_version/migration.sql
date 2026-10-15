-- What a request is (service application or inquiry), recorded at
-- submission from now on. Existing rows stay NULL: they are not
-- reclassified (see docs/WORKFLOW-POLICY.md, "legacy records").
ALTER TABLE "ContactRequest" ADD COLUMN "requestKind" TEXT;

-- Explicit quote version for customer price decisions. Existing prices
-- start at version 1; every revision increments it.
ALTER TABLE "Invoice" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
