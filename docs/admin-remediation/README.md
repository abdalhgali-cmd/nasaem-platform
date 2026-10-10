# Admin remediation: before/after screenshots

The screenshots were taken with Chromium on the local server, using **synthetic data only**:
- **Before**: base commit `4bb8a73` (PR #81).
- **After**: integration branch `ccr-1bb2ad1a-sa8ylm`.

| Before | After |
|---|---|
| ![](before-employee-phone.png) EMPLOYEE on a phone: only Orders and Customers. Customer requests are unreachable. | ![](after-employee-phone.png) Customer requests, Orders, Flight bookings and Customers. Rows show as cards on small screens. |
| ![](before-flight-bookings.png) Flight bookings page: the CSP blocks the inline script, so the page is empty. | ![](after-flight-bookings.png) External scripts, with search and filters. |
| ![](before-order-payment.png) Payment form: no currency is sent (the server assumes SAR), a free "status" select (PARTIAL was never counted), and a refund row is shown as "paid". | ![](after-order-settlement-refund.png) Settlement in the order's currency, payments and refunds as separate rows, and an overpayment guard. |

Also captured in the after state:
- `after-request-detail.png`: the full customer-request detail.
- `after-database-outage-retry.png`: when the database is down, the session is kept and a retry is offered.
