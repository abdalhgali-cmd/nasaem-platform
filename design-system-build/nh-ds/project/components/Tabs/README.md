# Tabs

Tabs switch between sections of one record (a case: نظرة عامة، المستندات، الدفع، السجل); the segmented control switches a view or range of the same data.

- `nh-tabs`: underline style, 2px `primary` indicator, optional `nh-count` (danger tone when something needs action).
- `nh-segment`: for date ranges, view mode, and the service split in table toolbars. 2–4 options.
- Use `role="tablist"`/`tab`/`aria-selected`; arrow keys move between tabs (Right = previous in RTL).
- Never put tabs inside tabs; use a segment inside a tab instead.
