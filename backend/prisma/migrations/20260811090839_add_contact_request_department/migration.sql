-- CreateEnum
CREATE TYPE "ContactRequestDepartment" AS ENUM ('VISAS', 'FLIGHTS', 'UMRAH', 'HOTELS_PACKAGES', 'FERRY');

-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "department" "ContactRequestDepartment";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "department" "ContactRequestDepartment";

-- CreateIndex
CREATE INDEX "ContactRequest_department_idx" ON "ContactRequest"("department");

-- CreateIndex
CREATE INDEX "User_department_idx" ON "User"("department");

-- Backfill: mirrors deriveContactRequestDepartment() in
-- contact-request-department.js exactly — keep both in sync if this
-- mapping ever changes. Any existing `service` string not covered below
-- (e.g. "استفسار آخر", NULL, or free-form values from before this mapping
-- existed) is left NULL, identical to how a brand-new unmapped request is
-- treated going forward.
UPDATE "ContactRequest"
SET "department" = CASE "service"
  WHEN 'طيران' THEN 'FLIGHTS'
  WHEN 'حجز طيران' THEN 'FLIGHTS'
  WHEN 'عمرة' THEN 'UMRAH'
  WHEN 'باقة عمرة' THEN 'UMRAH'
  WHEN 'تأشيرة' THEN 'VISAS'
  WHEN 'فندق' THEN 'HOTELS_PACKAGES'
  WHEN 'حجز فندق' THEN 'HOTELS_PACKAGES'
  WHEN 'باقة سفر شاملة' THEN 'HOTELS_PACKAGES'
  WHEN 'حجز العبارات' THEN 'FERRY'
  ELSE NULL
END::"ContactRequestDepartment";
