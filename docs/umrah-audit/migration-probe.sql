-- Synthetic-only proof of the small additive example in D-database.md.
-- This is not a production migration. Everything rolls back.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'nasaem_umrah_restore' THEN
    RAISE EXCEPTION 'Requires dedicated audit restore database';
  END IF;
END $$;
ALTER TABLE "ContactRequest" ADD COLUMN "serviceSnapshot" JSONB;
ALTER TABLE "ContactRequestDocument" ADD CONSTRAINT "document_one_owner"
  CHECK (("contactRequestId" IS NOT NULL) <> ("draftId" IS NOT NULL)) NOT VALID;
ALTER TABLE "IntakeDraft" ADD CONSTRAINT "draft_submitted_request_fk"
  FOREIGN KEY ("submittedContactRequestId") REFERENCES "ContactRequest"("id")
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE "ContactRequestDocument" VALIDATE CONSTRAINT "document_one_owner";
ALTER TABLE "IntakeDraft" VALIDATE CONSTRAINT "draft_submitted_request_fk";
DO $$ BEGIN
  BEGIN
    INSERT INTO "ContactRequestDocument" (id,label,"fileName","storagePath","mimeType","sizeBytes","updatedAt")
    VALUES ('audit-orphan-probe','synthetic','synthetic.pdf','audit/none','application/pdf',1,now());
    RAISE EXCEPTION 'Orphan unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: owner CHECK refuses orphan';
  END;
  BEGIN
    INSERT INTO "IntakeDraft" (id,token,"expiresAt","updatedAt","submittedContactRequestId")
    VALUES ('audit-draft-probe','synthetic-noncredential',now(),now(),'audit-missing-request');
    RAISE EXCEPTION 'Dangling reference unexpectedly accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: submitted request FK refuses dangling reference';
  END;
END $$;
ROLLBACK;
SELECT count(*) AS additive_columns_after_rollback
FROM information_schema.columns
WHERE table_name = 'ContactRequest' AND column_name = 'serviceSnapshot';
