# Alert

Alerts are inline banners that explain a state of the current case or page and, where useful, offer the next action.

- Tones: `--info` (neutral fact), `--warning` (customer action needed), `--danger` (blocking), `--success` (just completed), `--gold` (policy and trust notes, e.g. the "تشغيل آمن" note from the sidebar).
- Structure: icon, then a bold `nh-alert__title` and one sentence. Optional `nh-alert__actions` holds at most one small button.
- `role="alert"` only for danger that appears after a user action; others are `role="status"`.
- Never stack more than two alerts; fold the rest into the case timeline.
- Tokens: `*-soft` ground, `*-ink` text, `radius-lg`.
