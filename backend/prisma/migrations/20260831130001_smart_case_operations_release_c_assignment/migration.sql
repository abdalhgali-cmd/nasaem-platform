-- Smart Case Operations — Release C groundwork (employee case assignment).
--
-- Hand-written, not `prisma migrate dev`'s raw output — same flight_*
-- migration-diff hazard as 20260831130000_smart_case_operations_release_a
-- (see that migration's own comment and tests/migrationIntegrity.test.js).
-- The auto-generated diff also proposed dropping flight_bank_accounts,
-- flight_bookings and flight_inventory; those statements are deliberately
-- excluded below.
--
-- The only real change here: one nullable column on ContactRequest (every
-- existing row is simply unassigned, same as it already implicitly was),
-- its index, and its foreign key to User.

-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "assignedUserId" TEXT;

-- CreateIndex
CREATE INDEX "ContactRequest_assignedUserId_idx" ON "ContactRequest"("assignedUserId");

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
