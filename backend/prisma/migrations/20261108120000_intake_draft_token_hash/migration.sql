-- Additive and reversible: new drafts store only a SHA-256 hash of their
-- bearer token. Existing rows keep their plaintext token (still accepted) and
-- get a hash lazily when next used; clearing old plaintext is a separate,
-- explicitly approved step.
ALTER TABLE "IntakeDraft" ALTER COLUMN "token" DROP NOT NULL;
ALTER TABLE "IntakeDraft" ADD COLUMN "tokenHash" TEXT;
CREATE UNIQUE INDEX "IntakeDraft_tokenHash_key" ON "IntakeDraft"("tokenHash");
