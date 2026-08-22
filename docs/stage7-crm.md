# Stage 7 — CRM

- Customer records support pagination and search by name, passport number, and customer number.
- Customer detail already exposes orders and documents; the CRM milestone now groups service-request history by normalized phone as `contactRequests` so the staff profile can see prior public inquiries alongside completed orders.
- Customer IDs use the atomic sequence utility and duplicate passport errors are returned cleanly.
- The CRM remains read/write staff-only; no new public customer endpoint is introduced.
