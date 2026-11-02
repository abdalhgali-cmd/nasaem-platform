-- Umrah checklist: the personal photo is no longer requested; the guarantor's
-- residence permit («إقامة الضامن») is. Non-destructive and idempotent:
--  * the personal-photo requirement is deactivated, never deleted, so every
--    document already uploaded against it keeps its requirement and label;
--  * «إقامة الضامن» is added once per Umrah item that has no guarantor
--    residence requirement yet (VISA-UMRAH already has «صورة إقامة الضامن»).
-- Umrah items: the Umrah service (SVC-UMRAH / category "umrah"), every Umrah
-- package (category UMRAH_PACKAGE) and every Umrah visa type (category UMRAH).
-- Generic travel packages and other visas are untouched.

UPDATE "VisaRequirement" vr
SET "active" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE vr."active" = true
  AND vr."type" = 'DOCUMENT'
  AND vr."name" LIKE '%الصورة الشخصية%'
  AND vr."name" NOT LIKE '%جواز%'
  AND (
    vr."serviceId" IN (SELECT s."id" FROM "Service" s WHERE s."code" = 'SVC-UMRAH' OR s."category" IN ('umrah', 'UMRAH_PACKAGE'))
    OR vr."visaTypeId" IN (SELECT v."id" FROM "VisaType" v WHERE v."code" = 'VISA-UMRAH' OR v."category" = 'UMRAH')
  );

INSERT INTO "VisaRequirement" (
  "id", "visaTypeId", "serviceId", "name", "description", "required", "attachmentType",
  "maxFiles", "allowedMimeTypes", "maxSizeBytes", "reviewRequired", "ocrEnabled",
  "sortOrder", "active", "type", "scope", "createdAt", "updatedAt"
)
SELECT
  'umrah_guarantor_res_s_' || md5(s."id"),
  NULL,
  s."id",
  'إقامة الضامن',
  'صورة واضحة لإقامة الضامن في السعودية (صورة أو PDF).',
  true,
  'guarantor_residence',
  1,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::TEXT[],
  10485760,
  true,
  false,
  50,
  true,
  'DOCUMENT',
  'CASE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Service" s
WHERE (s."code" = 'SVC-UMRAH' OR s."category" IN ('umrah', 'UMRAH_PACKAGE'))
  AND NOT EXISTS (
    SELECT 1 FROM "VisaRequirement" vr
    WHERE vr."serviceId" = s."id" AND vr."name" LIKE '%إقامة الضامن%'
  );

INSERT INTO "VisaRequirement" (
  "id", "visaTypeId", "serviceId", "name", "description", "required", "attachmentType",
  "maxFiles", "allowedMimeTypes", "maxSizeBytes", "reviewRequired", "ocrEnabled",
  "sortOrder", "active", "type", "scope", "createdAt", "updatedAt"
)
SELECT
  'umrah_guarantor_res_v_' || md5(v."id"),
  v."id",
  NULL,
  'إقامة الضامن',
  'صورة واضحة لإقامة الضامن في السعودية (صورة أو PDF).',
  true,
  'guarantor_residence',
  1,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::TEXT[],
  10485760,
  true,
  false,
  50,
  true,
  'DOCUMENT',
  'CASE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "VisaType" v
WHERE (v."code" = 'VISA-UMRAH' OR v."category" = 'UMRAH')
  AND NOT EXISTS (
    SELECT 1 FROM "VisaRequirement" vr
    WHERE vr."visaTypeId" = v."id" AND vr."name" LIKE '%إقامة الضامن%'
  );
