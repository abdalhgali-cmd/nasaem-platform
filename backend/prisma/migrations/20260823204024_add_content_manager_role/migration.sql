-- Platform 3.0 Phase 15: adds the CONTENT_MANAGER role.
--
-- The flight_bank_accounts / flight_bookings / flight_inventory tables are
-- managed by raw SQL, not Prisma models (see backend/prisma/schema.prisma's
-- header comment and every prior Platform 3.0 migration in this repo).
-- `prisma migrate dev` always proposes dropping them because they have no
-- corresponding Prisma model; those DROP TABLE / DROP CONSTRAINT statements
-- have been manually removed from this file. Only the actual schema change
-- (adding the new enum value) is applied.

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'CONTENT_MANAGER';
