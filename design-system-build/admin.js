// Case Workspace: SUPER_ADMIN view (Egypt clearance + Umrah). SYNTHETIC DATA ONLY.
// Reuses the approved employee layout from case.js and adds manager tools that map to
// EXISTING backend permissions only:
//   PATCH /contact-requests/:id/assign      SUPER_ADMIN, ADMIN      (reassign / unassign)
//   GET   /users                            SUPER_ADMIN, ADMIN      (staff list for the picker)
//   GET   /contact-requests?assignedUserId  SUPER_ADMIN, ADMIN, EMPLOYEE (workload counts)
//   POST  /contact-requests/:id/tasks       SUPER_ADMIN, ADMIN, EMPLOYEE (task with dueAt + assignee)
//   GET   /contact-requests/:id/warnings    SUPER_ADMIN, ADMIN, EMPLOYEE (case-intelligence signals)
//   GET   /contact-requests/:id/timeline    SUPER_ADMIN, ADMIN, EMPLOYEE
//   GET   /activity                         SUPER_ADMIN, ADMIN      (global log; no per-case filter today)
// Nothing here creates an escalation workflow, a case-deadline editor, or any new privilege.
const fs = require('fs');
const path = require('path');
const C = require('./case.js');
const { page, I, rows, card, note, check, tl } = C;

const ADMIN = { initial: 'خ', name: 'خالد (مدير تجريبي)', short: 'خالد (تجريبي)', role: 'المدير الأعلى' };
// Admin-only navigation groups, exactly as admin-shell.tsx shows them to SUPER_ADMIN/ADMIN.
ADMIN.extraNav = `  <div class="nh-navgroup"><button class="nh-navgroup__label" type="button" aria-expanded="true">المال والتقارير ${I('chevron-down')}</button>${[['chart-column', 'التقارير'], ['credit-card', 'مراجعة الدفعات']].map(([i, t]) => `<a class="nh-navitem" href="#">${I(i)}<span>${t}</span></a>`).join('')}</div>
  <div class="nh-navgroup"><button class="nh-navgroup__label" type="button" aria-expanded="true">الفريق والنظام · للمدير ${I('chevron-down')}</button>${[['users', 'المستخدمون'], ['shield-check', 'الأدوار والصلاحيات'], ['user-round-cog', 'الإسناد'], ['activity', 'سجل النشاط']].map(([i, t]) => `<a class="nh-navitem" href="#">${I(i)}<span>${t}</span></a>`).join('')}</div>
`;
const roleBanner = `<div role="note" style="display:flex;align-items:center;justify-content:center;gap:10px;height:40px;background:var(--navy-950);color:var(--sidebar-ink);font-size:13.5px;font-weight:700;border-bottom:2px solid var(--accent)"><span style="color:var(--accent);display:inline-flex">${I('shield-check')}</span>عرض المدير الأعلى (SUPER_ADMIN): تظهر في هذه الصفحة أدوات الإدارة التي لا يراها الموظف</div>`;
const roleChip = `<span class="nh-rolechip" style="background:var(--navy-950);color:var(--sidebar-ink);box-shadow:inset 0 0 0 1px var(--accent)" title="عرض المدير: تظهر أدوات الإدارة"><span style="color:var(--accent);display:inline-flex">${I('shield-check')}</span>المدير الأعلى · SUPER_ADMIN</span>`;
const clone = (o) => ({ ...o, next: { ...o.next } });

// ---------- manager panel ----------
const pick = (list) => `<fieldset class="nh-pick"><legend class="nh-mgr__hint" style="margin-bottom:6px">الحمل الحالي لكل موظف (حالات مفتوحة)</legend>${list.map((p) => `<label${p.cur ? ' class="is-selected"' : ''}><input type="radio" name="owner"${p.cur ? ' checked' : ''}><span class="nh-avatar nh-avatar--sm${p.cur ? ' nh-avatar--gold' : ''}">${p.n[0]}</span><span class="nh-pick__name">${p.n}${p.cur ? ' <span class="nh-you" style="background:var(--surface);">الحالي</span>' : ''}</span><span class="nh-pick__load"><b>${p.open}</b> مفتوحة${p.late ? ` · <span class="nh-pick__late"><b>${p.late}</b> متأخرة</span>` : ''}</span></label>`).join('')}</fieldset>`;
const dl = (d) => `<div class="nh-dl is-${d.tone}"><span class="nh-dl__icon">${I(d.icon)}</span><div><span class="nh-dl__name">${d.name}</span><span class="nh-dl__meta">${d.meta}</span></div><span class="nh-dl__when">${d.when}</span></div>`;
const att = (a) => `<div class="nh-att nh-att--${a.tone}"><span class="nh-att__icon">${I(a.icon)}</span><div><span class="nh-att__title">${a.title}</span><span class="nh-att__body">${a.body}</span><span class="nh-att__src">المصدر: <code>${a.src}</code></span></div></div>`;
const mgr = (m) => `<section class="nh-mgr" aria-labelledby="mgr-t">
  <div class="nh-mgr__head"><h2 class="nh-mgr__title" id="mgr-t">${I('shield-check')}أدوات المدير</h2><span class="nh-mgr__scope">تظهر للمدير الأعلى والمدير فقط · لا تظهر للموظف</span></div>
  <div class="nh-mgr__grid">
    <div class="nh-mgr__col">
      <h3 class="nh-mgr__label">${I('user-round-cog')} تغيير الموظف المسؤول</h3>
      ${pick(m.staff)}
      <div style="display:flex;gap:8px"><button class="nh-btn nh-btn--primary nh-btn--sm" style="flex:1" disabled>${I('check')}حفظ الإسناد</button><button class="nh-btn nh-btn--secondary nh-btn--sm">${I('x')}إلغاء الإسناد</button></div>
      <p class="nh-mgr__hint">يُسجَّل التغيير في سجل الحالة ("إسناد الطلب لموظف" أو "إلغاء إسناد الطلب"). يتفعّل الحفظ عند اختيار موظف آخر.</p>
    </div>
    <div class="nh-mgr__col">
      <h3 class="nh-mgr__label">${I('alarm-clock')} المواعيد <small>للمتابعة</small></h3>
      ${m.deadlines.map(dl).join('')}
      <button class="nh-btn nh-btn--secondary nh-btn--sm" style="justify-self:start">${I('plus')}مهمة بموعد ومسؤول</button>
      <p class="nh-mgr__hint">موعد الحالة نفسه يُعرض للمتابعة فقط؛ لا توجد اليوم أداة لتعديله. يمكن إضافة مهمة بموعد وتحديد المسؤول عنها.</p>
    </div>
    <div class="nh-mgr__col">
      <h3 class="nh-mgr__label">${I('triangle-alert')} يحتاج انتباه المدير <small>${m.attention.length} نقاط</small></h3>
      ${m.attention.map(att).join('')}
      <p class="nh-mgr__hint">لا يوجد مسار "تصعيد" في النظام الحالي. هذه القائمة تجمع إشارات موجودة فعلًا (المواعيد، تنبيهات الحالة، المهام، الإرسال للجهة). المعالجة تتم بالأدوات المتاحة: إعادة الإسناد، مهمة، أو ملاحظة داخلية.</p>
    </div>
  </div>
</section>`;
const tabs = (n, notes) => `<div class="nh-tabs nh-tabs--card" role="tablist"><button class="nh-tab is-active" role="tab" aria-selected="true">سجل النشاط الكامل · للمدير <span class="nh-count">${n}</span></button><button class="nh-tab" role="tab">الملاحظات الداخلية <span class="nh-count">${notes}</span></button><span style="margin-inline-start:auto;align-self:center;display:flex;gap:10px;align-items:center"><span class="nh-segment"><button class="is-active">الكل</button><button>الموظفون</button><button>العميل</button><button>النظام</button></span></span></div>`;
const actsum = (items) => `<dl class="nh-actsum">${items.map(([k, v, warn]) => `<div><dt>${k}</dt><dd${warn ? ' class="is-warn"' : ''}>${v}</dd></div>`).join('')}</dl>`;
const headActions = `<button class="nh-btn nh-btn--secondary nh-btn--sm">${I('message-square')}ملاحظة داخلية</button><button class="nh-btn nh-btn--secondary nh-btn--sm">${I('plus')}مهمة</button><button class="nh-btn nh-btn--secondary nh-btn--sm">${I('user-round-cog')}إعادة الإسناد</button>`;
const activityLink = `<p class="nh-mgr__hint" style="margin-top:16px;display:flex;gap:6px;align-items:center">${I('activity', 'nh-icon--sm')}<span>للاطلاع على نشاط الفريق في كل الحالات: <a href="#" class="nh-linkbtn" style="font-size:12.5px">سجل النشاط العام</a> (لا يدعم حاليًا التصفية حسب الحالة).</span></p>`;

// ---------- EGYPT (same case, same moment as the employee preview) ----------
const eg = clone(C.egypt);
Object.assign(eg, {
  height: 3480, user: ADMIN, role: 'المدير الأعلى', headActions, roleBanner, roleChip, historyFirst: true,
  facts: C.egypt.facts.map((f) => (f[1] === 'الموظف المسؤول' ? ['user', 'الموظف المسؤول', 'سارة <a href="#mgr-t" class="nh-linkbtn" style="font-size:12.5px">تغيير</a>', 'ضمن الموعد · 14 حالة مفتوحة', 'ok'] : f)),
  next: { eyebrow: 'الإجراء التالي في هذه الحالة · لدى سارة', icon: 'file-search', title: 'مراجعة تذكرة الطيران لبدء التعميم', why: 'رفعت العميلة التذكرة قبل يومين ولم تُراجع بعد. آخر موعد آمن لإرسال التعميم <b>15 نوفمبر</b>، أي قبل الدخول بـ 72 ساعة. يمكنك المراجعة بنفسك أو متابعة الموظفة المسؤولة.', actions: `<button class="nh-btn nh-btn--primary">${I('file-search')}مراجعة التذكرة</button><button class="nh-btn nh-btn--secondary">${I('plus')}مهمة لسارة بموعد</button>` },
  beforeNext: mgr({
    staff: [{ n: 'سارة', cur: true, open: 14, late: 2 }, { n: 'أحمد', open: 11, late: 1 }, { n: 'ليلى', open: 8, late: 0 }],
    deadlines: [
      { tone: 'ok', icon: 'calendar-days', name: 'موعد الحالة', meta: 'محدد عند الاستلام · حالة SLA', when: 'ضمن الموعد' },
      { tone: 'due', icon: 'clipboard-check', name: 'مراجعة تذكرة الطيران', meta: 'مهمة · سارة', when: 'غدًا 1 نوفمبر' },
      { tone: 'ok', icon: 'stamp', name: 'تجهيز تعميم الموافقة الأمنية لمصر', meta: 'مهمة تلقائية · قبل الدخول بـ 3 أيام · <b style="color:var(--warning-ink)">غير مسندة</b>', when: '15 نوفمبر' },
      { tone: 'ok', icon: 'plane', name: 'الدخول إلى مصر', meta: 'منفذ جوي', when: '18 نوفمبر' },
    ],
    attention: [
      { tone: 'warn', icon: 'timer', title: 'بلا نشاط منذ 40 ساعة', body: 'آخر حدث: رفع العميلة للتذكرة (29 أكتوبر 18:20). لم يتجاوز أي موعد بعد.', src: 'timeline · ageHours ≥ 24' },
      { tone: 'warn', icon: 'user-plus', title: 'مهمة التعميم غير مسندة لأحد', body: 'أُنشئت تلقائيًا بموعد 15 نوفمبر. أسندها لموظف لضمان المتابعة.', src: 'case task · assignedUserId = null' },
      { tone: 'warn', icon: 'id-card', title: 'جواز يوسف ع. ينتهي قريبًا', body: 'ينتهي 2 فبراير 2027، أقل من 6 أشهر من الدخول. تنبيه استرشادي.', src: 'warnings · DOCUMENT_EXPIRING_SOON' },
    ],
  }) + '\n',
  historyTabs: tabs(9, 2),
  historyIntro: actsum([['آخر نشاط على الحالة', 'قبل 40 ساعة · العميلة', true], ['آخر إجراء من الموظفة', '24 أكتوبر · تسليم ملف'], ['تغييرات الإسناد', 'مرة واحدة · 2 أكتوبر']]),
  timeline: C.egypt.timeline,
});
eg.side = [
  C.egypt.side[0], C.egypt.side[1], C.egypt.side[2],
  card('wallet', 'الدفع', rows([['الفاتورة', '90 USD', 1], ['الحالة', '<span class="nh-badge nh-badge--success">مدفوع</span>'], ['الطريقة', 'تحويل بنكي'], ['أكّده', 'المحاسب (تجريبي) · 3 أكتوبر']]) + `<div style="padding:0 20px 16px"><button class="nh-btn nh-btn--secondary nh-btn--sm" style="width:100%">${I('receipt')}عرض في مراجعة الدفعات</button></div>` + note('info', 'اعتماد الدفع ورفضه يتمّان في صفحة مراجعة الدفعات فقط، كما في التصميم المعتمد.')),
  card('clipboard-check', 'المهام المفتوحة', `<div class="nh-task"><input class="nh-check" type="checkbox" aria-label="إنهاء المهمة" style="margin-top:4px"><div><span class="nh-task__name">مراجعة تذكرة الطيران</span><span class="nh-task__due nh-task__due--warn">سارة · تستحق غدًا 1 نوفمبر</span></div></div><div class="nh-task"><input class="nh-check" type="checkbox" aria-label="إنهاء المهمة" style="margin-top:4px"><div><span class="nh-task__name">تجهيز تعميم الموافقة الأمنية لمصر</span><span class="nh-task__due">غير مسندة · 15 نوفمبر · مهمة تلقائية</span></div></div>`, `<button class="nh-btn nh-btn--ghost nh-btn--sm">${I('plus')}مهمة</button>`),
  C.egypt.side[6],
];
eg.timeline = [
  ...C.egypt.timeline.slice(0, 2),
  { icon: 'clipboard-check', title: 'إنشاء مهمة', time: '29 أكتوبر · 18:12', body: 'تجهيز تعميم الموافقة الأمنية لمصر · موعدها 15 نوفمبر · بواسطة النظام' },
  ...C.egypt.timeline.slice(2),
];

// ---------- UMRAH ----------
const um = clone(C.umrah);
Object.assign(um, {
  height: 3400, user: ADMIN, role: 'المدير الأعلى', headActions, roleBanner, roleChip, historyFirst: true,
  facts: C.umrah.facts.map((f) => (f[1] === 'الموظف المسؤول' ? ['user', 'الموظف المسؤول', 'سارة <a href="#mgr-t" class="nh-linkbtn" style="font-size:12.5px">تغيير</a>', 'تستحق اليوم · 14 حالة مفتوحة', 'warn'] : f)),
  next: { eyebrow: 'الإجراء التالي في هذه الحالة · لدى سارة', icon: 'file-search', title: 'مراجعة جواز ريم ح. (المسافرة الثالثة)', why: 'آخر مستند ناقص. الإيصال (18,600 SAR) بانتظار المحاسب منذ 3 ساعات. المغادرة بعد 12 يومًا، وموعد الحالة اليوم.', actions: `<button class="nh-btn nh-btn--primary">${I('file-search')}مراجعة الجواز</button><button class="nh-btn nh-btn--secondary">${I('receipt')}فتح في مراجعة الدفعات</button>` },
  beforeNext: mgr({
    staff: [{ n: 'سارة', cur: true, open: 14, late: 2 }, { n: 'أحمد', open: 11, late: 1 }, { n: 'ليلى', open: 8, late: 0 }],
    deadlines: [
      { tone: 'due', icon: 'calendar-days', name: 'موعد الحالة', meta: 'حالة SLA', when: 'اليوم' },
      { tone: 'late', icon: 'clipboard-check', name: 'تجهيز كشف أسماء المجموعة', meta: 'مهمة · ليلى · كان موعدها 30 أكتوبر', when: 'متأخرة يومًا' },
      { tone: 'due', icon: 'clipboard-check', name: 'مراجعة جواز ريم ح.', meta: 'مهمة · سارة', when: 'اليوم' },
      { tone: 'ok', icon: 'plane-takeoff', name: 'مغادرة المجموعة', meta: 'رجب الأولى (تجريبي)', when: '12 نوفمبر' },
    ],
    attention: [
      { tone: 'late', icon: 'alarm-clock', title: 'مهمة تجاوزت موعدها', body: 'تجهيز كشف أسماء المجموعة (ليلى) كان موعده أمس.', src: 'case task · dueAt < today' },
      { tone: 'warn', icon: 'id-card', title: 'جواز ريم ح. ينتهي قريبًا', body: 'ينتهي 4 ديسمبر 2026، بعد أقل من شهر من العودة.', src: 'warnings · DOCUMENT_EXPIRING_SOON' },
      { tone: 'info', icon: 'file-search', title: 'طلب مشابه مفتوح', body: 'جواز عبد الرحمن ح. مستخدم أيضًا في UM-DEMO-1188 (مفتوح). تحقق قبل الإرسال للتأشيرة.', src: 'warnings · POSSIBLE_DUPLICATE_APPLICATION' },
    ],
  }) + '\n',
  historyTabs: tabs(C.umrah.timeline.length, 1),
  historyIntro: actsum([['آخر نشاط على الحالة', 'اليوم 09:12 · العميلة'], ['آخر إجراء من الموظفة', '28 أكتوبر · مراجعة مستند'], ['تغييرات الإسناد', 'مرة واحدة · 20 أكتوبر']]),
});
um.side = [
  C.umrah.side[0], C.umrah.side[1], C.umrah.side[2],
  card('wallet', 'الدفع', rows([['الفاتورة', '18,600 SAR', 1], ['الحالة', '<span class="nh-badge nh-badge--info">إيصال قيد المراجعة</span>'], ['الإيصال', 'رُفع اليوم 07:40'], ['المطابقة', '<span class="nh-match nh-match--ok">مطابق للفاتورة</span>']]) + `<div style="padding:0 20px 16px"><button class="nh-btn nh-btn--primary nh-btn--sm" style="width:100%">${I('receipt')}فتح في مراجعة الدفعات</button></div>` + note('info', 'صلاحيتك تسمح باعتماد الدفع، ويتم ذلك في صفحة مراجعة الدفعات فقط.')),
  card('clipboard-check', 'المهام المفتوحة', `<div class="nh-task"><input class="nh-check" type="checkbox" aria-label="إنهاء المهمة" style="margin-top:4px"><div><span class="nh-task__name">تجهيز كشف أسماء المجموعة</span><span class="nh-task__due" style="color:var(--danger-ink);font-weight:700">ليلى · متأخرة يومًا (30 أكتوبر)</span></div></div><div class="nh-task"><input class="nh-check" type="checkbox" aria-label="إنهاء المهمة" style="margin-top:4px"><div><span class="nh-task__name">مراجعة جواز ريم ح.</span><span class="nh-task__due nh-task__due--warn">سارة · تستحق اليوم</span></div></div><div class="nh-task"><input class="nh-check" type="checkbox" aria-label="إنهاء المهمة" style="margin-top:4px"><div><span class="nh-task__name">تجهيز ملف التأشيرات للإرسال</span><span class="nh-task__due">سارة · بعد تأكيد الدفع</span></div></div>`, `<button class="nh-btn nh-btn--ghost nh-btn--sm">${I('plus')}مهمة</button>`),
  C.umrah.side[6],
];
um.timeline = [
  ...C.umrah.timeline.slice(0, 3),
  { icon: 'clipboard-check', title: 'إنشاء مهمة', time: '27 أكتوبر · 10:00', body: 'تجهيز كشف أسماء المجموعة · لليلى · موعدها 30 أكتوبر · بواسطة خالد (مدير)' },
  ...C.umrah.timeline.slice(3),
];

const readme = `# CaseWorkspaceAdmin

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
- No editing of the case deadline (\`dueAt\`): no route sets it today. The manager can add a task with a due date and an owner.
- No per-case filter on the global activity log: the link says so.
- No payment approval or rejection inside the case, and no price editing.

## Rules used for colour (R2 from the Operations Center baseline)
- Red only for a genuinely missed deadline: a task past its dueAt (Umrah example: تجهيز كشف أسماء المجموعة) or SLA OVERDUE.
- Amber for inactivity (≥ 24 h without activity), due today, unassigned work, and advisories.

## Notes
The ADMIN role has the same manager tools; the header chip names the viewer's role.
`;

if (require.main === module) {
  const outE = path.join(__dirname, 'nh-ds/project/components/CaseWorkspaceAdmin');
  const outU = path.join(__dirname, 'nh-ds/project/components/CaseWorkspaceAdminUmrah');
  for (const d of [outE, outU]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(outE, 'preview.html'), page(eg));
  fs.writeFileSync(path.join(outE, 'README.md'), readme);
  fs.writeFileSync(path.join(outU, 'preview.html'), page(um));
  fs.writeFileSync(path.join(outU, 'README.md'), '# CaseWorkspaceAdminUmrah\n\nSUPER_ADMIN view of the Umrah case UM-DEMO-1192 (same moment as CaseWorkspaceUmrah) with manager tools: reassignment, deadline monitoring (including one genuinely overdue task, shown in red), the attention list built from existing signals, and the full activity history. Permissions and limits: see CaseWorkspaceAdmin. All data is synthetic demonstration data.\n');
  console.log('ok');
}
