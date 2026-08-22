# Stage 2 — Notifications

Goals:
- Centralize customer/staff notification events for flight and service workflows.
- Support internal notifications first and leave WhatsApp/email providers behind adapters.
- Avoid duplicate sends by using an idempotency/event key.
- Record delivery status without blocking the business workflow.
