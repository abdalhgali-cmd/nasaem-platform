# NASAEM — Final Release Readiness Report

## Repository baseline

| Field | Actual | Status |
|---|---|---|
| Repository | `abdalhgali-cmd/nasaem-platform` | PASS |
| Branch | `feature/launch-readiness-remediation` | PASS |
| PR | #42 | OPEN / NOT MERGED |
| Production deploy | Not performed | NOT PERFORMED |
| Production migration | Not performed | NOT PERFORMED |
| Production configuration | Not changed | NOT CHANGED |
| Production credentials | Not used | NOT USED |

## Engineering evidence

GitHub Actions uses disposable PostgreSQL for backend integration testing. Migrations and seed run before the backend test suite. Frontend typecheck/build and Playwright E2E are CI gates.

A dedicated test `backend/tests/customerIsolation.test.js` now creates two independently authenticated customers and verifies:

- A's order list excludes B's order and vice versa;
- A can open A's order and B can open B's order;
- cross-customer direct-ID order access returns 404 in both directions;
- each customer may mutate only their own notification;
- cross-customer notification mutation returns 404.

The implementation commit containing this test completed CI successfully, establishing:

> **CROSS-CUSTOMER ACCESS = 0 for the covered order and notification paths.**

## Architecture decision

The target architecture now anticipates multiple independent travel agencies while retaining Nasaem Al-Haramain as the default organization for all existing data. This change adds an explicit Prisma `Organization`, backfills current rows without moving ownership, propagates organization identity through staff/customer authentication, scopes the principal customer/order/contact-request staff surfaces, and adds database triggers that reject an Order or linked ContactRequest whose organization differs from its Customer.

This is a **tenant-foundation increment**, not a claim that every catalog, finance, supplier, content, audit and configuration table has already been classified and isolated. `backend/tests/organizationIsolation.test.js` supplies the new automated two-organization matrix for covered paths; GitHub CI and writable Staging verification are still required before the invariant can be accepted as release evidence.

## Preview / Staging evidence

A Vercel Preview deployment exists for PR #42 and reaches `READY` with `target: null` (not Production). Preview responses are protected with `x-robots-tag: noindex`, and Vercel runtime logs are available. A seven-day runtime-error query returned no runtime errors at review time.

During readiness verification, an important Preview safety issue was discovered: browser code could be configured/hardcoded to call the Railway Production API from a branch Preview. This was fixed in:

- `web/src/lib/api-url.ts`
- `web/public/assets/api.js`

When the configured backend is the Production Railway host, browser requests from any unapproved Preview/branch hostname now fail closed to same-origin `/api` instead of reaching Production. The deployed Preview copy of `/assets/api.js` was fetched and verified to contain this guard.

Therefore:

| Environment capability | Status |
|---|---|
| Frontend Preview deployment | PASS |
| Preview noindex | PASS |
| Vercel runtime log/error visibility | PASS/PARTIAL MONITORING EVIDENCE |
| Preview → Production mutation protection | IMPLEMENTED |
| Safe frontend/read-only QA | AVAILABLE |
| Writable Staging backend | NOT AVAILABLE |
| Disposable Staging database | NOT AVAILABLE |
| Live Customer A/B write tests | BLOCKED UNTIL NON-PRODUCTION BACKEND/DB |

Do not create test customers, orders, uploads, payment proofs or other write data on Preview until a dedicated non-Production backend/database is provided.

## Security

Repository evidence includes server-side authentication/authorization, Customer ownership checks, RBAC, document/payment protections, upload validation, rate limiting, CORS fail-closed behavior, production error sanitization and the new A/B direct-object regression tests.

Preview hardening now also prevents branch QA from accidentally mutating the Production Railway backend.

No production secrets, real customer PII/documents or real payment data were used in this readiness work.

## Payment decision

The current code implements a manual payment record/review workflow. There is no evidence of a selected live gateway contract requiring us to fabricate webhook/provider verification.

Production gate:

- **Option A:** Owner/Finance explicitly approve the manual payment workflow for launch; or
- **Option B:** select a gateway, supply Sandbox credentials/callback environment and complete provider verification.

A payment provider is not automatically a code blocker when the approved business process remains manual.

## Supplier decision

Supplier/provider verification is required only for integrations that are actually enabled. If no external API contract exists for a flow, the product must retain explicit manual quote/review behavior rather than implying real-time supplier availability.

## Infrastructure and operations

| Gate | Status | Required evidence |
|---|---|---|
| Vercel frontend Preview | PASS | READY Preview + logs + noindex |
| Dedicated non-Production backend/database | INFRASTRUCTURE INPUT REQUIRED | Disposable backend, DB and non-Production secrets |
| Railway backend operations | INFRASTRUCTURE INPUT REQUIRED | health, replicas/resources, backend logs/redaction and environment ownership |
| Backup | INFRASTRUCTURE INPUT REQUIRED | schedule, retention, encryption and successful backup evidence |
| Restore | INFRASTRUCTURE INPUT REQUIRED | isolated restore drill + integrity verification |
| RPO/RTO | INFRASTRUCTURE INPUT REQUIRED | measured during restore drill |
| Monitoring | PARTIAL | Vercel logs/errors visible; backend/DB/provider alert thresholds/destinations/on-call remain |
| Rollback | INFRASTRUCTURE INPUT REQUIRED | non-Production full-stack rollback drill |
| Incident response | OWNER/INFRASTRUCTURE INPUT REQUIRED | severity ownership, escalation and communication process |

## Commercial and legal gates

| Gate | Status |
|---|---|
| Approved current visa/service pricing and requirements | OWNER INPUT REQUIRED |
| Approved Umrah package/commercial data | OWNER INPUT REQUIRED |
| Approved company/contact/support information | OWNER INPUT REQUIRED |
| Privacy/Terms/Cancellation/Refund/Payment/document policies | LEGAL/OWNER INPUT REQUIRED |
| Payment process decision | OWNER/FINANCE ACTION REQUIRED |
| Supplier/manual-flow decisions | OWNER/OPERATIONS ACTION REQUIRED |

## Remaining production gates

1. Provision a disposable non-Production backend and PostgreSQL database, with non-Production secrets and storage.
2. Execute live synthetic Customer A/B isolation across every customer-owned resource, direct object ID, file/download, search/filter/export and mutation path.
3. Execute live Organization A/B isolation and complete the tenant classification/scoping audit for remaining modules.
4. Execute the complete staff/customer RBAC and customer journey matrix in writable Staging.
5. Approve the manual payment flow or verify a selected payment provider in Sandbox.
6. Verify every enabled supplier integration in Sandbox, or explicitly approve manual flow where no integration exists.
7. Execute isolated backup/restore and record measured RPO/RTO.
8. Configure backend/database/provider monitoring, alert destinations, thresholds and operational ownership.
9. Execute a non-Production rollback drill.
10. Obtain legal, commercial, pricing, company-data, supplier/payment-policy and owner approvals.

## Current classification

> **APPLICATION: READY FOR CONTROLLED FRONTEND PREVIEW / OWNER REVIEW**
>
> **AUTOMATED CUSTOMER ISOLATION: PASS FOR COVERED CI PATHS**
>
> **WRITABLE STAGING: NOT READY — NON-PRODUCTION BACKEND/DATABASE REQUIRED**
>
> **PRODUCTION: NOT READY — EXTERNAL VERIFICATION REQUIRED**

**MERGE: NOT PERFORMED**  
**PRODUCTION DEPLOY: NOT PERFORMED**  
**PRODUCTION MIGRATION: NOT PERFORMED**  
**PRODUCTION CONFIGURATION: NOT CHANGED**
