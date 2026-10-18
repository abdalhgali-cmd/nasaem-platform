# Approved mobile design integration

Design source: `claude/laughing-sagan-mkdmtw/mobile/design-concepts/final.html` (B visual identity, A service list, C responsive request steps). Ported to the **real** Capacitor app, not copied as a simulated static app.

## Actual behavior preserved
- Branded welcome, guest-first entry, existing real login/register and separate real biometric-security flow.
- Home uses published catalog and payment/request/tracking APIs; Umrah spotlight appears only if published and routes to actual service.
- Four illustrative *journey labels* never claim the old "approve a quote" step for Umrah or Egypt; actual progress steps remain server-driven.
- Existing shortcut/featured cards continue routing to their own services, and guest tracking stays WhatsApp OTP based.
- Hotel discovery postponed, without deleting API, old cases, or their ability to be tracked.
- Touch targets >=48px for the main navigation, search, bell, brand actions; request steps adapt to 2x2 at narrow widths.

## Release gates
- No simulated fingerprint handler was copied; existing device biometrics remain unchanged, must be tested under #108 on Android hardware.
- No changes to prices, bank details, validation, backend, auth-session policies or production environment.
- Automatic smoke/unit tests are needed in CI; 360/390, enlarged Android system fonts, WebView scrolling, service routes and payments need owner device acceptance under #110.
- Do not deploy, merge to main or distribute the APK before owner approval of the final candidate.
