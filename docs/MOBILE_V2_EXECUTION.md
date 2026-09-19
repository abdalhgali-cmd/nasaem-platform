# Mobile V2 execution plan

Branch: `feature/mobile-app-v2`

## Batch 1 — Native foundation
- [x] Create isolated development branch.
- [x] Add Capacitor mobile workspace.
- [x] Define Android application id: `com.nasaemalharamain.app`.
- [x] Keep existing backend and customer web app as source of truth.
- [ ] Generate and commit native Android project.
- [ ] Add GitHub Actions debug APK build.
- [ ] Install APK on a physical Android device and smoke-test navigation/uploads.

## Batch 2 — Mobile design system
- Mobile-first shell and bottom navigation.
- RTL safe areas, keyboard handling, loading/offline/error states.
- Branded splash screen and adaptive Android icon.

## Batch 3 — Dynamic services
- Service-driven forms.
- Umrah flow first.
- SAR primary pricing with SDG equivalent.

## Batch 4 — Travelers and documents
- Independent traveler records.
- Mandatory passport per traveler.
- Service-specific document rules.
- Fix second-traveler upload path.

## Batch 5 — Orders and payment
- Review-before-payment workflow.
- Customer/admin role separation.
- Order timeline and payment receipt.

## Batch 6 — Notifications and deliverables
- Push notifications.
- Issued visa/ticket/voucher PDFs inside the order.

## Batch 7 — QA/security
- Backend tests, typecheck/build, Playwright, Android build.
- Authorization, upload validation, offline/network failure handling.

## Batch 8 — Release
- Signed APK and AAB.
- GitHub Release automation.
- Merge only after owner approval.
