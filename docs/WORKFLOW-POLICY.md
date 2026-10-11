# Customer request workflow policy

Source of truth: `backend/src/modules/contact-request-workflow/workflow-policy.js` (pure, unit-tested) and `workflow-lock.js` (row lock + in-transaction audit). Every mutation of a customer request (staff back-office, Next.js admin, phone tracking, customer account, Egypt travel plan) asks `checkAction(action, request)` on the request as stored **under its row lock**, and every screen offers only the actions listed in `allowedActions` returned with the request.

A refused action answers **409** (400 for invalid input such as coverage) with `{ code, message (Arabic), reasons? }`.

## Allowed actions

| Action | Who | Allowed when (request open, i.e. `status ≠ CLOSED`, for all except REOPEN) |
|---|---|---|
| Issue / revise single price (`ISSUE_QUOTE`) | EMPLOYEE, ADMIN, SUPER_ADMIN | QUOTE requests only (`FIXED_PRICE` otherwise); not already approved by the customer; no multi-carrier offers |
| Add offer (`ADD_OFFER`) | same | QUOTE requests only; no single price; no offer selected yet |
| Approve / reject price (`APPROVE_QUOTE`, `REJECT_QUOTE`) | customer (phone tracking) | price `PENDING` **and** `invoiceVersion` equal to the stored `Invoice.version` (the version displayed). Missing → `QUOTE_VERSION_REQUIRED`; not a positive integer → `QUOTE_VERSION_INVALID`; older → `QUOTE_CHANGED`. All 409, Arabic, telling the customer to refresh/update; nothing changes and nothing is announced |
| Select offer (`SELECT_OFFER`) | customer | offers exist, none selected |
| Declare transfer / upload receipt (`DECLARE_TRANSFER`, `UPLOAD_RECEIPT`) | customer | payment `AWAITING_TRANSFER` (declaring again while `UNDER_REVIEW` is an idempotent repeat); for a FIXED price with payment after document review, only once readiness is complete (`PAYMENT_AFTER_DOCUMENT_REVIEW`) |
| Accept / reject receipt (`CONFIRM_PAYMENT`, `REJECT_PAYMENT`) | ACCOUNTANT, ADMIN, SUPER_ADMIN | payment `UNDER_REVIEW` |
| Upload document (`UPLOAD_DOCUMENT`) | customer | open |
| Review document (`REVIEW_DOCUMENT`) | EMPLOYEE, ADMIN, SUPER_ADMIN | open; not a payment receipt (decided in the payment step) |
| Start execution (`START_EXECUTION`) | EMPLOYEE, ADMIN, SUPER_ADMIN | payment `CONFIRMED`; readiness complete (below); not started |
| Correct an accidental start (`REVERT_EXECUTION`) | ADMIN, SUPER_ADMIN, written reason | started; no final file published yet |
| Prepare final file (draft) (`PREPARE_DELIVERABLE`) | EMPLOYEE, ADMIN, SUPER_ADMIN | open |
| Publish final file (`PUBLISH_DELIVERABLE`) | same | payment `CONFIRMED`; execution recorded; the file not yet published; valid traveler coverage |
| Save Egypt travel plan (`SAVE_TRAVEL_PLAN`) | customer | Egypt clearance visa type; open |
| Complete (`COMPLETE`) | EMPLOYEE, ADMIN, SUPER_ADMIN | completion policy (below) |
| Cancel / reject (`CLOSE`) | same | open; after a confirmed payment a note on how the money is handled is required |
| Reopen (`REOPEN`) | ADMIN, SUPER_ADMIN, written reason, audited | closed |

Closing an already closed request again (re-labelling its outcome) is refused (`ALREADY_CLOSED`): reopen (audited) and close again. No other operation reopens a request.

**Closed requests stay readable:** the customer still lists and downloads its documents and published files; staff still read everything, add internal notes, and see the audit trail. No refund record exists for customer requests; the refund/correction path is the closing note (required after payment) and, if work must continue, an audited reopen.

## Pricing modes (explicit configuration)

Each Service (including Umrah packages) and VisaType carries `pricingMode` (`QUOTE` default | `FIXED`), `priceUnit` (`PER_REQUEST` | `PER_TRAVELER`) and `paymentAfterDocumentReview`, set in the back-office (service details card; visa card «طريقة التسعير») or the Next.js admin (services, visas, Umrah packages). A `basePrice` alone never makes a price fixed; FIXED needs `basePrice > 0` (`INVALID_PRICING`). Source: `contact-request-pricing/fixed-price.js`.

- **FIXED**: selection → travelers and documents → *final total review and confirmation* in the app → payment → receipt review → execution → delivery. The app sends `acceptedTotal`/`acceptedCurrency`; the server recomputes `basePrice × units` from the catalog and refuses a different total or currency (`PRICE_CHANGED`, 409, with the current total; nothing created). On success it stores `pricingMode = FIXED`, a `pricingSnapshot` (item, unit price, unit, travelers counted, total, currency, payment rule, acceptedAt) and an `APPROVED` Invoice (version 1, SDG equivalent frozen, no staff author), and sets payment `AWAITING_TRANSFER`. There is no quote step: `ISSUE_QUOTE`/`ADD_OFFER` are refused and the customer progress has no quote circle. With `paymentAfterDocumentReview`, payment stays locked (no upload, no bank accounts shown) until every required document is accepted, then opens at the same price (customer notified).
- **QUOTE**: unchanged — the agency quotes and the customer approves the exact version.
- A FIXED item submitted **without** a confirmed total (older app, website forms, guided intake) is recorded as a QUOTE request with `pricingSnapshot.reason = FIXED_PRICE_NOT_CONFIRMED`: nothing is charged that the customer did not see. A confirmed total for an item now set to QUOTE is refused (`PRICING_MODE_CHANGED`).

## Readiness (gate for execution)

From the stored request only (`evaluateReadiness`):
- every traveler declared (`travelerCount`) has a traveler row with a name;
- every required, applicable requirement of the request's own snapshot (taken at submission) is satisfied: documents **accepted** for every traveler (per-traveler requirements) or for the request; answers present;
- no document waiting for review.

Payment receipts are not "documents" for readiness. Refusals list each missing item in Arabic, with the traveler's name (`reasons[]`); the back-office, `/admin/cases` and the customer progress show the same list (`progress.blockers`).

## Completion

A request closes as **COMPLETED** only when all hold (`completionBlockers`):
1. readiness complete;
2. payment accepted;
3. execution recorded;
4. **every traveler is covered by a published final file.** A file lists the travelers it covers (`travelerIds`); a combined file lists all of them explicitly. A file with no coverage counts only for a request with at most one traveler. Coverage must reference travelers of that same request.

Publishing the last missing file completes the request automatically **inside the same locked transaction**, except for Egypt clearance (its travel-plan and circular stage follows the approval): staff complete it from the close form once the policy holds.

### Inquiries versus service applications

`ContactRequest.requestKind` is recorded **at submission** and never re-derived later:
- `SERVICE_APPLICATION` — a service or visa was chosen (`serviceId`/`visaTypeId`), or travelers, a traveler count, documents or a requirement checklist were submitted (app, website service forms, guided intake);
- `INQUIRY` — anything else (the website contact form).

A service application must satisfy the full completion policy above **whether or not a quote exists**: with no quote it is refused (`QUOTE_MISSING`), and deleting or rejecting a quote changes nothing. A genuine inquiry that was never priced, executed or delivered is resolved by closing it as completed (roles that may close requests); once priced it follows the full policy.

**Legacy records** (created before `requestKind`, so `NULL`) are not reclassified or rewritten. They are evaluated conservatively: any `serviceId`, `visaTypeId`, requirement checklist, traveler, traveler count or customer document makes them a service application; only a record with none of those is treated as a legacy inquiry.

### Egypt clearance

After the approval file, completion also needs (`egyptTravelBlockers`, reusing the existing travel-plan rules):
- the customer's travel plan saved with entry mode, booking status and entry date (`TRAVEL_PLAN_MISSING`);
- for an existing booking, its ticket document uploaded (`TRAVEL_TICKET_MISSING`) and not rejected (`TRAVEL_TICKET_REJECTED`); a ticket under review is already blocked by readiness;
- none of the system tasks the plan opened still open: the agency booking task (`NEEDS_NASAEM`) and the circular task (`READY_FOR_CIRCULAR`) (`TRAVEL_TASKS_OPEN`).

Travel tasks are recognised by their stable `CaseTask.systemKey` (`EGYPT_TRAVEL_BOOKING_AIR`, `EGYPT_TRAVEL_BOOKING_BORDER`, `EGYPT_TRAVEL_CIRCULAR`), never by title; the back-office done-buttons use the same key.

This applies only to the Egypt clearance **visa type** (the only form with a travel plan). The same list is returned by the API, used for `allowedActions`, shown on the back-office close form (with done-buttons for the open travel tasks), in `/admin/cases`, and as the customer's «بيانات السفر والتعميم» progress step. No administrative bypass exists; a request that will not travel is closed as cancelled with a note.

## Draft and published files

Upload with `publish=false` (default) prepares a draft: never listed, announced or downloadable for the customer. Publishing (same upload with `publish=true`, or `POST /:id/deliverables/:deliverableId/publish`) notifies the customer.

## Concurrency

Each transition runs in a transaction that first locks the request row (`SELECT … FOR UPDATE`), re-reads it, decides with the policy, writes with conditional updates where a single winner matters (`executionStartedAt IS NULL`, `publishedAt IS NULL`, `status ≠ CLOSED`), and writes its audit row in the same transaction. Notifications are sent after commit by the winner only. Verified against PostgreSQL in `backend/tests/workflowIntegrity.test.js` (five simultaneous execution starts; simultaneous accept and reject of one receipt; publish racing a cancellation; a price approved after a revision).

## Legacy records (migration `20261012090000_deliverable_publish_and_coverage`)

- Files uploaded before the migration were visible to the customer at upload: they get `publishedAt = createdAt` and stay published, with empty coverage.
- Requests already CLOSED are not touched: their outcome, closing time and files stay as they are.
- An **open** request with more than one traveler whose only files are legacy (no coverage) is not complete under the new policy: staff publish the missing outputs with explicit traveler coverage.
- Legacy open requests that are paid but have no recorded execution show «تم قبول الدفع، بانتظار بدء التنفيذ» until staff record it.

## Migration `20261013090000_request_kind_and_quote_version`

Adds `ContactRequest.requestKind` (nullable; existing rows stay NULL, see "Legacy records" above) and `Invoice.version` (existing prices start at 1; every revision increments it inside the locked transaction, so two revisions can never share a version).

## Migrations `20261014090000_case_task_system_key` and `20261014100000_explicit_pricing_mode`

Additive only. Existing Egypt travel tasks get their `systemKey` from their exact historical titles (other tasks untouched). Every existing service and visa type becomes `QUOTE` (today's behaviour); existing requests keep `pricingMode = NULL` (treated as QUOTE); `Invoice.createdByUserId` becomes nullable. Verified on a database upgraded from the previous schema with data in place.

## Customer progress circles

`progress.steps` (server) for QUOTE: RECEIVED, DOCUMENTS, QUOTE, PAYMENT (transfer + receipt sent), PAYMENT_REVIEW (staff accepted the payment), EXECUTION, DELIVERY (+ TRAVEL_PLAN for Egypt); FIXED has no QUOTE. Each step has a `status` line; EXECUTION has `started` (recorded, not finished). The app renders them as connected tappable circles (tab list: one tab stop, arrow keys follow RTL, Home/End; each opens its details and the action the server allows; no animation under reduced motion).

## Older installed apps

The app on `main` never sends `acceptedTotal`, approves prices without a version and ignores `progress`. Against this backend: a FIXED item from it becomes a QUOTE request; its approval is refused with an Arabic "update the app" message (`QUOTE_VERSION_REQUIRED`, since the previous batch); a receipt on a locked fixed price is refused in Arabic. Nothing is approved or charged unseen, but those customers must update the app to finish. Recommendation: distribute the new app before switching any item to FIXED. Tested in `backend/tests/pricingModes.test.js`.

## Tracking-code (OTP) and public submission limits

`PUBLIC_CONTACT_RATE_LIMIT` (anonymous submissions, default 5 per 15 minutes) follows the same rule as below (`public-contact-limit.js`, `tests/publicContactLimit.test.js`).

5 per client per 15 minutes. `TRACKING_CODE_RATE_LIMIT` may raise it only when `NODE_ENV` is `test` or `development` (backend tests; local runs and the browser E2E backend, which Playwright and CI start with `NODE_ENV=development`). With `NODE_ENV=production`, any other value, or none, the variable is ignored; non-integer or out-of-range values (outside 1–1000) are ignored everywhere (`tracking-code-limit.js`, `tests/trackingCodeLimit.test.js`).
