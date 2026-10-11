-- Stable identifier for specific system tasks (Egypt travel-plan tasks),
-- so code no longer recognises them by their Arabic title.
ALTER TABLE "CaseTask" ADD COLUMN "systemKey" TEXT;
CREATE INDEX "CaseTask_systemKey_idx" ON "CaseTask"("systemKey");

-- Existing Egypt travel tasks (any status) get their key from the exact
-- titles the travel-plan service has always used. Nothing else changes.
UPDATE "CaseTask" SET "systemKey" = 'EGYPT_TRAVEL_BOOKING_AIR'
  WHERE "source" = 'SYSTEM' AND "systemKey" IS NULL AND "title" = 'ترتيب حجز طيران للموافقة الأمنية لمصر';
UPDATE "CaseTask" SET "systemKey" = 'EGYPT_TRAVEL_BOOKING_BORDER'
  WHERE "source" = 'SYSTEM' AND "systemKey" IS NULL AND "title" = 'ترتيب رحلة برية للموافقة الأمنية لمصر';
UPDATE "CaseTask" SET "systemKey" = 'EGYPT_TRAVEL_CIRCULAR'
  WHERE "source" = 'SYSTEM' AND "systemKey" IS NULL AND "title" = 'تجهيز تعميم الموافقة الأمنية لمصر';
