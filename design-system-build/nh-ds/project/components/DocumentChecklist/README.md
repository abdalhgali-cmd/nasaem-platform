# DocumentChecklist

The document checklist lists every required document for a case with its review state and the reviewer's next action.

- One row per required document: icon tile (state-tinted), name, meta (file, size, date, or rejection reason), status badge, actions.
- States use `DOCUMENT_STATUS_LABEL`: PENDING = قيد المراجعة (info, shows قبول/رفض), ACCEPTED = مقبول (success), REJECTED = مرفوض (danger, meta shows the reason), not yet uploaded = مطلوب (warning, shows رفع).
- Rejecting always asks for a reason (Dialog) because the customer sees it.
- Stage-specific documents say which stage needs them ("مطلوب قبل التعميم فقط").
