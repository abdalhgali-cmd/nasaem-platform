-- Production safety follow-up for the Egypt Security Approval journey.
-- Some long-lived databases can legitimately be missing the historical seeded
-- passport requirement (seed data is not a migration). The previous migration
-- upgraded an existing passport row, but could not update a row that was absent.
-- This migration is idempotent with respect to business meaning: first normalize
-- any passport-like row that already exists, then create one only when none exists.

-- Normalize an existing passport requirement regardless of whether it was
-- previously identified by its Arabic/English name or attachment type.
UPDATE "VisaRequirement"
SET
  "attachmentType" = 'passport_copy',
  "required" = true,
  "maxFiles" = 1,
  "allowedMimeTypes" = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::TEXT[],
  "maxSizeBytes" = 10485760,
  "reviewRequired" = true,
  "ocrEnabled" = true,
  "sortOrder" = 10,
  "active" = true,
  "type" = 'DOCUMENT',
  "scope" = 'TRAVELER',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "visaTypeId" = (
  SELECT "id" FROM "VisaType" WHERE "code" = 'VISA-EGYPT-CLEARANCE'
)
AND (
  "attachmentType" = 'passport_copy'
  OR LOWER("name") LIKE '%passport%'
  OR "name" LIKE '%جواز%'
);

-- Seed data is not guaranteed to have run on every historical Production DB.
-- Ensure the structured passport requirement therefore exists as migration
-- state, without duplicating a passport-like requirement that is already there.
INSERT INTO "VisaRequirement" (
  "id",
  "visaTypeId",
  "serviceId",
  "name",
  "description",
  "required",
  "attachmentType",
  "maxFiles",
  "allowedMimeTypes",
  "maxSizeBytes",
  "reviewRequired",
  "ocrEnabled",
  "sortOrder",
  "active",
  "type",
  "scope",
  "createdAt",
  "updatedAt"
)
SELECT
  'egypt_clearance_passport_v1',
  vt."id",
  NULL,
  'صورة جواز السفر',
  'ارفع صفحة البيانات التي تحتوي على الصورة والبيانات بوضوح. نقبل صورة أو PDF.',
  true,
  'passport_copy',
  1,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::TEXT[],
  10485760,
  true,
  true,
  10,
  true,
  'DOCUMENT',
  'TRAVELER',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "VisaType" vt
WHERE vt."code" = 'VISA-EGYPT-CLEARANCE'
  AND NOT EXISTS (
    SELECT 1
    FROM "VisaRequirement" vr
    WHERE vr."visaTypeId" = vt."id"
      AND (
        vr."attachmentType" = 'passport_copy'
        OR LOWER(vr."name") LIKE '%passport%'
        OR vr."name" LIKE '%جواز%'
      )
  );
