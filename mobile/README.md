# Nasaem Mobile

Production Android client for Nasaem Al-Haramain, built with Expo SDK 54 / React Native.

## Current real flows

- Dynamic public service catalog and prices from the existing backend.
- Dynamic visa countries/types and admin-managed requirements.
- Umrah packages, multi-traveler data, per-traveler passport/guarantor documents.
- Generic service intake for flights, ferries, hotels/tourism, family visit, Egypt security approval and other catalog services.
- Real contact-request submission with server-generated request IDs.
- WhatsApp OTP tracking through the existing tracking backend.
- Customer quote/offer approval, payment accounts, receipt upload and payment-review transition.
- Staff login with bearer auth, encrypted token persistence, request queue, document review, status changes and payment confirmation.

## Android identity

Package: `com.nasaemalharamain.app`

GitHub Actions stamps `android.versionCode` from `github.run_number` so every build is newer than the previous build.

For APKs that must update an already-installed APK, configure repository secret
`ANDROID_DEBUG_KEYSTORE_BASE64` with the same stable Android debug keystore on every run.
Without a stable signing key, fresh debug installs work but Android may reject an update signed by another runner.

## Safety

The mobile branch targets staging by default. Do not merge to production until CI, device install/update tests, uploads, payment flow and staff RBAC are verified.
