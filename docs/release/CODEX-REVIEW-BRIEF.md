# Independent Codex review: PR stack #147–#152

Run this from the repository root, on branch `feat/intake-scope-umrah-egypt-20261101` (the top of the stack). Codex needs a signed-in account: either `codex login`, or `OPENAI_API_KEY` set in the environment.

```bash
git fetch origin fix/egypt-intake-staging-20261024
codex exec --sandbox read-only -C . -o docs/release/codex-review-1.md "$(sed -n '/^## Prompt/,$p' docs/release/CODEX-REVIEW-BRIEF.md | tail -n +2)"
```

The review is read-only: it must not modify code. Claude then verifies each finding, fixes verified P0/P1 defects with regression tests, and asks Codex to re-review the fix commits.

## Prompt

You are an independent reviewer of the Nasaem Al-Haramain travel platform.

**Codebase:**
- Express/Prisma backend in `backend/`.
- Next.js customer site and `/admin` dashboard in `web/`. `web/AGENTS.md` applies: this Next.js version differs from older ones.
- Static back-office in `backend/public/`.
- Capacitor Android app in `mobile/www/` and `mobile/android/`.

**What to review.** Review the actual code of the stack: `git diff origin/fix/egypt-intake-staging-20261024...HEAD`, plus any code those changes call. Do not judge the code by its CI results.

**Product scope (owner decision):**
- Only Umrah and Egypt Security Approval are customer-facing and accept new applications.
- All other services are hidden but kept, with their data, APIs and components.
- The server-side gate is `PUBLIC_INTAKE_SCOPE`: unset means Umrah + Egypt; `ALL` means every service.
- Egypt's optional flight-ticket assistance is kept.

**Prices:** prices and exchange rates are development/test data, not final. They must be editable from the admin dashboard and labelled as test data outside production. Do not report "price not confirmed" as a defect.

**Review areas:**
1. **Mobile app:** UX, Arabic RTL, navigation, authentication, session security, upload/download flows, Android compatibility (Capacitor config, permissions, WebView).
2. **Website:** responsive design, performance, usability, accessibility (WCAG 2.1 AA), and that only the active services are visible.
3. **Admin dashboard:** usability, workflow clarity, permissions per role (SUPER_ADMIN, ADMIN, EMPLOYEE, ACCOUNTANT), employee operations, notifications, case management.
4. **Umrah:** the full customer journey, documents, pricing logic, payments, tracking, delivery of final files.
5. **Egypt Security Approval:**
   - air and land workflows;
   - document validation;
   - payment;
   - approval upload ordering (approval only after payment is accepted);
   - travel details;
   - circular issuance (PDF only);
   - delivery.
6. **Security:**
   - authorization and tenant isolation;
   - data exposure in API responses;
   - passport data and passport files;
   - payment receipts;
   - API input validation;
   - secrets in code or logs;
   - file access (signed or authenticated downloads only);
   - CSRF.
7. **Backend and database:** data integrity, transaction safety, idempotency of payment acceptance, concurrency (double submit, double accept), error handling, backup and restore scripts.
8. **Release engineering:**
   - PR dependencies (a linear stack #147 ← … ← #152, plus #146 off the base);
   - CI coverage gaps;
   - staging readiness;
   - APK configuration (environment badge, API URL, signing);
   - hosting risks (Railway, persistent `/data/uploads`).

**Already resolved; do not report again:**
- The legacy e2e failures fixed in #151.
- The pending-payment card that persisted after a receipt upload (fixed in #151).
- The public API accepting flight and work-visa applications (closed by the intake gate in #152).
- The order dependence in the `publicIntakeScope` and `releaseReadiness` tests.

**Output rules:**
- Evidence-based only. For every finding give:
  - severity: P0 Critical, P1 High, P2 Medium or P3 Low;
  - kind: VERIFIED BUG, POTENTIAL RISK or ENHANCEMENT;
  - exact file path and line numbers;
  - the concrete failure scenario (input or state → wrong result);
  - the missing test that would catch it.
- Group the findings by the 8 areas above.
- End with a list of missing tests and a short list of what you checked and found sound.
- Do not modify any file.
