# Financial data: diagnostics and remediation proposal

Status: **proposal only.** Nothing in this document has been run against staging or production data.

## What changed in the code

The order financial position is defined in one place: `backend/src/modules/payments/settlement.js`.

| Term | Definition |
|---|---|
| Confirmed paid | Payment rows with `kind = PAYMENT` and `status = PAID`, in the order's currency. |
| Refunded | Rows with `kind = REFUND` and `status = PAID`, plus legacy payment rows recorded with `status = REFUNDED`. |
| Net paid | Confirmed paid − refunded. |
| Outstanding | Order total − net paid, never below 0. |
| Pending | Payments awaiting review. They are never counted as received. |
| `Order.paymentStatus` | The settlement state derived from the figures above: UNPAID / PARTIAL / PAID / REFUNDED. |

The write path and the reports both use these definitions:

- `POST /api/payments`
- `POST /api/payments/:id/confirm`
- `POST /api/payments/:id/refund`
- the order detail, the finance report and the dashboard

The write path enforces these rules:

- **Currency.** A payment's currency defaults to the order's currency. Any other currency is refused with `CURRENCY_MISMATCH`, because there is no approved conversion workflow for payments.
- **Status field.** A payment row can only be recorded as received (`PAID`) or as pending review. "Partial" is a property of the order, not of a payment row.
- **Over-payment.** Refused with `OVERPAYMENT`. There is no customer-credit workflow, so no untracked balance is created.
- **Refunds.** A refund is its own row, linked to the confirmed payment it reverses. It cannot exceed what remains refundable.
- **Concurrency.** Every money write locks the order row (`SELECT … FOR UPDATE`), so concurrent submissions cannot pass the checks twice.
- **Idempotency.** `Idempotency-Key` (unique index plus a request hash) makes a replayed submission return the stored row. Reusing a key for a different request is refused.

## Reading the existing data

Run the read-only diagnostics against a **copy** of the database first:

```
cd backend
DATABASE_URL=<copy> npm run finance:diagnose > finance-diagnostics.json
```

The output contains ids, order numbers and amounts only. It contains no names or phone numbers.

| Section | Meaning | Effect after this release |
|---|---|---|
| `currencyMismatches` | A payment recorded in a different currency from its order. The old UI always sent SAR. | Excluded from balances. Previously these were summed as if equal. |
| `legacyPartialRows` | A payment row labelled `PARTIAL` by the old form. | Not counted, as before. These were probably real partial payments. |
| `legacyRefundedRows` | A payment row labelled `REFUNDED`. | Counted as money returned, as the finance report already did. |
| `statusDrift` | Stored `Order.paymentStatus` ≠ the computed settlement. | The stored value is corrected the next time a payment is recorded on that order. |
| `overpaidOrders` | Net paid > total. | Further payments are refused. |
| `possibleDuplicates` | Same order, amount, currency and method within 5 minutes, without an idempotency key. | Unchanged. Needs human review. |

On the local synthetic test database, the scan found:

- 33 currency mismatches
- 1 legacy PARTIAL row
- 2 legacy REFUNDED rows
- 21 orders with drift
- 12 possible duplicates

Staging and production are **NOT VERIFIED**.

## Proposed remediation (needs the agency owner's and the accountant's decision)

1. Take a backup and confirm that it restores (see `docs/PRODUCTION_RUNBOOK.md`).
2. Review `currencyMismatches` with the accountant. For each row, decide one of two outcomes:
   - **The money was received in the order's currency** and SAR was a UI default. Correct `Payment.currency` to the order's currency.
   - **It really was another currency.** Record the actual conversion outside the system and replace the row with a payment in the order's currency. Keep the original row as rejected, with the conversion noted in `rejectionReason`.
3. Review `legacyPartialRows`. If the money was received, change `status` to `PAID`. The order then becomes PARTIAL or PAID through the normal recalculation.
4. Review `possibleDuplicates` against the bank or cash records. Do not delete a duplicate. Refund it, or mark it rejected with a reason.
5. After the corrections, recompute every order's `paymentStatus` with the settlement function. This can be done in a one-off script run in a transaction. Then run the diagnostics again and expect `statusDrift = 0`.

Every correction should be written to `ActivityLog` with the old and new values.

Steps 2–5 change financial records. They must not run without that sign-off and a verified backup.
