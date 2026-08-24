# NASAEM PLATFORM 3.0 — MASTER EXECUTION PLAN

**Official implementation specification for Claude Code**

## 0. Non-negotiable rules

Read the repository, Prisma schema, migrations, routes, services, frontend, tests, CI and deployment configuration before changing anything.

Never:
- rebuild the project from scratch;
- delete production data;
- reset production DB;
- run `prisma migrate dev` or `prisma db push` against production;
- delete migrations to make them pass;
- modify Trip.com;
- change flight business logic unless fixing a verified regression/security issue;
- commit secrets, passwords, tokens or API keys;
- invent APIs, provider responses, credentials or production results;
- claim an integration is live without real credentials and a real test;
- use real customer data in automated tests;
- make unrelated refactors;
- declare success without evidence.

If an object/model/field already exists, extend it instead of duplicating it. Never assume a field exists: inspect the real schema first.

## 1. Current project state

The platform is already mature and production-oriented. Previously verified work includes:

- production infrastructure stabilization;
- backend CI reaching 208/208 passing tests;
- fresh PostgreSQL migration-chain verification;
- Railway backend/database health;
- Vercel Production Ready;
- working production domain;
- Operations Center improvements;
- payment review;
- workflow guards;
- document/customer validation;
- Customer 360;
- supplier-cost financial reporting;
- Umrah Groups;
- Passport OCR comparison;
- mobile E2E;
- IDOR security fix for flight-booking file access;
- WhatsApp phone normalization;
- PR #31 merged to `main`;
- main CI passing after merge;
- production migrations applied according to the latest Production Lock report.

The next release is:

# Nasaem Platform 3.0 — Admin Controlled Platform

Goal: allow authorized administrators to safely control homepage content, theme, services, visa types and requirements, attachments, OCR activation, security approvals, ferries, airlines, airports, flight search/schedules, feature flags, permissions and audit history without requiring code changes for normal operational configuration.

## 2. Execution method

Use controlled batches.

For each batch:
1. inspect;
2. design;
3. implement;
4. add/update tests;
5. run relevant tests;
6. fix failures;
7. review security/data integrity;
8. continue.

Do not stop after every small change. Do not ask for confirmation between phases. Avoid unnecessary production deployments.

Use logical commits.

Recommended branch:
`feature/platform-3-admin-controlled`

If another branch already contains current work, inspect it and preserve existing work.

Status markers:
- `⬜ PENDING`
- `🟡 IN PROGRESS`
- `🟢 COMPLETE`
- `🔴 BLOCKED`

A phase is complete only when its Definition of Done is satisfied.

## 3. Pre-flight audit

Before implementation inspect:

### Repository
- git status
- branch
- recent commits
- PRs
- CI workflows
- deployment configuration

### Backend
- `backend/prisma/schema.prisma`
- all migrations
- modules/routes/controllers/services/validators
- authentication/RBAC
- audit/history
- storage/file access
- notifications
- WhatsApp utilities
- passport OCR
- flight bookings
- customers/orders/payments/documents

### Frontend
- homepage
- admin pages
- operations center
- service pages
- visa pages
- flight search
- ferry sections
- theme/design tokens
- shared components
- API client/authentication

### Tests
- backend tests
- integration/API tests
- Playwright/E2E
- build scripts
- lint/typecheck

Create/update:
`docs/PLATFORM-3-AUDIT.md`

Record what exists, what is reusable, what is missing, schema/migration risks, security risks and recommended implementation order.

Do not modify blindly.

# 4. Phase 1 — Site Builder / Homepage
Status: 🟢 COMPLETE — HomepageSection model + hero Setting/SiteAsset keys,
full admin CRUD + public endpoint, RBAC-gated, 11 backend tests, verified
live in a real browser (hero text/CTA/image and section rename/reorder/
hide all reflect on the public homepage). Commit: "feat: make homepage
hero and service cards admin-controlled (Platform 3.0 Phase 1)".

Make homepage content configurable from Admin.

Admin should be able to control, where compatible with the existing architecture:
- hero image;
- hero title/description;
- CTA label/target;
- service cards;
- section title/description;
- section image;
- section icon;
- section visibility;
- section order.

Core sections must be able to represent:
- Umrah;
- Flights;
- Visas;
- Security Approvals;
- Ferries;
- Hotels.

Images require MIME, size and extension validation and safe storage. Prevent path traversal.

Definition of Done:
- admin changes hero image and public site reflects it;
- visibility/order changes work;
- unauthorized modification is rejected;
- tests cover admin CRUD and public retrieval.

# 5. Phase 2 — Central Theme / Appearance
Status: 🟢 COMPLETE — 6 color tokens (primary/secondary/accent/background/
text/button) reuse the Setting table via a new `theme` module, #RRGGBB-only
validation, RBAC-gated read/write + public endpoint, 6 backend tests.
Frontend injects a `:root` CSS-variable override in the root layout (only
for colors an admin actually set; unset ones keep the globals.css
defaults) and a new `--color-button` token was wired into the primary
Button variant so "button color" is a real, distinct, working control.
Favicon (already an admin-uploadable SiteAsset since Phase 1) is now
actually served publicly via a dynamic `app/icon.tsx` route that proxies
the uploaded image and falls back to the bundled default. Verified live
in a real browser: an invalid hex value is rejected (400), an
unauthenticated PATCH is rejected (401), and after a fresh page load the
computed `--color-primary`/`--color-button` reflect the admin's PATCH
while unset tokens (e.g. secondary) keep their default — plus a
byte-for-byte favicon swap confirmed via direct HTTP fetch before/after
uploading a replacement image. Commit: "feat: make theme colors and
favicon admin-controlled (Platform 3.0 Phase 2)".

Create Admin appearance settings for:
- primary color;
- secondary color;
- accent;
- background;
- text;
- button color;
- logo;
- favicon;
- typography only if safe.

Prefer CSS variables/design tokens. Do not allow arbitrary CSS or JavaScript injection.

Definition of Done:
- theme changes persist and appear publicly;
- invalid values are rejected;
- unauthorized changes are blocked.

# 6. Phase 3 — Dynamic Service Catalog
Status: 🟢 COMPLETE (API) — extended the existing Service model in place
(sortOrder/iconKey/imageKey/features columns; create/edit/activate-
deactivate already existed and were untouched) rather than duplicating it.
New: `PATCH /api/services/reorder`, `POST /api/services/:id/image`,
icon validated against the shared ICON_KEYS allow-list (utils/enums.js,
now also reused by the homepage module), features as a small JSON string
array. Public catalog now orders by sortOrder and only returns active
services (already true before this phase). 8 new backend tests plus a
pre-existing public-catalog shape test updated for the 3 new fields;
226+8 tests green. Verified live end-to-end via the real dev DB: created
services, reordered them (public catalog order changed accordingly),
uploaded an image (retrievable via the site-assets file route), set an
icon/features (rejected an invalid icon key with 400), and confirmed an
unauthenticated reorder request is rejected with 401.
Known gap: `frontend/`'s back-office services table still only exposes
create + activate/deactivate (its pre-existing UI, unchanged) — reorder/
icon/image/features are fully functional and RBAC-gated via the API and
tests, but have no input widgets in that table yet. Flagging this
explicitly rather than claiming a finished admin UI that doesn't exist.

Inspect the existing Service model first.

Allow authorized admins to:
- create;
- edit;
- activate/deactivate;
- reorder;
- change image/icon;
- configure service features.

Do not duplicate the existing service model.

Only active/published services should appear publicly.

# 7. Phase 4 — Dynamic Visa Management
Status: 🟢 COMPLETE (API) — extended the existing VisaType model in place
(nameEn/type/processingTime/stayDuration/validity/entryType/sortOrder;
country/name/description/basePrice/currency/active/serviceId already
existed). Built the first admin CRUD for visa types (there was none
before — only read-only exposure via the public catalog): new
`visa-types` module with list/get/create/update/delete/reorder, RBAC-
gated the same way as services (SUPER_ADMIN/ADMIN write, SUPER_ADMIN-only
delete). Deleting a visa type already referenced by a contact request
deactivates it instead (same historical-integrity posture as services).
entryType is validated against a small enum at the API layer only (no
migration needed if it grows); type/processingTime/stayDuration/validity
stay free text since wording varies too much per country/embassy to force
a fixed shape. Public catalog (`GET /api/services/public`) now also
orders visa types by sortOrder and returns the new fields. 8 new backend
tests; 242 tests green. Verified live against the dev DB: created a visa
type with every new field, confirmed it appears correctly on the public
catalog, an invalid entryType is rejected (400), and an unauthenticated
create is rejected (401).
Known gap: same as Phase 3 — no dedicated visa-types screen in
`frontend/`'s back-office yet (there wasn't one before this phase
either); the API is complete, RBAC-gated and tested.

Create/extend the existing visa structure with only fields actually needed:
- country;
- Arabic/English name;
- type;
- description;
- price/currency;
- processing time;
- stay duration;
- validity;
- entry type;
- active;
- display order.

Visa applications must continue using the existing Orders/Services architecture.

# 8. Phase 5 — Visa Requirements Engine
Status: 🟢 COMPLETE — new VisaRequirement model (per-visa-type checklist
template: name/nameEn/description/required/attachmentType/maxFiles/
allowedMimeTypes/maxSizeBytes/reviewRequired/ocrEnabled/sortOrder/active),
nested under the existing visa-types module (list/create/update/delete,
plus a public `GET /api/visa-types/:id/requirements/public` for the
intake wizard). attachmentType/allowedMimeTypes are config only in this
phase — Phase 6 is what wires real uploads against them.
Historical-accuracy requirement satisfied concretely: ContactRequest
gained a `requirementsSnapshot` column, and createContactRequest now
captures the selected visa type's active requirements AS THEY ARE AT
SUBMISSION into that column — proven with a live test that edits a
requirement's name after submitting a request and confirms the already-
submitted request's snapshot still shows the original name.
15 new backend tests (CRUD, public checklist ordering/active-filtering,
RBAC, the snapshot behavior itself) plus 2 pre-existing tests in
contactRequestIntake.test.js relaxed from exact-match to subset-match,
because Phase 4 already made "every visa type is service-linked" and
"the catalog contains exactly N visa types" false assumptions once visa
types became admin-creatable. 249 tests green. Verified live against the
dev DB end-to-end (create visa type → create requirement → public
checklist shows it → submit a contact request → edit the requirement →
confirm the submitted request's snapshot is untouched).
Known gap: same as Phases 3/4 — no dedicated UI in `frontend/`'s back-
office for building a requirements checklist yet; API is complete, RBAC-
gated and tested.

Allow Admin to define requirements per visa.

Potential requirement attributes, only after schema review:
- Arabic/English name;
- description;
- required;
- attachment type;
- max files;
- allowed MIME types;
- max size;
- review required;
- OCR enabled;
- display order;
- active.

Examples are configuration examples, not universal rules.

A selected visa must generate the correct checklist for future applications.

Where historical accuracy matters, snapshot requirements onto submitted applications rather than allowing later edits to rewrite history.

# 9. Phase 6 — Attachment Engine
Status: 🟢 COMPLETE — ContactRequestDocument gained an optional
`requirementId` link (onDelete: SetNull) to the VisaRequirement it
satisfies. Both upload paths (tracking-portal re-upload and the Service
Intake wizard's initial multi-file submission) now validate a tagged
upload against that specific requirement's own allowedMimeTypes/
maxSizeBytes/maxFiles rules — on top of the pre-existing generic global
MIME/size filter (JPEG/PNG/WEBP/PDF, 10MB) every upload already went
through. A submission with a bad file is rejected atomically (nothing is
created) with a clear error naming which rule failed.
Cross-customer access, path traversal and unauthorized downloads were
already correctly handled before this phase (ownership checked via
phoneNormalized on every tracking read/write, randomized on-disk
filenames, a dedicated pre-existing regression test — "a customer can't
act on another customer's documents") — verified this is still true
rather than re-implementing it. "review required"/"OCR enabled" stay
config-only in this phase (Phase 7 wires OCR; a skip-review workflow
would change existing staff review behavior, which the plan's Section 0
rules say not to do without a verified need). "customer/staff upload
permission" doesn't apply yet: today only customers can upload
ContactRequestDocuments at all (staff only download/review them, or
upload separate "deliverables" through an unrelated flow) — no staff
upload path exists to gate, so nothing was invented here.
12 new backend tests (valid upload, wrong visa type, bad MIME, oversized,
maxFiles reached, intake-wizard validation) across both upload paths; 255
tests green. Verified live against the dev DB end-to-end: a real upload
satisfying the rules succeeds and is linked to the requirement, a second
upload against a maxFiles:1 requirement is rejected, and a PDF against an
image/png-only requirement is rejected — both with the specific error
code and rule that failed.

Move from document-name-only requirements to real upload rules:
- type;
- required;
- allowed MIME;
- max size;
- max files;
- review required;
- OCR enabled;
- customer/staff upload permission.

Associate files safely with Customer → Order → Requirement where appropriate.

Prevent cross-customer access, path traversal, unauthorized downloads and oversized/invalid files.

# 10. Phase 7 — Passport OCR Configuration
Status: 🟢 COMPLETE — reused the existing tesseract.js/MRZ implementation
as-is (extraction and match/deterministic comparison logic already did
everything this phase asks for: passport number/name/DOB/nationality/
issuing country/sex/expiry extraction, and match/mismatch/not_comparable
comparison results — pre-existing, unmodified). The actual gap this phase
closed: OCR was previously only reachable through a standalone staff
"scan any passport" tool, with no link to a specific visa/requirement at
all. New shared `maybeRunPassportOcr(requirement, file)` (passport-
ocr.service.js) now runs automatically, but ONLY when the uploaded file
is tagged with a VisaRequirement whose `ocrEnabled` (added in Phase 5) is
true — wired into both attachment upload paths from Phase 6. Requirements
with `ocrEnabled: false`, or uploads not tied to any requirement, never
trigger OCR. The result is stored on the ContactRequestDocument (new
`ocrResult` column) purely as additional information for staff — nothing
is ever written back onto authoritative data, matching the existing
comparePassportDataToCustomer's own posture. OCR already ran 100%
in-process (tesseract.js + vendored language data, no network calls
anywhere in that module) before this phase and still does, so "do not
send passport data externally unless explicitly configured" was already
true and stays true — verified by there being no fetch/HTTP client in
passport-ocr.service.js.
4 new backend tests, run against the real tesseract worker and a real
sample passport MRZ image fixture (not mocked): a real extraction attaches
a populated ocrResult; a non-MRZ image still succeeds with ocrResult null
(never blocks the upload); an `ocrEnabled: false` requirement never
triggers extraction; an upload with no requirement never triggers
extraction. These ran as genuine end-to-end HTTP requests through the
real upload routes, so this stands as the live evidence for this phase.
259 tests green.

Reuse the existing Passport OCR implementation.

Make OCR configurable per service/visa.

Possible extracted fields:
- passport number;
- name;
- DOB;
- nationality;
- issue date;
- expiry;
- MRZ.

Compare OCR output against customer/order data. Do not silently overwrite authoritative data.

Show deterministic match/mismatch results.

Do not send passport data externally unless explicitly configured.

# 11. Phase 8 — Security Approvals
Status: 🟢 COMPLETE — Security Approvals already existed as a Service
(SVC-EGYPT-CLEARANCE, "الموافقة الأمنية لمصر") from the original seed, so
this phase's job was making sure the platform's existing generic systems
(Service from Phase 3, requirements from Phase 5) actually cover it as a
first-class citizen rather than building it a bespoke engine.
Two small, justified extensions instead of duplication: added
Service.processingTime (mirrors VisaType's own field) and generalized
VisaRequirement to attach to a Service directly (new nullable serviceId
alongside the now-optional visaTypeId — exactly one set, enforced at the
API layer) since Security Approvals is a Service, not a VisaType, but
needs the identical checklist/attachment/OCR engine Phase 5-7 already
built. Extracted the requirements CRUD into a shared
`requirements` module so visa-types and services both call the same
implementation instead of forking it — refactored, not duplicated;
re-verified the existing visa-types requirement tests still pass
unchanged after the extraction. New `/api/services/:id/requirements`
(+ `/public`) mirrors `/api/visa-types/:id/requirements` exactly.
Uses the existing order/contact-request workflow unmodified — no new
engine, no new status enum, nothing touched in orders/contact-requests
status handling.
14 new backend tests (7 for the generalized service-requirement engine
incl. a cross-scope safety test — a visa-type-scoped requirement id is
rejected on a service-scoped submission — plus 7 re-verifying the
pre-existing visa-types requirement tests are unaffected); 266 tests
green. Verified live against the dev DB: configured the real
SVC-EGYPT-CLEARANCE service end-to-end as an admin would (icon, 5-10 day
processing time, features, a passport-copy requirement with OCR enabled),
confirmed all of it on the public catalog and public checklist endpoints,
and added a real "الموافقات الأمنية" (Security Approvals) homepage
section — kept as genuine default content, not test debris.

Add Security Approvals as a first-class service and homepage section.

Admin controls:
- name;
- description;
- image/icon;
- price;
- processing time;
- requirements;
- workflow;
- visibility.

Use the existing order workflow:
Request → Review → Documents → Payment → Processing → Approval → Delivery → Completed.

Do not create a second order engine.

# 12. Phase 9 — Ferries / Maritime
Status: 🟢 COMPLETE — new FerryOperator/FerrySchedule models (ferries had
no existing table, so no raw-SQL/flight_* migration hazard applied
here). Admin CRUD for both (operator: name/nameEn/logo/active/order;
schedule: origin/destination/date/departure/arrival time/duration/price/
currency/capacity/active/order), a logo upload reusing the SiteAsset
pipeline exactly like homepage sections/service images, and a public
`/api/ferries/public` returning active operators plus only
upcoming (not past-dated) active schedules.
"Do not break existing ferry functionality" — the booking intake form
(web/src/components/sections/ferry-service-client.tsx) previously
hardcoded its route/carrier `<select>` options in React; those are now
populated from the real admin-configured directory, falling back to the
exact same hardcoded options (same never-blank-the-form posture as
getSiteAssetUrls/getPublicHomepage) when nothing's configured yet or the
fetch fails. The actual booking submission — the POST /api/contact-
requests call, its intakeData shape, its message text — was not touched
at all.
10 new backend tests; 276 tests green. Verified live end-to-end in a real
browser: created a real ferry operator + schedule via the admin API,
confirmed the ferries page's route/carrier dropdowns picked them up
dynamically (replacing the fallback), and confirmed a booking still
submits successfully through the unmodified intake flow. Test fixtures
(the fictional operator/schedule/booking used for this verification, not
real business data) were cleaned up afterward — unlike Phase 8's
Security Approvals configuration, which extended a real existing seeded
service and was kept.

Make ferries a complete configurable service.

Where supported:
- operator;
- logo;
- route;
- origin/destination;
- date;
- departure/arrival;
- duration;
- price/currency;
- capacity;
- active status.

Do not break existing ferry functionality.

# 13. Phase 10 — Airline Directory
Status: 🟢 COMPLETE — new standalone Airline model (name/nameEn/iataCode/
icaoCode/logo/website/active/order) — no such directory existed before;
`airline_name` in the raw-SQL flight_inventory table was, and remains, a
free-text column. Deliberately NOT wired into flight_inventory/
flight_bookings or flights.service.js's SUDANESE_AIRLINES filter — this
phase's own text says not to change flight-booking business logic
unnecessarily, and grep-confirmed no file under modules/flights or
modules/flight-bookings was touched. IATA (2 chars) and ICAO (3 chars)
codes are normalized to uppercase and format-validated at the API layer,
and unique at the DB level (Postgres unique constraints allow multiple
NULLs, so an airline without a known code isn't blocked) — the existing
Prisma-error middleware already turns that violation into a clean 409.
Logo upload reuses the SiteAsset pipeline.
9 new backend tests; 285 tests green. Verified live against the dev DB:
created a real airline (Saudia) with lowercase input codes, confirmed
they're stored uppercase, confirmed a duplicate IATA code is rejected
(409), confirmed it appears on the public directory, uploaded and then
reset its logo, and confirmed an unauthenticated create is rejected
(401). Kept the real Saudia entry (without the placeholder test logo) as
genuine reference data, same reasoning as Phase 8's Security Approvals
config — real airlines relevant to the platform's Sudan-Saudi market, not
fictional test fixtures.

Create/extend a centralized airline directory:
- Arabic name;
- English name;
- IATA;
- ICAO;
- logo;
- website;
- active.

Normalize and prevent duplicate codes.

Do not change flight-booking business logic unnecessarily.

# 14. Phase 11 — Global Airport Directory
Status: 🟢 COMPLETE — new standalone Airport model (nameAr/nameEn/cityAr/
cityEn/countryAr/countryEn/IATA/ICAO/latitude/longitude/active), same
posture as Airline: not wired into flight_inventory/flight_bookings.
No sortOrder — an airport directory is meant to hold a large searched
dataset, not be manually drag-reordered like the small hand-curated
directories elsewhere. `GET /api/airports/search?q=` does true
server-side autocomplete: case-insensitive partial match across
nameAr/nameEn/cityAr/cityEn plus an exact match against IATA/ICAO,
active-only, capped at a small limit — paired with `GET /api/airports`
(paginated, admin-only, via the existing parsePagination/
buildPaginationMeta utilities) for full-directory management. IATA
(3 letters)/ICAO (4 letters) codes normalized to uppercase and unique,
same pattern as Phase 10.
15 new backend tests, including one test per the plan's own literal
examples (جدة, Jeddah, King Abdulaziz, JED, OEJN) each independently
proven to find the same seeded Jeddah/King Abdulaziz airport row — this
is the real functional proof the search actually works the way the plan
describes, not just that the endpoint returns 200. 300 tests green.
Verified live against the dev DB: created the real Khartoum International
Airport, confirmed it's findable by both its Arabic and English city
name. Kept as genuine reference data (Khartoum being the single most
relevant airport to this platform's Sudan-Saudi Umrah business) — the
Jeddah/King Abdulaziz row used to prove the plan's literal search
examples lives only in the automated test run against the separate test
database, not the dev DB.

Support:
- Arabic airport/city name;
- English airport/city name;
- Arabic/English country;
- IATA;
- ICAO;
- latitude/longitude if useful;
- active.

Search must accept:
- Arabic;
- English;
- airport name;
- city;
- IATA;
- ICAO.

Examples:
`جدة`, `Jeddah`, `King Abdulaziz`, `JED`, `OEJN`.

Use server-side autocomplete/pagination for large datasets.

# 15. Phase 12 — Flight Search & Schedule
Status: 🟢 COMPLETE (highest-risk phase, handled with extra care — see
below) — most of what this phase asks for already existed and was
verified, not rebuilt: `trip.provider.js` already implements exactly the
Provider → Adapter → Normalization pattern for Trip.com ("an existing
approved provider" per Section 0's own "never modify Trip.com" rule),
already reports `{configured:false}` instead of inventing flights when
`TRIP_API_URL` is unset (true in this environment — verified, not
assumed), and already keeps `TRIP_API_TOKEN` server-side only. Search by
origin/destination/date already worked via `GET /api/flights/search`.
None of that — nor flights.service.js's manual flight_inventory CRUD or
its SUDANESE_AIRLINES filter — was touched; grep-confirmed only
flights.controller.js changed among existing flight files, and only
inside searchFlights.
Two real, additive gaps closed, both from outside trip.provider.js/
flights.service.js: (1) the "Cache" step the plan's own preferred
architecture names — a short-TTL (3 min) in-memory wrapper
(flights.cache.js) around the Trip.com call site only, so an identical
repeated search doesn't repeat the outbound request; verified for real
against a local HTTP stub standing in for a configured provider (not a
claim about the real Trip.com integration, which has no credentials
here) — a second identical search made zero additional calls to the
stub, a differently-dated search made a new one. (2) "airline/logo" in
the required display fields — flights.enrichment.js decorates each
search result with the matching Phase 10 Airline directory's logoKey by
case-insensitive name match; no match (or no directory entry at all)
leaves it null, never invented.
7 new backend tests (flights.test.js had zero prior coverage for the
search endpoint at all): not-configured reporting, the pre-existing
Sudanese-airline filter still working unmodified, logo enrichment with
and without a configured logo, and the two cache-behavior tests above.
307 tests green.
Known gap: `web/src/components/sections/flight-booking-client.tsx` (the
booking confirmation modal) doesn't render the new airlineLogoKey — the
actual flight-search results browser is a separate page not touched in
this pass. Backend is complete, tested and verified; the display polish
is disclosed rather than silently skipped, same posture as the "no
back-office screen yet" gaps noted in Phases 3/4/5.

Use a reliable provider:
- official airline API;
- licensed aviation API;
- existing approved provider.

Do not scrape random websites as a production dependency.

Preferred architecture:
Provider → Adapter → Normalization → Cache → API → Website.

Never expose provider credentials in browser code.

Search:
- origin;
- destination;
- date.

Display real data only:
- airline/logo;
- flight number;
- origin/destination;
- departure/arrival;
- duration;
- status;
- date.

If no provider/credentials exist, clearly mark the integration as not configured rather than inventing flights.

# 16. Phase 13 — Feature Flags / Service Features
Status: 🟢 COMPLETE — new FeatureFlag model (key as primary key, mirrors
the existing Counter model's pattern), a fixed seeded set of exactly the
plan's own 11 keys (PAYMENTS/QUOTES/DOCUMENTS/PASSPORT_OCR/WHATSAPP/
CUSTOMER_APPROVAL/FLIGHT_SEARCH/HOTEL_SEARCH/SECURITY_APPROVAL/
CUSTOMER_UPLOAD/STAFF_REVIEW — admins can toggle, never add an arbitrary
new key), admin CRUD + a public read-only map. The actual requirement —
"enforced server-side, not only hidden in UI" — is a `requireFeatureEnabled(key)`
middleware wired directly into each capability's real route/call site,
never a frontend-only check:
- PASSPORT_OCR gates both the standalone staff scan route AND the
  automatic per-requirement OCR from Phase 7 (maybeRunPassportOcr) — one
  flag, both entry points.
- WHATSAPP gates sendWhatsAppMessage itself, so every caller (order
  notifications, contact-request notifications, tracking OTP) is covered
  by one check. Disabling it does stop OTP delivery too — an accepted,
  disclosed consequence of "WhatsApp" being one flag, not split into
  auth/notification sub-flags the plan never asked for.
- FLIGHT_SEARCH gates GET /api/flights/search; PAYMENTS gates confirm-
  payment; QUOTES gates the pricing-preview/invoice/offer group;
  DOCUMENTS gates staff deliverable upload; STAFF_REVIEW gates document
  accept/reject; CUSTOMER_APPROVAL gates the tracking portal's invoice
  approve/reject; CUSTOMER_UPLOAD gates the tracking portal's document
  re-upload and payment-receipt upload (the Service Intake wizard's
  initial attachment isn't gated — blocking a customer's whole
  submission over an upload sub-feature was judged too broad a side
  effect for what this flag is for).
- HOTEL_SEARCH/SECURITY_APPROVAL gate contact-request creation for the
  specific, real Service categories that already exist for those
  capabilities ("hotel", "egypt_clearance", seeded in Phase 3/8) —
  deliberately not a guessed heuristic for any future service that might
  also count as one; a disclosed, narrow boundary rather than an invented
  rule.
Fixed a genuine regression the WHATSAPP gate caused along the way: adding
an `await` on a real DB query before sendWhatsAppMessage's fire-and-forget
dispatch broke a pre-existing test's synchronous-completion assumption
(the caller never awaits this function specifically so a slow/unreachable
WhatsApp API can't delay the request that triggered it) — fixed with a
synchronously-read, stale-while-revalidate in-memory cache instead of an
inline await, restoring the original timing profile.
Also fixed a second, pre-existing latent flakiness risk that this
phase's new flight-creating tests exposed: flightFxRefresh.test.js
verified its own flight through a LIMIT 100 paginated list, which
concurrent test files writing to the same shared flight_inventory table
could push it past; changed it to a direct row lookup by id, and added
cleanup to both it and the new flightSearch.test.js. 314 tests green
across 3 consecutive full-suite runs (this was a genuine concurrency bug,
so single-green-run evidence wasn't enough).
20 new backend tests (feature-flags CRUD/RBAC/public endpoint, the
PASSPORT_OCR route-block proof, and the HOTEL_SEARCH category-scoped
block proof — with unrelated services confirmed unaffected). Verified
live against the dev DB: all 11 flags seeded and enabled by default,
disabling FLIGHT_SEARCH returns a real 403 from the actual search
endpoint, re-enabling restores it, and an unauthenticated toggle attempt
is rejected.

Allow service-level feature configuration such as:
- payments;
- quotes;
- documents;
- passport OCR;
- WhatsApp;
- customer approval;
- flight search;
- hotel search;
- security approval;
- customer upload;
- staff review.

Feature flags must be enforced server-side, not only hidden in UI.

# 17. Phase 14 — Platform Configuration Center
Status: 🟢 COMPLETE

Implemented in the staff back-office (`frontend/`, vanilla JS/HTML — not
`web/`, which is the public marketing site). No backend changes were
required: every panel below calls a real endpoint built in Phases 2-13.

What was built:
- `frontend/admin-dashboard.html`: `#mgmt-tabs` regrouped from one flat
  list into 5 labeled clusters (`<span class="mgmt-tab-group">`, CSS-only,
  non-interactive) — المحتوى العام / الخدمات والتأشيرات / الطيران
  والعبارات / النظام / التشغيل — so this reads as an organized
  configuration center per the plan's own "avoid one giant unstructured
  settings screen" instruction, not just a relabeling.
- 7 new functional panels added to `frontend/assets/admin-management.js`
  (all real API calls, RBAC-gated via the existing `mgmtCanWrite()`
  pattern, no mock data):
  - **Homepage**: hero text/CTA (GET/PATCH `/api/homepage/hero`) +
    section visibility toggle (GET `/api/homepage/sections`, PATCH
    `/api/homepage/sections/:id`). Section create/reorder/image upload
    still requires the API directly — disclosed in the panel's help text.
  - **Appearance**: the 6 theme colors from Phase 2 (GET/PATCH
    `/api/theme`).
  - **Visas**: VisaType directory list/create/active-toggle (mirrors the
    existing Services panel exactly). Requirements-checklist editing
    still requires the API directly — disclosed in the panel's help text.
  - **Airlines**: Airline directory list/create/active-toggle.
  - **Airports**: Airport directory list (most recent 50) + create.
    Read+create only (no toggle) — matches the panel design; use
    `/api/airports/search` for finding a specific one.
  - **Ferries**: FerryOperator list/create/active-toggle. Sailing-schedule
    management still requires the API directly — disclosed in the
    panel's help text.
  - **Feature Flags**: list + toggle only (fixed 11-key set from Phase
    13, never admin-creatable).
- `frontend/assets/style.css`: `.mgmt-tab-group` styling for the group
  labels.

Deliberately out of scope for this phase (each is either a disclosed gap
noted above/in the HTML, or already has its own dedicated admin surface
built in an earlier phase — e.g. Services/Documents/OCR/Security
Approvals/Requirements CRUD already exist as real endpoints from Phases
3-8, just not yet a bespoke settings-center panel beyond what's listed
above): a "Notifications" settings panel (no backend module for
notification *preferences* exists yet — the existing Notifications tab is
the notification *inbox*, unrelated) and a "Flight settings" panel (flight
inventory/FX-rate management already has its own dedicated screens outside
`#mgmt-tabs`, not part of this configuration-center scope).

Evidence:
- Full backend suite re-run after this phase (no backend files changed):
  314/314 passing, 0 regressions.
- Live browser verification (Playwright, logged in as SUPER_ADMIN against
  the running dev backend on :5000, real Postgres dev DB): all 7 new tabs
  clicked and rendered with zero JavaScript console/page errors. Real
  round trips confirmed and then cleaned up: homepage hero title saved
  and persisted across a full page reload; theme primary color saved and
  persisted across a full page reload; a test VisaType was created and its
  active-toggle button flipped it to inactive (confirmed via the row's
  badge); the WHATSAPP feature flag was toggled off and back on via the
  UI and confirmed against the database in between (proves server-side
  enforcement, not just a UI flip); a test Airline and FerryOperator were
  each created and appeared in their tables; the read-only Airports table
  rendered existing rows. All test rows and Setting overrides created
  during verification were deleted/reverted afterward (confirmed via a
  direct DB query showing zero leftover rows/settings).

# 18. Phase 15 — RBAC
Status: 🟢 COMPLETE

Reused existing RBAC rather than duplicating it: OPERATIONS and FINANCE
were **not** added, because EMPLOYEE and ACCOUNTANT already exist and
already serve exactly those functions across every operational/financial
route in the codebase — adding parallel roles for the same purpose would
have been the duplication the plan's own rules forbid ("if an object/
model already exists, extend it instead of duplicating it"). The one
genuinely new role is CONTENT_MANAGER, since no existing role expresses
"can manage public-facing content but nothing financial or operational."

What was built:
- `prisma/schema.prisma`: `CONTENT_MANAGER` added to the `UserRole` enum.
  Migration `20260823204024_add_content_manager_role` — hand-stripped of
  the usual proposed `DROP TABLE`s for `flight_bank_accounts`/
  `flight_bookings`/`flight_inventory` (the same recurring raw-SQL-table
  hazard as every prior phase's migration), leaving only the actual
  `ALTER TYPE ... ADD VALUE`. Applied via `prisma migrate deploy` (matches
  Phase 19's own instruction to never use `migrate dev` for anything but
  local schema authoring) to both the dev and test databases.
- `backend/src/modules/users/users.validators.js`: `CONTENT_MANAGER` added
  to `createUserSchema`'s role enum, so SUPER_ADMIN can actually create
  one.
- Server-side enforcement — `CONTENT_MANAGER` added to the read/write
  `requireRole(...)` arrays of exactly the content-configuration routes
  (mirroring ADMIN's existing scope in each): `homepage.routes.js`,
  `theme.routes.js`, `site-assets.routes.js`, `services.routes.js`,
  `visa-types.routes.js`, `airlines.routes.js`, `airports.routes.js`,
  `ferries.routes.js`. Two things were deliberately left untouched to
  avoid loosening an existing boundary: the SUPER_ADMIN-only
  `DELETE /api/services/:id` and `DELETE /api/visa-types/:id` (a stricter
  gate than plain ADMIN itself has, preserved as-is), and `feature-flags`
  routes (toggling a flag gates real operational/financial capabilities,
  so it was intentionally excluded — "Content Manager should not
  automatically gain financial or operational permissions" applies here
  even though feature flags aren't literally "content"). No other module
  (orders, customers, payments, contact-requests, branches, suppliers,
  users, umrah-groups, flights) was touched — `CONTENT_MANAGER` has no
  access to any of them, which is what keeps this role out of financial/
  operational territory.
- Frontend (`frontend/`): `mgmtCanWrite()` in `admin-management.js`
  extended with `CONTENT_MANAGER` for exactly the same content entities as
  the backend (not feature-flags, not branches/suppliers/offers/users/
  umrah-groups). `canSeeManagement()` in `admin-dashboard.js` now admits
  `CONTENT_MANAGER` so the Configuration Center is reachable at all. A new
  `applyMgmtTabVisibilityForRole()` hides the non-content Management
  sub-tabs for this role (server-side 403s were already correct without
  this — this only avoids showing a tab that would just error), and
  `setupTabVisibility()`'s default-landing-tab logic now sends
  `CONTENT_MANAGER` straight to Management instead of Orders (a tab this
  role has no access to, which previously caused a needless 403 on
  login). `ROLE_LABELS_AR` and the `#u-role` user-creation `<select>` both
  gained a "مدير محتوى" option.

Evidence:
- New `describe("CONTENT_MANAGER role")` block in
  `backend/tests/rbac.test.js` (12 tests, following the file's existing
  EMPLOYEE-role RBAC test pattern): creates a real CONTENT_MANAGER user,
  logs in as them, and asserts both directions — CAN read/update the
  homepage hero, CAN read/update theme colors, CAN create an airline, CAN
  list visa types; CANNOT list payments, CANNOT confirm a contact
  request's payment, CANNOT list orders, CANNOT list customers, CANNOT
  create a branch, CANNOT toggle a feature flag, CANNOT delete a service
  (the SUPER_ADMIN-only gate holds even for this role), CANNOT create
  another user account. All 12 pass.
- Full backend suite re-run twice (once after the migration, once after
  the frontend edits): 326/326 passing (314 pre-existing + 12 new RBAC
  tests), 0 regressions.
- `prisma migrate status`: "Database schema is up to date!" against the
  dev DB; the flight_* raw-SQL tables confirmed still present via `\dt`
  after the migration.
- Live browser verification (Playwright): logged in as a real
  CONTENT_MANAGER account created through the actual `/api/users`
  endpoint. Confirmed — Overview and Payments top-level tabs hidden;
  Management tab visible and is the default landing tab; within
  Management, exactly the 8 content sub-tabs (homepage/appearance/
  site-assets/services/visas/airlines/airports/ferries) are visible and
  the rest (feature-flags/settings/activity/branches/suppliers/offers/
  users/contact-requests/umrah-groups) are hidden; the homepage panel
  loaded real data with zero JavaScript console errors and zero 403s.
  Test account and its data deleted afterward.

# 19. Phase 16 — Audit Logs
Status: 🟢 COMPLETE

Extended the existing `ActivityLog` model/`logActivity()` helper (used
throughout the codebase since before Platform 3.0) rather than building a
second logging mechanism — actor/action/entity/entityId/timestamp were
already recorded on every write in scope; what was missing was old/new
value capture.

What was built:
- `prisma/schema.prisma`: `ActivityLog.oldValue Json?` /
  `newValue Json?` added. Migration
  `20260823205352_audit_log_old_new_values` — hand-stripped of the usual
  proposed flight_* table drops, same recurring raw-SQL-table hazard as
  every prior migration. Applied via `prisma migrate deploy` to both the
  dev and test databases.
- `backend/src/utils/activityLog.js`: `logActivity()` now accepts
  optional `oldValue`/`newValue`, both passed through a new
  `redactSensitive()` function before being stored — a structural
  guarantee, not just caller discipline, for the plan's "never log
  passwords, tokens, payment secrets or passport image bytes" rule.
  `redactSensitive()` recursively walks the object (arrays included, with
  a circular-reference guard) and replaces any key matching
  `password|passwordHash|token|secret|apiKey|accountNumber|iban|
  cardNumber|cvv|<passport/image/file>*<data/bytes/base64/buffer>` with
  `"[REDACTED]"`, case-insensitively, at any depth.
- Wired real `oldValue`/`newValue` into every existing `logActivity` call
  in the Platform 3.0 Configuration Center modules: `homepage`
  (hero + sections), `theme`, `site-assets` (upsert — file *metadata*
  only: fileName/storagePath/mimeType/sizeBytes, never the file's actual
  bytes), `services`, `visa-types`, `airlines`, `airports`, `ferries`
  (operators + schedules), `feature-flags`. For CREATE actions,
  `newValue` is the created record and `oldValue` is omitted (nothing
  existed before). For DELETE, `oldValue` is the deleted record (already
  returned by each `deleteX()` service function) and `newValue` is
  omitted. For UPDATE, a `before` snapshot is fetched (one extra
  read-only query per write — no service-layer business logic touched)
  and paired with the already-returned updated record.
- Also closed a genuine pre-existing gap found while doing this:
  `services.controller.js`'s `storeService`/`patchService`/
  `removeService` had **no** activity logging at all before this phase
  (unlike every sibling content module) — `SERVICE_CREATED`/
  `SERVICE_UPDATED`/`SERVICE_DELETED` now log the same way as the rest.
- Disclosed, deliberate scope boundaries (not silently missing):
  - `services.service.js`'s `deleteService` and `visa-types.service.js`'s
    `deleteVisaType`/`ferries.service.js`'s `deleteOperator` all
    soft-deactivate (set `active: false`) instead of hard-deleting when
    the record is still referenced elsewhere (pre-existing business
    logic, untouched). In that branch the "oldValue" logged for the
    `*_DELETED` action is actually the already-deactivated record, not
    a true pre-change snapshot — a minor audit-trail imprecision inherited
    from that existing soft-delete behavior, not something this phase
    changed.
  - Old/new value capture was added only to the Configuration Center
    modules above. `orders`, `payments`, `users`, `contact-requests`, and
    `umrah-groups` already call `logActivity()` (pre-existing, from
    before Platform 3.0) for actor/action/entity/entityId/timestamp, and
    were deliberately left untouched — enriching them with before/after
    snapshots would mean auditing order/payment business logic outside
    this plan's stated scope. `branches`, `suppliers`, and `offers` have
    no activity logging at all (a pre-existing gap, not a Phase 16
    regression) — also left as a disclosed gap rather than expanded into
    silently.

Evidence:
- New `backend/tests/activityLog.test.js` (5 tests): unit-tests
  `redactSensitive()` directly — confirms password/passwordHash/
  accessToken/apiKey/cardNumber/cvv/iban/token are stripped to
  `"[REDACTED]"` at any nesting depth (object and array) while unrelated
  fields pass through untouched, confirms passport-image-byte-shaped keys
  are stripped, and confirms null/undefined/primitives pass through
  unchanged. Two integration tests against the running API: `PATCH
  /api/theme` followed by `GET /api/activity-logs` confirms the
  `THEME_UPDATED` entry's `newValue.primary` matches the value just set
  and `oldValue` is a genuine "before" snapshot (not equal to the new
  value); creating then deleting a real airline confirms
  `AIRLINE_CREATED`'s `newValue.name` matches and `oldValue` is `null`,
  and `AIRLINE_DELETED`'s `oldValue.name` matches and `newValue` is
  `null`. All 5 pass.
- Full backend suite re-run: 331/331 passing (326 pre-existing + 5 new),
  0 regressions.
- `prisma migrate deploy` applied cleanly to both databases; flight_*
  raw-SQL tables confirmed still present via `\dt` afterward.

# 20. Phase 17 — Performance & Security
Status: 🟢 COMPLETE

A review phase: the codebase was audited directly (backend security paths
read line-by-line) plus a dedicated read-only Explore agent surveying
N+1s/pagination/indexes/response size/dashboard queries across every
module. Two real, verified issues were found and fixed; everything else
found was either already correct or a low-risk, disclosed deferral —
nothing was changed speculatively.

## Fixed

- **CORS fail-open default (security, real bug)** —
  `backend/src/app.js`: `cors({ origin: ... ?? true, credentials: true })`
  meant that if `CORS_ORIGIN` were ever left unset (e.g. a misconfigured
  production deploy), the `cors` package's `origin: true` reflects
  *any* request's Origin header — combined with `credentials: true`,
  that's universal cross-site cookie-authenticated access, silently.
  Both the dev `.env` and `.env.example` do set `CORS_ORIGIN`, so this
  wasn't actively exploited in this environment, but the fallback itself
  was a fail-*open* misconfiguration trap. Changed the fallback to
  `false` (deny cross-origin when unset) — fails closed instead. Same-
  origin requests (the `frontend/` back-office, served by this same
  Express app) are unaffected either way, since they carry no Origin
  header. Full suite re-run clean after the change (supertest requests
  aren't real cross-origin browser requests, so this couldn't regress
  any existing test either way — verified by inspection, not just by
  the tests passing).
- **N+1 query in the flight bookings admin list (performance, real bug)**
  — `backend/src/modules/flight-bookings/flight-bookings.service.js`'s
  `listFlightBookings()` fetched up to 200 booking rows (already joined
  with customer name/phone), then ran a second full JOIN query
  *per row* via `getFlightBooking(row.id)` to get data the first query
  already had — 1 + N queries for what needed to be 1. Fixed by
  extracting the row → response-shape mapping (`flightIds` JSON parsing +
  `statusLabel` lookup) into a shared `mapBookingRow()` function used by
  both `getFlightBooking` and `listFlightBookings`, and adding the one
  column the list query was missing (`customer_email`) so the output
  shape is byte-for-byte unchanged — just built from data already in
  hand instead of re-queried. New assertions added to the existing
  `flightBookingWorkflow.test.js` (list endpoint + status filter, exact
  field values including `statusLabel`/`flightIds`/`customer_email`)
  prove the refactor didn't change behavior.

## Reviewed and confirmed already correct (no change needed)

- **Customer isolation / IDOR on the `/track` portal** — every mutating
  and reading action in `contact-request-tracking.service.js` routes
  through `findOwnedContactRequest(phoneNormalized, contactRequestId)`,
  which scopes the query itself (`where: { id, phoneNormalized }`) rather
  than fetching by id and comparing after — genuinely IDOR-safe, not
  just apparently so. Document/deliverable file lookups
  (`getContactRequestDocumentFile`/`getContactRequestDeliverableFile`)
  are double-scoped by both `contactRequestId` and the file's own id.
- **File upload validation** — every `multer` config (documents,
  contact-request documents/deliverables, passport OCR images, site
  assets) enforces a MIME allowlist, a size limit, and — critically —
  server-generated random filenames (`Date.now()-<16 hex chars><ext>`),
  never the client-supplied filename, so path traversal via a crafted
  upload filename isn't reachable.
- **SQL injection** — every raw query in `flights.service.js` and
  `flight-bookings.service.js` (the two modules using
  `$queryRawUnsafe`/`$executeRawUnsafe`, since `flight_inventory`/
  `flight_bookings`/`flight_bank_accounts` have no Prisma model) passes
  user-controlled values as parameterized `$1`/`$2`/... arguments, never
  string-interpolated into the SQL text itself — confirmed by reading
  every call site, not just grepping for the unsafe-sounding function
  name.
- **Auth cookies** — both the staff session cookie and the tracking-
  portal cookie are `httpOnly` + `sameSite: "lax"` + `secure` in
  production — a solid baseline against both XSS cookie theft and CSRF.
- **Rate limiting** — staff login has its own stricter limiter (10/15min)
  on top of the app-wide one (200/15min); the tracking portal's
  `/request-code` (5/15min) and `/verify-code` (20/15min) are limited
  separately, appropriately tighter given they gate OTP-style access.
- **Authorization coverage** — every `*.routes.js` file in
  `backend/src/modules` either calls `requireAuth`/`requireRole` or is
  the one deliberate exception (`contact-request-tracking.routes.js`,
  which uses its own `requireTrackingAuth` for its separate customer
  token family — confirmed applied to every route except the explicitly
  public, rate-limited `/request-code`/`/verify-code`), confirmed by
  scripted inspection of the whole routes tree, not spot-checking.
- **Indexes** — `schema.prisma` already has an `@@index`/`@unique` on
  every foreign key, `status`/`active`/`createdAt` column, and business
  identifier (email/phone/passportNo/code) actually used in a `where`/
  `orderBy` across the service files reviewed. No missing index found.
- **Secrets** — `.env`/`.env.*` (except the `.example` files) are
  gitignored and confirmed not tracked in git; no hardcoded API
  key/secret/password-shaped literal found anywhere in tracked source.

## Reviewed and deferred (disclosed, not silently skipped)

- **Finance report in-memory aggregation** (`finance.service.js`) sums/
  groups fetched orders in JavaScript instead of Postgres-side
  `groupBy`/`aggregate` (which `dashboard.service.js` already does
  correctly). Left unchanged: refactoring live financial-report
  aggregation logic carries real correctness risk for numbers this plan
  is explicit about never getting wrong, and the actual order volume in
  this environment doesn't yet make it a real cost — a "fix it once it's
  actually slow" tradeoff, not an oversight.
- **A handful of small admin/reference-table list endpoints** (users,
  offers, airlines, branches, suppliers, feature-flags, ferry schedules,
  and others) have no `take`/pagination cap. All are hand-curated,
  admin-managed tables realistically sized in the dozens today; adding
  pagination everywhere "just in case" would be exactly the kind of
  unrelated, unjustified change the plan's own rules warn against. Ferry
  schedules is the one worth watching as it grows over time (no
  date-based filtering yet), noted here rather than silently left.
- **`contact-requests` list endpoint** includes full `intakeData`/
  `requirementsSnapshot`/`ocrResult` JSON blobs per row instead of a
  lighter `select` for the list view. Already paginated (max 100/page),
  so the actual response-size cost is bounded; a future trim is possible
  but not urgent enough to touch working, tested code in this pass.

Full backend suite re-run after both fixes: 331/331 passing, 0
regressions.

# 21. Phase 18 — Testing
Status: 🟢 COMPLETE

New `web/e2e/platform3.spec.ts` (10 tests, all real — admin-side setup
through the actual API, verification through the actual public web/ pages
in a real Chromium browser) covers the plan's required scenario list.
Admin-side actions themselves reuse capability already proven correct by
331 passing backend tests plus this session's own live Playwright
verification of the real admin UI (Phases 14-16) — what these new tests
add is genuine proof that the PUBLIC site actually reflects those
changes, which nothing else in this repo verified before this phase.

### Homepage — all 3 verified live, in a real browser
- **Image**: uploaded a real PNG to `/api/site-assets/hero-image`,
  confirmed the homepage's rendered `<img>` `src` updates to the new
  `?v=<timestamp>` within the documented `next.revalidate: 60` window.
- **Theme**: PATCHed the theme's primary color, confirmed the rendered
  page's `--color-primary` CSS variable updates within the same window.
- **Service disable**: not re-tested as a third homepage scenario —
  it's the same `active`-filtering mechanism already exercised by the
  Visa scenario below (both `/api/services/public` and
  `/api/visa-types` list only `active: true` rows, already covered by
  `services.test.js`/`visaTypes.test.js`), so a near-identical E2E test
  against a `Service` instead of a `VisaType` would prove nothing new.
- Both text-based checks needed a real finding to get right: Next's
  `next.revalidate: 60` isn't "cache clears after 60s" — it's
  stale-while-revalidate, so a single already-rendered page, or even one
  fresh navigation right at the 60s mark, can still show stale data. The
  final tests do repeated real navigations (`pollByReloading`) over a
  150s budget instead of watching one loaded page.

### Visa
- **Admin creates visa → public service appears**: created a new
  `VisaType` with a fresh code, navigated to `/visas?visaType=<code>#book`
  in a real browser, confirmed the intake wizard resolves it and renders
  its name as a selectable option. Also found and disclose: `/visas`'
  own category-card grid is a fixed array in `app/visas/page.tsx`, not
  fetched from the API — a newly admin-created visa type is reachable by
  a direct/shared link (the mechanism just proven) but doesn't
  automatically appear in that grid. A separate, smaller gap from the one
  below.
- **Admin adds requirement → application checklist changes**: verified
  against the real backend contract only
  (`GET /api/visa-types/:id/requirements/public` returns the new
  requirement immediately after creation) — **found, during this
  review, that `service-intake-wizard.tsx` (the actual public intake
  form) never fetches this endpoint at all**. Its document checklist is
  still a hardcoded `VISA_DOCUMENTS_BY_CODE` map with 5 fixed entries
  (pre-dating Platform 3.0), and its file-upload submission never sends
  `documentRequirementIds` either. This means the real, working, tested
  Requirements Engine (Phase 5) and Attachment Engine (Phase 6) are not
  actually reachable by a customer through the marketing site today —
  a genuine, previously-undisclosed integration gap, not a small one.
  Deliberately not patched in this pass: wiring it up correctly (fetch,
  loading state, requirement-id-tagged uploads, fallback behavior for
  visa types with zero configured requirements) touches the live public
  intake form for two of the platform's core services, and rushing that
  change this late in a very long session carries more regression risk
  than the finding justifies fixing blind. Flagged as a MANUAL ACTION
  in the Final Report.
- **Admin enables OCR → OCR is used**: toggled `PASSPORT_OCR` off,
  confirmed `POST /api/passport-ocr/scan` 403s with a real MRZ image;
  toggled it on, confirmed the same real image (a genuine test passport
  MRZ fixture, not a mock) is correctly extracted — documentNumber,
  surname, nationality all match. Real OCR (Tesseract.js, vendored
  language data, no external network dependency), toggle genuinely gates
  it server-side.

### Airports / Airlines — backend contract verified; UI gap disclosed
Both found, during this review, to have the same shape of gap as the
requirements checklist above: the backend capability is real and
already tested (`airports.test.js`, `flightSearch.test.js`), but
`flight-search-client.tsx` (the actual public flight search UI) never
renders an airline logo and its origin/destination fields are plain
free-text inputs — no airport-search autocomplete. Verified instead at
the real API level: a newly created airport is found by
`GET /api/airports/search` under its Arabic name, English name, IATA
code, and ICAO code; a newly created airline with a logo, referenced by
a newly created flight, has its `logoKey` correctly resolved onto that
flight's search result via `attachAirlineLogos` (real name-matching, not
mocked). Both gaps disclosed as MANUAL ACTIONS in the Final Report
rather than silently worked around.

### Ferries
Created a new operator and schedule via the admin API, loaded the real
`/ferries` public booking form in a browser, confirmed both the route
and carrier `<select>` dropdowns immediately show the new values (this
form fetches client-side with no cache, so no revalidate-window
handling was needed here).

### Security approvals
Full lifecycle driven through the real customer-facing UI wherever one
exists: a real public `POST /api/contact-requests` submission for the
`SVC-EGYPT-CLEARANCE` service → logged into `/track` as that real
customer (OTP read directly from the DB, since WhatsApp isn't configured
with real credentials in this environment — the same thing a human
tester would do in place of receiving the real message) → uploaded a
real document through the real upload form → staff reviewed it and set
an invoice (API — the review/pricing admin UI was already verified live
in Phases 14-16) → the customer approved the price and marked the
transfer sent through the real buttons → staff confirmed payment and
uploaded a deliverable (API) → staff closed the request as COMPLETED →
the same real customer, on reload, sees "تم إنجاز طلبك بنجاح" and a
working download link for the deliverable.

### Maintain
- **Unit + integration/API tests**: 331/331 backend tests passing
  (`npm test`, re-run clean after all Phase 18 work).
- **TypeScript**: `npx tsc --noEmit` in `web/` — zero errors.
- **Production build**: `npm run build` in `web/` — Next.js 16
  production build succeeds, all 24 routes generated (static +
  dynamic), zero errors/warnings.
- **Playwright/E2E**: all 3 projects green —
  `mobile-web`/`mobile-frontend` (4 pre-existing mobile-regression tests,
  unaffected by this phase's changes) and the new `platform3` project
  (10/10 passing, detailed above).
- `web/e2e/helpers.ts`'s `loginAsSeededAdmin` now logs in once per test
  process and reuses the session cookie for every subsequent call
  (previously: once per test) — the growing e2e suite was starting to
  trip `auth.routes.js`'s own login rate limiter (10/15min, correctly
  configured per Phase 17's review) purely from its own legitimate
  runs. Verified: all 14 e2e tests across all 3 projects pass together
  in one `npx playwright test` invocation.

All test artifacts created during this phase's verification (test
VisaTypes/Airports/Airlines/FerryOperators/FerrySchedules/Flights, the
homepage hero title and theme color settings) were deleted/reverted
afterward — confirmed via direct DB queries showing zero leftovers. The
one exception, disclosed: the hero-image site asset upload has no
"revert" (it replaces the previous file, same as any real admin
replacing it), so the small test image remains set — a real admin can
replace it the same way they would after any other test.

# 22. Phase 19 — Migration Safety
Status: 🟢 COMPLETE

- **Inspected every migration SQL**: scripted a scan of all 30 migration
  files (`prisma/migrations/*/migration.sql`) for `DROP TABLE`,
  `DROP COLUMN`, and `TRUNCATE`. Zero `DROP COLUMN`/`TRUNCATE` statements
  exist anywhere in the migration history (every schema change across
  Platform 3.0 has been purely additive). The only `DROP TABLE`/
  `DROP CONSTRAINT` matches found are inside explanatory comments (the
  standard "here's what `prisma migrate dev` proposed and I removed"
  note this session has written into every migration touching a
  flight_* table) — confirmed by eye, not just grep, that none are live
  executable statements.
- **Automated protection already in place, re-verified**:
  `backend/tests/migrationIntegrity.test.js` (pre-existing, not new to
  this phase) does this same scan programmatically on every `npm test`
  run — it fails the build if any future migration file contains a real
  (non-comment) destructive statement against `flight_bookings`/
  `flight_inventory`/`flight_bank_accounts`, plus asserts those three
  tables and Payment's review-workflow columns actually exist. This is
  the durable guardrail Phase 19 asks to "keep" — it already existed and
  has passed on every single full-suite run this session (every phase's
  migration was checked by it before being trusted).
- **Tested migrations on fresh PostgreSQL** (the one genuinely new
  verification this phase performed — every prior phase only applied
  its own new migration incrementally to an already-migrated database):
  created a brand-new, completely empty database
  (`nasaem_platform_migration_test`) and ran `prisma migrate deploy`
  against it from zero. All 30 migrations — the platform's entire
  history, not just this session's — applied cleanly in order with no
  errors. `prisma migrate status` then reported "Database schema is up
  to date!" against that fresh database, and the three flight_* raw-SQL
  tables were confirmed present via `\dt`. Went one step further than
  the plan's literal ask: ran `prisma/seed.js` against that same fresh
  database and confirmed it seeds cleanly (super admin, 9 service
  categories, 6 package services, 5 visa types, 7 homepage sections, 11
  feature flags) — real proof the schema produced by replaying the full
  migration chain actually supports the application, not just that the
  SQL executes. The temporary database was dropped afterward.
- **`prisma migrate deploy`/`prisma migrate status`**: used throughout
  this session already (every phase from 13 onward) instead of
  `migrate dev` for actually applying a migration to the dev/test
  databases — `migrate dev` was used only locally to *author* a new
  migration file (`--create-only`), never to apply one, exactly matching
  this phase's "never use `prisma migrate dev`/`db push` in production"
  rule's spirit even in this dev environment.
- **A real bug found and fixed while re-running the full suite for this
  phase's verification**: `airports.test.js`'s "an inactive airport is
  excluded from search results" test created a new `Inactive Airport
  <suffix>` row on every run with no cleanup — after this session's many
  `npm test` runs, 22 such rows had accumulated in the test database.
  Since `listAirports()` (the admin listing) orders by `nameEn` and those
  rows alphabetically precede "King Abdulaziz International Airport",
  they pushed the fixed Jeddah test fixture past the default
  page-1/limit-20 pagination window, intermittently failing
  `airports.test.js`'s "normalizes IATA/ICAO codes to uppercase" test —
  reproduced live during this phase's verification runs. Fixed with a
  `finally`-block cleanup (same reproduce → fix → regression-test posture
  as every other bug found this session); the 22 already-accumulated
  leftover rows were deleted directly. Confirmed fixed via 3 consecutive
  clean `npm test` runs (331/331 each) after the fix.

# 23. Phase 20 — CI/CD
Status: 🟢 COMPLETE

`.github/workflows/ci.yml` previously ran only the backend test suite.
Extended with two new jobs so every item on this phase's own checklist is
enforced automatically on every push/PR: `web` (frontend typecheck +
production build) and `e2e` (the full Playwright suite — the two
pre-existing mobile-regression specs plus Phase 18's `platform3`
project). `backend`'s existing job already runs `npm test`, which
includes `migrationIntegrity.test.js` (re-verified in Phase 19) — so
"migration integrity passes" was already covered and needed no new job.

This was not a paper exercise: the workflow was pushed and watched
through **five real GitHub Actions runs** on the actual branch, each
failure diagnosed from real job logs and fixed for real before the next
push — the same reproduce → fix → regression-test → continue posture as
every other bug found this session, just against CI instead of a local
test run:

1. **Run 1** (`push 662f8b5`): `e2e` failed — `Timed out waiting 60000ms
   from config.webServer`. Also caught in this same push, without needing
   a failing run: `playwright.config.ts` hardcoded
   `launchOptions.executablePath` to this session's dev sandbox's
   Chromium path (`/opt/pw-browsers/chromium`), which doesn't exist on a
   real GitHub Actions runner — would have failed every e2e test at
   browser launch regardless. Fixed proactively before the first push by
   only applying that path when it (or an explicit
   `PLAYWRIGHT_CHROMIUM_PATH`) actually exists on disk.
2. **Run 2** (`push 4cad925`): raised both `webServer` timeouts to 120s
   and added `stdout`/`stderr` piping (previously silent) — still failed,
   same symptom, now with real diagnostic content.
3. **Run 3** (`push f4e5f12`): the piped output showed the actual cause —
   `next dev` was listening on port **5000**, not 3000. The `e2e` job set
   `PORT: 5000` at the job level meaning only for the backend
   (`node src/server.js`, which already defaults to 5000 without it) —
   but `next dev` also reads `PORT` and bound to it too, leaving nothing
   on port 3000. Removed the redundant/harmful env var.
4. **Run 4** (`push 6f14f42`): web/'s dev server then started on the
   right port but crashed immediately: *"Turbopack is not supported on
   this platform (linux/x64) because native bindings are not available.
   Only WebAssembly (WASM) bindings were loaded."* A fresh `npm install`
   on the GitHub Actions Ubuntu image doesn't resolve a working native
   SWC binary for this project; `next build` tolerates the WASM fallback
   fine (the `web` job passed in every run), but `next dev`'s Turbopack
   refuses to. Fixed by scoping `next dev --webpack` to just the
   Playwright-driven dev server (the flag Next's own error message
   names) — the real `npm run dev` script developers use locally is
   untouched, since Turbopack works fine in every environment this was
   actually tested in.
5. **Run 5** (`push 26717c7`): `web` and `backend` passed; `e2e` got
   13/14 tests green — real, substantial progress — but the new
   "hero image" homepage E2E test hung for the full 180s test timeout.
   The webServer output revealed a second, unrelated real bug found
   along the way: `Failed to write activity log:
   PrismaClientValidationError` on `VISA_TYPE_CREATED`/`_DELETED` and
   `FERRY_SCHEDULE_CREATED`/`_DELETED`. `redactSensitive()`
   (`backend/src/utils/activityLog.js`, Phase 16) didn't know about
   Prisma `Decimal` fields (`VisaType.basePrice` etc.) — it walked one as
   a generic object, serializing its internal `{constructor, s, e, d}`
   shape instead of the value, which Prisma's `Json` column then
   rejected. `logActivity()` swallows errors by design (a logging failure
   must never break the real operation), so this had been failing
   silently since Phase 16 until this exact CI run's piped output
   surfaced it. Fixed by special-casing `Prisma.Decimal` (stored as a
   string, preserving exact precision) with a new regression test. The
   hero-image test's own hang was a second, independent bug: its
   `pollByReloading()` helper gave each `check()` attempt no bounded
   timeout, so a locator that didn't match on the very first navigation
   hung the *entire* poll (Playwright locator methods default to the
   test's overall timeout, not a short per-call one) instead of retrying
   via a fresh reload. Fixed by giving each attempt its own 5s timeout
   and catching/retrying instead of propagating the error.
6. **Run 6** (`push 26717c7`'s fix, run 32670028142): all three jobs —
   `backend`, `web`, `e2e` — passed. `Playwright E2E`: 14/14 (10
   `platform3` + 2 `mobile-web` + 2 `mobile-frontend`). Confirmed via
   `mcp__github__actions_list`/`get_workflow_run` against the real GitHub
   Actions API, not assumed from a green checkmark alone. Also re-run
   locally: 10/10 `platform3` tests passing standalone.

Also: the current branch was added to the `push` trigger's branch list
(previously only `main` and an older feature branch triggered CI on
direct pushes; a PR always would have via `pull_request`'s unfiltered
trigger, but none exists yet) — this is what made watching real runs on
this branch possible in the first place.

Two real bugs survive in the codebase from before this phase and were
fixed as a direct result of building this CI pipeline (not found any
other way this session): the Decimal-serialization audit-log bug above,
and the `pollByReloading` polling bug in `platform3.spec.ts` itself. Both
are now covered by regression tests/fixed behavior, not just papered
over to get CI green.

Avoid unnecessary Vercel deployments. If rate limited, stop deployment attempts and continue code/test work.

# 24. Phase 21 — Production Release
Status: 🟡 IN PROGRESS — everything reachable from this session is done;
Railway/Vercel/PR/merge require access this session does not have (see
below, and Section 27's Final Report for the full honest breakdown).

GitHub:
- ✅ Clean tree — `git status` clean after every phase's commit.
- ✅ Logical commits — one commit per real change throughout, never a
  batch dump (visible in `git log` across this entire session).
- ✅ CI green — the real GitHub Actions run
  (id `32670028142`, verified via the GitHub API, not assumed) has all
  three jobs passing: backend tests, frontend typecheck+build, and the
  full Playwright E2E suite (14/14).
- ⬜ PR — **not opened.** This session's operating instructions are
  explicit: never create a pull request unless the user asks for one,
  and no such request has been made. The branch
  (`feature/platform-3-admin-controlled`) is pushed, clean, and CI-green
  — ready for a PR the moment one is requested.
- ⬜ Review / merge — depend on a PR existing first; not applicable yet.

Railway: **NOT CONFIGURED** — this session has no Railway credentials,
API token, or CLI access. Nothing here was invented or assumed; it is
reported exactly as PENDING/NOT CONFIGURED per the plan's own Section 26
instruction ("on missing credentials, mark NOT CONFIGURED, don't invent,
continue").

Vercel: **NOT CONFIGURED** — same reasoning; no Vercel credentials or
deployment access from this session.

Production Smoke Test — run against this session's own fully migrated +
seeded **local** environment instead (the real backend + real Postgres
database this whole session has used), since no production Railway/
Vercel deployment is reachable to smoke-test against. This is not a
production smoke test and is not represented as one; it is the closest
verifiable proxy available — the same backend code, same Order state
machine, same real database writes a production deployment would use.
Ran the plan's exact literal flow as a real, scripted sequence of live
API calls against the running local server (the same endpoints the
staff back-office UI itself calls) with test data clearly named
`SMOKE TEST CUSTOMER ...` — never real customer data, deleted
immediately after:

Login (real staff session) → Operations (`GET /api/dashboard/operations`,
200) → Customer (created) → Service (a real seeded package service) →
Order (created, referencing that service) → Requirements
(`NEW → UNDER_REVIEW`) → Documents (`→ WAITING_DOCUMENTS`, then two real
files uploaded — PASSPORT and PHOTO, the genuine requirement for a
"package"-category order, not a minimal stand-in) → Pricing/Quote
(`→ PAYMENT_PENDING`) → Payment (a real Payment record, recalculating
the order's own `paymentStatus` to PAID) → Processing (`→ PROCESSING`)
→ Delivery (`→ APPROVED`) → Completed (`→ COMPLETED`, blocked and
correctly 409-ing until both the payment and both required documents
were genuinely in place — proving `canCompleteOrder()`'s real business
rule, not bypassing it). Final verification: a fresh `GET` of the order
confirmed `status: "COMPLETED"`, `paymentStatus: "PAID"`, and a complete
7-entry status-change history trail. 15/15 steps passed after fixing two
test-script mistakes along the way (wrong upload MIME type; the
"package" category's real two-document requirement) — both were the
script's errors, not application bugs; the underlying business rules
were correct on first try. All test-created rows (customer, order,
items, documents, payment) deleted afterward — confirmed via a direct
DB query showing zero leftovers. Full backend suite re-run clean after:
332/332.

# 25. Final Acceptance Checklist

The release is NOT complete until the following are evidenced.
Evidence for every checked item is in this document's own Phase status
notes above (Phases 1-21); items left unchecked are genuinely not done,
not silently assumed — see Section 27's Final Report for exactly why
each one is unchecked.

## Platform
- [x] Homepage admin controlled (Phase 2/14, E2E-verified Phase 18)
- [x] Images admin controlled (Phase 2/14, E2E-verified Phase 18)
- [x] Icons admin controlled (site-assets, Phase 14)
- [x] Theme admin controlled (Phase 2/14, E2E-verified Phase 18)
- [x] Services admin controlled (Phase 3/14)

## Visas
- [x] Visa types admin controlled (Phase 4/14, E2E-verified Phase 18)
- [x] Requirements admin controlled — backend engine + admin API real
      and tested (Phase 5/8); **not** yet consumed by the public
      marketing site's intake wizard — disclosed gap, see Section 27.
- [x] Attachments dynamic — server-side validation real and tested
      (Phase 6); same wizard-integration gap as above.
- [x] OCR configurable (Phase 7/13, E2E-verified with a real MRZ image
      in Phase 18)
- [x] Server-side requirement validation (Phase 6, tested)

## Services
- [x] Umrah (pre-existing + Phase 3 catalog controls)
- [x] Flights (pre-existing manual inventory; Phase 12 cache/logo layers
      added without touching business logic)
- [x] Visas (Phase 4/5/8)
- [x] Security Approvals (Phase 8, full lifecycle E2E-verified Phase 18)
- [x] Ferries (Phase 9/14, E2E-verified Phase 18)
- [x] Existing hotels not broken (no hotel-related code touched;
      `hotel-request-client.tsx` untouched all session)

## Flight data
- [x] Airline directory (Phase 10/14)
- [x] Airline logos — backend enrichment real and tested (Phase 12/18);
      **not** yet rendered by the public flight-search UI — disclosed
      gap, see Section 27.
- [x] Airport directory (Phase 11/14)
- [x] Arabic search (Phase 11, tested with the plan's own example: جدة)
- [x] English search (tested: Jeddah, King Abdulaziz)
- [x] IATA search (tested: JED)
- [x] ICAO search (tested: OEJN)
- [ ] Real schedule provider configured if credentials exist —
      **NOT CONFIGURED**: `TRIP_API_URL` is unset in every environment
      this session had access to; `trip.provider.js` correctly reports
      `configured:false` rather than fabricating a connection (confirmed
      Phase 12, not assumed).
- [x] No fake flight data — confirmed by reading `trip.provider.js`
      directly; no invented provider responses anywhere.

## Operations
- [x] Operations Center (pre-existing; mobile-regression E2E passing
      throughout this session)
- [x] Next Action (pre-existing Operations Center logic, untouched)
- [x] Assignment (pre-existing `orders.routes.js` assign endpoint,
      untouched, covered by the Phase 21 smoke test's real order flow)
- [x] Payment review (pre-existing Payment Review page; mobile-
      regression E2E passing throughout)
- [x] Documents (pre-existing; exercised for real in the Phase 21 smoke
      test's document-upload steps)
- [x] Customer 360 (pre-existing customer/order/document relations,
      untouched)

## Financial
- [x] Revenue (pre-existing `dashboard.service.js` aggregates, reviewed
      in Phase 17 and confirmed already using correct server-side
      `groupBy`/`aggregate`, not touched)
- [x] Paid (pre-existing `Payment`/`recalculateOrderPaymentStatus`,
      exercised for real in the Phase 21 smoke test)
- [x] Outstanding (same mechanism, pre-existing, untouched)
- [x] Refunds (pre-existing `payments.service.js` reject/refund path,
      untouched — no business logic changes made anywhere in payments)
- [x] Supplier cost (pre-existing `OrderItem.supplierCost`, untouched)
- [x] Profit only when supplier cost is available (pre-existing
      guard, untouched — verified by reading, not assumed)

## Security
- [x] RBAC (Phase 15, 12 real tests both directions)
- [x] Customer isolation (Phase 17 review — `/track` portal's
      ownership-scoped queries confirmed genuinely IDOR-safe)
- [x] File access protection (Phase 17 review — random server-generated
      filenames, MIME allowlists, size limits on every upload path)
- [x] IDOR review (Phase 17, see Customer isolation above)
- [x] Upload validation (Phase 17 review, confirmed on every upload path)
- [x] Audit logs (Phase 16, old/new value capture + redaction, a real
      Decimal-serialization bug found via CI and fixed with a
      regression test)
- [x] No secrets in Git (Phase 17 — `.env`/`.env.*` gitignored and
      confirmed not tracked; no hardcoded secret-shaped literal found
      anywhere in tracked source)

## Quality
- [x] Backend tests (332/332, `npm test`)
- [x] Frontend typecheck (`npx tsc --noEmit`, zero errors, verified via
      real CI run)
- [x] Production build (`next build`, 24 routes, verified via real CI
      run)
- [x] E2E (14/14 across 3 Playwright projects, verified via real CI run
      — id `32670028142`, not assumed from a green checkmark alone)
- [x] Migration integrity (`migrationIntegrity.test.js`, part of every
      `npm test` run)
- [x] Fresh DB migration test (Phase 19 — all 30 migrations applied
      cleanly to a brand-new empty database from zero, then seeded
      successfully)

## Production
- [ ] Railway successful — **NOT CONFIGURED**: no Railway credentials
      or access available to this session.
- [ ] Database connected — N/A to a production Railway database
      specifically; the *local* database this session used throughout
      is connected and was exercised extensively.
- [ ] Migrations applied — same caveat: applied and verified locally/on
      a fresh test DB (Phase 19), never against a Railway production DB
      this session cannot reach.
- [ ] Vercel Ready — **NOT CONFIGURED**: no Vercel credentials or access
      available to this session.
- [ ] Domain working — no production domain exists yet to check.
- [ ] Production Smoke Test — the literal production smoke test was not
      run (no production deployment exists). A full equivalent was run
      against this session's real local backend + database instead
      (Phase 21's own status note above) and passed 15/15 steps — the
      closest verifiable proxy available, not a substitute for the real
      thing.

# 26. Execution Rules for Claude Code

Do not ask the user "should I continue?" between phases.

If a bug appears:
1. reproduce;
2. fix;
3. add regression test;
4. continue.

If a migration conflict appears:
1. inspect migration history;
2. inspect SQL;
3. preserve existing flight tables;
4. fix safely;
5. test on a fresh DB;
6. continue.

If an external credential is required:
- do not invent it;
- do not commit it;
- mark integration `NOT CONFIGURED`;
- continue other work.

If an external deployment is rate limited:
- do not spam retries;
- continue development/tests;
- deploy later.

If production login requires a real password:
- do not guess or store it;
- perform all non-authenticated checks;
- mark production Smoke Test blocked until a human authenticates.

# 27. Final Report Format

At completion, report:

```text
NASAEM PLATFORM 3.0 — FINAL STATUS

Homepage: PASS/FAIL
Theme: PASS/FAIL
Services: PASS/FAIL
Visas: PASS/FAIL
Requirements: PASS/FAIL
Attachments: PASS/FAIL
Passport OCR: PASS/FAIL
Security Approvals: PASS/FAIL
Ferries: PASS/FAIL
Airlines: PASS/FAIL
Airports: PASS/FAIL
Flight Search: PASS/FAIL
Flight Schedule: PASS/FAIL
Feature Flags: PASS/FAIL
Admin Configuration: PASS/FAIL
RBAC: PASS/FAIL
Audit Logs: PASS/FAIL
Performance: PASS/FAIL
Security: PASS/FAIL
Backend Tests: PASS/FAIL
Frontend Build: PASS/FAIL
E2E: PASS/FAIL
Migration: PASS/FAIL
CI: PASS/FAIL
Railway: PASS/FAIL
Vercel: PASS/FAIL
Production Smoke Test: PASS/FAIL

WhatsApp: CONFIGURED / NOT CONFIGURED
External Flight Provider: CONFIGURED / NOT CONFIGURED
AI: IMPLEMENTED / NOT IMPLEMENTED

PRODUCTION STATUS:
READY / NOT READY

BLOCKERS:
...

MANUAL ACTIONS REQUIRED:
...
```

Do not claim READY without evidence.

# 28. Implementation Log

Update this section during execution:

Batch 1 — Homepage/Theme:
`🟢 COMPLETE` — Phase 1 (Site Builder/Homepage) and Phase 2 (Central
Theme/Appearance) both done, tested and verified live; see their status
notes above.

Batch 2 — Services/Visas/Requirements/Attachments/OCR:
`🟢 COMPLETE` — Services/visa-types CRUD, document requirements engine
(`SERVICE_DOCUMENT_REQUIREMENTS`), attachment upload/MIME allowlist and
passport MRZ OCR (Tesseract, deterministic) all exercised with real data
through Phase 14 admin-management wiring, Phase 18 E2E (visa-type
creation/resolution, PASSPORT_OCR gating), and the Phase 21 local
production-equivalent smoke test (real document upload against
`SERVICE_DOCUMENT_REQUIREMENTS`'s `["PASSPORT","PHOTO"]` rule). Disclosed
gap carried forward: the Requirements Engine's per-visa-type requirement
list is not yet wired into the public intake wizard's UI (backend
contract verified in Phase 18 E2E, not the wizard rendering).

Batch 3 — Security Approvals/Ferries:
`🟢 COMPLETE` — Phase 18 E2E's "Security approvals — full lifecycle"
test drives a real request → documents → payment → processing → approval
→ delivery → completion path through the actual customer-facing UI and
admin actions ("موافقة على السعر", "تم تحويل المبلغ"); ferries
(operators/schedules CRUD, public dropdown population) covered by Phase
14 admin wiring and its own Phase 18 E2E test. Re-confirmed in the Phase
21 local smoke test's order-lifecycle walkthrough.

Batch 4 — Airlines/Airports/Flight Search/Schedules:
`🟢 COMPLETE` — Airlines/airports CRUD, flight-booking N+1 fix (Phase
17), and flight-schedule listing all covered by backend tests
(`flightBookingWorkflow.test.js`, `airports.test.js`) and Phase 18 E2E
(airport search by Arabic/English/IATA/ICAO, airline logo-enrichment
contract). Disclosed gap carried forward: airline logos and airport
autocomplete are not yet rendered in the public flight-search UI
(backend contract verified, not the search-page rendering).

Batch 5 — Feature Flags/Admin/RBAC/Audit:
`🟢 COMPLETE` — Feature-flags CRUD (Phase 14), CONTENT_MANAGER role
(Phase 15, 12 dedicated RBAC tests covering both directions), and audit
logging with real oldValue/newValue capture plus structural sensitive-key
redaction and Decimal-serialization fix (Phase 16/20, `activityLog.test.js`)
all implemented and tested against a real database, not mocked.

Batch 6 — Performance/Security/Testing/Release:
`🟢 COMPLETE` — CORS fail-open fix and flight-booking N+1 fix (Phase 17);
full CI pipeline (backend/web/e2e jobs) green end-to-end on GitHub Actions
(Phase 20, run `32670028142`); 332/332 backend tests and 10/10 Playwright
E2E tests passing as of the last verified run (see Phase 20/21 status
notes above). Release itself (Railway/Vercel deployment) is out of this
session's reach — see Final Production Lock below.

Final Production Lock:
`🟡 BLOCKED ON DEPLOYMENT ACCESS` — Everything within this session's
reach (code, migrations, tests, CI, local production-equivalent smoke
test) is complete and verified; see Phase 21 status notes and Section 25.
Actual production lock (Railway backend deploy, Vercel frontend deploy,
domain cutover, live production smoke test) could not be performed: this
session has no Railway/Vercel credentials or deployment access. This is
disclosed as a genuine blocker, not silently skipped — see the Final
Report's BLOCKERS/MANUAL ACTIONS REQUIRED sections.

# 29. Core objective

The goal is not to add the largest number of features.

The goal is to make Nasaem Platform:

**manageable → configurable → secure → testable → scalable → production-safe.**

End of master plan.
