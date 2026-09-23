-- A passport/personal-photo document is owned by each visitor in a Saudi
-- family-visit request. Invitation and sponsor-residency documents remain
-- case-scoped. This is an idempotent data classification change only.
UPDATE "VisaRequirement" AS requirement
SET "scope" = 'TRAVELER'
FROM "VisaType" AS visa_type
WHERE requirement."visaTypeId" = visa_type."id"
  AND visa_type."code" = 'VISA-FAMILY-VISIT'
  AND requirement."name" = 'صورة الجواز والصورة الشخصية'
  AND requirement."scope" <> 'TRAVELER';
