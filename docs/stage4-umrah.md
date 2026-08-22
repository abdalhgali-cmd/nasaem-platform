# Stage 4 — Umrah

- Public Umrah page uses real catalog-backed service codes.
- Package cards deep-link to the selected package in the intake wizard.
- Umrah package services are seeded idempotently.
- Package requests preserve service IDs, traveler data, and document uploads through the existing intake workflow.
- Existing tracking, invoice/payment, activity, notifications, and deliverables infrastructure remains the operational back-office flow.
- Trip.com remains deferred.
