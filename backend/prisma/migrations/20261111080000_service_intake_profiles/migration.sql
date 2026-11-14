-- Agency intake questions, not a universal consular document list.
-- Preserve administrator fields (including inactive aliases), prices,
-- existing documents, requirement IDs and submitted checklist snapshots.
BEGIN;
WITH spec(kind, code, key, name, description, type, required, options, sort_order, aliases) AS (
VALUES
  ('service', 'SVC-TASHEEL', 'tasheel_application_country', 'بلد تقديم الطلب', 'الدولة التي ستراجع فيها مركز الخدمة.', 'TEXT', true, NULL::jsonb, 1, ARRAY['بلد تقديم الطلب','دولة التقديم','Country of application']::text[]),
  ('service', 'SVC-TASHEEL', 'tasheel_center_city', 'مدينة مركز الخدمة', 'المدينة التي تفضّل حجز الموعد فيها.', 'TEXT', true, NULL::jsonb, 2, ARRAY['مدينة مركز الخدمة','المدينة المطلوبة','مدينة الموعد']::text[]),
  ('service', 'SVC-TASHEEL', 'tasheel_visa_kind', 'نوع التأشيرة المطلوبة', 'لتحديد إجراءات المركز المناسبة لطلبك.', 'SELECT', true, '[{"value":"FAMILY_VISIT","label":"زيارة عائلية"},{"value":"WORK","label":"عمل"},{"value":"RESIDENCE","label":"إقامة"},{"value":"OTHER","label":"نوع آخر — تراجعه الوكالة"}]'::jsonb, 3, ARRAY['نوع التأشيرة المطلوبة','نوع التأشيرة']::text[]),
  ('service', 'SVC-TASHEEL', 'tasheel_preferred_date', 'تاريخ الموعد المفضل', 'تفضيل فقط؛ الموعد لا يصبح مؤكدًا حتى تصلك وثيقة الحجز.', 'DATE', false, NULL::jsonb, 4, ARRAY['تاريخ الموعد المفضل','التاريخ المفضل']::text[]),
  ('visaType', 'VISA-INTERNATIONAL', 'visa_destination_country', 'دولة الوجهة', 'الدولة التي تريد التقدم للحصول على تأشيرتها. تتحدد المستندات النهائية بعد مراجعة ملفك.', 'TEXT', true, NULL::jsonb, 1, ARRAY['دولة الوجهة','الدولة المطلوبة','دولة السفر','Destination country']::text[]),
  ('visaType', 'VISA-INTERNATIONAL', 'visa_application_country', 'بلد تقديم طلب التأشيرة', 'بلد إقامتك أو البلد الذي ستقدم منه طلب التأشيرة.', 'TEXT', true, NULL::jsonb, 2, ARRAY['بلد تقديم طلب التأشيرة','بلد تقديم الطلب','دولة التقديم','Country of application']::text[])
), parents AS (
  SELECT spec.*, s.id AS service_id, v.id AS visa_type_id
  FROM spec
  LEFT JOIN "Service" s ON spec.kind = 'service' AND s.code = spec.code
  LEFT JOIN "VisaType" v ON spec.kind = 'visaType' AND v.code = spec.code
  WHERE s.id IS NOT NULL OR v.id IS NOT NULL
)
INSERT INTO "VisaRequirement" (id, "serviceId", "visaTypeId", name, description, "attachmentType", type, scope, required,
  options, "sortOrder", active, "maxFiles", "allowedMimeTypes", "reviewRequired", "ocrEnabled", "createdAt", "updatedAt")
SELECT 'service_intake_' || md5(coalesce(p.service_id, p.visa_type_id) || ':' || p.key),
  p.service_id, p.visa_type_id, p.name, p.description, p.key, p.type::"RequirementType", 'CASE'::"RequirementScope", p.required,
  p.options, p.sort_order, true, 1, ARRAY[]::TEXT[], true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM parents p
WHERE NOT EXISTS (
  SELECT 1 FROM "VisaRequirement" r
  WHERE ((p.service_id IS NOT NULL AND r."serviceId" = p.service_id) OR (p.visa_type_id IS NOT NULL AND r."visaTypeId" = p.visa_type_id))
    AND (r."attachmentType" = p.key OR EXISTS (SELECT 1 FROM unnest(p.aliases) AS alias(name) WHERE lower(alias.name) = lower(r.name)))
)
ON CONFLICT (id) DO NOTHING;

-- Each person's passport/photo belongs to that person. Contracts and other
-- case documents remain as configured; no old request is reclassified.
UPDATE "VisaRequirement" r
SET scope = 'TRAVELER', "updatedAt" = CURRENT_TIMESTAMP
FROM "VisaType" v
WHERE r."visaTypeId" = v.id AND v.code IN ('VISA-WORK', 'VISA-INTERNATIONAL')
  AND r.type = 'DOCUMENT' AND r.scope <> 'TRAVELER'
  AND concat_ws(' ', r."attachmentType", r.name) ~* 'passport|photo|portrait|جواز|الصورة[[:space:]]+الشخصية';
COMMIT;
