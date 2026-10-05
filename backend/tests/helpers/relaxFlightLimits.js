// Imported BEFORE the app so the flight-booking limiters read these values.
// Used by suites that create many bookings in one process; the dedicated
// rate-limit suite (flightBookingRateLimit.test.js) leaves the defaults alone.
process.env.FLIGHT_BOOKING_CREATE_LIMIT = "1000";
process.env.FLIGHT_BOOKING_BAD_TOKEN_LIMIT = "1000";
process.env.FLIGHT_BOOKING_UPLOAD_LIMIT = "1000";
