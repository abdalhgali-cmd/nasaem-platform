-- Superseded by 20260822000000_flight_booking_workflow.
-- The earlier migration already creates the runtime flight_bookings and
-- flight_bank_accounts tables used by the current raw-SQL flight workflow.
-- This migration is intentionally a no-op so a fresh database does not try
-- to create those tables a second time. Existing deployments that already
-- recorded this migration remain unchanged.
SELECT 1;
