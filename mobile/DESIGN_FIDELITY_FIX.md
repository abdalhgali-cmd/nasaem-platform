# Mobile design fidelity patch — October 18, 2026

The 0.3.103 QA binary did include design-integrated.css, but the old homepage
carousel and horizontal shortcut rail remained prominent, and the original
linear service timeline was still used. The UI therefore looked old even
though some styles had changed.

This patch makes the real main journey structurally match the approved mobile
concept: compact logo/search header; separate published Umrah service card;
three-column catalog-backed service tiles; responsive four-step journey;
OTP-protected guest tracking; secondary banners; grouped service lists.

No fabricated catalog entries, offers, biometric simulation or prices are
created. Hotel discovery remains postponed without deleting existing orders.
Every card uses the existing server-aware dispatcher, all customer sessions
and payments are unchanged. The native build manifest now embeds the QA
version (PR #124).

Acceptance requires an APK with a versionCode strictly higher than 103,
valid SHA/signature, visual check of home + grouped services on Android, and
no regressions in guest OTP/Umrah/Egypt/payments and 360px/390px accessibility.
Do not publish to production or merge to main.
