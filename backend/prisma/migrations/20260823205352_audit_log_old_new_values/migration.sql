-- Platform 3.0 Phase 16: adds ActivityLog.oldValue/newValue for
-- before/after capture on sensitive configuration changes.
--
-- The flight_bank_accounts / flight_bookings / flight_inventory tables are
-- managed by raw SQL, not Prisma models (see backend/prisma/schema.prisma's
-- header comment and every prior Platform 3.0 migration in this repo).
-- `prisma migrate dev` always proposes dropping them because they have no
-- corresponding Prisma model; those DROP TABLE / DROP CONSTRAINT statements
-- have been manually removed from this file. Only the actual schema change
-- is applied.

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "newValue" JSONB,
ADD COLUMN     "oldValue" JSONB;
