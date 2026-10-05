# Financial model (currency-safe payments)

Status: implemented on `stabilize/production-readiness`. Production data has **not** been migrated or modified.

## The rule

1. An **order is priced in one currency** — `Order.currency` is its settlement currency; `totalAmount` is in that currency.
2. A **payment records what was actually received**: `amount` + `currency`. If `currency` ≠ the order's currency, the staff member must supply `fxRate` (**order-currency units per 1 unit of the payment currency**). The server stores:
   * `fxRate` — `Decimal(18,8)`, an immutable snapshot taken when the payment is recorded;
   * `convertedAmount` — `Decimal(14,2)` = `amount × fxRate`, **half-up, once**, in the order's currency.
   Later changes to exchange rates never rewrite history.
3. If `currency` is omitted it defaults to the **order's** currency (never a hard-coded one).
4. Same-currency payments have `fxRate = 1`, `convertedAmount = amount`. Supplying any other `fxRate` for a same-currency payment is rejected.
5. **Order position** (always in the order's currency, `backend/src/utils/money.js`):
   * `paid = Σ convertedAmount (status PAID)`, `refunded = Σ convertedAmount (status REFUNDED)`
   * `netPaid = max(paid − refunded, 0)`
   * `balanceDue = max(total − netPaid, 0)`, `overpaidAmount = max(netPaid − total, 0)`
   * `paymentStatus`: `PAID` if `netPaid ≥ total`, `PARTIAL` if `netPaid > 0`, else `UNPAID`.
   * A payment with no `convertedAmount` (legacy cross-currency row, see below) counts for nothing and is surfaced as `unreconciledPayments`.
6. **Reports never add different currencies.** `GET /api/finance/reports` returns `totalsByCurrency[]` (one entry per order currency) and a breakdown whose rows each carry a `currency`. There is deliberately no cross-currency grand total. All values are exact decimal strings (`"300.30"`). `paid` is net of refunds.
7. Dashboard "paid today / 7 days / month" is `paidByCurrency` (money received per currency).
8. All arithmetic uses `Decimal` (decimal.js via Prisma). No JavaScript floats are used for money totals.

## Refunds

A refund is a payment row with `status = REFUNDED`; it stores its own `fxRate`/`convertedAmount` and **reduces** the order's net paid amount (previously it was merely ignored, so a refund after a payment left the order "PAID"). A full ledger with separate refund entities, reasons and approvals is Phase 8 work (unified financial ledger).

## Not covered yet (by design)

* `ContactRequest` cases still use `Invoice` (one amount + a four-value `paymentStatus`); they have no payment rows, partial payments or balance. They are to be moved onto the same ledger in Phase 8.
* `OrderItem.supplierCost` has no currency of its own; it is read in the order's currency.
* Flight bookings create their order/payment in the booking currency, so they are same-currency by construction.

## Migration strategy and rollback

Migration `20261005100000_payment_fx_snapshot` is **additive**: two nullable columns and one deterministic backfill (`fxRate = 1`, `convertedAmount = amount` where `Payment.currency = Order.currency`). No amount, currency or status is changed or deleted.

Legacy payments whose currency differs from their order's are **left NULL on purpose** — the historical rate is unknown and inventing one would falsify the books. Before the fix they were summed at face value, so some orders may show a wrong `paymentStatus`.

**Expect some legacy mismatches.** Before this change `POST /api/payments` defaulted `currency` to `SAR` regardless of the order, and the staff payment form had no currency field. Payments recorded for a **non-SAR order** through that form therefore carry `SAR` and will be listed by the audit (they were silently summed at face value). Orders in SAR (the default) and flight-booking payments (created in the booking's own currency) are unaffected.

Rollout:
1. Deploy the migration with the release (safe; additive).
2. On production run the **read-only** audit: `npm run finance:audit` (`--json` for a file). It lists affected payments/orders (ids, amounts, currencies — no customer data).
3. Finance reviews each row and decides the rate to apply (or that the row was entered in the wrong currency).
4. Only after that review, a separately reviewed script applies `fxRate`/`convertedAmount` and recalculates affected orders. **Not part of this change.**
5. Rollback: `ALTER TABLE "Payment" DROP COLUMN "fxRate", DROP COLUMN "convertedAmount";` then redeploy the previous release. The old release ignores the columns.

## API

`POST /api/payments` `{ orderId, amount, currency?, fxRate?, paymentMethod, status?, ... }`
* cross-currency without `fxRate` → `400`; `fxRate ≤ 0` → `400`; same-currency with `fxRate ≠ 1` → `400`.
* Response includes `fxRate` and `convertedAmount`.

`GET /api/orders/:id` additionally returns `paidAmount`, `refundedAmount`, `balanceDue`, `overpaidAmount`, `unreconciledPayments`.

## Tests

`backend/tests/currencySafeFinance.test.js` — same-currency, cross-currency, partial, multiple, overpayment, Decimal rounding (half-up), refunds (same and cross currency), refund-only order, missing/invalid rates, per-currency Decimal-exact report.
