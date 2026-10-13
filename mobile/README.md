# Nasaem Mobile — Customer App (Android)

The customer-only Android app for Nasaem Al-Haramain. Built with
[Capacitor](https://capacitorjs.com/) as a native Android shell around a
hand-written, dependency-free vanilla JS web app (`www/`) that talks
directly to the existing backend API (`../backend`) — no admin/staff code,
routes or bundle ever ships inside this app. Admin stays on the separate
staff back-office (`../frontend`, `../web/src/app/admin`), deployed and
built independently of this APK.

## Why Capacitor + vanilla JS, not a framework

The backend is the single source of truth for the customer experience
(services, visa requirements, pricing, order/case lifecycle). This app is a
thin, fast-loading client over that API — no build step, no bundler, no
framework runtime to keep in sync with the backend's own fast pace of
change. Every screen is a plain ES module under `www/js/screens/`.

## Structure

```
mobile/
  capacitor.config.ts       App id, name, splash/status bar config
  package.json              Capacitor CLI + plugin dependencies
  android-debug.keystore.b64  Stable QA signing key (see "Signing" below)
  www/                        The actual app — served as-is into the WebView
    index.html
    css/app.css                Design system (tokens, RTL, components)
    js/
      config.js                 apiBaseUrl — the one place the backend URL lives
      api.js                    fetch wrapper: Bearer auth, offline detection, upload progress
      storage.js                Capacitor Preferences wrapper (non-secret settings only)
      secure-store.js           Keystore-backed token storage + biometrics (SecureSession plugin)
      session-core.js           Pure session rules (unit-tested: npm test)
      auth.js                   Customer session: launch check, login/logout, biometrics
      tracking.js                Phone-OTP session for price-approval/payment actions (/api/tracking)
      catalog.js                 Public service/visa-type catalog, cached
      router.js                   Tiny stack router (no framework)
      icons.js                    Hand-built inline SVG icon set (no emoji, no icon font)
      ui.js                       Toast / skeleton / empty-state / error-state helpers
      screens/                    One module per screen (see app.js for the registry)
  android/                    Generated native project (`npx cap add android`) — committed
    app/src/main/res/...        Launcher icon, adaptive icon, splash — Nasaem-branded, not Capacitor defaults
```

## Guest-first: no account needed

The app is fully usable without an account (`js/app.js`, `js/experience-core.js`):

- **Launch**: first-launch introduction (optional, skippable), then the public
  home. No login or registration screen is ever required. A stored account
  session is verified in the background; a biometric-locked account stays
  locked (no account API calls) until the customer opens account content.
- **Tabs**: الرئيسية · الخدمات · طلباتي · حسابي. Account-dependent tabs re-draw
  when the account state changes (`auth.onAccountStateChange`).
- **Requests**: every service form posts to `POST /contact-requests` with or
  without an account (`js/submission.js`). Each form sends one random
  `submissionKey` on every attempt, so a retry after a lost response returns
  the already-stored request instead of a duplicate. Success is shown only
  when the server returned the stored id; the confirmation screen shows that
  reference (copy, track, home) and an honest confirmation-message status.
- **Tracking without an account** (طلباتي when signed out): phone → WhatsApp
  code (`/tracking/request-code`, `/tracking/verify-code`) → that phone's
  requests (`/tracking/requests`). The tracking token is stored separately and
  tracking calls never carry the account token. A reference alone opens
  nothing.
- **Account tab** states: guest (optional sign in / create account), locked
  (unlock with fingerprint or password), verifying, could-not-verify (Retry),
  signed in. Expired or revoked sessions return to guest; the app keeps working.
- **Documents**: the form counts only files actually selected (empty optional
  passport inputs take no slot; a hidden conditional document isn't sent) and
  blocks more than 6 before uploading.
- **Service checklist**: if the requirements can't be loaded (offline, server
  error, malformed answer) the form is not shown — only an error and Retry.
  A checklist the server confirms is empty shows the form without it.
- **Codes that can't be sent**: when the server answers
  `OTP_CHANNEL_UNAVAILABLE` / `OTP_DELIVERY_FAILED` (or doesn't answer), the
  tracking and password-reset screens say no code was sent and offer the
  agency's WhatsApp and phone (`js/otp-support.js`).
- Contact needs a phone number; e-mail is optional. **E-mail-only requests are
  BLOCKED** until there is an e-mail provider, e-mail ownership verification
  and secure e-mail tracking; until then a phone number is always required.

## Authentication model

Accounts are optional (see above). When a customer signs in, this is how
the session is kept (`js/auth.js`).

**Where the session lives.** The customer token (and the separate tracking
token, see below) is stored by the app's own native plugin,
`android/app/src/main/java/com/nasaemalharamain/app/SecureSessionPlugin.java`
(exposed to JS as `Capacitor.Plugins.SecureSession`, wrapped by
`js/secure-store.js`): AES-256-GCM with a non-exportable Android Keystore key,
ciphertext in the app's private storage. It is never written to
localStorage or Capacitor Preferences; JS keeps it in memory only and sends
it as `Authorization: Bearer`. Tokens left in Preferences by older versions
are moved into secure storage on first launch and deleted.

**Launch sequence** (`app.js` → `auth.js`, rules in `js/session-core.js`).
The public home always opens first (after the one-time introduction on a
fresh install); the account check runs in the background and only decides
what the account-dependent parts show:

| Stored on device | Server answer to `GET /customer-auth/me` | Result |
|---|---|---|
| nothing | — (no request) | Guest: public home; Account tab offers optional sign in / create account |
| token | 200 | Signed in (personal home, account requests, notifications) |
| token | 401 (`SESSION_EXPIRED` / `SESSION_INVALID` / `SESSION_REVOKED`) | Local session wiped; back to guest with a notice; the app keeps working |
| token | no network, timeout (15 s), 5xx, 429 | Public home works; Account tab shows "تعذر التحقق من الجلسة" with **Retry**; token kept; retried automatically when the device comes back online |
| biometric-protected token | — (no request until unlocked) | Public home; account content stays locked until the customer opens it and unlocks with fingerprint or password |

Only a 401 from the server ends a session. The backend returns **503**
(`SESSION_CHECK_UNAVAILABLE`), never 401, when it cannot check a session
(e.g. database unreachable). A 401 on any other request made with the
customer token triggers one `/me` re-check before anything is cleared, so a
"wrong current password" 401 never logs anyone out. Tokens are renewed
(`POST /customer-auth/refresh`) once a week of their 30 days is used, so an
active customer is not asked to log in again.

**Biometric login** (Account → الأمان والدخول بالبصمة) is optional and
off by default. Enabling it re-encrypts the stored token with a second
Keystore key that requires a strong biometric for every use and is
invalidated by Android when fingerprints change. When the customer opens
account content (not at launch), the system fingerprint prompt decrypts the
token (BiometricPrompt + CryptoObject, via
AndroidX Biometric); the server check above still runs afterwards, so a
fingerprint never revives a revoked session. If the fingerprints change, the
protected copy is dropped and the customer signs in with their password
(and can re-enable biometrics). Cancel, lockout or an unsupported sensor
always leave "الدخول بكلمة المرور" available; a password login turns
biometrics off until re-enabled. No biometric data is ever seen or stored
by the app.

**Logout** revokes the token on the server (`POST /customer-auth/logout`,
other devices stay signed in) and wipes everything locally: secure storage,
the biometric key, the tracking session and memory. A password change ends
every other session and gives this device a fresh token; a password reset
ends all sessions.

A second, independent session (`js/tracking.js`) is the phone-OTP tracking
session (`/api/tracking/*`): it is how guests see their requests (طلباتي
without an account) and how price-approval / payment-receipt actions are
authorised. It only ever reaches requests of the public organization, and
it never carries the account token.

In a plain browser (developing `www/` without Android) there is no Keystore:
tokens go to sessionStorage and biometrics show as unavailable.

## Customer experience (onboarding, home, About)

- **Onboarding** (`js/screens/onboarding.js`): three slides shown once, on the
  first launch with no stored session. Native swipe (CSS scroll-snap, RTL),
  Skip / Next / ابدأ الآن, page dots, keyboard arrows. Completion is a plain
  preference (`nasaem.onboarding.v1`), separate from authentication; a stored
  session skips it and opens the public home, with the account verified or
  kept locked in the background (`js/experience-core.js` `launchRoute`). Replay: Account → عرض الجولة التعريفية.
- **About Us** (`js/screens/about.js`): agency identity and contacts from
  `js/agency.js` — the agency's published details (same as the web site's
  `site-config.ts`); phone, e-mail, address and WhatsApp can be changed from
  the back-office settings (`CONTACT_PHONE`, `CONTACT_EMAIL`,
  `CONTACT_ADDRESS`, `WHATSAPP_NUMBER`) without an app release.
- **Home**: greeting, banner carousel built only from published homepage
  content and the customer's available coupons (brand slide otherwise),
  service cards, latest request + unread notification, WhatsApp help.
- **Motion** (`css/motion.css`, `js/motion.js`): transform/opacity only,
  short durations, all disabled under the system "reduce motion" setting.
- **Status bar**: always light icons on navy. Capacitor 8 draws the app
  edge-to-edge, so the page paints the navy strip itself (`.status-scrim`);
  see `capacitor.config.ts`.
- **Font**: Cairo (SIL OFL), bundled in `www/assets/fonts` so it works offline.

## Local development

```bash
cd mobile
npm install
npx cap add android      # already committed — only needed if android/ is deleted
npx cap sync android      # after any www/ change, before a native build
npx cap open android      # opens Android Studio
```

Point the app at a different backend by editing `apiBaseUrl` in
`www/js/config.js`, then re-run `npx cap sync android`.

## Signing

`android-debug.keystore.b64` is a **stable QA/debug key**, not a Play Store
production key — committed so every CI build (and every developer's local
build) signs with the same key, so APKs can be installed over each other
instead of requiring an uninstall each time. `android/app/build.gradle`
defines an explicit `release` signingConfig pointing at `android/debug.keystore`
(deliberately not AGP's implicit `signingConfigs.debug`, which resolves
against `$ANDROID_SDK_HOME`/`user.home` and silently falls back to a
freshly auto-generated, differently-fingerprinted keystore if that doesn't
land where you expect — exactly what happened on this app's first CI run,
caught and fixed by the signature assertion the workflow now runs). Before
a release build, decode the key to that exact path:

```bash
base64 -d android-debug.keystore.b64 > android/debug.keystore
```

CI does this automatically (`.github/workflows/android-apk.yml`'s
"Restore stable QA signing key" step), and also asserts the built APK's
certificate fingerprint matches the committed key's, so a future signing
misconfiguration fails the build instead of shipping silently. This is
deliberate: the task this app was built under explicitly excludes any
production deployment or Play Store signing.

## CI

`.github/workflows/android-apk.yml` builds a release APK on every push that
touches `mobile/**` (and on demand via `workflow_dispatch`), uploading it as
a workflow artifact. GitHub's `ubuntu-latest` runners ship the Android SDK
pre-installed, which this sandboxed development environment does not —
`dl.google.com` (Android/Gradle's own package repository) is not reachable
here, so a full native build can only be verified in CI, not locally. What
*was* verified locally: the web app's full flow (register → login → browse
→ submit a request with document uploads → My Requests → request detail →
logout → log back in and see the same data) against a real instance of the
backend, driven headlessly with Playwright/Chromium; the native Android
project's structure, manifest, signing config and all generated launcher
icon/splash assets; and every JS file's syntax (`npm run check`).
