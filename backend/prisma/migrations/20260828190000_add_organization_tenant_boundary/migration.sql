-- Introduce the first explicit tenant boundary without changing the ownership
-- of any existing production row. All existing data belongs to Nasaem.
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

INSERT INTO "Organization" ("id", "slug", "name", "active", "updatedAt")
VALUES ('org_nasaem_default', 'nasaem-alharamain', 'نسائم الحرمين للسفر والسياحة', true, CURRENT_TIMESTAMP);

ALTER TABLE "Branch" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org_nasaem_default';
ALTER TABLE "User" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org_nasaem_default';
ALTER TABLE "Customer" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org_nasaem_default';
ALTER TABLE "Order" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org_nasaem_default';
ALTER TABLE "ContactRequest" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org_nasaem_default';

CREATE INDEX "Branch_organizationId_idx" ON "Branch"("organizationId");
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX "Customer_organizationId_idx" ON "Customer"("organizationId");
CREATE INDEX "Order_organizationId_idx" ON "Order"("organizationId");
CREATE INDEX "ContactRequest_organizationId_idx" ON "ContactRequest"("organizationId");

ALTER TABLE "Branch" ADD CONSTRAINT "Branch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Consistency guards prevent a child record from claiming a different tenant
-- than its owning customer, even if a future application bug omits a filter.
CREATE OR REPLACE FUNCTION enforce_order_organization_match()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Customer"
    WHERE "id" = NEW."customerId"
      AND "organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Order organization must match customer organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Order_organization_match"
BEFORE INSERT OR UPDATE OF "customerId", "organizationId" ON "Order"
FOR EACH ROW EXECUTE FUNCTION enforce_order_organization_match();

CREATE OR REPLACE FUNCTION enforce_contact_request_organization_match()
RETURNS trigger AS $$
BEGIN
  IF NEW."customerId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Customer"
    WHERE "id" = NEW."customerId"
      AND "organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'ContactRequest organization must match customer organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ContactRequest_organization_match"
BEFORE INSERT OR UPDATE OF "customerId", "organizationId" ON "ContactRequest"
FOR EACH ROW EXECUTE FUNCTION enforce_contact_request_organization_match();
