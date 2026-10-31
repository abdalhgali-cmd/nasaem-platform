# ClearanceTracker

The clearance tracker shows where an Egypt security-approval case is in its fixed journey, from intake to travel, at a glance.

## Stages
استلام الطلب → مراجعة المستندات → تأكيد الدفع → لدى الجهة الأمنية → صدور الموافقة → التعميم والسفر

## States
- `is-done`: navy filled dot with a check; connector to the next step turns `primary`.
- `is-current`: gold ring on `accent-soft` with the stage icon: the ONE gold element on the case page.
- `is-blocked`: danger ring (e.g. document rejected); pair it with a danger Alert explaining why.
- Upcoming: hollow, muted label.
- Each step's meta line is a date, a duration ("منذ ٤ أيام") or an expected date.

## Rules
- Always pair with the disclosure line that the agency follows up and is not the issuing authority (the existing legal copy).
- The same component renders Umrah pipelines with their own stages (استلام، التأشيرة، الحجز، التسكين، السفر).
- Below 720px it stacks vertically using the Timeline layout.
