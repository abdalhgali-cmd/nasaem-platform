# Staff role matrix (back-office)

The backend's `requireRole(...)` checks are authoritative. The back-office (`backend/public/assets/admin-dashboard.js`, `ROLE_TABS` and the per-view `*_ROLE_CAN` maps) only hides controls that a role would be refused anyway.

Every row is also scoped to the user's organization. A record from another organization reads as "not found".

## Sections visible per role

| Section | SUPER_ADMIN | ADMIN | EMPLOYEE | ACCOUNTANT | CONTENT_MANAGER |
|---|---|---|---|---|---|
| Overview (stats) | ✓ | ✓ | – | – | – |
| Customer requests (ContactRequest) | ✓ | ✓ | ✓ | read (payment context) | – |
| Orders | ✓ | ✓ | ✓ | ✓ | – |
| Flight bookings | ✓ | ✓ | ✓ | ✓ | – |
| Customers | ✓ | ✓ | ✓ | ✓ | – |
| Payments list | ✓ | ✓ | – | ✓ | – |
| Management (configuration) | ✓ | ✓ (no branches/suppliers/user creation) | – | – | content panels only |

## Actions

| Action | Roles | Enforced in |
|---|---|---|
| Customer request: change status, close with outcome | SUPER_ADMIN, ADMIN, EMPLOYEE | `contact-requests.routes.js` PATCH `/:id/status` and the transition rules in the service |
| Customer request: re-open a closed request (reason required) | SUPER_ADMIN, ADMIN | the service (`REOPEN_ROLES`) |
| Customer request: assign responsible staff | SUPER_ADMIN, ADMIN | PATCH `/:id/assign` |
| Customer request: review documents, set price/offers, deliver files, notes | SUPER_ADMIN, ADMIN, EMPLOYEE | the respective routes |
| Customer request: confirm payment | SUPER_ADMIN, ADMIN, ACCOUNTANT | POST `/:id/confirm-payment` |
| Order: change status (state machine), assign | SUPER_ADMIN, ADMIN, EMPLOYEE | `orders.routes.js` |
| Order: record payment, confirm/reject pending payment, refund | SUPER_ADMIN, ADMIN, ACCOUNTANT | `payments.routes.js` |
| Flight booking: provisional ticket, final ticket | SUPER_ADMIN, ADMIN, EMPLOYEE | `flight-bookings.routes.js` |
| Flight booking: confirm customer payment | SUPER_ADMIN, ADMIN, ACCOUNTANT | `flight-bookings.routes.js` |
| Flights catalogue, FX rates, flight payment accounts | SUPER_ADMIN, ADMIN | `flights.routes.js`, `flight-bookings.routes.js` |
| Users: list, read, change status | SUPER_ADMIN, ADMIN (only a SUPER_ADMIN may change a SUPER_ADMIN) | `users.routes.js`, `users.service.js` |
| Users: create, change role | SUPER_ADMIN | `users.routes.js` |

## Design rules
- **Separation of duties.** Operational access (EMPLOYEE) never includes confirming that money was received. Finance access (ACCOUNTANT) never includes changing a request's status, documents or pricing.
- **Last administrator.** No one can deactivate or lower their own account. The last active SUPER_ADMIN of an organization can be neither suspended nor demoted.
