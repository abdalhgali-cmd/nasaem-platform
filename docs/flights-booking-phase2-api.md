# Flight Booking API contract

Public:
- `POST /api/flight-bookings` — create booking request.
- `GET /api/flight-bookings/:idOrNumber` — customer booking status.
- `GET /api/flight-bookings/bank-accounts` — active agency bank accounts.
- `GET /api/flight-bookings/:idOrNumber/file/provisional` — provisional ticket.
- `POST /api/flight-bookings/:idOrNumber/payment-receipt` — upload bank receipt.
- `GET /api/flight-bookings/:idOrNumber/file/final` — final ticket.

Staff:
- `GET /api/flight-bookings/admin/list`
- `POST /api/flight-bookings/:id/provisional-ticket`
- `POST /api/flight-bookings/:id/confirm-payment`
- `POST /api/flight-bookings/:id/final-ticket`
- `GET/POST /api/flight-bookings/admin/bank-accounts`
