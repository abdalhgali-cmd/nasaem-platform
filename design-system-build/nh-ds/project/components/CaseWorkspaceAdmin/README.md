# CaseWorkspaceAdmin

The SUPER_ADMIN view of the approved Case Workspace, for Egypt security clearance (this card) and Umrah (card CaseWorkspaceAdminUmrah). Same case, same moment, same layout as the employee previews, plus **أدوات المدير**. **All data is synthetic demonstration data.** The employee views (CaseWorkspace, CaseWorkspaceUmrah) are unchanged.

## How the manager view is identified (revised after review)
The first review found the manager preview too close to the employee view. It now differs from the first screen:
1. A navy role banner with a gold rule under the demo bar: "عرض المدير الأعلى (SUPER_ADMIN): تظهر في هذه الصفحة أدوات الإدارة التي لا يراها الموظف".
2. A gold-outlined navy role badge "المدير الأعلى · SUPER_ADMIN" in the case header (the employee view keeps its grey "تعرض بصلاحية: موظف عمليات" chip).
3. The admin-only navigation groups from admin-shell.tsx: المال والتقارير (التقارير، مراجعة الدفعات) and الفريق والنظام (المستخدمون، الأدوار والصلاحيات، الإسناد، سجل النشاط). The user in the sidebar and top bar is the manager.
4. **أدوات المدير sits directly under the case header**, above the next-action box, so reassignment, deadlines and attention signals are visible without scrolling.
5. "تغيير" link on the الموظف المسؤول fact, and a "إعادة الإسناد" button in the header.
6. The case history moves up to the second section, titled "سجل النشاط الكامل · للمدير", with filters and an activity summary.

## What the manager sees in addition
| Element | Backed by (existing) | Roles today |
|---|---|---|
| تغيير الموظف المسؤول / إلغاء الإسناد | PATCH /contact-requests/:id/assign | SUPER_ADMIN, ADMIN |
| Staff picker | GET /users | SUPER_ADMIN, ADMIN |
| Open / overdue counts per employee | GET /contact-requests?assignedUserId=… (+ readiness.sla) | SUPER_ADMIN, ADMIN, EMPLOYEE |
| المواعيد: case SLA, task due dates and owners, auto circular task (entry − 3 days), travel date | case dueAt → deriveSlaState; CaseTask.dueAt; Egypt travel service | read |
| مهمة بموعد ومسؤول | POST /contact-requests/:id/tasks (title, type, assignedUserId, dueAt) | SUPER_ADMIN, ADMIN, EMPLOYEE |
| يحتاج انتباه المدير | timeline age, CaseTask fields, GET /:id/warnings (DOCUMENT_EXPIRING_SOON, DOCUMENT_EXPIRED, OCR_PASSPORT_MISMATCH, POSSIBLE_DUPLICATE_APPLICATION), provider submission FAILED | read |
| السجل الكامل + filter chips + activity summary | GET /:id/timeline (filtering is client-side) | SUPER_ADMIN, ADMIN, EMPLOYEE |
| Link to سجل النشاط العام | GET /activity | SUPER_ADMIN, ADMIN |
| "عرض / فتح في مراجعة الدفعات" | POST /:id/confirm-payment happens on the Payment Review page only (approved decision) | SUPER_ADMIN, ADMIN, ACCOUNTANT |

## Deliberately NOT added (would be new privileges or logic)
- No escalation workflow: no "escalate", "resolve" or "dismiss". The attention list only gathers existing signals, and every item names its source.
- No editing of the case deadline (`dueAt`): no route sets it today. The manager can add a task with a due date and an owner.
- No per-case filter on the global activity log: the link says so.
- No payment approval or rejection inside the case, and no price editing.

## Rules used for colour (R2 from the Operations Center baseline)
- Red only for a genuinely missed deadline: a task past its dueAt (Umrah example: تجهيز كشف أسماء المجموعة) or SLA OVERDUE.
- Amber for inactivity (≥ 24 h without activity), due today, unassigned work, and advisories.

## Notes
The ADMIN role has the same manager tools; the header chip names the viewer's role.
