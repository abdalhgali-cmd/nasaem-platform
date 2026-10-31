// Writes components/<Comp>/preview.html + README.md for the Nasaem admin design system.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, 'nh-ds/project/components');
const MARK = '/_blob/a413328814b38b6086bc518d8ff4f324';

const wrap = (group, height, body, opts = {}) =>
  `<!-- @dsCard group="${group}" height=${height}${opts.page ? ' page' : ''}${opts.width ? ` width=${opts.width}` : ''} -->\n` +
  `<div class="nh" dir="rtl" lang="ar" style="padding:${opts.pad ?? 24}px;background:var(--${opts.bg ?? 'canvas'});min-height:100%">\n${body.trim()}\n</div>\n` +
  `<script>window.NasaemDS && NasaemDS.hydrate();</script>\n`;

const I = (n, c = '') => `<i data-icon="${n}"${c ? ` class="${c}"` : ''}></i>`;
const row = (inner, gap = 12, extra = '') => `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:${gap}px;${extra}">${inner}</div>`;
const col = (inner, gap = 16, extra = '') => `<div style="display:grid;gap:${gap}px;${extra}">${inner}</div>`;
const label = (t) => `<div class="nh-muted" style="font-size:12px;font-weight:700;line-height:18px">${t}</div>`;

// ---------- reusable fragments ----------
const sidebar = (active = 'cases') => {
  const item = (key, icon, text, count = '', danger = false) =>
    `<a class="nh-navitem${key === active ? ' is-active' : ''}" href="#">${I(icon)}<span>${text}</span>${count ? `<span class="nh-count${danger ? ' nh-count--danger' : ''}">${count}</span>` : ''}</a>`;
  return `<aside class="nh-sidebar" aria-label="تنقل الإدارة">
  <div class="nh-sidebar__brand"><span class="nh-sidebar__mark"><img src="${MARK}" alt=""></span><div><div class="nh-sidebar__name">نسائم الحرمين</div><div class="nh-sidebar__tag">مركز التحكم</div></div></div>
  <div class="nh-navgroup"><button class="nh-navgroup__label" type="button">العمل اليومي ${I('chevron-down')}</button>
    ${item('ops', 'gauge', 'مركز العمليات')}
    ${item('cases', 'clipboard-list', 'مساحة عمل الحالات', '12', true)}
    ${item('notif', 'bell', 'الإشعارات', '4')}
    ${item('assign', 'user-round-cog', 'الإسناد')}
    ${item('docs', 'file-check-2', 'المستندات')}
  </div>
  <div class="nh-navgroup"><button class="nh-navgroup__label" type="button">الخدمات والموقع ${I('chevron-down')}</button>
    ${item('umrah', 'sparkles', 'مجموعات العمرة')}
    ${item('visas', 'layers-3', 'التأشيرات والمتطلبات')}
  </div>
  <div class="nh-navgroup"><button class="nh-navgroup__label" type="button">المال والتقارير ${I('chevron-left')}</button></div>
  <div class="nh-navgroup"><button class="nh-navgroup__label" type="button">الفريق والنظام ${I('chevron-left')}</button></div>
  <div class="nh-sidebar__foot"><span class="nh-avatar nh-avatar--gold">س</span><div><strong>سارة عبد الرحمن</strong><span>موظف عمليات</span></div></div>
</aside>`;
};

const topbar = (crumb = 'مساحة عمل الحالات') => `<header class="nh-topbar">
  <div class="nh-topbar__start">
    <button class="nh-iconbtn" type="button" aria-label="فتح القائمة" style="display:none">${I('menu')}</button>
    <nav class="nh-crumbs" aria-label="المسار"><span>العمل اليومي</span>${I('chevron-left')}<strong>${crumb}</strong></nav>
  </div>
  <div class="nh-topbar__end">
    <div class="nh-search">${I('search')}<input class="nh-input" placeholder="ابحث برقم الحالة أو الجواز أو الاسم" aria-label="بحث"><span class="nh-kbd">⌘K</span></div>
    <button class="nh-iconbtn" type="button" aria-label="الإشعارات">${I('bell')}<span class="nh-iconbtn__dot">4</span></button>
    <div class="nh-userchip"><span class="nh-avatar nh-avatar--gold">س</span><div><strong>سارة عبد الرحمن</strong><span>موظف عمليات</span></div></div>
  </div>
</header>`;

const cases = [
  ['EG-2026-00418', 'أحمد محمد عبد الله', 'جواز P04718823 · سوداني', 'nile', 'الموافقة الأمنية لمصر', 'info', 'بحاجة لمراجعة', 'due', 'تستحق اليوم', 'clock', '45.00', 'USD', 'م ع'],
  ['UM-2026-01192', 'فاطمة حسن إبراهيم', 'مجموعة رجب · ١٤ معتمر', 'gold', 'عمرة', 'warning', 'بانتظار الدفع', 'ok', 'ضمن الموعد', 'circle-check', '18,600.00', 'SAR', 'ف ح'],
  ['EG-2026-00411', 'عمر صالح الطيب', 'جواز P03920014 · سوداني', 'nile', 'الموافقة الأمنية لمصر', 'warning', 'ناقصة المستندات', 'late', 'متأخرة ٢ يوم', 'triangle-alert', '45.00', 'USD', 'ع ص'],
  ['EG-2026-00402', 'مريم يوسف أحمد', 'جواز P05581230 · سوداني', 'nile', 'الموافقة الأمنية لمصر', 'navy', 'لدى الجهة', 'ok', 'ضمن الموعد', 'circle-check', '45.00', 'USD', 'م ي'],
  ['UM-2026-01187', 'خالد عثمان محمود', 'عمرة فردية · ٣ أفراد', 'gold', 'عمرة', 'success', 'النتيجة جاهزة', 'ok', 'ضمن الموعد', 'circle-check', '5,250.00', 'SAR', 'خ ع'],
];
const caseRow = (c, i, selected = false) => `<tr${selected ? ' class="is-selected"' : ''}>
  <td class="is-check"><input class="nh-check" type="checkbox"${selected ? ' checked' : ''} aria-label="تحديد"></td>
  <td><span class="nh-ref">${c[0]}</span></td>
  <td><div class="nh-person"><span class="nh-avatar${c[3] === 'gold' ? ' nh-avatar--gold' : ''}">${c[12]}</span><div><span class="nh-cell-primary">${c[1]}</span><span class="nh-cell-secondary">${c[2]}</span></div></div></td>
  <td><span class="nh-badge nh-badge--${c[3]} nh-badge--square nh-badge--plain">${c[4]}</span></td>
  <td><span class="nh-badge nh-badge--${c[5]}">${c[6]}</span></td>
  <td><span class="nh-sla nh-sla--${c[7]}">${I(c[9])}${c[8]}</span></td>
  <td class="is-num"><span>${c[10]} <span class="nh-muted">${c[11]}</span></span></td>
  <td class="is-actions"><button class="nh-btn nh-btn--ghost nh-btn--icon nh-btn--sm" aria-label="فتح الحالة">${I('chevron-left')}</button></td>
</tr>`;
const table = (n = 5, sel = -1) => `<div class="nh-table-card">
  <div class="nh-table-toolbar">
    <div class="nh-table-toolbar__group">
      <div class="nh-segment" role="tablist"><button class="is-active">الكل <span class="nh-count">128</span></button><button>الموافقة الأمنية</button><button>العمرة</button></div>
      <button class="nh-chip is-on">${I('list-filter')}الحالة: بحاجة لمراجعة ${I('x')}</button>
      <button class="nh-chip">${I('plus')}الموظف المسند</button>
    </div>
    <div class="nh-table-toolbar__group">
      <div class="nh-inputwrap" style="width:220px">${I('search')}<input class="nh-input" style="height:34px" placeholder="بحث في الحالات" aria-label="بحث في الحالات"></div>
      <button class="nh-btn nh-btn--secondary nh-btn--sm">${I('download')}تصدير</button>
    </div>
  </div>
  <div class="nh-table-scroll"><table class="nh-table">
    <thead><tr><th class="is-check"><input class="nh-check" type="checkbox" aria-label="تحديد الكل"></th><th class="is-sortable">رقم الحالة ${I('arrow-down-up')}</th><th>العميل</th><th>الخدمة</th><th>الحالة</th><th class="is-sortable">الموعد ${I('arrow-down-up')}</th><th class="is-num">المبلغ</th><th class="is-actions"><span style="position:absolute;width:1px;height:1px;overflow:hidden">إجراءات</span></th></tr></thead>
    <tbody>${cases.slice(0, n).map((c, i) => caseRow(c, i, i === sel)).join('')}</tbody>
  </table></div>
  <div class="nh-table-foot"><span>عرض <span class="nh-num">1–${n}</span> من <span class="nh-num">128</span> حالة</span>
    <div class="nh-pager"><button aria-label="السابق" disabled>${I('chevron-right')}</button><button class="is-current">1</button><button>2</button><button>3</button><button>…</button><button>26</button><button aria-label="التالي">${I('chevron-left')}</button></div></div>
</div>`;

const stat = (labelT, icon, tone, value, foot, delta, dir, bar) => `<div class="nh-stat">
  <div class="nh-stat__top"><span class="nh-stat__label">${labelT}</span><span class="nh-stat__icon${tone ? ` nh-stat__icon--${tone}` : ''}">${I(icon)}</span></div>
  <div class="nh-stat__value">${value}</div>
  ${bar != null ? `<div class="nh-stat__bar" role="progressbar" aria-valuenow="${bar}" aria-valuemin="0" aria-valuemax="100"><span style="width:${bar}%"></span></div>` : ''}
  <div class="nh-stat__foot">${delta ? `<span class="nh-delta nh-delta--${dir}">${I(dir === 'up' ? 'trending-up' : 'trending-down', 'nh-icon--sm')}${delta}</span>` : ''}<span>${foot}</span></div>
</div>`;

const clearance = (current = 3) => {
  const steps = [['user-check', 'استلام الطلب', '٢ نوفمبر'], ['file-search', 'مراجعة المستندات', '٣ نوفمبر'], ['wallet', 'تأكيد الدفع', '٣ نوفمبر'], ['landmark', 'لدى الجهة الأمنية', 'منذ ٤ أيام'], ['stamp', 'صدور الموافقة', 'متوقع ١٥ نوفمبر'], ['plane-takeoff', 'التعميم والسفر', '—']];
  return `<ol class="nh-steps">${steps.map((s, i) => {
    const st = i < current ? 'is-done' : i === current ? 'is-current' : '';
    return `<li class="nh-step ${st}"><span class="nh-step__dot">${i < current ? I('check') : I(s[0])}</span><span class="nh-step__label">${s[1]}</span><span class="nh-step__meta">${s[2]}</span></li>`;
  }).join('')}</ol>`;
};

// ---------- components ----------
const C = {};

C.Button = {
  group: 'Actions', height: 300,
  body: col(`
${label('الأنواع')}
${row(`<button class="nh-btn nh-btn--primary">${I('plus')}حالة جديدة</button><button class="nh-btn nh-btn--secondary">${I('download')}تصدير Excel</button><button class="nh-btn nh-btn--ghost">إلغاء</button><button class="nh-btn nh-btn--gold">${I('sparkles')}نشر الباقة</button><button class="nh-btn nh-btn--danger">${I('circle-x')}رفض الطلب</button>`)}
${label('الأحجام والحالات')}
${row(`<button class="nh-btn nh-btn--primary nh-btn--sm">صغير</button><button class="nh-btn nh-btn--primary">متوسط</button><button class="nh-btn nh-btn--primary nh-btn--lg">كبير</button><button class="nh-btn nh-btn--primary is-loading" aria-busy="true">${I('loader-circle')}جاري الحفظ</button><button class="nh-btn nh-btn--primary" disabled>غير متاح</button>`)}
${label('أزرار الأيقونات')}
${row(`<button class="nh-btn nh-btn--secondary nh-btn--icon" aria-label="تحديث">${I('refresh-cw')}</button><button class="nh-btn nh-btn--ghost nh-btn--icon" aria-label="المزيد">${I('ellipsis')}</button><button class="nh-btn nh-btn--secondary nh-btn--icon nh-btn--sm" aria-label="عرض">${I('eye')}</button><button class="nh-btn nh-btn--secondary">التالي ${I('chevron-left')}</button>`)}
`, 14),
  readme: `# Button

Buttons trigger an action. Five variants, three sizes and an icon-only form, all at 38px default height so they line up with inputs.

## Variants
| Class | Use | Tokens |
|---|---|---|
| \`nh-btn--primary\` | The ONE main action on a screen or dialog (حفظ، اعتماد، حالة جديدة). | \`primary\`, \`primary-hover\`, \`on-primary\` |
| \`nh-btn--secondary\` | Supporting actions (تصدير، تعديل، رفع مستند). | \`surface\`, \`line-strong\`, hover \`primary-soft\` |
| \`nh-btn--ghost\` | Low-emphasis: إلغاء, row actions, toolbar overflow. | \`ink-secondary\`, hover \`surface-sunken\` |
| \`nh-btn--gold\` | Rare premium/publishing action (نشر الباقة). At most one per page; never for routine saves. | \`accent\`, \`on-accent\` |
| \`nh-btn--danger\` | Destructive or irreversible (رفض الطلب، حذف). Always behind a confirm Dialog. | \`danger\`, \`ink-inverse\` |

## Rules
- Label = verb + object, in Arabic: "اعتماد الدفع" not "موافق".
- Icons come first in source order; in RTL they render on the right. Pick the direction for RTL yourself: "next" and "open" are \`chevron-left\`, "back" is \`chevron-right\`. Only \`send\` and \`log-out\` are mirrored automatically (\`nh-icon--flip\`).
- Icon-only buttons (\`nh-btn--icon\`) must have an \`aria-label\`.
- Loading: add \`is-loading\` + \`aria-busy="true"\` and swap the icon to \`loader-circle\`; keep the width stable.
- Sizes: \`--sm\` (32px) in tables and toolbars, default (38px) in forms, \`--lg\` (44px) on login and wizards only.

## Maps to code
Replaces the ad-hoc \`rounded-xl px-3 py-2\` buttons in \`admin-shell.tsx\` and \`button.btn\` in \`public/assets/style.css\`. The consumer provides the click handler and the disabled/loading state.
`,
};

C.StatusBadge = {
  group: 'Status', height: 330,
  body: col(`
${label('حالات الطلب (statusLabel)')}
${row(`<span class="nh-badge nh-badge--info">جديد</span><span class="nh-badge nh-badge--info">قيد المراجعة</span><span class="nh-badge nh-badge--warning">بانتظار المستندات</span><span class="nh-badge nh-badge--warning">بانتظار الدفع</span><span class="nh-badge nh-badge--navy">قيد التنفيذ</span><span class="nh-badge nh-badge--success">معتمد</span><span class="nh-badge nh-badge--success">مكتمل</span><span class="nh-badge nh-badge--danger">مرفوض</span><span class="nh-badge">ملغي</span>`, 8)}
${label('حالة الدفع')}
${row(`<span class="nh-badge nh-badge--danger">غير مدفوع</span><span class="nh-badge nh-badge--warning">جزئي</span><span class="nh-badge nh-badge--warning">بانتظار التحويل</span><span class="nh-badge nh-badge--info">الدفع قيد المراجعة</span><span class="nh-badge nh-badge--success">مدفوع</span>`, 8)}
${label('نوع الخدمة')}
${row(`<span class="nh-badge nh-badge--nile nh-badge--square">${I('shield-check')}الموافقة الأمنية لمصر</span><span class="nh-badge nh-badge--gold nh-badge--square">${I('sparkles')}عمرة</span><span class="nh-badge nh-badge--navy nh-badge--square">${I('plane')}طيران</span><span class="nh-badge nh-badge--navy nh-badge--square">${I('hotel')}فنادق</span>`, 8)}
${label('مؤشر SLA')}
${row(`<span class="nh-sla nh-sla--ok">${I('circle-check')}ضمن الموعد</span><span class="nh-sla nh-sla--due">${I('clock')}تستحق اليوم</span><span class="nh-sla nh-sla--late">${I('triangle-alert')}متأخرة ٢ يوم</span>`, 20)}
`, 12),
  readme: `# StatusBadge

Status badges label the state of a case, payment, document or service type with one consistent colour per meaning.

## Tone map (use exactly this; never pick a colour per screen)
| Tone class | Meaning | Statuses |
|---|---|---|
| \`nh-badge--info\` | New / someone on our side must look | NEW, UNDER_REVIEW, NEEDS_REVIEW, UNDER_REVIEW_PAYMENT |
| \`nh-badge--warning\` | Waiting on the customer | WAITING_DOCUMENTS, MISSING_DOCUMENTS, PAYMENT_PENDING, WAITING_CUSTOMER, AWAITING_TRANSFER, PARTIAL |
| \`nh-badge--navy\` | In progress with us or a provider | PROCESSING, READY_FOR_PROCESSING, WAITING_PROVIDER |
| \`nh-badge--success\` | Done, positive | APPROVED, COMPLETED, PAID, CONFIRMED, ACCEPTED, RESULTS_READY |
| \`nh-badge--danger\` | Negative or blocking | REJECTED, UNPAID, SUSPENDED |
| default (no tone) | Inert | CANCELLED, INACTIVE, NOT_REQUIRED, DRAFT |

Service-type tags use \`--square\` + \`--plain\` (no dot) so they never read as a status: **Egypt clearance = \`nile\`**, **Umrah = \`gold\`**, everything else \`navy\`.

## SLA
\`nh-sla--ok | --due | --late\` (from \`SLA_LABEL\` in \`case-workspace.tsx\`). Always icon + words, never colour alone: \`circle-check\`, \`clock\`, \`triangle-alert\`.

## Rules
- Text comes from the existing Arabic label maps (\`statusLabel\`, \`QUEUE_LABEL\`); never show the raw enum.
- One status badge per row. Tones are told apart by the label text and lightness, not hue alone.
- Tokens: each tone's \`*-soft\` ground with its \`*-ink\` text (≥5.7:1 in both themes).
`,
};

C.Alert = {
  group: 'Status', height: 340,
  body: col(`
<div class="nh-alert nh-alert--info" role="status">${I('info')}<div><span class="nh-alert__title">الطلب لدى الجهة الأمنية</span>تم إرسال الملف بتاريخ ٥ نوفمبر. لا يلزم أي إجراء حتى صدور النتيجة.</div></div>
<div class="nh-alert nh-alert--warning" role="status">${I('file-warning')}<div><span class="nh-alert__title">صورة الجواز غير واضحة</span>اطلب من العميل إعادة رفع صفحة البيانات بدقة أعلى قبل الإرسال.</div><div class="nh-alert__actions"><button class="nh-btn nh-btn--secondary nh-btn--sm">${I('send')}إرسال تذكير</button></div></div>
<div class="nh-alert nh-alert--danger" role="alert">${I('shield-alert')}<div><span class="nh-alert__title">تعذر تأكيد الدفع</span>المبلغ المحول لا يطابق الفاتورة (45.00 USD).</div></div>
<div class="nh-alert nh-alert--gold">${I('lock')}<div><span class="nh-alert__title">تشغيل آمن</span>كل إجراء حساس يمر عبر صلاحيات الخادم وقواعد العمل الحالية.</div></div>
`, 12),
  readme: `# Alert

Alerts are inline banners that explain a state of the current case or page and, where useful, offer the next action.

- Tones: \`--info\` (neutral fact), \`--warning\` (customer action needed), \`--danger\` (blocking), \`--success\` (just completed), \`--gold\` (policy and trust notes, e.g. the "تشغيل آمن" note from the sidebar).
- Structure: icon, then a bold \`nh-alert__title\` and one sentence. Optional \`nh-alert__actions\` holds at most one small button.
- \`role="alert"\` only for danger that appears after a user action; others are \`role="status"\`.
- Never stack more than two alerts; fold the rest into the case timeline.
- Tokens: \`*-soft\` ground, \`*-ink\` text, \`radius-lg\`.
`,
};

C.Toast = {
  group: 'Status', height: 150,
  body: col(`
<div class="nh-toast" role="status">${I('circle-check')}<span>تم إسناد الحالة <span class="nh-ref" style="color:inherit">EG-2026-00418</span> إلى سارة</span><button type="button">تراجع</button></div>
<div class="nh-toast" role="status">${I('upload')}<span>تم رفع ٣ مستندات بنجاح</span></div>
`, 10),
  readme: `# Toast

Toasts confirm a completed action for ~5 seconds without moving focus.

- Navy-950 ground with sidebar ink and a gold leading icon: the one place the dark brand surface appears inside the content area.
- Offer "تراجع" (undo) for reversible actions instead of a confirm dialog.
- Position: bottom-start (bottom-right in RTL), \`z-toast\`. Errors are never toasts; use an Alert next to the thing that failed.
`,
};

C.StatCard = {
  group: 'Data', height: 220,
  body: `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
${stat('الحالات المفتوحة', 'clipboard-list', '', '128', 'مقارنة بالأسبوع الماضي', '12%', 'up')}
${stat('طلبات الموافقة الأمنية', 'shield-check', 'nile', '46', 'لدى الجهة الأمنية: 19', '', '', 41)}
${stat('معتمرو هذا الشهر', 'sparkles', 'gold', '312', 'من 400 مقعد في 6 مجموعات', '', '', 78)}
${stat('حالات متأخرة', 'triangle-alert', 'danger', '7', 'تجاوزت موعد SLA', '3', 'down')}
</div>`,
  readme: `# StatCard

Stat cards show one operational KPI with its context: label, icon, value, and either a trend or a capacity bar.

- Value uses the \`kpi\` text style (Inter, tabular, LTR) so digits align across a row of cards.
- Icon tile tone follows the service: default navy (general), \`--nile\` (Egypt clearance), \`--gold\` (Umrah), \`--danger\` (overdue/blocked only).
- Foot: a \`nh-delta--up|down\` trend OR a progress bar (\`nh-stat__bar\`, for capacity such as seats filled), plus one short context line. Not both.
- Make it a link (\`a.nh-stat\`) to the filtered list it counts; hover raises to \`shadow-md\`.
- Four per row on desktop, two on tablet, one on mobile. Never more than four.
`,
};

C.DataTable = {
  group: 'Data', height: 560, width: 1100,
  body: table(5, 0),
  readme: `# DataTable

The data table is the main working surface: a toolbar (segment, filter chips, search, export), a sticky-header table, and a footer with count and pagination.

## Anatomy
1. \`nh-table-toolbar\`: \`nh-segment\` for the service split (الكل / الموافقة الأمنية / العمرة), \`nh-chip\` filters (dashed = add filter, solid \`is-on\` = applied, with an × to clear), search and export on the end side.
2. \`nh-table\`: header row on \`surface-sunken\` in the \`caption\` style; sticky.
3. \`nh-table-foot\`: "عرض 1–5 من 128 حالة" + \`nh-pager\`.

## Cell recipes
- **Reference**: \`nh-ref\` (mono, LTR): EG-2026-00418.
- **Person**: \`nh-person\` = avatar initials + \`nh-cell-primary\` name + \`nh-cell-secondary\` passport/nationality or group.
- **Service**: square plain badge (nile / gold / navy).
- **Status**: one StatusBadge. **SLA**: \`nh-sla\`.
- **Money and counts**: \`is-num\` cell: end-aligned, tabular, LTR, amount then currency code in muted.
- **Actions**: \`is-actions\`, ghost icon buttons only, chevron opens the case.

## Rules
- Row height 48px comfortable, \`nh-table--compact\` 40px for long registers (activity log).
- Hover \`navy-50\`, selected \`primary-soft\`; selecting rows swaps the toolbar for \`nh-bulkbar\` (assign, export, change status).
- Text columns align to the start (right); numbers to the end (left). Never centre.
- Empty result: render EmptyState inside the card, keep the toolbar.
- Loading: 5 rows of \`nh-skel\` bars, never a spinner over an empty table.
- The consumer provides rows, sort state, selection and page; the table holds no data logic.
`,
};

C.QueueCard = {
  group: 'Data', height: 200,
  body: `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
<button class="nh-queue is-active"><span class="nh-queue__icon" style="background:var(--info-soft);color:var(--info-ink)">${I('file-search')}</span><span class="nh-queue__label">بحاجة لمراجعة</span><span class="nh-queue__n">12</span></button>
<button class="nh-queue"><span class="nh-queue__icon" style="background:var(--warning-soft);color:var(--warning-ink)">${I('file-warning')}</span><span class="nh-queue__label">ناقصة المستندات</span><span class="nh-queue__n">9</span></button>
<button class="nh-queue"><span class="nh-queue__icon" style="background:var(--warning-soft);color:var(--warning-ink)">${I('hourglass')}</span><span class="nh-queue__label">بانتظار العميل</span><span class="nh-queue__n">17</span></button>
<button class="nh-queue"><span class="nh-queue__icon" style="background:var(--warning-soft);color:var(--warning-ink)">${I('wallet')}</span><span class="nh-queue__label">بانتظار الدفع</span><span class="nh-queue__n">6</span></button>
<button class="nh-queue"><span class="nh-queue__icon" style="background:var(--primary-soft);color:var(--primary-ink)">${I('circle-dot')}</span><span class="nh-queue__label">جاهزة للتنفيذ</span><span class="nh-queue__n">5</span></button>
<button class="nh-queue"><span class="nh-queue__icon" style="background:var(--primary-soft);color:var(--primary-ink)">${I('landmark')}</span><span class="nh-queue__label">لدى الجهة</span><span class="nh-queue__n">19</span></button>
<button class="nh-queue"><span class="nh-queue__icon" style="background:var(--success-soft);color:var(--success-ink)">${I('stamp')}</span><span class="nh-queue__label">النتيجة جاهزة</span><span class="nh-queue__n">4</span></button>
<button class="nh-queue"><span class="nh-queue__icon">${I('circle-check')}</span><span class="nh-queue__label">مكتملة</span><span class="nh-queue__n">231</span></button>
</div>`,
  readme: `# QueueCard

Queue cards are the work-lane selector of the case workspace: one card per \`QueueKey\`, in \`QUEUE_ORDER\`, each a filter for the table below.

- Icon tile tone = the StatusBadge tone of that queue (info → warning → navy → success), so lanes read left-to-right (right-to-left) as the case's journey.
- The active lane gets \`is-active\` (primary outline) and \`aria-pressed="true"\`.
- The count is the \`kpi\`-family numeral at 20px; zero still shows "0", never hidden.
- Eight lanes = two rows of four on desktop; a horizontal scroll row on mobile.
`,
};

C.Sidebar = {
  group: 'Navigation', height: 720, width: 320, pad: 0,
  body: sidebar('cases'),
  readme: `# Sidebar

The sidebar is the admin's primary navigation: a deep navy rail with the brand mark, collapsible role-filtered groups, and the signed-in user.

## Anatomy
- **Brand**: the Kaaba-and-orbit emblem (\`assets/Logos/nasaem-mark.png\`) on a white tile with a \`gold-300\` ring, the name "نسائم الحرمين" and "مركز التحكم" in \`gold-300\`.
- **Groups** (from \`navigationGroups\` in \`admin-shell.tsx\`): العمل اليومي، المال والتقارير، الخدمات والموقع، الفريق والنظام. Headings in the \`overline\` style; chevron shows open/closed. A group containing the active page is always open.
- **Item**: Lucide icon (16px, 1.75 stroke) + label + optional count. Active = \`sidebar-active\` fill, \`sidebar-ink\` text, gold icon and a 3px gold marker on the inline-start edge (right in RTL).
- **Counts**: neutral for informational (الإشعارات), \`nh-count--danger\` only for items with overdue work.
- **Foot**: the user's avatar, name and Arabic role label (\`roleLabels\`).

## Rules
- Width 272px desktop; below 1024px it becomes a drawer (\`overlay\` scrim, \`radius-xl\` edge, \`z-drawer\`) opened from the top bar menu button.
- Items the user's role cannot reach are removed, not disabled.
- Gold is used here for exactly one thing: what is active. Don't add gold elsewhere in the rail.
- Tokens: \`sidebar-bg\`, \`sidebar-ink\`, \`sidebar-ink-muted\`, \`sidebar-hover\`, \`sidebar-active\`, \`sidebar-line\`, \`accent\`.
`,
};

C.Topbar = {
  group: 'Navigation', height: 200, width: 1100, pad: 0,
  body: `${topbar()}
<div style="padding:24px 32px"><div class="nh-pagehead"><div><h1>مساحة عمل الحالات</h1><p>كل الحالات المسندة إليك وإلى فريقك، مرتبة حسب الأولوية وموعد الاستحقاق.</p></div>${row(`<button class="nh-btn nh-btn--secondary">${I('download')}تصدير</button><button class="nh-btn nh-btn--primary">${I('plus')}حالة جديدة</button>`, 8)}</div></div>`,
  readme: `# Topbar

The top bar and page header frame every admin screen: breadcrumbs and global search on one side, notifications and the user on the other, then the page title with its primary actions.

- Height 64px, \`surface\` with a \`line\` bottom border; sticky at \`z-topbar\`.
- Breadcrumb: group › page, current page in \`ink\` bold. Separators are \`chevron-left\` (mirrors correctly in RTL).
- Global search (\`nh-search\`) looks up case reference, passport number or name; ⌘K / Ctrl K focuses it.
- Notification button shows the unread count from \`/notifications?limit=1\` (\`meta.unreadCount\`), capped "9+".
- Page header (\`nh-pagehead\`): \`h1\` style title, one-line description in \`ink-muted\`, max two actions with the primary last (leftmost in RTL).
- Logout lives in the user menu, not as a bare icon next to notifications.
`,
};

C.Tabs = {
  group: 'Navigation', height: 210,
  body: col(`
<div class="nh-tabs" role="tablist"><button class="nh-tab is-active" role="tab" aria-selected="true">نظرة عامة</button><button class="nh-tab" role="tab">المستندات <span class="nh-count nh-count--danger">2</span></button><button class="nh-tab" role="tab">الدفع</button><button class="nh-tab" role="tab">السجل <span class="nh-count">14</span></button><button class="nh-tab" role="tab">الملاحظات</button></div>
${row(`<div class="nh-segment"><button class="is-active">اليوم</button><button>٧ أيام</button><button>٣٠ يوم</button><button>مخصص</button></div><div class="nh-segment"><button class="is-active">${I('columns-3')}جدول</button><button>${I('layers-3')}لوحة</button></div>`)}
`, 24),
  readme: `# Tabs

Tabs switch between sections of one record (a case: نظرة عامة، المستندات، الدفع، السجل); the segmented control switches a view or range of the same data.

- \`nh-tabs\`: underline style, 2px \`primary\` indicator, optional \`nh-count\` (danger tone when something needs action).
- \`nh-segment\`: for date ranges, view mode, and the service split in table toolbars. 2–4 options.
- Use \`role="tablist"\`/\`tab\`/\`aria-selected\`; arrow keys move between tabs (Right = previous in RTL).
- Never put tabs inside tabs; use a segment inside a tab instead.
`,
};

C.FormField = {
  group: 'Forms', height: 400,
  body: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px 24px;max-width:760px">
<div class="nh-field"><label class="nh-label" for="f1">الاسم الكامل كما في الجواز<span class="req">*</span></label><input id="f1" class="nh-input" value="أحمد محمد عبد الله"></div>
<div class="nh-field"><label class="nh-label" for="f2">رقم الجواز<span class="req">*</span></label><input id="f2" class="nh-input nh-input--ltr" value="P04718823"><span class="nh-help">بالأحرف اللاتينية كما يظهر في الجواز.</span></div>
<div class="nh-field"><label class="nh-label" for="f3">الجنسية</label><select id="f3" class="nh-select"><option>سوداني</option><option>مصري</option><option>سعودي</option></select></div>
<div class="nh-field"><label class="nh-label" for="f4">تاريخ انتهاء الجواز<span class="req">*</span></label><div class="nh-inputwrap">${I('calendar')}<input id="f4" class="nh-input nh-input--ltr is-invalid" value="2026-12-01" aria-invalid="true" aria-describedby="e4"></div><span id="e4" class="nh-error">${I('circle-x')}يجب أن يكون الجواز صالحًا ٦ أشهر على الأقل من تاريخ السفر.</span></div>
<div class="nh-field"><label class="nh-label" for="f5">رقم الهاتف (واتساب)</label><div class="nh-inputwrap">${I('phone')}<input id="f5" class="nh-input nh-input--ltr" placeholder="+249 9X XXX XXXX"></div></div>
<div class="nh-field"><label class="nh-label" for="f6">المرحلة</label><input id="f6" class="nh-input" value="الموافقة الأساسية" disabled></div>
<div class="nh-field" style="grid-column:1/-1"><label class="nh-label" for="f7">ملاحظة داخلية</label><textarea id="f7" class="nh-textarea" placeholder="تظهر للفريق فقط، لا يراها العميل"></textarea></div>
</div>`,
  readme: `# FormField

Form fields pair a label, a control and one line of help or error, laid out in a two-column grid on desktop.

- Label above the control, always visible (no placeholder-as-label). Required = red \`*\` via \`.req\`.
- Controls: \`nh-input\`, \`nh-select\`, \`nh-textarea\`, 40px tall, \`line-control\` border (3:1), focus = \`primary\` border + 3px \`primary-soft\` halo.
- **Latin data in an Arabic form** (passport number, phone, email, dates): add \`nh-input--ltr\`. The text runs LTR but stays right-aligned with its Arabic neighbours.
- Leading icon: wrap in \`nh-inputwrap\`; the icon sits on the inline-start (right).
- Error: \`is-invalid\` + \`aria-invalid\` + \`nh-error\` line that says what to do, not just what is wrong.
- Disabled shows the value on \`surface-sunken\`; use it for fields locked by workflow stage.
- Internal notes always say who can see them ("تظهر للفريق فقط").
`,
};

C.FilterBar = {
  group: 'Forms', height: 170,
  body: col(`
${row(`<div class="nh-inputwrap" style="width:280px">${I('search')}<input class="nh-input" placeholder="رقم الحالة، الجواز، أو الاسم" aria-label="بحث"></div><button class="nh-chip is-on">${I('shield-check')}الموافقة الأمنية ${I('x')}</button><button class="nh-chip is-on">${I('clock')}تستحق اليوم ${I('x')}</button><button class="nh-chip">${I('plus')}الموظف المسند</button><button class="nh-chip">${I('plus')}المرحلة</button><button class="nh-btn nh-btn--ghost nh-btn--sm">مسح الكل</button>`, 8)}
<div class="nh-bulkbar" style="border-radius:10px"><span><span class="nh-num">3</span> حالات محددة</span><button class="nh-btn nh-btn--ghost nh-btn--sm">${I('user-round-cog')}إسناد</button><button class="nh-btn nh-btn--ghost nh-btn--sm">${I('refresh-cw')}تغيير الحالة</button><button class="nh-btn nh-btn--ghost nh-btn--sm">${I('download')}تصدير</button><button class="nh-btn nh-btn--ghost nh-btn--sm" style="margin-inline-start:auto">${I('x')}إلغاء التحديد</button></div>
`, 14),
  readme: `# FilterBar

The filter bar narrows a list: search, applied filter chips, add-filter chips, and a clear-all; with rows selected it becomes the navy bulk-action bar.

- Applied chip: solid \`is-on\` with an × to remove. Add chip: dashed outline with \`plus\`.
- Clear-all appears only when at least one filter is on.
- Filters persist in the URL query so a filtered queue can be shared with a colleague.
- Bulk bar: \`navy-950\` ground, count first, actions as ghost buttons, "إلغاء التحديد" at the far end.
`,
};

C.ClearanceTracker = {
  group: 'Operations', height: 330, width: 1000,
  body: `<div class="nh-card">
<div class="nh-card__head"><div><h2 class="nh-card__title">مسار الموافقة الأمنية لمصر</h2><p class="nh-card__sub"><span class="nh-ref">EG-2026-00418</span> · أحمد محمد عبد الله</p></div>${row(`<span class="nh-badge nh-badge--navy">لدى الجهة</span><span class="nh-sla nh-sla--ok">${I('circle-check')}ضمن الموعد</span>`, 12)}</div>
<div class="nh-card__body">${clearance(3)}</div>
<div class="nh-card__body" style="padding-top:0"><div class="nh-alert nh-alert--info">${I('info')}<div>نسائم الحرمين تتابع إجراءات الطلب وليست جهة إصدار حكومية. التعميم والحجز يتمّان بعد صدور الموافقة من نفس الطلب.</div></div></div>
</div>`,
  readme: `# ClearanceTracker

The clearance tracker shows where an Egypt security-approval case is in its fixed journey, from intake to travel, at a glance.

## Stages
استلام الطلب → مراجعة المستندات → تأكيد الدفع → لدى الجهة الأمنية → صدور الموافقة → التعميم والسفر

## States
- \`is-done\`: navy filled dot with a check; connector to the next step turns \`primary\`.
- \`is-current\`: gold ring on \`accent-soft\` with the stage icon: the ONE gold element on the case page.
- \`is-blocked\`: danger ring (e.g. document rejected); pair it with a danger Alert explaining why.
- Upcoming: hollow, muted label.
- Each step's meta line is a date, a duration ("منذ ٤ أيام") or an expected date.

## Rules
- Always pair with the disclosure line that the agency follows up and is not the issuing authority (the existing legal copy).
- The same component renders Umrah pipelines with their own stages (استلام، التأشيرة، الحجز، التسكين، السفر).
- Below 720px it stacks vertically using the Timeline layout.
`,
};

C.Timeline = {
  group: 'Operations', height: 430,
  body: `<div class="nh-card" style="max-width:560px"><div class="nh-card__head"><h2 class="nh-card__title">سجل الحالة</h2><button class="nh-btn nh-btn--ghost nh-btn--sm">${I('message-square')}إضافة ملاحظة</button></div><div class="nh-card__body"><ol class="nh-timeline">
<li class="nh-tl"><span class="nh-tl__icon nh-tl__icon--navy">${I('send')}</span><div><div class="nh-tl__head"><span class="nh-tl__title">إرسال الحالة للجهة</span><span class="nh-tl__time">5 نوفمبر · 10:42</span></div><div class="nh-tl__body">بواسطة سارة عبد الرحمن</div></div></li>
<li class="nh-tl"><span class="nh-tl__icon nh-tl__icon--success">${I('wallet')}</span><div><div class="nh-tl__head"><span class="nh-tl__title">تأكيد الدفع</span><span class="nh-tl__time">3 نوفمبر · 16:05</span></div><div class="nh-tl__body">45.00 USD · تحويل بنكي</div></div></li>
<li class="nh-tl"><span class="nh-tl__icon nh-tl__icon--gold">${I('file-check-2')}</span><div><div class="nh-tl__head"><span class="nh-tl__title">مراجعة مستند</span><span class="nh-tl__time">3 نوفمبر · 11:20</span></div><div class="nh-tl__body">صورة الجواز: مقبول</div><div class="nh-tl__note">الصورة واضحة والبيانات مطابقة للطلب.</div></div></li>
<li class="nh-tl"><span class="nh-tl__icon">${I('inbox')}</span><div><div class="nh-tl__head"><span class="nh-tl__title">استلام الطلب</span><span class="nh-tl__time">2 نوفمبر · 21:14</span></div><div class="nh-tl__body">من الموقع · مرحلة الموافقة الأساسية</div></div></li>
</ol></div></div>`,
  readme: `# Timeline

The timeline is a case's audit trail: every action, newest first, with who, when, and an optional note.

- Titles come from \`ACTION_LABEL\` in \`case-workspace.tsx\`; an unknown action shows its raw code rather than being hidden.
- Icon tone: navy = staff action, success = money/approval, gold = document review, danger = rejection, neutral = system/customer.
- Time in the \`num\` style (LTR): "5 نوفمبر · 10:42". Today's events may use relative time.
- Internal notes render in \`nh-tl__note\` on \`surface-sunken\`.
`,
};

C.DocumentChecklist = {
  group: 'Operations', height: 360,
  body: `<ul class="nh-docs" style="max-width:640px">
<li class="nh-doc is-accepted"><span class="nh-doc__icon">${I('id-card')}</span><div class="nh-doc__main"><span class="nh-doc__name">صورة صفحة بيانات الجواز</span><span class="nh-doc__meta">passport.jpg · 1.2 MB · رُفع ٢ نوفمبر</span></div><span class="nh-badge nh-badge--success">مقبول</span><button class="nh-btn nh-btn--ghost nh-btn--icon nh-btn--sm" aria-label="عرض">${I('eye')}</button></li>
<li class="nh-doc"><span class="nh-doc__icon">${I('image')}</span><div class="nh-doc__main"><span class="nh-doc__name">صورة شخصية بخلفية بيضاء</span><span class="nh-doc__meta">photo.png · 640 KB · رُفع ٥ نوفمبر</span></div><span class="nh-badge nh-badge--info">قيد المراجعة</span>${row(`<button class="nh-btn nh-btn--secondary nh-btn--sm">${I('check')}قبول</button><button class="nh-btn nh-btn--danger-soft nh-btn--sm">${I('x')}رفض</button>`, 6)}</li>
<li class="nh-doc is-rejected"><span class="nh-doc__icon">${I('file-warning')}</span><div class="nh-doc__main"><span class="nh-doc__name">تأشيرة أو إقامة سابقة</span><span class="nh-doc__meta">السبب: الصورة مقصوصة من الأطراف</span></div><span class="nh-badge nh-badge--danger">مرفوض</span><button class="nh-btn nh-btn--ghost nh-btn--icon nh-btn--sm" aria-label="عرض">${I('eye')}</button></li>
<li class="nh-doc is-missing"><span class="nh-doc__icon">${I('paperclip')}</span><div class="nh-doc__main"><span class="nh-doc__name">تذكرة الطيران (لمرحلة التعميم)</span><span class="nh-doc__meta">مطلوب قبل التعميم فقط</span></div><span class="nh-badge nh-badge--warning">مطلوب</span><button class="nh-btn nh-btn--secondary nh-btn--sm">${I('upload')}رفع</button></li>
</ul>`,
  readme: `# DocumentChecklist

The document checklist lists every required document for a case with its review state and the reviewer's next action.

- One row per required document: icon tile (state-tinted), name, meta (file, size, date, or rejection reason), status badge, actions.
- States use \`DOCUMENT_STATUS_LABEL\`: PENDING = قيد المراجعة (info, shows قبول/رفض), ACCEPTED = مقبول (success), REJECTED = مرفوض (danger, meta shows the reason), not yet uploaded = مطلوب (warning, shows رفع).
- Rejecting always asks for a reason (Dialog) because the customer sees it.
- Stage-specific documents say which stage needs them ("مطلوب قبل التعميم فقط").
`,
};

C.EmptyState = {
  group: 'Overlays', height: 300,
  body: `<div class="nh-card"><div class="nh-empty"><span class="nh-empty__icon">${I('inbox')}</span><h3>لا توجد حالات بحاجة لمراجعة</h3><p>أنجزت كل ما في هذه القائمة. الحالات الجديدة تظهر هنا تلقائيًا فور وصولها.</p>${row(`<button class="nh-btn nh-btn--secondary nh-btn--sm">عرض كل الحالات</button>`)}</div></div>`,
  readme: `# EmptyState

Empty states explain why a list is empty and what to do next, inside the card the list would occupy.

- Icon in a \`primary-soft\` disc, a title that states the fact, one sentence of reassurance or guidance, and at most one action.
- Distinguish "nothing yet" (offer the create action), "all done" (positive, no action needed) and "no results for these filters" (offer clear filters).
`,
};

C.Dialog = {
  group: 'Overlays', height: 380,
  body: `<div class="nh-scrim" style="display:grid;place-items:center;padding:28px;border-radius:14px"><div class="nh-dialog" role="dialog" aria-modal="true" aria-labelledby="dt">
<div class="nh-dialog__head"><span class="nh-dialog__icon nh-dialog__icon--danger">${I('circle-x')}</span><div><h2 id="dt" class="nh-dialog__title">رفض المستند؟</h2><p class="nh-dialog__text">سيصل للعميل إشعار بالرفض مع السبب، ويُطلب منه إعادة الرفع.</p></div></div>
<div class="nh-dialog__body"><div class="nh-field"><label class="nh-label" for="dr">سبب الرفض<span class="req">*</span></label><select id="dr" class="nh-select"><option>الصورة غير واضحة</option><option>الصورة مقصوصة من الأطراف</option><option>المستند منتهي الصلاحية</option></select></div></div>
<div class="nh-dialog__foot"><button class="nh-btn nh-btn--ghost">إلغاء</button><button class="nh-btn nh-btn--danger">رفض المستند</button></div>
</div></div>`,
  readme: `# Dialog

Dialogs confirm a consequential action or collect the one input it needs, without leaving the page.

- Title is the question ("رفض المستند؟"), the text says the consequence for the customer, the confirm button repeats the verb ("رفض المستند", never "نعم").
- Footer on \`surface-sunken\`: cancel (ghost) then confirm; confirm is \`danger\` for destructive actions, otherwise \`primary\`.
- \`radius-xl\`, \`shadow-lg\`, \`overlay\` scrim, \`z-dialog\`. Focus moves to the first field (or cancel for destructive confirms); Esc closes.
- Built on the Radix Dialog already in the codebase (\`components/ui/sheet.tsx\`).
`,
};

C.DashboardPage = {
  group: 'Pages', height: 980, width: 1440, pad: 0, page: true,
  body: `<div style="display:flex;min-height:980px">
${sidebar('ops').replace('nh-sidebar"', 'nh-sidebar" style="min-height:980px"')}
<div style="flex:1;min-width:0;display:flex;flex-direction:column">
${topbar('مركز العمليات')}
<main style="padding:28px 32px;display:grid;gap:24px">
<div class="nh-pagehead"><div><h1>مركز العمليات</h1><p>صباح الخير يا سارة. لديك ١٢ حالة بحاجة لمراجعة، ٣ منها تستحق اليوم.</p></div>${row(`<div class="nh-segment"><button class="is-active">اليوم</button><button>٧ أيام</button><button>٣٠ يوم</button></div><button class="nh-btn nh-btn--primary">${I('plus')}حالة جديدة</button>`, 10)}</div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
${stat('الحالات المفتوحة', 'clipboard-list', '', '128', 'مقارنة بالأسبوع الماضي', '12%', 'up')}
${stat('طلبات الموافقة الأمنية', 'shield-check', 'nile', '46', 'لدى الجهة الأمنية: 19', '', '', 41)}
${stat('معتمرو هذا الشهر', 'sparkles', 'gold', '312', 'من 400 مقعد في 6 مجموعات', '', '', 78)}
${stat('حالات متأخرة', 'triangle-alert', 'danger', '7', 'تجاوزت موعد SLA', '3', 'down')}
</div>
${table(5)}
</main></div></div>`,
  readme: `# DashboardPage

A composed reference screen: the operations centre (مركز العمليات) built only from this system's parts: Sidebar, Topbar, page header, four StatCards and the case DataTable.

Use it as the layout contract: 272px rail, 64px top bar, 32px page gutter (\`space-8\`), 24px between sections (\`space-6\`), 16px between cards (\`space-4\`), content on \`canvas\`, every card on \`surface\`.
`,
};

for (const [name, c] of Object.entries(C)) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'preview.html'), wrap(c.group, c.height, c.body, { pad: c.pad, page: c.page, width: c.width }));
  fs.writeFileSync(path.join(dir, 'README.md'), c.readme);
}
console.log(Object.keys(C).join(' '));
