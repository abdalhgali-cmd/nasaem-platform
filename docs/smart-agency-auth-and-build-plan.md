# Nasaem Smart Agency — Architecture and Authentication Baseline

Reviewed against `main` at commit `2c40487d22e8a4ebd67a9fdf8e7eb0d175ed5480` (2026-11-26). This document is a verified code-based baseline and a proposed implementation sequence, **not evidence that new smart features have shipped**.

## Existing products and boundaries
- `backend/`: Express 5, Prisma, PostgreSQL API. `backend/src/app.js` mounts the API, request origin policy, cookie parsing and CSRF middleware.
- `backend/public/`: same-origin staff back office with login and operations.
- `web/`: Next.js website, customer and admin account pages.
- `mobile/www/`: customer Android experience packaged by Capacitor 8; existing home, Umrah, Egypt, requests, payments and notifications screens. Reuse it rather than create a disconnected replacement.
- Customer-facing scope: **Umrah and Egypt** until an owner-approved scope change. Existing other modules remain in code but must not be represented as bookable services by a new assistant or front end.

## Authentication components
| Boundary | Files | Behavior |
|---|---|---|
| Staff endpoints | `backend/src/modules/auth/auth.routes.js`, `auth.controller.js`, `auth.service.js` | Login, logout, me, change-password; login throttling; active staff only; role data |
| Staff request guard | `backend/src/middleware/auth.middleware.js` | Bearer first, otherwise `accessToken` cookie; verifies JWT; fetches live user + organization, session version and revocation status; role guard |
| Customer endpoints | `backend/src/modules/customer-auth/customer-auth.routes.js`, controller/service | Register, login, logout, me, refresh, profile, password reset/change and optional Google login |
| Customer request guard | `customer-auth.middleware.js` | Bearer first, otherwise `customerAccessToken` cookie; verifies customer scope, current account/organization, session version and revoked jti |
| JWT and password | `backend/src/utils/jwt.js`, `password.js` | HMAC JWT signed with server-only `JWT_SECRET`; bcrypt hash with 12 rounds |
| App client | `mobile/www/js/auth.js`, `api.js`, `session-core.js`, `secure-store.js` | Holds current bearer in memory; persists in Android Keystore-backed native secure store; verifies against `/customer-auth/me`, renews and locks biometric sessions |
| Optional Google | `customer-auth/google-auth.js`, `docs/google-customer-login.md` | Server verifies Google ID token, audience and nonce; maps to an agency customer session; optional; Android native Credential Manager |

## Request flows
**Staff**
1. Staff submits email/password to `POST /api/auth/login` (subject to rate limits and Zod validation).
2. `loginUser` retrieves staff record, checks bcrypt password and active status, issues staff JWT `{sub, role, email, sv}` with unique `jti`, updates last login.
3. Controller sets `accessToken` cookie (`HttpOnly`, `Secure` in production, `SameSite=None` for documented cross-site production; `Lax` locally). **The JSON response also returns the token**, so a bearer-capable client can read it.
4. Protected requests send Bearer or cookie; `requireAuth` verifies signature/expiry, active user/organization, `sessionVersion`, individual token revocation; `requireRole` protects role-restricted routes.
5. Logout records revocation of token identifier and clears cookie. Password change increments `sessionVersion`, ending other sessions while issuing a replacement for this device.

**Customer / mobile**
1. `POST /api/customer-auth/register` or `/login` validates input, uses bcrypt, returns a customer JWT and profile and sets `customerAccessToken` HttpOnly cookie.
2. Customer JWT has `scope=customer`, `sub`, `jti` and `sv`, 30-day lifetime; unlike staff and phone-only tracking tokens, it is scope restricted.
3. Capacitor client stores the JWT in Android native encrypted storage (AES-GCM + Android Keystore); browser development fallback is tab-scoped `sessionStorage`. App API sends `Authorization: Bearer ...` and `credentials: include`. Existing legacy Capacitor Preferences tokens are migrated then removed.
4. `GET /api/customer-auth/me` checks current validity; HTTP 401 with explicit session-end code signs the customer out; 503, timeout or network errors preserve stored credentials and present retry.
5. `POST /api/customer-auth/refresh` requires a currently verified session and returns a new JWT; `POST /logout` revokes current `jti`; password change/reset increments `sessionVersion`.
6. Optional Google sign-in requires a server-issued challenge, nonce validation, verified identity and backend-issued normal customer session. Google web/native configuration and actual device tests must be confirmed before calling it production-ready.

**Request protection:** `backend/src/app.js` configures origin allowlist and `/api` CSRF middleware. Do not disable either for mobile compatibility. Android uses the existing explicit app-request provenance header. Public tracking tokens have `scope=tracking` and are **not** interchangeable with staff/customer credentials.

## Risks / improvement candidates (not yet patched)
- Login endpoints return JWTs in **JSON and cookies**. HttpOnly protects only cookie copies; audit web JS consumers, avoid storage in localStorage/logs, and consider a carefully tested cookie-only staff web flow without breaking Android Bearer semantics.
- Password reset codes in `customer-auth.service.js` appear to be compared as plain values in database. Consider hashing short-lived reset codes at rest with constant-time validation, rate limits and migration-safe tests.
- Customer and staff JWTs share `JWT_SECRET`, separated by scope rules. Assess rotation strategy and explicit issuer/audience enforcement without invalidating existing active sessions unexpectedly.
- Check CSRF, CORS, tenancy and rate-limit coverage for any future smart-assistant tool endpoints.
- Existing GitHub docs and deployed instances can drift. Confirm branch SHA, CI, QA API and a real Android device before declaring features shipped.

## Smart agency build plan — additive, testable, no fake booking
**Phase 1 — secure in-app assistant**
- Expose a read-only assistant API authenticated with existing customer session, server-side tenant scoping and per-user rate limits. It may only answer about agency-published Umrah/Egypt services, prices and requirements retrieved server-side. Unknown prices must be marked unknown.
- Add a small **مساعد نسائم** entry to the existing Capacitor app; Arabic-first UI, accessible focus, concise choices, consent before submitting requests. No credentials or passports in model prompts or analytics.
- Keep conversation transcripts off by default; scrub PII and implement bounded requests and fallback to human WhatsApp assistance. Any AI provider key is server-side only.
- Write contract tests for unauthorized cross-tenant access, unsupported claims, prompt injection, rate limits and missing catalog values.

**Phase 2 — guided journeys**
- Umrah: ask only relevant fields, use the backend's published packages and per-pilgrim document checklist, show requirement-specific upload failures and resubmission.
- Egypt: reuse the existing clearance journey, actual pricing fields and status updates. Never auto-approve visas/payments.
- Link exact request/detail from notifications; confirm mobile navigation and replay-safety.

**Phase 3 — quality gates**
- Targeted unit/integration tests, disposable DB migrations only when necessary, web lint/typecheck, mobile syntax/unit tests, Android QA build, device security checks, CI on exact candidate SHA.
- Explicit owner approval before merging `main`, staging/production deploys, live migrations, or distributing APKs. Production migrations also require verified database + uploads backup **and restore**.

## Acceptance checklist
- No duplicated app or breaking changes to established public APIs.
- Auth boundaries intact (staff/customer/tracking separation, tenant isolation, CSRF).
- Every assistant price comes from published backend source, not generated content.
- No transmission of tokens, passport images or payment details to an AI model.
- Verified anonymous Umrah/Egypt information and authenticated request tracking.
- CI pass on the exact commit and documented Android real-device checks.
