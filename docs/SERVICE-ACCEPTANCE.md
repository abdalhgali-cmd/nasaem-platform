# Per-service acceptance — 2026-10-11

Branch `claude/busy-hamilton-1ccxm1`. Local PostgreSQL 16, Node 22, Chromium (Playwright). Prices, requirements and catalog entries are the seeded/back-office ones; nothing was invented for a service that has none (flights, ferries and hotels have **no** document requirement configured, so their journeys carry travelers but no documents).

Journey checked for each service: selection → travelers → each required document per traveler → staff document review → quote → customer approval → receipt → staff payment decision → «تم قبول الدفع، بانتظار بدء التنفيذ» → staff record execution → service-specific stage → final file → closed «مكتمل». At each of the last three stages the back-office label and the customer's label are compared.

## Results

| Service | API journey (`backend/tests/serviceJourneys.test.js`) | Browser journey (`web/e2e/service-journeys.spec.ts`) | Execution label shown only after it is recorded | Android device |
|---|---|---|---|---|
| Flights | **Verified** | **Verified** (+ receipt rejected with reason, re-uploaded; staff opened from the notification) | جارٍ إصدار تذكرة الطيران | **Not tested** |
| Ferries | **Verified** | **Verified** | جارٍ إصدار تذكرة العبّارة | **Not tested** |
| Hotels | **Verified** | **Verified** (new shared form: stay details, then guests) | جارٍ تأكيد حجز الفندق | **Not tested** |
| Umrah | **Verified** (2 pilgrims × 2 documents) | **Verified** (package chosen first) | جارٍ استخراج تأشيرة العمرة | **Not tested** |
| Family visit | **Verified** (per-visitor + request documents) | **Verified** | جارٍ استخراج تأشيرة الزيارة العائلية | **Not tested** |
| Egypt clearance | **Verified** (per-traveler passport + entry question) | **Verified** | جارٍ استخراج الموافقة الأمنية | **Not tested** |
| Visa configured at run time | **Verified** (visa type + per-traveler requirement created through the admin API in the test) | **Verified** (+ a document rejected with reason, re-uploaded for that traveler) | جارٍ استخراج التأشيرة | **Not tested** |

Unit coverage of the progress rules for every kind (including «خدمة أخرى» → «جارٍ تنفيذ طلبك»): `backend/tests/requestProgress.test.js`; app rendering: `mobile/tests/progress-view.test.mjs`.

## What "browser" means here

The customer side runs `mobile/www` — the same files packaged in the APK — in Chromium with a Pixel 5 viewport. It does **not** exercise the Android WebView, Capacitor plugins (camera, file picker, push), the installed-app lifecycle, real WhatsApp OTP delivery (codes are read from the database), or a real network. None of those were tested; see `docs/ANDROID-RELEASE.md` («الفحص اليدوي») for the device checklist.

## Not covered

- Egypt clearance post-approval travel plan: its own backend tests only.
- Tasheel and other services without a dedicated screen fall back to the general label; no journey test.
- External integrations (ticketing, visa portals, hotel suppliers, payment gateways): none exist; execution is a staff-recorded step.
