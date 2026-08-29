# Stages 8–18 implementation state

## 8 — Notifications
Internal activity/notification events and asynchronous WhatsApp notifications are used throughout contact-request pricing, customer decisions, transfer declaration, payment receipt upload, payment confirmation and delivery. Messaging failures do not block the primary workflow.

## 9 — Automatic follow-up
The operations center now calculates `ageHours` for open requests/orders and exposes a `stalled` queue for items waiting 24 hours or more. This is intentionally a derived signal, so reminders can be added later without a schema change.

## 10 — Manager dashboard
Added `/api/dashboard/summary` for SUPER_ADMIN/ADMIN with today, last-7-days and month order/payment summaries plus open contact requests. Profit stays null until a real supplier-cost field/source exists.

## 11 — Quick operations
The operations center already provides direct links to administration, flights and customer tracking. These are kept alongside the unified `nextAction` flow.

## 12 — Documents
Customer-uploaded documents, staff review states and final deliverables are already integrated into ContactRequest tracking and the operations center.

## 13 — Reports
Dashboard financial aggregations already expose sales/payment totals by currency and service. The new summary endpoint adds period-based paid totals without fabricating profit.

## 14 — Permissions
Dashboard summary/stats are restricted to SUPER_ADMIN/ADMIN. Operations supports the existing staff roles. Payment-account management is restricted to SUPER_ADMIN/ADMIN, while customer-facing payment-account data is exposed only through the tracking session.

## 15 — Mobile
Operations, tracking, service intake and booking screens use responsive layouts; the operations table remains horizontally scrollable on narrow screens.

## 16 — Automation
`nextAction` remains the canonical operational decision key. Queue age/stalled detection now gives automation a concrete follow-up trigger without changing request state semantics.

## 17 — Testing
Added dashboard summary/stalled-operation regression coverage. Existing CI tests cover tracking, invoices, offers, documents, deliverables, auto-completion, finance/security and flights.

## 18 — Production Lock
Not declared complete until the single final release verification requested by the operator: CI green, Railway healthy, Vercel READY, database/migrations healthy, domain smoke test, auth/payment/document workflow smoke test and production safety checks.

Trip.com remains deferred until an official API is available.
