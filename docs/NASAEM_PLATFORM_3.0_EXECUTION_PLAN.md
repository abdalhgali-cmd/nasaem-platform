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
Status: ⬜ PENDING

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
Status: ⬜ PENDING

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
Status: ⬜ PENDING

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
Status: ⬜ PENDING

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
Status: ⬜ PENDING

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
Status: ⬜ PENDING

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
Status: ⬜ PENDING

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
Status: ⬜ PENDING

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
Status: ⬜ PENDING

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
Status: ⬜ PENDING

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
