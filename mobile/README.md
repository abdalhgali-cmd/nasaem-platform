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
      storage.js                Capacitor Preferences wrapper (persistent session)
      auth.js                   Customer account session (register/login/forgot-password/logout)
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
signed-in customer account — see `js/auth.js` and `js/app.js`'s boot
sequence. The session token is stored via `@capacitor/preferences`
(`js/storage.js`) and sent as `Authorization: Bearer <token>`, not relied on
as a browser cookie, because a Capacitor WebView cannot be assumed to
persist a cross-origin cookie as reliably as a desktop browser across an
app restart. The backend (`customer-auth.middleware.js`,
`tracking-auth.middleware.js`) accepts either a cookie or this header —
nothing about the web account pages changed.

A second, independent session (`js/tracking.js`) covers price-approval and
payment-receipt actions, which live under the backend's separate phone-OTP
`/api/tracking/*` routes. The UI only asks for this once per device, inline,
the first time a customer uses one of those actions.

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
instead of requiring an uninstall each time. `android/app/build.gradle`'s
`release` build type signs with it (`signingConfig signingConfigs.debug`).
This is deliberate: the task this app was built under explicitly excludes
any production deployment or Play Store signing.

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
