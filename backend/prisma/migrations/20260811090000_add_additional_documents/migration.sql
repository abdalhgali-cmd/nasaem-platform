-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN "additionalDocumentPaths" TEXT[] NOT NULL DEFAULT '{}';
