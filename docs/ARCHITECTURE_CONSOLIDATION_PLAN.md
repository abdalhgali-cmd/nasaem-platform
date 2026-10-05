# Architecture consolidation plan (Phase 8 — evaluation only)

**Nothing in this document has been implemented.** It follows the brief: consolidate, do not rewrite; do not rename `ContactRequest` yet; protect production data. Each item lists the evidence, a recommendation, the order, the risk and the rollback. All counts come from the stabilization branch.

Already consolidated during stabilization (so the plan below starts from here): phone-ownership proof is one shared service (`utils/phoneVerification.js`); money arithmetic is one module (`utils/money.js`); upload validation is the shared magic-byte validator (now also used by flight bookings); payment conversion has one rule (`docs/FINANCIAL_MODEL.md`).

---

## 1. Customer identity

**Today, four identity mechanisms:**

| Mechanism | Proves | Stored | Used by |
|---|---|---|---|
| Customer account (password) | knowledge of a password; now **bound to a verified phone at registration** | `Customer.passwordHash` | web `/account`, coupons, portal |
| Tracking session (WhatsApp OTP) | possession of a phone, 30-day token | `ContactRequestLoginCode` (**plaintext** code), JWT `scope: tracking` | web `/track`, **mobile app**, flight-booking fallback |
| Booking access token | possession of a link/token | SHA-256 in `flight_bookings` | flight booking page |
| Staff session | knowledge of a password | `User.passwordHash`, JWT | admin |

Remaining duplication: **two OTP stores** (`ContactRequestLoginCode` plaintext vs `PhoneVerification` hashed) and a **third** in `Customer.passwordResetCode` (plaintext); all three JWT families share one `JWT_SECRET`, separated only by a `scope` claim (staff now rejects any scoped token).

**Recommendation (in order)**
1. Move tracking login and password reset onto `PhoneVerification` (purposes `TRACKING_LOGIN`, `PASSWORD_RESET`). Blocker: the Playwright helper `readTrackingLoginCode()` and 3 suites read the plaintext table. Replace that with the API's `debugCode` (already returned in `development`/`test`) and a request made by the helper itself. Then drop the plaintext columns in a *later* release (data-destructive → separate, reviewed migration).
2. Use separate signing secrets (or `iss`/`aud` claims verified on every path) per token family, so a key/algorithm slip cannot cross families.
3. Offer "log in with phone OTP" as the primary customer login (the mobile app and `/track` already work this way) and keep the password as an optional convenience attached to the **verified** phone.
4. Do **not** merge tracking into accounts yet: tracking works for customers who never register, which is the common case.

**Risk:** medium (touches login). **Rollback:** feature-flag the new store; the old table stays until step 1 has run a full release.

## 2. Business case model — `ContactRequest`

**Evidence:** `ContactRequest` is the real service/case entity (intake JSON, travelers, documents, offers, invoice, deliverables, tasks, notes, provider submissions) and is referenced **616 times in backend source+schema, 30 in web, in 40 backend test files**. Its name describes the original contact form. Its `status` has only `NEW | CONTACTED | CLOSED`; readiness/queues are *computed*; there is no human case number (the cuid is the customer-visible id).

**Recommendation:** **do not rename the table or model.** A rename is a 700-reference change with no behaviour gain and real migration risk. Instead:
1. Add a human **case number** (`CaseNumber`, sequence-backed like `Order`), searchable (search already matches id prefix) and shown to customers/staff.
2. Add a `CaseStatusHistory` table (who/when/from/to, written in the same place status changes are applied) instead of reconstructing history from the activity log.
3. Introduce the name "Case" only at the edges (API response alias, UI copy, a TypeScript type alias); keep the Prisma model name until a major release.
4. Treat `Order` (legacy ERP-style) and `ContactRequest` as two *views* of one customer purchase and link them (`ContactRequest.orderId?`) rather than merging.

**Risk:** low–medium. **Rollback:** additive columns/tables only.

## 3. Unified financial ledger

**Evidence:** two payment concepts. `Order → Payment[]` (amount, currency, fx snapshot, review status, refunds) vs `ContactRequest → Invoice` (one amount + currency, a single status) with `ContactRequest.paymentStatus` (4 values) and receipts stored as documents. Cases therefore have **no payment rows, no partial payments, no remaining balance, no refund record, no history**.

**Recommendation:** evolve `Payment` into the ledger instead of adding a third model:
1. Add nullable `Payment.contactRequestId` (+ index) and a `kind` (`PAYMENT | REFUND | ADJUSTMENT`); relax `orderId` to nullable with a CHECK that exactly one of `orderId`/`contactRequestId` is set. Additive.
2. Case price = `Invoice` (or a new `CaseCharge`) in a **settlement currency**; `balanceDue` computed with the same `summarizeOrderPayments` rule already tested.
3. Customer receipt upload creates a `PENDING` ledger entry (the `reviewStatus` machinery exists); staff confirm/reject as for orders; `ContactRequest.paymentStatus` becomes **derived** from the ledger.
4. Refund = a `REFUND` entry (own reason, approver, FX snapshot); stop encoding refunds as `status = REFUNDED` on the original row.
5. One finance report over the ledger (already per-currency). Back-fill case history from `paymentConfirmedAt` only after finance review.

**Risk:** high (money). **Rollback:** dual-write for one release, read from the old fields until the ledger matches; the audit script pattern (`finance:audit`) is reused to compare.

## 4. Data access (flights)

**Evidence:** `flight_inventory`, `flight_bookings`, `flight_bank_accounts` have **no Prisma models**; 23 `$queryRawUnsafe/$executeRawUnsafe` call sites (all parameterized — no injection found — but untyped and unreviewed by Prisma). The SQL migrations create them with `IF NOT EXISTS`.

**Recommendation:** model the three tables in `schema.prisma` with `@@map`/`@map` (introspect with `prisma db pull` against a copy), keep the existing SQL migrations as the source of truth (add a baselining migration `prisma migrate resolve`), then move queries behind a small repository per table, starting with `flight_bank_accounts` (smallest), then `flight_inventory`, then `flight_bookings` (JSONB `passengers`, `Decimal`). Remove `$queryRawUnsafe` last.

**Risk:** medium. **Rollback:** each table is migrated independently; revert one module at a time.

## 5. Shared definitions (web ↔ mobile ↔ backend)

**Evidence of drift:**
* currency list: `backend/src/utils/enums.js` (8 codes), a `z.enum([...])` in the tracking validators, hard-coded lists in `service-manager.tsx`, `umrah-package-manager.tsx` and both copies of the legacy `admin-dashboard.js`;
* Arabic status labels re-declared in ≥10 files (backend services; web `case-workspace`, `operations-center`, `approvals-manager`, `account-dashboard`, `flight-booking-client`, …);
* upload rules (types, 10 MB) in `upload.middleware.js`, `flight-bookings.routes.js`, `flights.routes.js` and now `mobile/src/utils/uploadRules.ts`;
* two copies of the legacy admin (`frontend/` and `web/public/assets/`).

**Recommendation:** a plain TypeScript package `packages/shared` (no build step: `tsc --noEmit`-checked sources, consumed through path aliases; Metro `watchFolders` for Expo) exporting: `CURRENCIES`, status enums + Arabic labels, upload rules, phone normalization, date validators, and the API response types / zod schemas. Migrate one export at a time, starting with currencies and upload rules (smallest blast radius). Delete the duplicated legacy admin copy once the Next.js admin covers its functions.

**Risk:** low. **Rollback:** per export.

---

## Suggested order

1. (done) stabilization commits. 2. Case number + `CaseStatusHistory` (low risk, high operational value). 3. Shared currency/upload/status definitions. 4. Tracking/reset onto `PhoneVerification`. 5. Flight Prisma models + repositories. 6. Case ledger (dual-write). Each step is independently shippable and reversible.
