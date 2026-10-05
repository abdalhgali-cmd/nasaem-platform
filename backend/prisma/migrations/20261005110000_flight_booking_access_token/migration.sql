-- Additive. Customer access to a public flight booking is by an unguessable
-- per-booking token; only its SHA-256 is stored. Existing bookings keep NULL
-- (no token) and are reachable by their owner through a phone-verified
-- tracking session. Rollback: ALTER TABLE flight_bookings DROP COLUMN access_token_hash;
ALTER TABLE flight_bookings ADD COLUMN IF NOT EXISTS access_token_hash TEXT;
