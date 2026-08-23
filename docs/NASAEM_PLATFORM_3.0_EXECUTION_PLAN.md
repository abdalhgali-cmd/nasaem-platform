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
Status: ⬜ PENDING

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
Status: ⬜ PENDING

Create a clear Admin configuration center containing:
- Appearance;
- Homepage;
- Services;
- Visas;
- Requirements;
- Documents;
- OCR;
- Security Approvals;
- Ferries;
- Airlines;
- Airports;
- Flight settings;
- Feature flags;
- Notifications;
- system settings.

Avoid one giant unstructured settings screen.

# 18. Phase 15 — RBAC
Status: ⬜ PENDING

Reuse existing RBAC.

Possible roles, only if they do not already exist:
- SUPER_ADMIN;
- ADMIN;
- OPERATIONS;
- FINANCE;
- CONTENT_MANAGER.

Enforce authorization server-side.

Content Manager should not automatically gain financial or operational permissions.

# 19. Phase 16 — Audit Logs
Status: ⬜ PENDING

Sensitive configuration changes should record:
- actor;
- action;
- entity;
- entity ID;
- timestamp;
- old value where safe;
- new value where safe.

Never log passwords, tokens, payment secrets or passport image bytes.

# 20. Phase 17 — Performance & Security
Status: ⬜ PENDING

Review:
- Prisma N+1 queries;
- indexes;
- pagination;
- response size;
- image loading;
- caching where justified;
- dashboard queries.

Security review:
- authentication;
- authorization;
- customer isolation;
- document access;
- IDOR;
- upload validation;
- rate limiting;
- input validation;
- error leakage;
- secrets;
- CORS/CSRF where applicable.

Every customer-facing resource must enforce ownership or authorized access.

# 21. Phase 18 — Testing
Status: ⬜ PENDING

Maintain:
- unit tests;
- integration/API tests;
- TypeScript;
- production build;
- Playwright/E2E.

Required E2E scenarios:

### Homepage
Admin changes image → public image changes.
Admin changes theme → public theme changes.
Admin disables service → public service follows configuration.

### Visa
Admin creates visa → public service appears.
Admin adds requirement → application checklist changes.
Admin enables OCR → OCR is used.

### Airports
Admin adds airport → Arabic/English/IATA/ICAO search finds it.

### Airlines
Admin adds airline/logo → flight display resolves it.

### Ferries
Admin adds schedule → public schedule displays it.

### Security approvals
Request → documents → payment → processing → approval → delivery → completion.

# 22. Phase 19 — Migration Safety
Status: ⬜ PENDING

Known project hazard:
some flight tables were historically created using raw SQL and are not fully represented in Prisma models.

Therefore:
- never use `prisma migrate dev` in production;
- never use `prisma db push` in production;
- inspect every migration SQL;
- reject unintended DROP/TRUNCATE/destructive changes;
- test migrations on fresh PostgreSQL;
- run `prisma migrate deploy`;
- run `prisma migrate status`.

Keep migration integrity tests protecting critical flight tables.

# 23. Phase 20 — CI/CD
Status: ⬜ PENDING

Before merge:
- backend tests pass;
- frontend typecheck passes;
- frontend production build passes;
- relevant E2E passes;
- migration integrity passes.

Avoid unnecessary Vercel deployments. If rate limited, stop deployment attempts and continue code/test work.

# 24. Phase 21 — Production Release
Status: ⬜ PENDING

After development is complete:

GitHub:
- clean tree;
- logical commits;
- PR;
- CI green;
- review;
- merge.

Railway:
- successful deployment;
- migration status current;
- health endpoint healthy;
- database connected.

Vercel:
- production deployment Ready;
- correct commit;
- domain healthy.

Production Smoke Test with test data:
Login → Operations → Customer → Order → Service → Requirements → Documents → Pricing → Quote → Payment → Processing → Delivery → Completed.

Do not use real customer data.

# 25. Final Acceptance Checklist

The release is NOT complete until the following are evidenced:

## Platform
- [ ] Homepage admin controlled
- [ ] Images admin controlled
- [ ] Icons admin controlled
- [ ] Theme admin controlled
- [ ] Services admin controlled

## Visas
- [ ] Visa types admin controlled
- [ ] Requirements admin controlled
- [ ] Attachments dynamic
- [ ] OCR configurable
- [ ] Server-side requirement validation

## Services
- [ ] Umrah
- [ ] Flights
- [ ] Visas
- [ ] Security Approvals
- [ ] Ferries
- [ ] Existing hotels not broken

## Flight data
- [ ] Airline directory
- [ ] Airline logos
- [ ] Airport directory
- [ ] Arabic search
- [ ] English search
- [ ] IATA search
- [ ] ICAO search
- [ ] Real schedule provider configured if credentials exist
- [ ] No fake flight data

## Operations
- [ ] Operations Center
- [ ] Next Action
- [ ] Assignment
- [ ] Payment review
- [ ] Documents
- [ ] Customer 360

## Financial
- [ ] Revenue
- [ ] Paid
- [ ] Outstanding
- [ ] Refunds
- [ ] Supplier cost
- [ ] Profit only when supplier cost is available

## Security
- [ ] RBAC
- [ ] Customer isolation
- [ ] File access protection
- [ ] IDOR review
- [ ] Upload validation
- [ ] Audit logs
- [ ] No secrets in Git

## Quality
- [ ] Backend tests
- [ ] Frontend typecheck
- [ ] Production build
- [ ] E2E
- [ ] Migration integrity
- [ ] Fresh DB migration test

## Production
- [ ] Railway successful
- [ ] Database connected
- [ ] Migrations applied
- [ ] Vercel Ready
- [ ] Domain working
- [ ] Production Smoke Test

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
`⬜ PENDING`

Batch 3 — Security Approvals/Ferries:
`⬜ PENDING`

Batch 4 — Airlines/Airports/Flight Search/Schedules:
`⬜ PENDING`

Batch 5 — Feature Flags/Admin/RBAC/Audit:
`⬜ PENDING`

Batch 6 — Performance/Security/Testing/Release:
`⬜ PENDING`

Final Production Lock:
`⬜ PENDING`

# 29. Core objective

The goal is not to add the largest number of features.

The goal is to make Nasaem Platform:

**manageable → configurable → secure → testable → scalable → production-safe.**

End of master plan.
