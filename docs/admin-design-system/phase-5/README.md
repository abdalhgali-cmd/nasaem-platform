# Phase 5 — customer UX, Umrah and Egypt only

Found by looking at the real pages at 390 px and 1440 px (local build, local backend). Each fix is covered by `web/e2e/customer-ux-umrah-egypt.spec.ts`.

| Problem (real screenshot) | Fix |
|---|---|
| Umrah «from» prices read «SAR يبدأ من 3,800»: the whole Arabic phrase was forced left-to-right (`umrah-from-price-390-before.png`) | The phrase stays right-to-left; only the amount is isolated as LTR → «يبدأ من 3,800 SAR» (`umrah-from-price-390.png`) |
| Egypt form: «إرسال طلب الموافقة» stays disabled with no reason given | A live line under the button says what is still missing, using the form's own existing check («قبل الإرسال: رقم الهاتف مطلوب») (`egypt-submit-hint-390.png`) |
| On phones the floating WhatsApp button covered the Umrah wizard's «التالي» and the Egypt form buttons | Hidden on phones on those two pages only (both have an inline WhatsApp link); unchanged on desktop and on every other page |

Checked and left as they are: the customer app home (Umrah + Egypt only, prices with `<bdi>`, SDG equivalents), the Egypt form steps and review box, `/track`. Horizontal overflow at 390 px was 0 on `/umrah`, `/visas/egypt-security-approval` and `/track`.

## Old e2e failures found while doing this (same on the base branch)

| Test | Cause | Status |
|---|---|---|
| `egypt-approval.spec.ts:100` | Since `9f236eb` («keep payment journey continuous») the app stays on the payment screen after the receipt instead of the old success screen with `#requestReference` | Test updated to the current screen (`#paymentUnderReview` + the reference shown there); 4/4 locally |
| `mobile-app.spec.ts:135`, `pricing-progress.spec.ts:153`, `service-journeys.spec.ts:320` | They click home tiles (`.featured-row`, `.hc-tile[data-key="visas"|"flights"]`) that the Umrah/Egypt-only home no longer has | NOT FIXED here (two cover services outside this scope; the third needs fixed-price Umrah fixtures). Owner decision needed |
