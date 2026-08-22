# Stage 8 — Finance

- Dashboard financial aggregates now expose total sales by currency, non-refunded paid amounts by currency/status, and sales totals grouped by service.
- Payment state recalculation already excludes refunded payments and is executed inside the payment transaction.
- The existing payment API remains the source of truth for individual transactions; the dashboard aggregates are reporting only.
- Profit requires supplier-cost data on each service/order item; the current schema does not invent that cost, so the dashboard does not fabricate profit numbers.
