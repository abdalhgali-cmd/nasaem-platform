# FormField

Form fields pair a label, a control and one line of help or error, laid out in a two-column grid on desktop.

- Label above the control, always visible (no placeholder-as-label). Required = red `*` via `.req`.
- Controls: `nh-input`, `nh-select`, `nh-textarea`, 40px tall, `line-control` border (3:1), focus = `primary` border + 3px `primary-soft` halo.
- **Latin data in an Arabic form** (passport number, phone, email, dates): add `nh-input--ltr`. The text runs LTR but stays right-aligned with its Arabic neighbours.
- Leading icon: wrap in `nh-inputwrap`; the icon sits on the inline-start (right).
- Error: `is-invalid` + `aria-invalid` + `nh-error` line that says what to do, not just what is wrong.
- Disabled shows the value on `surface-sunken`; use it for fields locked by workflow stage.
- Internal notes always say who can see them ("تظهر للفريق فقط").
