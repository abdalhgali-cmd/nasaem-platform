# Button

Buttons trigger an action. Five variants, three sizes and an icon-only form, all at 38px default height so they line up with inputs.

## Variants
| Class | Use | Tokens |
|---|---|---|
| `nh-btn--primary` | The ONE main action on a screen or dialog (حفظ، اعتماد، حالة جديدة). | `primary`, `primary-hover`, `on-primary` |
| `nh-btn--secondary` | Supporting actions (تصدير، تعديل، رفع مستند). | `surface`, `line-strong`, hover `primary-soft` |
| `nh-btn--ghost` | Low-emphasis: إلغاء, row actions, toolbar overflow. | `ink-secondary`, hover `surface-sunken` |
| `nh-btn--gold` | Rare premium/publishing action (نشر الباقة). At most one per page; never for routine saves. | `accent`, `on-accent` |
| `nh-btn--danger` | Destructive or irreversible (رفض الطلب، حذف). Always behind a confirm Dialog. | `danger`, `ink-inverse` |

## Rules
- Label = verb + object, in Arabic: "اعتماد الدفع" not "موافق".
- Icons come first in source order; in RTL they render on the right. Pick the direction for RTL yourself: "next" and "open" are `chevron-left`, "back" is `chevron-right`. Only `send` and `log-out` are mirrored automatically (`nh-icon--flip`).
- Icon-only buttons (`nh-btn--icon`) must have an `aria-label`.
- Loading: add `is-loading` + `aria-busy="true"` and swap the icon to `loader-circle`; keep the width stable.
- Sizes: `--sm` (32px) in tables and toolbars, default (38px) in forms, `--lg` (44px) on login and wizards only.

## Maps to code
Replaces the ad-hoc `rounded-xl px-3 py-2` buttons in `admin-shell.tsx` and `button.btn` in `public/assets/style.css`. The consumer provides the click handler and the disabled/loading state.
