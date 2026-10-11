# Per-service acceptance — 2026-10-13 (after the second review fixes)

Branch `claude/busy-hamilton-1ccxm1`. Local PostgreSQL 16, Node 22, Chromium via Playwright. No Android device.

Journey checked for each service: selection → travelers (2) → each required document per traveler → staff review → price → customer approval → receipt → staff payment decision → «تم قبول الدفع، بانتظار بدء التنفيذ» → staff record execution (only once ready) → service-specific stage, still *current* → the first traveler's final file published (request stays open) → the second traveler's file prepared as a draft (invisible), then published → closed «مكتمل» → read-only. Staff and customer labels are compared at each stage.

**Requirements.** Flights, ferries and hotels have no document requirement in the seeded catalog. To exercise their document path, each run configures a clearly labelled fixture requirement «TEST-WF صورة الجواز (اختبار)» (per traveler, required) through the admin API and removes it afterwards. Umrah, family visit and Egypt use their seeded requirements; the «configured visa» journey creates a visa type and its requirement at run time. Nothing is installed in any real catalog; the agency must decide the real requirements for flights, ferries and hotels.

| Service | API journey (`backend/tests/serviceJourneys.test.js`) | Browser journey (`web/e2e/service-journeys.spec.ts`) | Android device |
|---|---|---|---|
| Flights | **Verified** with TEST-WF per-traveler document | **Verified** (+ receipt rejected with reason and re-uploaded; staff open it from the notification) | Not tested |
| Ferries | **Verified** with TEST-WF document | **Verified** | Not tested |
| Hotels | **Verified** with TEST-WF document | **Verified** (stay details → guests → documents) | Not tested |
| Umrah | **Verified** (seeded: passport + photo per pilgrim) | **Verified** (package first) | Not tested |
| Family visit | **Verified** (seeded: per-visitor + request documents) | **Verified** | Not tested |
| Egypt clearance | **Verified** incl. refusal before the travel plan (`TRAVEL_PLAN_MISSING`), ticket under review, agency booking task open, circular task open (`TRAVEL_TASKS_OPEN`), then completion; travel plan refused once closed | **Verified** incl. the refusal path (completed option disabled, blockers listed, API 409), the app's travel-plan form and progress step, finishing the circular task, then the staff close | Not tested |
| Visa configured at run time | **Verified** | **Verified** (+ a document rejected and re-uploaded for that traveler) | Not tested |

Negative and concurrency coverage (PostgreSQL integration, `backend/tests/workflowIntegrity.test.js`): closed requests refuse every workflow mutation; execution refused with missing / rejected / under-review documents and before payment; one traveler's file does not complete a group; coverage validated; drafts invisible and not downloadable; progress steps; five simultaneous execution starts; accept vs reject of one receipt; publish vs cancel; approving a revised price; execution correction; other phone / organization / role.

Completion and quote decisions (`backend/tests/workflowCompletionAndQuoteVersion.test.js`, PostgreSQL): unpriced service applications (visa, flight) cannot be completed; removing a quote does not bypass it; a genuine inquiry closes; legacy records follow the documented rule; missing / malformed / stale quote versions refused with no state change or notification; concurrent repricing and approval (5 rounds) never approve an unseen amount.

Next.js admin pages (`web/e2e/admin-workflow.spec.ts`, browser; also a missing-version refusal and a reprice while `/track` is open): `/admin/cases` «سير العمل», `/admin/payment-review` (reject with reason, accept), `/admin/delivery`, `/track` on a cancelled request and a stale approval.

## What "browser" means

The customer side runs `mobile/www` — the files packaged in the APK — in Chromium with a Pixel 5 viewport. It does **not** exercise the Android WebView, Capacitor plugins (camera, file picker, push), the installed-app lifecycle, real WhatsApp OTP delivery (codes are read from the database), or real network conditions.

## Not covered

- Tasheel and services without a dedicated screen: general labels only, no journey test.
- External integrations (ticketing, visa portals, hotel suppliers, payment gateways): none exist; execution and delivery are staff-recorded steps.
- Real agency configuration still needed: document requirements for flights, ferries and hotels (if any); payment accounts; exchange rates; production API address and WhatsApp credentials.

## Pricing modes and progress circles (2026-10-14)

| Check | API (`backend/tests/pricingModes*.test.js`) | Browser (`web/e2e/pricing-progress.spec.ts`) |
|---|---|---|
| Admin sets FIXED / unit / payment-after-documents (back-office visa card) | Verified (incl. FIXED with price 0 refused) | Verified |
| FIXED: total review + explicit confirmation, server-recomputed total, snapshot, approved invoice, no quote circle | Verified | Verified (2 travelers × 120 USD = 240) |
| FIXED: price changed after review → refused, new total shown, re-confirmed | Verified | Verified |
| FIXED: payment locked until documents approved, then same price | Verified | Verified |
| Receipt uploaded ≠ payment accepted (PAYMENT done, PAYMENT_REVIEW current) | Verified | Verified |
| Execution started ≠ completed (service-specific label) | Verified | Verified |
| QUOTE: quote circle and version-checked approval kept | Verified | Verified |
| Circles: tappable, details + allowed action, keyboard (RTL arrows, Home/End), single tab stop, no horizontal page scroll at Pixel 5 width, reduced motion | — | Verified (Chromium; not an Android device) |
| Older installed app (main) payloads | Verified | — |
