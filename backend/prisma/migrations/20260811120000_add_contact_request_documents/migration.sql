-- CreateEnum
CREATE TYPE "ContactRequestDocumentType" AS ENUM ('PASSPORT', 'GUARANTOR_ID', 'ADDITIONAL');
CREATE TYPE "ContactRequestDocumentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "ContactRequestDocument" (
    "id" TEXT NOT NULL,
    "contactRequestId" TEXT NOT NULL,
    "type" "ContactRequestDocumentType" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "status" "ContactRequestDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactRequestDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactRequestDocument_contactRequestId_idx" ON "ContactRequestDocument"("contactRequestId");
CREATE INDEX "ContactRequestDocument_contactRequestId_type_idx" ON "ContactRequestDocument"("contactRequestId", "type");
CREATE INDEX "ContactRequestDocument_status_idx" ON "ContactRequestDocument"("status");

-- AddForeignKey
ALTER TABLE "ContactRequestDocument" ADD CONSTRAINT "ContactRequestDocument_contactRequestId_fkey" FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one row per existing array element, preserving original order
-- via WITH ORDINALITY (used to stagger createdAt so same-type rows have a
-- deterministic, tie-free order — the "needs re-upload" logic in
-- application code relies on createdAt ordering within a type). Uses
-- gen_random_uuid() (core Postgres 13+ builtin, no pgcrypto extension
-- needed) since Prisma's @default(cuid()) is enforced client-side only —
-- a raw INSERT must supply its own id.
--
-- The three deprecated array columns are intentionally NOT dropped here —
-- see schema.prisma's comment on them. A follow-up migration drops them
-- once this backfill is verified against production data.
INSERT INTO "ContactRequestDocument" (id, "contactRequestId", type, "storagePath", status, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  cr.id,
  'PASSPORT'::"ContactRequestDocumentType",
  p.path,
  'PENDING'::"ContactRequestDocumentStatus",
  cr."createdAt" + (p.ord * interval '1 second'),
  cr."createdAt" + (p.ord * interval '1 second')
FROM "ContactRequest" cr
CROSS JOIN LATERAL unnest(cr."passportImagePaths") WITH ORDINALITY AS p(path, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM "ContactRequestDocument" d WHERE d."contactRequestId" = cr.id AND d.type = 'PASSPORT'
);

INSERT INTO "ContactRequestDocument" (id, "contactRequestId", type, "storagePath", status, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  cr.id,
  'GUARANTOR_ID'::"ContactRequestDocumentType",
  g.path,
  'PENDING'::"ContactRequestDocumentStatus",
  cr."createdAt" + (g.ord * interval '1 second'),
  cr."createdAt" + (g.ord * interval '1 second')
FROM "ContactRequest" cr
CROSS JOIN LATERAL unnest(cr."guarantorIdImagePaths") WITH ORDINALITY AS g(path, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM "ContactRequestDocument" d WHERE d."contactRequestId" = cr.id AND d.type = 'GUARANTOR_ID'
);

INSERT INTO "ContactRequestDocument" (id, "contactRequestId", type, "storagePath", status, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  cr.id,
  'ADDITIONAL'::"ContactRequestDocumentType",
  a.path,
  'PENDING'::"ContactRequestDocumentStatus",
  cr."createdAt" + (a.ord * interval '1 second'),
  cr."createdAt" + (a.ord * interval '1 second')
FROM "ContactRequest" cr
CROSS JOIN LATERAL unnest(cr."additionalDocumentPaths") WITH ORDINALITY AS a(path, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM "ContactRequestDocument" d WHERE d."contactRequestId" = cr.id AND d.type = 'ADDITIONAL'
);
