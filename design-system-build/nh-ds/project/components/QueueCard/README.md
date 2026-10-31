# QueueCard

Queue cards are the work-lane selector of the case workspace: one card per `QueueKey`, in `QUEUE_ORDER`, each a filter for the table below.

- Icon tile tone = the StatusBadge tone of that queue (info → warning → navy → success), so lanes read left-to-right (right-to-left) as the case's journey.
- The active lane gets `is-active` (primary outline) and `aria-pressed="true"`.
- The count is the `kpi`-family numeral at 20px; zero still shows "0", never hidden.
- Eight lanes = two rows of four on desktop; a horizontal scroll row on mobile.
