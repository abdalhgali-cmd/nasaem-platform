-- AlterTable: replace the single passportImagePath with one entry per
-- traveler. No real submissions exist yet on this still-unreleased feature,
-- so this drops the old column rather than migrating data.
ALTER TABLE "ContactRequest" DROP COLUMN "passportImagePath";
ALTER TABLE "ContactRequest" ADD COLUMN "passportImagePaths" TEXT[] NOT NULL DEFAULT '{}';
