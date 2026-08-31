-- Egypt Security Approval is intentionally approval-first: a customer can
-- submit the approval request months before travel. The flight/border booking
-- therefore must NOT block the initial approval case. Travel/circular details
-- are collected later on the same case.

-- 1) Make the passport requirement the only initial document requirement,
--    mark it as traveler-owned, and enable the existing passport OCR helper.
UPDATE "VisaRequirement"
SET
  "attachmentType" = 'passport_copy',
  "scope" = 'TRAVELER',
  "ocrEnabled" = true,
  "required" = true,
  "active" = true,
  "sortOrder" = 10,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "visaTypeId" = (
  SELECT "id" FROM "VisaType" WHERE "code" = 'VISA-EGYPT-CLEARANCE'
)
AND (LOWER("name") LIKE '%passport%' OR "name" LIKE '%جواز%');

-- 2) A ticket/booking is a later circular-stage document, not an initial
--    approval requirement. Deactivate the legacy seeded row instead of
--    deleting it so historical references remain safe.
UPDATE "VisaRequirement"
SET
  "active" = false,
  "required" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "visaTypeId" = (
  SELECT "id" FROM "VisaType" WHERE "code" = 'VISA-EGYPT-CLEARANCE'
)
AND ("name" LIKE '%تذكرة%' OR LOWER("name") LIKE '%booking%' OR LOWER("name") LIKE '%ticket%');

-- 3) Entry mode is part of the approval itself and is deterministic business
--    data. Store it as a structured SELECT requirement so it is included in
--    the point-in-time requirements snapshot and readiness calculation.
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
  "reviewRequired",
  "ocrEnabled",
  "sortOrder",
  "active",
  "type",
  "scope",
  "options",
  "createdAt",
  "updatedAt"
)
SELECT
  'egypt_clearance_entry_mode_v1',
  vt."id",
  NULL,
  'طريقة الدخول إلى مصر',
  'اختر طريقة دخولك المتوقعة إلى مصر. يمكن تحديد موعد السفر لاحقًا.',
  true,
  'egypt_entry_mode',
  1,
  ARRAY[]::TEXT[],
  false,
  false,
  20,
  true,
  'SELECT',
  'TRAVELER',
  '[{"value":"AIR","label":"منفذ جوي"},{"value":"BORDER","label":"منفذ بري"}]'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "VisaType" vt
WHERE vt."code" = 'VISA-EGYPT-CLEARANCE'
  AND NOT EXISTS (
    SELECT 1
    FROM "VisaRequirement" vr
    WHERE vr."visaTypeId" = vt."id"
      AND vr."attachmentType" = 'egypt_entry_mode'
  );
