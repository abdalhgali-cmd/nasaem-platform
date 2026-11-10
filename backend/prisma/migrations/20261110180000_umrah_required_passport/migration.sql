-- New Umrah applications need one passport per traveler. No prices, customer
-- records, submitted request snapshots, or other services are changed.
BEGIN;
UPDATE "VisaRequirement" r
SET "required" = true, "active" = true, "type" = 'DOCUMENT', "scope" = 'TRAVELER',
    "attachmentType" = 'umrah_passport', "conditionRequirementId" = NULL,
    "conditionOperator" = NULL, "conditionValue" = NULL, "updatedAt" = CURRENT_TIMESTAMP
FROM "Service" s
WHERE r."serviceId" = s.id AND s.category IN ('umrah', 'UMRAH_PACKAGE', 'umrah_package')
  AND r.type = 'DOCUMENT'
  AND (r.name LIKE '%جواز%' OR r.name ILIKE '%passport%' OR r."attachmentType" ILIKE '%passport%')
  AND (r."attachmentType" = 'umrah_passport' OR concat_ws(' ', r.name, r."attachmentType") !~* 'ضامن|كفيل|guarantor|sponsor');

INSERT INTO "VisaRequirement" (
  id, "serviceId", name, description, required, "attachmentType", "maxFiles",
  "allowedMimeTypes", "maxSizeBytes", "reviewRequired", "ocrEnabled", "sortOrder",
  active, type, scope, "createdAt", "updatedAt"
)
SELECT 'umrah_passport_' || md5(s.id), s.id, 'جواز سفر المعتمر',
  'صورة واضحة لصفحة بيانات جواز كل معتمر.', true, 'umrah_passport', 1,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']::TEXT[],
  10485760, true, false, 10, true, 'DOCUMENT', 'TRAVELER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Service" s
WHERE s.category IN ('umrah', 'UMRAH_PACKAGE', 'umrah_package')
  AND NOT EXISTS (SELECT 1 FROM "VisaRequirement" r WHERE r."serviceId" = s.id AND r."attachmentType" = 'umrah_passport' AND r.type = 'DOCUMENT');
COMMIT;
