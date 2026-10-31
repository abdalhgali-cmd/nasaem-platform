# Timeline

The timeline is a case's audit trail: every action, newest first, with who, when, and an optional note.

- Titles come from `ACTION_LABEL` in `case-workspace.tsx`; an unknown action shows its raw code rather than being hidden.
- Icon tone: navy = staff action, success = money/approval, gold = document review, danger = rejection, neutral = system/customer.
- Time in the `num` style (LTR): "5 نوفمبر · 10:42". Today's events may use relative time.
- Internal notes render in `nh-tl__note` on `surface-sunken`.
