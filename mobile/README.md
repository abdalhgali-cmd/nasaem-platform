# Nasaem Mobile

Customer Android app for Nasaem Al-Haramain (Expo SDK 54 / React Native). **Customer only** — staff use the web admin (`web/src/app/admin`).

## What it does

- Dynamic public service catalog and prices from the backend; visa countries/types and admin-managed requirements.
- Umrah (guided, multi-traveler, per-traveler documents), Egypt security approval, Saudi family visit, and generic intake for flights / ferries / hotels / other catalog services.
- Flight search against published inventory, then a request to the agency.
- Phone-verified tracking (WhatsApp one-time code): requests, quote/offer approval, payment accounts and currency, receipt upload, document requests, and **download / share of the issued visa, ticket or voucher**.
- Account screen: session state and log out, WhatsApp / phone contact, legal-page links.

Not in the app (use the web): customer email/password accounts and coupons, the online flight-booking payment workflow, staff features.

## Environments

`app.config.ts` selects everything from `APP_ENV` (`development` | `staging` | `production`):

| `APP_ENV` | Android package | API |
|---|---|---|
| development | `com.nasaemalharamain.app.dev` | `EXPO_PUBLIC_API_URL` or `http://10.0.2.2:5000` (emulator → host) |
| staging | `com.nasaemalharamain.app.staging` | `EXPO_PUBLIC_API_URL` or the staging host |
| production | `com.nasaemalharamain.app` | `EXPO_PUBLIC_API_URL` — **required, https, never staging/localhost** |

The config throws if a production build points at a non-production API, so the wrong combination cannot be built by accident. Staging and production install side by side.

## Scripts

```bash
npm ci
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm test            # unit tests: tsc + node --test (validation, upload rules, error mapping)
APP_ENV=staging npx expo start
```

## Release builds (GitHub Actions: `.github/workflows/mobile-android.yml`)

* Pull requests and pushes build **staging**. Only a manual dispatch can build **production**.
* Production needs repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` and the variable `PRODUCTION_API_URL` (staging uses `STAGING_API_URL`). Without the keystore a production build **fails** — it never falls back to the debug key. The job verifies the APK signature and also produces the Play Store `.aab`.
* `plugins/with-release-signing.js` wires the keystore into the generated Gradle project and throws if that file's shape ever changes.
* For staging builds that must update an installed staging APK, set `ANDROID_DEBUG_KEYSTORE_BASE64` to one stable debug keystore.

## Not yet verified

The Gradle build and signature verification run only in CI (they need the Android SDK and secrets). Run the workflow once for staging, then once for production with real secrets, and install both on a device before any release.
