-- Additive: per-pilgrim visa processing state (Umrah). All columns nullable;
-- existing travelers are untouched (null = never set). "Issued" is derived
-- from published files, never stored.
CREATE TYPE "UmrahVisaState" AS ENUM ('PENDING', 'IN_PROGRESS', 'DELAYED', 'REJECTED');
ALTER TABLE "Traveler" ADD COLUMN "visaState" "UmrahVisaState";
ALTER TABLE "Traveler" ADD COLUMN "visaStateReason" TEXT;
ALTER TABLE "Traveler" ADD COLUMN "visaFollowUpAt" TIMESTAMP(3);
ALTER TABLE "Traveler" ADD COLUMN "visaStateChangedAt" TIMESTAMP(3);
ALTER TABLE "Traveler" ADD COLUMN "visaStateChangedBy" TEXT;
-- Rollback: ALTER TABLE "Traveler" DROP COLUMN ...; DROP TYPE "UmrahVisaState";
