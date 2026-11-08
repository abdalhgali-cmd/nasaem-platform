-- Additive database guards (U-08). The application already checks these
-- rules; the guards make a future write path or backfill unable to break them.
--  * A document's traveler must belong to the document's own request.
--  * Every traveler named by a deliverable must belong to its request.
-- They apply to new writes only: existing rows are not touched or validated,
-- so legacy anomalies cannot block the migration. Reversible with DROP TRIGGER
-- / DROP FUNCTION (see the comment at the end).

CREATE OR REPLACE FUNCTION nasaem_guard_document_traveler() RETURNS trigger AS $$
BEGIN
  IF NEW."travelerId" IS NOT NULL THEN
    IF NEW."contactRequestId" IS NULL OR NOT EXISTS (
      SELECT 1 FROM "Traveler" t WHERE t."id" = NEW."travelerId" AND t."contactRequestId" = NEW."contactRequestId"
    ) THEN
      RAISE EXCEPTION 'document traveler does not belong to the document request' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ContactRequestDocument_traveler_guard"
  BEFORE INSERT OR UPDATE OF "travelerId", "contactRequestId" ON "ContactRequestDocument"
  FOR EACH ROW EXECUTE FUNCTION nasaem_guard_document_traveler();

CREATE OR REPLACE FUNCTION nasaem_guard_deliverable_travelers() RETURNS trigger AS $$
BEGIN
  IF COALESCE(array_length(NEW."travelerIds", 1), 0) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM unnest(NEW."travelerIds") AS wanted(id)
      WHERE NOT EXISTS (SELECT 1 FROM "Traveler" t WHERE t."id" = wanted.id AND t."contactRequestId" = NEW."contactRequestId")
    ) THEN
      RAISE EXCEPTION 'deliverable names a traveler outside its request' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ContactRequestDeliverable_travelers_guard"
  BEFORE INSERT OR UPDATE OF "travelerIds", "contactRequestId" ON "ContactRequestDeliverable"
  FOR EACH ROW EXECUTE FUNCTION nasaem_guard_deliverable_travelers();

-- Rollback (not part of the migration):
--   DROP TRIGGER "ContactRequestDocument_traveler_guard" ON "ContactRequestDocument";
--   DROP TRIGGER "ContactRequestDeliverable_travelers_guard" ON "ContactRequestDeliverable";
--   DROP FUNCTION nasaem_guard_document_traveler();
--   DROP FUNCTION nasaem_guard_deliverable_travelers();
