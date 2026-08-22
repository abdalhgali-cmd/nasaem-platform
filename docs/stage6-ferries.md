# Stage 6 — Ferry Booking Request

- The public ferry page uses the real `SVC-FERRY` service from the public catalog.
- Customers can submit route, travel date, traveler count, preferred carrier, contact details, and notes through one request form.
- The request is stored as a normal `ContactRequest` with structured `intakeData` and `travelerCount` so staff can continue using the existing operational workflow.
- The page does not invent live sailing schedules, seat inventory, or availability; staff confirm the real sailing with the customer.
- Existing tracking, offers/invoices, payment, activity logs, notifications, and deliverables remain reusable for ferry requests.
