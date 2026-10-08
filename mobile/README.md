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

## Authentication model

Every screen beyond Welcome/Login/Register/Forgot-Password requires a
signed-in customer account (`js/auth.js`, `js/app.js`).

**Where the session lives.** The customer token (and the separate tracking
token, see below) is stored by the app's own native plugin,
`android/app/src/main/java/com/nasaemalharamain/app/SecureSessionPlugin.java`
(exposed to JS as `Capacitor.Plugins.SecureSession`, wrapped by
`js/secure-store.js`): AES-256-GCM with a non-exportable Android Keystore key,
ciphertext in the app's private storage. It is never written to
localStorage or Capacitor Preferences; JS keeps it in memory only and sends
it as `Authorization: Bearer`. Tokens left in Preferences by older versions
are moved into secure storage on first launch and deleted.

**Launch sequence** (`app.js` → `auth.js`, rules in `js/session-core.js`):

| Stored on device | Server answer to `GET /customer-auth/me` | Result |
|---|---|---|
| nothing | — (no request) | Welcome / login |
| token | 200 | Signed in |
| token | 401 (`SESSION_EXPIRED` / `SESSION_INVALID` / `SESSION_REVOKED`) | Local session wiped, login with a notice |
| token | no network, timeout (15 s), 5xx, 429 | "تعذر التحقق من الجلسة" screen with **Retry**; token kept; retried automatically when the device comes back online |

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
invalidated by Android when fingerprints change. At launch the system
fingerprint prompt decrypts the token (BiometricPrompt + CryptoObject, via
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

A second, independent session (`js/tracking.js`) covers price-approval and
payment-receipt actions, which live under the backend's separate phone-OTP
`/api/tracking/*` routes. The UI only asks for this once per device, inline,
the first time a customer uses one of those actions.

In a plain browser (developing `www/` without Android) there is no Keystore:
tokens go to sessionStorage and biometrics show as unavailable.

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
