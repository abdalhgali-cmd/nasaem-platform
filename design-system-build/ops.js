// Operations Center v2 — high-fidelity 1440px preview built from the design system.
// All data below is DEMONSTRATION data. Workflow logic mirrors
// backend/src/modules/dashboard/dashboard.service.js (queues, nextAction, 24h stall rule).
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'nh-ds/project/components/OperationsCenter');
const LOGO_DARK = '/_blob/a6c6f4fe6eab2e24f9069478a79de65a'; // nasaem-logo-horizontal-dark.png

const I = (n, c = '') => `<i data-icon="${n}"${c ? ` class="${c}"` : ''}></i>`;
const sr = (t) => `<span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">${t}</span>`;

// ---------- sidebar (Umrah + Egypt clearance scope) ----------
const nav = (icon, text, { active = false, count = '', danger = false } = {}) =>
  `<a class="nh-navitem${active ? ' is-active' : ''}" href="#"${active ? ' aria-current="page"' : ''}>${I(icon)}<span>${text}</span>${count ? `<span class="nh-count${danger ? ' nh-count--danger' : ''}">${count}</span>` : ''}</a>`;
const sidebar = `<aside class="nh-sidebar" aria-label="تنقل الإدارة" style="min-height:100%;flex:none">
  <div class="nh-sidebar__logo"><img src="${LOGO_DARK}" alt="نسائم الحرمين للسفر والسياحة"><span>مركز التحكم · الإدارة</span></div>
  <div class="nh-navgroup"><button class="nh-navgroup__label" type="button" aria-expanded="true">العمل اليومي ${I('chevron-down')}</button>
    ${nav('gauge', 'مركز العمليات', { active: true })}
    ${nav('clipboard-list', 'مساحة عمل الحالات', { count: '9' })}
    ${nav('receipt', 'مراجعة الدفعات', { count: '4' })}
    ${nav('bell', 'الإشعارات', { count: '6' })}
    ${nav('user-round-cog', 'الإسناد')}
    ${nav('file-check-2', 'المستندات')}
  </div>
  <div class="nh-navgroup"><button class="nh-navgroup__label" type="button" aria-expanded="true">الخدمات ${I('chevron-down')}</button>
    ${nav('sparkles', 'مجموعات العمرة')}
    ${nav('shield-check', 'الموافقة الأمنية لمصر')}
  </div>
  <div class="nh-navgroup"><button class="nh-navgroup__label" type="button" aria-expanded="false">المال والتقارير ${I('chevron-left')}</button></div>
  <div class="nh-navgroup"><button class="nh-navgroup__label" type="button" aria-expanded="false">الفريق والنظام ${I('chevron-left')}</button></div>
  <div class="nh-sidebar__foot"><span class="nh-avatar nh-avatar--gold">س</span><div><strong>سارة (حساب تجريبي)</strong><span>موظف عمليات</span></div></div>
</aside>`;

// ---------- top bar ----------
const topbar = `<header class="nh-topbar" style="padding-inline:32px">
  <div class="nh-topbar__start">
    <nav class="nh-crumbs" aria-label="المسار"><span>العمل اليومي</span>${I('chevron-left')}<strong>مركز العمليات</strong></nav>
    <span class="nh-demo">${I('flask-conical')}وضع العرض · بيانات تجريبية</span>
  </div>
  <div class="nh-topbar__end">
    <div class="nh-search" style="width:380px">${I('search')}<input class="nh-input" placeholder="ابحث بالمرجع أو الاسم أو الهاتف" aria-label="بحث"><span class="nh-kbd">Ctrl K</span></div>
    <button class="nh-iconbtn" type="button" aria-label="الإشعارات، 6 غير مقروءة">${I('bell')}<span class="nh-iconbtn__dot" style="background:var(--primary)">6</span></button>
    <div class="nh-userchip"><span class="nh-avatar nh-avatar--gold">س</span><div><strong>سارة (تجريبي)</strong><span>موظف عمليات</span></div>${I('chevron-down', 'nh-icon--sm')}</div>
  </div>
</header>`;

// ---------- page header ----------
const header = `<div class="nh-pagehead">
  <div>
    <div style="display:flex;align-items:center;gap:12px"><h1 style="font-size:28px;line-height:40px">مركز العمليات</h1></div>
    <p style="max-width:none">ما يحتاج إجراءً الآن في <b style="color:var(--ink)">العمرة</b> و<b style="color:var(--ink)">الموافقة الأمنية لمصر</b>. آخر تحديث <span class="nh-num">10:42</span> · 31 أكتوبر</p>
  </div>
  <div style="display:flex;align-items:center;gap:10px">
    <div class="nh-segment" role="tablist" aria-label="الخدمة"><button class="is-active" role="tab" aria-selected="true">كل الخدمات</button><button role="tab"><span class="nh-sw nh-sw--umrah"></span>العمرة</button><button role="tab"><span class="nh-sw nh-sw--egypt"></span>الموافقة الأمنية لمصر</button></div>
    <button class="nh-btn nh-btn--secondary">${I('refresh-cw')}تحديث</button>
    <button class="nh-btn nh-btn--secondary">${I('chart-column')}التقارير</button>
  </div>
</div>`;

// ---------- focus strip: start here (red only on the overdue item) ----------
const urgent = `<section class="nh-focus" aria-labelledby="urg-t">
  <div class="nh-focus__head"><h2 class="nh-focus__title" id="urg-t">${I('alarm-clock')}ابدأ من هنا</h2><span class="nh-card__sub">3 من 6 طلبات ذات أولوية · <a href="#" class="nh-linkbtn">عرض الكل</a></span></div>
  <div class="nh-focus__grid">
    <div class="nh-focus__item is-overdue">
      <div class="nh-urgent__kind"><span class="nh-prio nh-prio--overdue">${I('timer')}متأخر 31 ساعة</span><span class="nh-badge nh-badge--nile nh-badge--square nh-badge--plain">الموافقة الأمنية</span></div>
      <div><div class="nh-focus__who">عمر ص. (عميل تجريبي)</div><div class="nh-focus__why">رفع العميل مستنداته ولم يراجعها أحد منذ أكثر من 24 ساعة.</div></div>
      <div class="nh-focus__owner">المسؤول: <b style="color:var(--warning-ink)">غير مسند</b></div>
      <div class="nh-focus__actions"><button class="nh-btn nh-btn--primary nh-btn--sm">${I('user-plus')}تعيين لي ومراجعة المستندات</button></div>
    </div>
    <div class="nh-focus__item">
      <div class="nh-urgent__kind"><span class="nh-prio nh-prio--high">${I('receipt')}دفعة بانتظار المراجعة</span><span class="nh-badge nh-badge--gold nh-badge--square nh-badge--plain">عمرة</span></div>
      <div><div class="nh-focus__who">فاطمة ح. (عميل تجريبي)</div><div class="nh-focus__why">إيصال بقيمة <span class="nh-num" style="font-weight:700;color:var(--ink)">18,600 SAR</span> منذ 3 ساعات. موعد مغادرة المجموعة بعد 12 يومًا.</div></div>
      <div class="nh-focus__owner">المسؤول: <b style="color:var(--ink)">سارة</b> <span class="nh-you">أنت</span></div>
      <div class="nh-focus__actions"><button class="nh-btn nh-btn--secondary nh-btn--sm">${I('receipt')}فتح في مراجعة الدفعات</button></div>
    </div>
    <div class="nh-focus__item">
      <div class="nh-urgent__kind"><span class="nh-prio nh-prio--high">${I('package-check')}موافقة صادرة للتسليم</span><span class="nh-badge nh-badge--nile nh-badge--square nh-badge--plain">الموافقة الأمنية</span></div>
      <div><div class="nh-focus__who">مريم ي. (عميل تجريبي)</div><div class="nh-focus__why">الدفع مؤكد والموافقة جاهزة منذ 5 ساعات، ولم يُرسل ملفها للعميل بعد.</div></div>
      <div class="nh-focus__owner">المسؤول: <b style="color:var(--ink)">أحمد</b></div>
      <div class="nh-focus__actions"><button class="nh-btn nh-btn--secondary nh-btn--sm">${I('upload')}إصدار وتسليم</button></div>
    </div>
  </div>
</section>`;


// ---------- queue tiles (dashboard.service queues) ----------
const tile = (icon, bg, fg, label, n, um, eg, active = false) => `<button class="nh-qtile${active ? ' is-active' : ''}" type="button"${active ? ' aria-pressed="true"' : ''}>
  <span class="nh-qtile__top"><span class="nh-qtile__icon" style="background:var(--${bg});color:var(--${fg})">${I(icon)}</span><span class="nh-qtile__n">${n}</span></span>
  <span class="nh-qtile__label">${label}</span>
  <span class="nh-qtile__split"><span><span class="nh-sw nh-sw--umrah"></span>عمرة <b>${um}</b></span><span><span class="nh-sw nh-sw--egypt"></span>مصر <b>${eg}</b></span></span>
</button>`;
const queues = `<section aria-label="قوائم العمل" style="display:grid;grid-template-columns:repeat(6,1fr);gap:14px">
  ${tile('inbox', 'info-soft', 'info-ink', 'طلبات جديدة', 7, 2, 5)}
  ${tile('receipt', 'info-soft', 'info-ink', 'دفعات للمراجعة', 4, 2, 2, true)}
  ${tile('user-plus', 'warning-soft', 'warning-ink', 'طلبات بلا موظف', 5, 1, 4)}
  ${tile('file-clock', 'warning-soft', 'warning-ink', 'بانتظار مستندات', 9, 3, 6)}
  ${tile('hourglass', 'warning-soft', 'warning-ink', 'بانتظار العميل', 6, 4, 2)}
  ${tile('package-check', 'success-soft', 'success-ink', 'جاهزة للتسليم', 3, 0, 3)}
</section>`;

// ---------- action table: 6 fixed columns, no horizontal scroll ----------
// Visual priority scale (logic unchanged from priority() in operations-center.tsx):
//   overdue  = stalled (ageHours >= 24)            -> red, the only red in the table
//   high     = urgent  (CONFIRM_PAYMENT, DELIVER)  -> amber
//   wait     = customer (CUSTOMER_DECISION)        -> neutral
//   normal                                          -> neutral, no badge
const prio = {
  overdue: (age) => `<span class="nh-prio nh-prio--overdue">${I('timer')}متأخر</span><span class="nh-prio-age nh-prio-age--overdue">${age}</span>`,
  high: (age) => `<span class="nh-prio nh-prio--high">أولوية عالية</span><span class="nh-prio-age">${age}</span>`,
  wait: (age) => `<span class="nh-prio nh-prio--wait">${I('hourglass')}لدى العميل</span><span class="nh-prio-age">${age}</span>`,
  normal: (age) => `<span class="nh-prio nh-prio--normal">عادية</span><span class="nh-prio-age">${age}</span>`,
};
const pay = {
  review: (amt, m) => `<div class="nh-pay nh-pay--review"><span class="nh-pay__state">${I('receipt')}إيصال للمراجعة</span><span class="nh-pay__meta"><span class="nh-num" style="font-weight:700;color:var(--ink)">${amt}</span> · ${m}</span></div>`,
  transfer: (amt, m) => `<div class="nh-pay nh-pay--transfer"><span class="nh-pay__state">${I('banknote')}بانتظار التحويل</span><span class="nh-pay__meta"><span class="nh-num" style="font-weight:700;color:var(--ink)">${amt}</span> · ${m}</span></div>`,
  paid: (amt, m) => `<div class="nh-pay nh-pay--paid"><span class="nh-pay__state">${I('circle-check')}مدفوع</span><span class="nh-pay__meta"><span class="nh-num" style="font-weight:700;color:var(--ink)">${amt}</span> · ${m}</span></div>`,
  quoted: (amt, m) => `<div class="nh-pay nh-pay--none"><span class="nh-pay__state">${I('circle-dot')}لم يُدفع بعد</span><span class="nh-pay__meta"><span class="nh-num" style="font-weight:700;color:var(--ink)">${amt}</span> · ${m}</span></div>`,
  none: (m) => `<div class="nh-pay nh-pay--none"><span class="nh-pay__state">${I('circle-dot')}لم يُسعَّر بعد</span><span class="nh-pay__meta">${m}</span></div>`,
};
const svc = { u: '<span class="nh-badge nh-badge--gold nh-badge--square nh-badge--plain">عمرة</span>', e: '<span class="nh-badge nh-badge--nile nh-badge--square nh-badge--plain">الموافقة الأمنية</span>' };
const owner = (who) => who === null
  ? `<div class="nh-owner nh-owner--none"><span class="nh-avatar">${I('user-plus', 'nh-icon--sm')}</span><div><span class="nh-owner__name">غير مسند</span><button class="nh-linkbtn">تعيين لي</button></div></div>`
  : `<div class="nh-owner"><span class="nh-avatar${who.me ? ' nh-avatar--gold' : ''}">${who.n[0]}</span><div><span class="nh-owner__name">${who.n}${who.me ? '<span class="nh-you">أنت</span>' : ''}</span><span class="nh-owner__role">موظف عمليات</span></div></div>`;
const nextCell = (n) => n.wait
  ? `<div class="nh-nextcell"><span class="nh-nextcell__wait">${I('hourglass')}${n.label}</span><span class="nh-nextcell__hint">${n.hint}</span></div>`
  : `<div class="nh-nextcell"><button class="nh-btn ${n.primary ? 'nh-btn--primary' : 'nh-btn--secondary'} nh-btn--sm">${I(n.icon)}${n.label}</button><span class="nh-nextcell__hint">${n.hint}</span></div>`;
const SARA = { n: 'سارة', me: true }, AHMAD = { n: 'أحمد' }, LAYLA = { n: 'ليلى' };
const rows = [
  { p: 'overdue', age: 'منذ 31 ساعة', ref: 'EG-DEMO-0411', s: 'e', name: 'عمر ص. (تجريبي)', st: ['navy', 'مستندات للمراجعة'], pay: pay.none('يُسعَّر بعد قبول المستندات'), who: null, next: { icon: 'file-search', label: 'مراجعة المستندات', hint: 'تجاوز 24 ساعة دون إجراء', primary: true } },
  { p: 'high', age: 'منذ 3 ساعات', ref: 'UM-DEMO-1192', s: 'u', name: 'فاطمة ح. (تجريبي)', st: ['navy', 'قيد التنفيذ'], pay: pay.review('18,600 SAR', 'تحويل بنكي'), who: SARA, next: { icon: 'receipt', label: 'مراجعة الدفع', hint: 'يُعتمد في صفحة مراجعة الدفعات' } },
  { p: 'high', age: 'منذ 5 ساعات', ref: 'EG-DEMO-0402', s: 'e', name: 'مريم ي. (تجريبي)', st: ['success', 'الموافقة صادرة'], pay: pay.paid('45 USD', '30 أكتوبر'), who: AHMAD, next: { icon: 'upload', label: 'إصدار وتسليم', hint: 'إرسال ملف الموافقة للعميل' } },
  { p: 'high', age: 'منذ ساعة', ref: 'EG-DEMO-0418', s: 'e', name: 'أحمد م. (تجريبي)', st: ['info', 'قيد المراجعة'], pay: pay.review('45 USD', 'مطابق للفاتورة'), who: SARA, next: { icon: 'receipt', label: 'مراجعة الدفع', hint: 'يُعتمد في صفحة مراجعة الدفعات' } },
  { p: 'wait', age: 'منذ 9 ساعات', ref: 'UM-DEMO-1201', s: 'u', name: 'خالد ع. (تجريبي)', st: ['warning', 'بانتظار العميل'], pay: pay.quoted('6,300 SAR', 'عرض سعر مرسل'), who: LAYLA, next: { wait: true, label: 'بانتظار رد العميل', hint: 'لا إجراء مطلوب الآن' } },
  { p: 'normal', age: 'منذ 14 ساعة', ref: 'EG-DEMO-0415', s: 'e', name: 'هبة إ. (تجريبي)', st: ['warning', 'بانتظار الدفع'], pay: pay.transfer('45 USD', 'فاتورة مرسلة'), who: AHMAD, next: { icon: 'banknote', label: 'متابعة الدفع', hint: 'تذكير العميل بالتحويل' } },
  { p: 'normal', age: 'منذ 20 دقيقة', ref: 'EG-DEMO-0423', s: 'e', name: 'يوسف ن. (تجريبي)', st: ['info', 'جديد'], pay: pay.none('بانتظار التسعير'), who: null, next: { icon: 'plus', label: 'إضافة سعر', hint: 'إرسال الفاتورة للعميل' } },
  { p: 'normal', age: 'منذ 6 ساعات', ref: 'UM-DEMO-1187', s: 'u', name: 'عائشة م. (تجريبي)', st: ['navy', 'قيد التنفيذ'], pay: pay.paid('5,250 SAR', '3 دفعات'), who: LAYLA, next: { icon: 'circle-dot', label: 'معالجة الطلب', hint: 'استكمال التأشيرة والحجز' } },
];
const trow = (r) => `<tr${r.p === 'overdue' ? ' class="is-overdue"' : ''}>
  <td><span class="nh-cell-primary">${r.name}</span><div class="nh-reqmeta"><span class="nh-ref">${r.ref}</span>${svc[r.s]}</div></td>
  <td>${prio[r.p](r.age)}</td>
  <td><span class="nh-badge nh-badge--${r.st[0]}">${r.st[1]}</span></td>
  <td>${r.pay}</td>
  <td>${owner(r.who)}</td>
  <td>${nextCell(r.next)}</td>
</tr>`;
const table = `<section class="nh-table-card" aria-labelledby="tbl-t">
  <div class="nh-card__head" style="padding:18px 24px">
    <div><h2 class="nh-card__title" id="tbl-t" style="font-size:17px">ما يحتاج إجراءً الآن</h2><p class="nh-card__sub" style="font-size:13.5px;line-height:22px">المتأخر أولًا، ثم الدفعات والتسليمات، ثم بقية الطلبات حسب آخر تحديث.</p></div>
    <div style="display:flex;align-items:center;gap:10px"><div class="nh-segment"><button class="is-active">الكل</button><button>المسندة لي</button><button>غير المسندة</button></div><button class="nh-btn nh-btn--secondary nh-btn--sm">${I('sliders-horizontal')}الفلاتر</button></div>
  </div>
  <div class="nh-table-fit"><table class="nh-table nh-table--fit">
    <colgroup><col style="width:22%"><col style="width:13%"><col style="width:14%"><col style="width:17%"><col style="width:15%"><col style="width:19%"></colgroup>
    <thead><tr><th>العميل والطلب</th><th>الأولوية</th><th>الحالة</th><th>الدفع</th><th>الموظف المسؤول</th><th>الإجراء التالي</th></tr></thead>
    <tbody>${rows.map(trow).join('')}</tbody>
  </table></div>
  <div class="nh-table-foot" style="padding:14px 24px"><span>عرض <span class="nh-num">1–8</span> من <span class="nh-num">34</span> طلبًا</span>
    <div class="nh-pager"><button aria-label="السابق" disabled>${I('chevron-right')}</button><button class="is-current" aria-current="page">1</button><button>2</button><button>3</button><button>4</button><button aria-label="التالي">${I('chevron-left')}</button></div></div>
</section>`;


// ---------- side column ----------
// ---------- payment summary (read-only; decisions on the Payment Review page) ----------
const payRow = (ref, s, who, amt, cur, age, ok, note) => `<div class="nh-payrow">
  <div><div class="nh-payrow__who">${who}</div><div class="nh-payrow__meta"><span class="nh-ref">${ref}</span>${svc[s]}</div><span class="nh-match nh-match--${ok ? 'ok' : 'warn'}" style="margin-top:4px">${I(ok ? 'circle-check' : 'triangle-alert')}${note}</span></div>
  <div style="text-align:left;align-self:start"><div class="nh-payrow__amount">${amt}<small>${cur}</small></div><div class="nh-payrow__meta" style="justify-content:flex-end">${age}</div></div>
</div>`;
const payments = `<section class="nh-card" aria-labelledby="pay-t">
  <div class="nh-card__head" style="padding:16px 20px"><h2 class="nh-card__title" id="pay-t" style="display:flex;align-items:center;gap:8px">${I('receipt')}ملخص الدفعات</h2><span class="nh-badge nh-badge--plain">للاطلاع</span></div>
  <div class="nh-paysum">
    <div class="nh-paysum__cell"><span class="nh-paysum__n">4</span><span class="nh-paysum__label">إيصالات بانتظار المراجعة</span></div>
    <div class="nh-paysum__cell"><span class="nh-paysum__n">5</span><span class="nh-paysum__label">ساعات منذ أقدم إيصال</span></div>
    <div class="nh-paysum__cell"><span class="nh-paysum__n nh-paysum__n--warn">1</span><span class="nh-paysum__label">يحتاج تدقيقًا</span></div>
  </div>
  ${payRow('UM-DEMO-1204', 'u', 'نادر ك. (تجريبي)', '2,100', 'SAR', 'منذ 5 ساعات', false, 'أقل من القسط بـ 150 SAR')}
  ${payRow('UM-DEMO-1192', 'u', 'فاطمة ح. (تجريبي)', '18,600', 'SAR', 'منذ 3 ساعات', true, 'مطابق للفاتورة')}
  ${payRow('UM-DEMO-1210', 'u', 'سلمى ب. (تجريبي)', '3,400', 'SAR', 'منذ ساعتين', true, 'مطابق للفاتورة')}
  ${payRow('EG-DEMO-0418', 'e', 'أحمد م. (تجريبي)', '45', 'USD', 'منذ ساعة', true, 'مطابق للفاتورة')}
  <div class="nh-payfoot">
    <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--ink-secondary)"><span>الإجمالي بانتظار المراجعة</span><span class="nh-num" style="font-weight:700;color:var(--ink)">24,100 SAR · 45 USD</span></div>
    <button class="nh-btn nh-btn--primary" style="width:100%">${I('receipt')}فتح صفحة مراجعة الدفعات</button>
    <p>${I('lock')}الاعتماد والرفض يتمّان في صفحة مراجعة الدفعات فقط، بعد فحص الإيصال، ويصل سبب الرفض للعميل.</p>
  </div>
</section>`;


const pipeline = `<section class="nh-card" aria-labelledby="pipe-t">
  <div class="nh-card__head" style="padding:14px 20px"><h2 class="nh-card__title" id="pipe-t" style="display:flex;align-items:center;gap:8px"><span class="nh-sw nh-sw--egypt" style="width:10px;height:10px"></span>مسار الموافقة الأمنية</h2><span class="nh-badge nh-badge--plain">48 حالة مفتوحة</span></div>
  <div class="nh-card__body" style="padding:16px 20px">
    <div class="nh-pipe">
      <div class="nh-pipe__stage"><span class="nh-pipe__n">5</span><span class="nh-pipe__label">استلام</span></div>
      <div class="nh-pipe__stage"><span class="nh-pipe__n">6</span><span class="nh-pipe__label">المستندات</span></div>
      <div class="nh-pipe__stage"><span class="nh-pipe__n">4</span><span class="nh-pipe__label">الدفع</span></div>
      <div class="nh-pipe__stage is-hot"><span class="nh-pipe__n">23</span><span class="nh-pipe__label">لدى الجهة</span></div>
      <div class="nh-pipe__stage is-alert"><span class="nh-pipe__n">3</span><span class="nh-pipe__label">للتسليم</span></div>
      <div class="nh-pipe__stage"><span class="nh-pipe__n">7</span><span class="nh-pipe__label">التعميم</span></div>
    </div>
    <p class="nh-help" style="margin:12px 0 0">متوسط المدة لدى الجهة: <span class="nh-num" style="font-weight:700;color:var(--ink-secondary)">9</span> أيام. 3 موافقات صادرة تنتظر التسليم للعميل.</p>
  </div>
</section>`;

const cap = (name, meta, n, of) => `<div class="nh-cap"><div class="nh-cap__row"><span class="nh-cap__name">${name}</span><span class="nh-cap__n">${n} / ${of}</span></div><div class="nh-cap__bar" role="progressbar" aria-valuenow="${n}" aria-valuemax="${of}" aria-label="${name}"><span style="width:${Math.round((n / of) * 100)}%"></span></div><span class="nh-cap__meta">${meta}</span></div>`;
const umrah = `<section class="nh-card" aria-labelledby="um-t">
  <div class="nh-card__head" style="padding:14px 20px"><h2 class="nh-card__title" id="um-t" style="display:flex;align-items:center;gap:8px"><span class="nh-sw nh-sw--umrah" style="width:10px;height:10px"></span>مغادرات العمرة</h2><a href="#" class="nh-btn nh-btn--ghost nh-btn--sm">المجموعات ${I('chevron-left')}</a></div>
  <div class="nh-card__body" style="padding:16px 20px">
    ${cap('مجموعة رجب الأولى (تجريبي)', 'المغادرة 12 نوفمبر · 4 تأشيرات قيد الإصدار', 38, 45)}
    ${cap('مجموعة رجب الثانية (تجريبي)', 'المغادرة 26 نوفمبر · 7 دفعات غير مكتملة', 22, 45)}
    ${cap('عمرة شعبان (تجريبي)', 'المغادرة 10 ديسمبر · التسجيل مفتوح', 9, 40)}
  </div>
</section>`;

const load = (av, name, on, late, total) => `<div class="nh-load"><span class="nh-avatar">${av}</span><div class="nh-load__main"><span class="nh-load__name">${name}</span><div class="nh-load__bar"><span class="on" style="width:${(on / 20) * 100}%"></span><span class="late" style="width:${(late / 20) * 100}%"></span></div></div><span class="nh-load__n">${total}${late ? ` · <span style="color:var(--danger-ink)">${late} متأخرة</span>` : ''}</span></div>`;
const team = `<section class="nh-card" aria-labelledby="team-t">
  <div class="nh-card__head" style="padding:14px 20px"><h2 class="nh-card__title" id="team-t" style="display:flex;align-items:center;gap:8px">${I('users-round')}توزيع العمل</h2><a href="#" class="nh-btn nh-btn--ghost nh-btn--sm">الإسناد ${I('chevron-left')}</a></div>
  <div class="nh-card__body" style="padding:8px 20px 16px">
    ${load('س', 'سارة (تجريبي) <span class="nh-you">أنت</span>', 12, 2, 14)}
    ${load('أ', 'أحمد (تجريبي)', 10, 1, 11)}
    ${load('ل', 'ليلى (تجريبي)', 8, 0, 8)}
    <div class="nh-load"><span class="nh-avatar" style="background:var(--warning-soft);color:var(--warning-ink)">${I('user-plus', 'nh-icon--sm')}</span><div class="nh-load__main"><span class="nh-load__name" style="color:var(--warning-ink)">غير مسندة</span><span class="nh-cap__meta">1 عمرة · 4 موافقة أمنية</span></div><button class="nh-btn nh-btn--secondary nh-btn--sm">توزيع</button></div>
  </div>
</section>`;

const footer = `<p class="nh-help" style="text-align:center;margin:0">${I('flask-conical', 'nh-icon--sm')} جميع الأسماء والأرقام والمبالغ في هذه المعاينة <b>بيانات تجريبية</b> للعرض فقط ولا تمثل عملاء أو طلبات حقيقية.</p>`;

const body = `<div style="display:flex;min-height:2060px;background:var(--canvas)">
${sidebar}
<div style="flex:1;min-width:0;display:flex;flex-direction:column">
<div class="nh-demobar" role="note">${I('flask-conical')}معاينة تصميم · بيانات تجريبية للعرض فقط · الألوان مؤقتة بانتظار اعتماد الهوية</div>
${topbar}
<main style="padding:32px 32px 48px;display:grid;gap:28px">
${header}
${urgent}
${queues}
${table}
<div style="display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) minmax(0,.9fr);gap:24px;align-items:start">
${payments}
<div style="display:grid;gap:24px;min-width:0">${pipeline}${umrah}</div>
${team}
</div>
${footer}
</main></div></div>`;

const html = `<!-- @dsCard group="Pages" height=2060 width=1440 page -->
<div class="nh" dir="rtl" lang="ar" style="min-height:100%">
${body}
</div>
<script>window.NasaemDS && NasaemDS.hydrate();</script>
`;

const readme = `# OperationsCenter

The Operations Center (مركز العمليات) for the first release: **Umrah and Egypt security clearance only**. One screen that answers "what needs me now, and who owns it?". **All data in the preview is demonstration data.**

## Built on the real workflow (unchanged)
Everything maps to \`GET /dashboard/operations\` (\`backend/src/modules/dashboard/dashboard.service.js\`) and the current \`operations-center.tsx\`:
- **Queue tiles** = \`queues\`: newRequests, waitingPaymentReview, unassignedOrders, waitingDocuments, waitingCustomer, readyToDeliver, each with the Umrah / Egypt split.
- **Priority** = the existing \`priority()\` rule. Only its *presentation* changes (see below).
- **Next action** = \`nextAction.label\` (مراجعة الدفع، إصدار وتسليم، مراجعة المستندات، متابعة الدفع، إضافة سعر، معالجة الطلب، بانتظار العميل).
- **تعيين لي** = the existing assign-to-me action, offered only on unassigned items.
- **Payment approval / rejection** stays on \`/admin/payment-review\` (confirm, or reject with a reason that reaches the customer).

## v3 refinements
1. **Red means overdue, nothing else.** Visual mapping of \`priority()\`: stalled (ageHours ≥ 24) → red "متأخر" with its age, plus a faint row tint; urgent (CONFIRM_PAYMENT, DELIVER) → amber "أولوية عالية"; customer → neutral "لدى العميل"; normal → neutral "عادية". The focus strip, sidebar counts, notification dot and payment mismatch are no longer red. The only other red is per-employee overdue counts, which are also genuinely overdue.
2. **Payments are read-only here.** The panel is a *summary* (count waiting, age of the oldest receipt, how many need checking, a total, the four latest receipts with match/mismatch). Every payment path leads to "فتح صفحة مراجعة الدفعات"; approve and reject exist only on that page.
3. **No horizontal scrolling.** The table has 6 fixed-width columns (العميل والطلب، الأولوية، الحالة، الدفع، الموظف المسؤول، الإجراء التالي) that fit 1104px, and cells wrap instead of scrolling. Phone numbers moved into the case; amounts sit inside the payment cell; age sits under priority.
4. **Owner and next step are explicit.** A dedicated "الموظف المسؤول" column with an avatar and name; "أنت" marks the signed-in user, and "غير مسند" (amber) comes with an inline "تعيين لي". The next-action cell gives the verb as a button plus one line saying where or what ("يُعتمد في صفحة مراجعة الدفعات", "إرسال ملف الموافقة للعميل"). When nothing is needed, it says so ("بانتظار رد العميل · لا إجراء مطلوب الآن").
5. **Arabic readability and density.** 15px bold names, 14px cell text on a 24px line, 16px cell padding, Western digits throughout (no mixed ٣/3), no abbreviations like "س" for hours, fewer filter chips (one "الفلاتر" button), and more space between sections.

## Status: APPROVED design baseline (31 Oct 2026)
The v3 visual direction is the approved baseline for implementation. Later changes are refinements on top of it.

## Implementation requirements (recorded at approval)
**R1. Egypt clearance: show and sort by travel date.**
- Show the travel / entry date (\`intakeData.egyptTravel.entryDate\`) and entry mode (منفذ جوي / منفذ بري) on every Egypt clearance row, with days remaining ("بعد 9 أيام").
- Default sort for Egypt clearance is nearest travel date first. Requests with no travel plan yet sort after dated ones, labelled "لم يُحدد السفر", and keep their current order among themselves.
- When the service filter is "كل الخدمات", Umrah rows keep today's order. The travel-date sort applies within Egypt rows (or when the Egypt filter is on).

**R2. Inactive is not the same as overdue.**
- **بلا نشاط 24 ساعة** (inactive): \`ageHours ≥ 24\` since the last update, the current \`priority() = stalled\` rule. A prompt to look, not a breach. Shown in **amber**, with a clock icon and the age.
- **متأخر عن الموعد** (missed an operational deadline): a real deadline has passed: case SLA \`OVERDUE\` / \`dueAt\` in the past, a case task past its \`dueAt\`, or an Egypt entry date less than 72 hours away with no circular issued. Shown in **red**, with the deadline that was missed.
- Red is reserved for the second group only. A case can be both; it then shows red with the inactivity as a secondary line.
- This changes the v3 preview, where stalled (inactive) items are red. Implement R2, not the preview, for this rule.

## Permission note found during Case Workspace design
- \`PATCH /contact-requests/:id/assign\` is limited to SUPER_ADMIN and ADMIN; \`PATCH /orders/:id/assign\` also allows EMPLOYEE. So "تعيين لي" is valid for an employee only on **order** rows. For contact-request rows (all Egypt clearance cases and Umrah requests made through the request form), an employee should see "غير مسند" with no self-assign. The v3 preview's "تعيين لي" on EG-DEMO rows is therefore an admin-view example only.

## Proposed data needs (not implemented)
The receipt/invoice match, Umrah departure capacity, per-employee overdue counts and the "أنت" marker (needs the current user id beside \`assignedUserId\`, already fetched by the page) are design intent; the operations endpoint does not return the first three today.

## Layout
1440px desktop: 272px rail, 32px gutters, 1104px content, 28px between sections. Order: focus strip, queue tiles, full-width table, then payment summary / service panels / team workload.
`;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'preview.html'), html);
fs.writeFileSync(path.join(OUT, 'README.md'), readme);
console.log('ok', html.length);
