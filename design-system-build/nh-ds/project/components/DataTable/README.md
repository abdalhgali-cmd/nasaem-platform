# DataTable

The data table is the main working surface: a toolbar (segment, filter chips, search, export), a sticky-header table, and a footer with count and pagination.

## Anatomy
1. `nh-table-toolbar`: `nh-segment` for the service split (الكل / الموافقة الأمنية / العمرة), `nh-chip` filters (dashed = add filter, solid `is-on` = applied, with an × to clear), search and export on the end side.
2. `nh-table`: header row on `surface-sunken` in the `caption` style; sticky.
3. `nh-table-foot`: "عرض 1–5 من 128 حالة" + `nh-pager`.

## Cell recipes
- **Reference**: `nh-ref` (mono, LTR): EG-2026-00418.
- **Person**: `nh-person` = avatar initials + `nh-cell-primary` name + `nh-cell-secondary` passport/nationality or group.
- **Service**: square plain badge (nile / gold / navy).
- **Status**: one StatusBadge. **SLA**: `nh-sla`.
- **Money and counts**: `is-num` cell: end-aligned, tabular, LTR, amount then currency code in muted.
- **Actions**: `is-actions`, ghost icon buttons only, chevron opens the case.

## Rules
- Row height 48px comfortable, `nh-table--compact` 40px for long registers (activity log).
- Hover `navy-50`, selected `primary-soft`; selecting rows swaps the toolbar for `nh-bulkbar` (assign, export, change status).
- Text columns align to the start (right); numbers to the end (left). Never centre.
- Empty result: render EmptyState inside the card, keep the toolbar.
- Loading: 5 rows of `nh-skel` bars, never a spinner over an empty table.
- The consumer provides rows, sort state, selection and page; the table holds no data logic.
