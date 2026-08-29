-- Closes the last organization-isolation gap from the tenant-boundary
-- inventory: ActivityLog had no organizationId at all, so GET
-- /api/activity-logs (SUPER_ADMIN/ADMIN) returned every organization's
-- activity history mixed together. All existing rows belong to Nasaem.
ALTER TABLE "ActivityLog" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org_nasaem_default';

CREATE INDEX "ActivityLog_organizationId_idx" ON "ActivityLog"("organizationId");

ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
