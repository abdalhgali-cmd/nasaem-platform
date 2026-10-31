// Case Workspace (شاشة إدارة الطلب الواحد): high-fidelity 1440px previews.
// ALL DATA IS SYNTHETIC DEMONSTRATION DATA. Viewing role: EMPLOYEE (موظف عمليات).
// Actions shown are limited to what backend/src/modules/contact-requests/contact-requests.routes.js
// allows EMPLOYEE: review documents, download files, add notes/tasks, submit to provider,
// upload deliverables. Assignment (ADMIN) and payment confirmation (ADMIN/ACCOUNTANT) are read-only here.
const fs = require('fs');
const path = require('path');
const LOGO_DARK = '/_blob/a6c6f4fe6eab2e24f9069478a79de65a';
const I = (n, c = '') => `<i data-icon="${n}"${c ? ` class="${c}"` : ''}></i>`;
const svcTag = { e: '<span class="nh-badge nh-badge--nile nh-badge--square nh-badge--plain">الموافقة الأمنية لمصر</span>', u: '<span class="nh-badge nh-badge--gold nh-badge--square nh-badge--plain">عمرة</span>' };

// ---------- shell ----------
const nav = (icon, text, o = {}) => `<a class="nh-navitem${o.active ? ' is-active' : ''}" href="#"${o.active ? ' aria-current="page"' : ''}>${I(icon)}<span>${text}</span>${o.count ? `<span class="nh-count">${o.count}</span>` : ''}</a>`;
const USER = { initial: 'س', name: 'سارة (حساب تجريبي)', short: 'سارة (تجريبي)', role: 'موظف عمليات' };
const mkSidebar = (u) => `<aside class="nh-sidebar" aria-label="تنقل الإدارة" style="min-height:100%;flex:none">
  <div class="nh-sidebar__logo"><img src="${LOGO_DARK}" alt="نسائم الحرمين للسفر والسياحة"><span>مركز التحكم · الإدارة</span></div>
  <div class="nh-navgroup"><button class="nh-navgroup__label" type="button" aria-expanded="true">العمل اليومي ${I('chevron-down')}</button>
    ${nav('gauge', 'مركز العمليات')}${nav('clipboard-list', 'مساحة عمل الحالات', { active: true, count: '9' })}${nav('receipt', 'مراجعة الدفعات', { count: '4' })}${nav('bell', 'الإشعارات', { count: '6' })}${nav('file-check-2', 'المستندات')}
  </div>
  <div class="nh-navgroup"><button class="nh-navgroup__label" type="button" aria-expanded="true">الخدمات ${I('chevron-down')}</button>${nav('sparkles', 'مجموعات العمرة')}${nav('shield-check', 'الموافقة الأمنية لمصر')}</div>
${u.extraNav || ''}  <div class="nh-sidebar__foot"><span class="nh-avatar nh-avatar--gold">${u.initial}</span><div><strong>${u.name}</strong><span>${u.role}</span></div></div>
</aside>`;
const sidebar = mkSidebar(USER);
const topbar = (ref, u = USER) => `<header class="nh-topbar" style="padding-inline:32px">
  <div class="nh-topbar__start"><nav class="nh-crumbs" aria-label="المسار"><span>العمل اليومي</span>${I('chevron-left')}<span>مساحة عمل الحالات</span>${I('chevron-left')}<strong class="nh-num" style="font-family:var(--font-mono)">${ref}</strong></nav><span class="nh-demo">${I('flask-conical')}وضع العرض · بيانات تجريبية</span></div>
  <div class="nh-topbar__end"><div class="nh-search" style="width:340px">${I('search')}<input class="nh-input" placeholder="ابحث بالمرجع أو الاسم أو الجواز" aria-label="بحث"><span class="nh-kbd">Ctrl K</span></div><button class="nh-iconbtn" type="button" aria-label="الإشعارات">${I('bell')}<span class="nh-iconbtn__dot" style="background:var(--primary)">6</span></button><div class="nh-userchip"><span class="nh-avatar nh-avatar--gold">${u.initial}</span><div><strong>${u.short}</strong><span>${u.role}</span></div></div></div>
</header>`;

// ---------- building blocks ----------
const steps = (list) => `<ol class="nh-steps nh-steps--compact">${list.map(([st, icon, label, meta]) => `<li class="nh-step ${st === 'done' ? 'is-done' : st === 'now' ? 'is-current' : ''}"${st === 'now' ? ' aria-current="step"' : ''}><span class="nh-step__dot">${st === 'done' ? I('check') : I(icon)}</span><span class="nh-step__label">${label}</span><span class="nh-step__meta">${meta}</span></li>`).join('')}</ol>`;
const fact = (icon, label, value, hint, tone = '') => `<div class="nh-fact"><span class="nh-fact__label">${I(icon)}${label}</span><span class="nh-fact__value">${value}</span>${hint ? `<span class="nh-fact__hint${tone ? ` nh-fact__hint--${tone}` : ''}">${hint}</span>` : ''}</div>`;
const doc = (d) => {
  const cls = { ok: 'is-accepted', pending: 'is-pending', rejected: 'is-rejected', missing: 'is-missing' }[d.s];
  const badge = { ok: '<span class="nh-badge nh-badge--success">مقبول</span>', pending: '<span class="nh-badge nh-badge--info">قيد المراجعة</span>', rejected: '<span class="nh-badge nh-badge--danger">مرفوض</span>', missing: '<span class="nh-badge nh-badge--warning">لم يُرفع بعد</span>' }[d.s];
  const actions = d.s === 'pending'
    ? `<button class="nh-btn nh-btn--ghost nh-btn--icon nh-btn--sm" aria-label="فتح ${d.name}">${I('eye')}</button><button class="nh-btn nh-btn--primary nh-btn--sm">${I('check')}قبول</button><button class="nh-btn nh-btn--secondary nh-btn--sm">${I('x')}رفض مع سبب</button>`
    : d.s === 'missing' ? '' : `<button class="nh-btn nh-btn--ghost nh-btn--icon nh-btn--sm" aria-label="تنزيل ${d.name}">${I('download')}</button>`;
  return `<li class="nh-doc ${cls}"><span class="nh-doc__icon">${I(d.icon)}</span><div class="nh-doc__main"><span class="nh-doc__name">${d.name}</span><span class="nh-doc__meta">${d.meta}</span>${d.note ? `<span class="nh-doc__meta" style="color:var(--ink-secondary)">${d.note}</span>` : ''}</div>${badge}<div class="nh-doc__actions">${actions}</div></li>`;
};
const traveler = (t) => `<div class="nh-traveler">
  <div class="nh-traveler__head"><span class="nh-avatar nh-avatar--lg${t.primary ? ' nh-avatar--gold' : ''}">${t.initial}</span><div><div class="nh-traveler__name">${t.name}</div><div class="nh-sec__meta">${t.role}</div></div><span style="margin-inline-start:auto" class="nh-badge nh-badge--${t.docsTone}">${t.docsLabel}</span></div>
  <dl class="nh-kv"><div><dt>رقم الجواز</dt><dd class="is-ltr">${t.passport}</dd></div><div><dt>الجنسية</dt><dd>${t.nat}</dd></div><div><dt>تاريخ الميلاد</dt><dd>${t.dob}</dd></div><div><dt>انتهاء الجواز</dt><dd>${t.exp}</dd></div></dl>
  <ul class="nh-docs">${t.docs.map(doc).join('')}</ul>
  ${t.advisory ? `<div class="nh-advisory" role="note">${I('triangle-alert')}<div><b>تنبيه للمراجعة:</b> ${t.advisory} <span style="opacity:.85">تنبيه استرشادي، لا يرفض الطلب تلقائيًا.</span></div></div>` : ''}
</div>`;
const deliv = (d) => `<div class="nh-deliv${d.future ? ' is-future' : ''}"><span class="nh-deliv__icon">${I(d.future ? 'file-clock' : 'file-check-2')}</span><div class="nh-deliv__main"><span class="nh-deliv__name">${d.name}</span><span class="nh-deliv__meta">${d.meta}</span></div>${d.future ? `<button class="nh-btn nh-btn--secondary nh-btn--sm" disabled title="${d.why}">${I('upload')}${d.btn}</button>` : `<button class="nh-btn nh-btn--secondary nh-btn--sm">${I('download')}تنزيل</button>`}</div>`;
const tl = (e) => `<li class="nh-tl"><span class="nh-tl__icon${e.tone ? ` nh-tl__icon--${e.tone}` : ''}">${I(e.icon)}</span><div><div class="nh-tl__head"><span class="nh-tl__title">${e.title}</span><span class="nh-tl__time">${e.time}</span></div><div class="nh-tl__body">${e.body}</div>${e.note ? `<div class="nh-tl__note">${e.note}</div>` : ''}</div></li>`;
const rows = (list) => `<dl class="nh-rows">${list.map(([k, v, ltr]) => `<div><dt>${k}</dt><dd${ltr ? ' class="is-ltr"' : ''}>${v}</dd></div>`).join('')}</dl>`;
const card = (icon, title, inner, aside = '') => `<section class="nh-card"><div class="nh-sec__head" style="padding:14px 20px"><h2 class="nh-sec__title" style="font-size:15px">${I(icon)}${title}</h2>${aside}</div>${inner}</section>`;
const note = (icon, t) => `<p class="nh-sidenote">${I(icon)}<span>${t}</span></p>`;
const check = (ok, label, hint) => `<div class="nh-task"><span style="color:var(--${ok ? 'success' : 'warning'}-ink);margin-top:2px">${I(ok ? 'circle-check' : 'circle-dot')}</span><div><span class="nh-task__name">${label}</span>${hint ? `<span class="nh-task__due">${hint}</span>` : ''}</div></div>`;
const task = (t) => `<div class="nh-task"><input class="nh-check" type="checkbox" aria-label="إنهاء المهمة" style="margin-top:4px"><div><span class="nh-task__name">${t.name}</span><span class="nh-task__due${t.warn ? ' nh-task__due--warn' : ''}">${t.due}</span></div></div>`;

// ---------- page ----------
function page(c) {
  const head = `<section class="nh-casehead" aria-labelledby="case-t">
  <div class="nh-casehead__top">
    <div><h1 class="nh-casehead__title" id="case-t">${c.customer}</h1><div class="nh-casehead__sub"><span class="nh-ref" style="font-size:14px">${c.ref}</span>${svcTag[c.svc]}<span class="nh-badge nh-badge--${c.status[0]}">${c.status[1]}</span><span>· أُنشئ ${c.created}</span></div></div>
    <div style="display:flex;align-items:center;gap:10px">${c.roleChip || `<span class="nh-rolechip" title="الأزرار المعروضة هي المسموحة لهذا الدور فقط">${I('lock')}تعرض بصلاحية: ${c.role || 'موظف عمليات'}</span>`}${c.headActions ?? `<button class="nh-btn nh-btn--secondary nh-btn--sm">${I('message-square')}ملاحظة داخلية</button><button class="nh-btn nh-btn--secondary nh-btn--sm">${I('plus')}مهمة</button>`}</div>
  </div>
  <div class="nh-facts">${c.facts.map((f) => fact(...f)).join('')}</div>
</section>`;
  const next = `<section class="nh-nextbox${c.next.wait ? ' nh-nextbox--wait' : ''}" aria-labelledby="next-t">
  <span class="nh-nextbox__icon">${I(c.next.icon)}</span>
  <div><div class="nh-nextbox__eyebrow">${c.next.eyebrow || 'الإجراء التالي المطلوب منك'}</div><h2 class="nh-nextbox__title" id="next-t">${c.next.title}</h2><p class="nh-nextbox__why">${c.next.why}</p></div>
  <div class="nh-nextbox__actions">${c.next.actions}</div>
</section>`;
  const journey = `<section class="nh-card" aria-labelledby="j-t"><div class="nh-sec__head"><h2 class="nh-sec__title" id="j-t">${I('route' in {} ? 'route' : 'map-pin')}المرحلة الحالية</h2><span class="nh-sec__meta">${c.journeyMeta}</span></div>
  ${c.phases.map((p, i) => `<div class="nh-phase${p.done ? ' nh-phase--done' : ''}"><div class="nh-phase__head"><h3 class="nh-phase__title"><span class="nh-phase__num">${i + 1}</span>${p.title}</h3>${p.badge}</div>${steps(p.steps)}${p.note ? `<div class="nh-phase__note">${I('info')}<span>${p.note}</span></div>` : ''}</div>`).join('')}
</section>`;
  const travelers = `<section class="nh-card" aria-labelledby="tr-t"><div class="nh-sec__head"><h2 class="nh-sec__title" id="tr-t">${I('id-card')}المسافرون والمستندات</h2><span class="nh-sec__meta">${c.travMeta}</span></div>${c.travelers.map(traveler).join('')}</section>`;
  const delivs = `<section class="nh-card" aria-labelledby="dl-t"><div class="nh-sec__head"><h2 class="nh-sec__title" id="dl-t">${I('package-check')}الملفات المسلّمة للعميل</h2><span class="nh-sec__meta">تظهر للعميل في بوابته فور رفعها</span></div>${c.deliverables.map(deliv).join('')}</section>`;
  const history = `<section class="nh-card" aria-labelledby="h-t"><div class="nh-sec__head" style="padding-bottom:0;border-bottom:0"><h2 class="nh-sec__title" id="h-t">${I('activity')}سجل الحالة</h2><span class="nh-sec__meta">الأحدث أولًا</span></div>
  ${c.historyTabs || `<div class="nh-tabs nh-tabs--card" role="tablist"><button class="nh-tab is-active" role="tab" aria-selected="true">السجل <span class="nh-count">${c.timeline.length}</span></button><button class="nh-tab" role="tab">الملاحظات الداخلية <span class="nh-count">${c.notesCount}</span></button></div>`}
  <div class="nh-card__body" style="padding:22px 24px">${c.historyIntro || ''}<ol class="nh-timeline">${c.timeline.map(tl).join('')}</ol></div></section>`;
  const side = `<div class="nh-side">${c.side.join('')}</div>`;
  const body = `<div style="display:flex;min-height:${c.height}px;background:var(--canvas)">
${c.user ? mkSidebar(c.user) : sidebar}
<div style="flex:1;min-width:0;display:flex;flex-direction:column">
<div class="nh-demobar" role="note">${I('flask-conical')}معاينة تصميم · بيانات تجريبية مصطنعة للعرض فقط · الألوان مؤقتة بانتظار اعتماد الهوية</div>${c.roleBanner || ''}
${topbar(c.ref, c.user || USER)}
<main style="padding:24px 32px 48px;display:grid;gap:24px">
<a href="#" class="nh-linkbtn" style="text-decoration:none;font-weight:600;color:var(--ink-muted)">${I('chevron-right', 'nh-icon--sm')}العودة إلى مساحة عمل الحالات</a>
${head}
${c.beforeNext || ''}${next}${c.afterNext || ''}
<div style="display:grid;grid-template-columns:minmax(0,1fr) 352px;gap:24px;align-items:start">
<div style="display:grid;gap:24px;min-width:0">${c.historyFirst ? journey + history + travelers + delivs : journey + travelers + delivs + history}</div>
${side}
</div>
<p class="nh-help" style="text-align:center;margin:0">${I('flask-conical', 'nh-icon--sm')} كل الأسماء وأرقام الجوازات والهواتف والمبالغ والمراجع في هذه المعاينة <b>بيانات تجريبية مصطنعة</b>، ولا تمثل أشخاصًا أو طلبات حقيقية.</p>
</main></div></div>`;
  const fixed = body.replace(/(^|[^\w-])(\d[\d,]*(?:\.\d+)?) (USD|SAR)(?![^<]*>)/g, '$1<span class="nh-num">$2 $3</span>');
  return `<!-- @dsCard group="Pages" height=${c.height} width=1440 page -->\n<div class="nh" dir="rtl" lang="ar" style="min-height:100%">\n${fixed}\n</div>\n<script>window.NasaemDS && NasaemDS.hydrate();</script>\n`;
}

// ---------- EGYPT SECURITY CLEARANCE ----------
const egypt = {
  height: 2700, ref: 'EG-DEMO-0431', svc: 'e', customer: 'منى ع. (عميلة تجريبية)', status: ['navy', 'مرحلة التعميم'], created: '2 أكتوبر 2026',
  facts: [
    ['calendar-days', 'تاريخ الدخول إلى مصر', '18 نوفمبر 2026', 'بعد 18 يومًا', ''],
    ['plane', 'طريقة الدخول', 'منفذ جوي', 'الحجز: تذكرة لدى العميلة', ''],
    ['shield-check', 'الموافقة الأمنية', 'صادرة', '24 أكتوبر · سُلّمت للعميلة', 'ok'],
    ['wallet', 'الدفع', 'مدفوع', '90 USD · أكّده المحاسب', 'ok'],
    ['user', 'الموظف المسؤول', 'سارة <span class="nh-you">أنت</span>', 'ضمن الموعد', 'ok'],
  ],
  next: { icon: 'file-search', title: 'راجِع تذكرة الطيران لبدء التعميم', why: 'رفعت العميلة تذكرتها قبل يومين. بعد قبولها يصبح الملف جاهزًا لإرسال طلب التعميم للجهة. آخر موعد آمن للإرسال <b>15 نوفمبر</b>، أي قبل الدخول بـ 72 ساعة.', actions: `<button class="nh-btn nh-btn--primary">${I('file-search')}مراجعة التذكرة</button><span class="nh-help" style="text-align:center">ثم: إرسال طلب التعميم للجهة</span>` },
  journeyMeta: 'الموافقة والتعميم مرحلتان منفصلتان',
  phases: [
    { title: 'الموافقة الأمنية', done: true, badge: '<span class="nh-badge nh-badge--success">مكتملة</span>', steps: [['done', 'inbox', 'استلام الطلب', '2 أكتوبر'], ['done', 'file-search', 'مراجعة المستندات', '3 أكتوبر'], ['done', 'wallet', 'تأكيد الدفع', '3 أكتوبر'], ['done', 'send', 'الإرسال للجهة', '4 أكتوبر'], ['done', 'stamp', 'صدور الموافقة', '24 أكتوبر'], ['done', 'package-check', 'التسليم للعميلة', '24 أكتوبر']] },
    { title: 'السفر والتعميم', badge: '<span class="nh-badge nh-badge--navy">جارية</span>', steps: [['done', 'calendar-days', 'بيانات السفر', '29 أكتوبر'], ['done', 'plane', 'الحجز', 'تذكرة العميلة'], ['now', 'file-search', 'مراجعة التذكرة', 'الآن'], ['', 'send', 'إرسال طلب التعميم', 'قبل 15 نوفمبر'], ['', 'stamp', 'صدور التعميم', '—'], ['', 'package-check', 'تسليم التعميم', '—']], note: 'صدور الموافقة الأمنية لا يعني أن المسافر جاهز للسفر. التعميم مرحلة لاحقة منفصلة تحتاج بيانات السفر والحجز، ويجب أن يتم قبل <b>72 ساعة على الأقل</b> من الدخول.' },
  ],
  travMeta: 'مسافران · 6 مستندات',
  travelers: [
    { initial: 'م', name: 'منى ع. (تجريبي)', role: 'المسافرة الرئيسية · مقدّمة الطلب', primary: true, docsTone: 'info', docsLabel: 'مستند واحد قيد المراجعة', passport: 'P0DEMO431', nat: 'سودانية', dob: '14 مارس 1986', exp: '9 يونيو 2030', docs: [
      { s: 'ok', icon: 'id-card', name: 'صورة صفحة بيانات الجواز', meta: 'passport.jpg · رُفع 2 أكتوبر · راجعته سارة' },
      { s: 'ok', icon: 'image', name: 'صورة شخصية بخلفية بيضاء', meta: 'photo.png · رُفع 2 أكتوبر · راجعته سارة' },
      { s: 'pending', icon: 'plane', name: 'تذكرة الطيران (لمرحلة التعميم)', meta: 'ticket.pdf · رُفع 29 أكتوبر', note: 'رحلة الدخول 18 نوفمبر · مطابقة للتاريخ المسجل' },
    ] },
    { initial: 'ي', name: 'يوسف ع. (تجريبي)', role: 'مرافق · ابن', docsTone: 'success', docsLabel: 'المستندات مكتملة', passport: 'P0DEMO432', nat: 'سوداني', dob: '2 يناير 2014', exp: '2 فبراير 2027', docs: [
      { s: 'ok', icon: 'id-card', name: 'صورة صفحة بيانات الجواز', meta: 'passport.jpg · رُفع 2 أكتوبر · راجعته سارة' },
      { s: 'ok', icon: 'image', name: 'صورة شخصية بخلفية بيضاء', meta: 'photo-2.png · رُفع 4 أكتوبر · راجعته سارة', note: 'النسخة الأولى رُفضت (الخلفية غير بيضاء) واستُبدلت بهذه.' },
      { s: 'ok', icon: 'plane', name: 'تذكرة الطيران (لمرحلة التعميم)', meta: 'نفس حجز المسافرة الرئيسية' },
    ], advisory: 'جواز يوسف ينتهي في <b>2 فبراير 2027</b>، أي بعد أقل من 6 أشهر من تاريخ الدخول.' },
  ],
  deliverables: [
    { name: 'خطاب الموافقة الأمنية: منى ع.', meta: 'PDF · رُفع 24 أكتوبر بواسطة سارة · متاح للعميلة' },
    { name: 'خطاب الموافقة الأمنية: يوسف ع.', meta: 'PDF · رُفع 24 أكتوبر بواسطة سارة · متاح للعميلة' },
    { future: true, name: 'ملف التعميم', meta: 'يُرفع بعد صدور التعميم من الجهة', btn: 'رفع ملف التعميم', why: 'يتاح بعد صدور التعميم' },
  ],
  notesCount: 2,
  timeline: [
    { icon: 'upload', title: 'رفع مستند', time: '29 أكتوبر · 18:20', body: 'تذكرة الطيران · بواسطة العميلة من بوابتها' },
    { icon: 'calendar-days', title: 'تحديث بيانات السفر والتعميم', time: '29 أكتوبر · 18:12', body: 'منفذ جوي · الدخول 18 نوفمبر · الحجز لدى العميلة' },
    { icon: 'package-check', tone: 'success', title: 'تسليم ملف للعميل', time: '24 أكتوبر · 13:05', body: 'خطابا الموافقة الأمنية · بواسطة سارة' },
    { icon: 'send', tone: 'navy', title: 'إرسال الحالة للجهة', time: '4 أكتوبر · 10:40', body: 'بالبريد إلى مكتب المتابعة (تجريبي) · مرجع EXT-DEMO-7781 · بواسطة سارة' },
    { icon: 'wallet', tone: 'success', title: 'تأكيد الدفع', time: '3 أكتوبر · 16:05', body: '90 USD · بواسطة المحاسب (تجريبي)' },
    { icon: 'file-check-2', tone: 'gold', title: 'مراجعة مستند', time: '3 أكتوبر · 11:20', body: 'صورة يوسف الشخصية: مرفوض · بواسطة سارة', note: 'السبب المرسل للعميلة: الخلفية غير بيضاء، يرجى إعادة التصوير.' },
    { icon: 'user-round-cog', tone: 'navy', title: 'إسناد الطلب لموظف', time: '2 أكتوبر · 21:30', body: 'إلى سارة · بواسطة مدير النظام (تجريبي)' },
    { icon: 'inbox', title: 'استلام الطلب', time: '2 أكتوبر · 21:14', body: 'من الموقع · مسافران' },
  ],
};
egypt.side = [
  card('user', 'العميلة', rows([['الاسم', 'منى ع. (تجريبي)'], ['الهاتف', '+249 9X XXX 0431', 1], ['واتساب', 'نفس الرقم'], ['حساب العميل', 'مسجّل في البوابة'], ['مصدر الطلب', 'الموقع']]) + `<div style="display:flex;gap:8px;padding:0 20px 16px"><button class="nh-btn nh-btn--secondary nh-btn--sm" style="flex:1">${I('phone')}اتصال</button><button class="nh-btn nh-btn--secondary nh-btn--sm" style="flex:1">${I('message-square')}واتساب</button></div>`),
  card('plane', 'السفر والتعميم', rows([['طريقة الدخول', 'منفذ جوي'], ['تاريخ الدخول', '18 نوفمبر 2026'], ['المتبقي', '18 يومًا'], ['الحجز', 'موجود لدى العميلة'], ['آخر موعد آمن للتعميم', '15 نوفمبر']]) + note('info', 'التعميم يحتاج 72 ساعة على الأقل قبل الدخول. عند اقتراب الموعد يظهر تنبيه هنا.'), '<span class="nh-badge nh-badge--success">بيانات السفر مكتملة</span>'),
  card('circle-check', 'جاهزية التنفيذ', check(true, 'المستندات المطلوبة مكتملة', 'عدا تذكرة التعميم: قيد مراجعتك') + check(true, 'البيانات المطلوبة مكتملة') + check(true, 'الدفع مكتمل')),
  card('wallet', 'الدفع', rows([['الفاتورة', '90 USD', 1], ['الحالة', '<span class="nh-badge nh-badge--success">مدفوع</span>'], ['الطريقة', 'تحويل بنكي'], ['أكّده', 'المحاسب (تجريبي) · 3 أكتوبر']]) + note('lock', 'تأكيد الدفع أو رفضه من صلاحية المحاسب أو المدير، في صفحة مراجعة الدفعات.'), '<span class="nh-badge nh-badge--plain">للاطلاع</span>'),
  card('user-round-cog', 'الإسناد', `<div class="nh-owner" style="padding:14px 20px"><span class="nh-avatar nh-avatar--gold nh-avatar--lg">س</span><div><span class="nh-owner__name">سارة <span class="nh-you">أنت</span></span><span class="nh-owner__role">أسندها مدير النظام · 2 أكتوبر</span></div></div>` + note('lock', 'تغيير الموظف المسؤول من صلاحية المدير.')),
  card('clipboard-check', 'المهام المفتوحة', task({ name: 'مراجعة تذكرة الطيران', due: 'تستحق غدًا · 1 نوفمبر', warn: true }) + task({ name: 'متابعة الجهة: طلب التعميم', due: 'بعد قبول التذكرة' }), `<button class="nh-btn nh-btn--ghost nh-btn--sm">${I('plus')}مهمة</button>`),
  card('landmark', 'الجهة المنفّذة', rows([['الجهة', 'مكتب المتابعة (تجريبي)'], ['طريقة الإرسال', 'بريد'], ['آخر إرسال', '4 أكتوبر · تم الإرسال'], ['المرجع', 'EXT-DEMO-7781', 1]]) + `<div style="padding:0 20px 16px"><button class="nh-btn nh-btn--secondary nh-btn--sm" style="width:100%" disabled>${I('send')}إرسال طلب التعميم إلى الجهة</button><span class="nh-help" style="display:block;margin-top:6px;text-align:center">يُفعَّل بعد قبول التذكرة</span></div>`),
];

// ---------- UMRAH ----------
const umrah = {
  height: 2650, ref: 'UM-DEMO-1192', svc: 'u', customer: 'فاطمة ح. (عميلة تجريبية)', status: ['navy', 'قيد التنفيذ'], created: '20 أكتوبر 2026',
  facts: [
    ['calendar-days', 'تاريخ السفر', '12 نوفمبر 2026', 'بعد 12 يومًا', ''],
    ['plane', 'طريقة السفر', 'جوًا مع المجموعة', 'مجموعة رجب الأولى (تجريبي)', ''],
    ['users-round', 'المسافرون', '3 أفراد', 'عائلة واحدة', ''],
    ['wallet', 'الدفع', 'إيصال قيد المراجعة', '18,600 SAR · لدى المحاسب', 'warn'],
    ['user', 'الموظف المسؤول', 'سارة <span class="nh-you">أنت</span>', 'تستحق اليوم', 'warn'],
  ],
  next: { icon: 'file-search', title: 'راجِع جواز ريم ح. (المسافرة الثالثة)', why: 'آخر مستند ناقص في الملف. بعد قبوله وتأكيد المحاسب للدفع، يصبح الطلب جاهزًا لإرساله لإصدار التأشيرات.', actions: `<button class="nh-btn nh-btn--primary">${I('file-search')}مراجعة الجواز</button><span class="nh-help" style="text-align:center">الدفع: لا إجراء منك، لدى المحاسب</span>` },
  journeyMeta: 'رحلة عمرة مع مجموعة',
  phases: [
    { title: 'رحلة العمرة', badge: '<span class="nh-badge nh-badge--navy">جارية</span>', steps: [['done', 'inbox', 'استلام الطلب', '20 أكتوبر'], ['now', 'file-search', 'مراجعة المستندات', '2 من 3 مسافرين'], ['', 'wallet', 'تأكيد الدفع', 'لدى المحاسب'], ['', 'send', 'الإرسال للتأشيرة', '—'], ['', 'stamp', 'إصدار التأشيرات', '—'], ['', 'plane-takeoff', 'السفر مع المجموعة', '12 نوفمبر']], note: 'تُرسل الحالة لإصدار التأشيرات بعد اكتمال مستندات جميع المسافرين وتأكيد الدفع. لا يمكن إرسال جزء من العائلة.' },
  ],
  travMeta: '3 مسافرين · 6 مستندات',
  travelers: [
    { initial: 'ف', name: 'فاطمة ح. (تجريبي)', role: 'المسافرة الرئيسية · مقدّمة الطلب', primary: true, docsTone: 'success', docsLabel: 'المستندات مكتملة', passport: 'P0DEMO192', nat: 'سعودية', dob: '7 مايو 1979', exp: '1 أغسطس 2031', docs: [
      { s: 'ok', icon: 'id-card', name: 'صورة صفحة بيانات الجواز', meta: 'passport.jpg · رُفع 20 أكتوبر · راجعته سارة' },
      { s: 'ok', icon: 'image', name: 'صورة شخصية', meta: 'photo.jpg · رُفع 20 أكتوبر · راجعته سارة' },
    ] },
    { initial: 'ع', name: 'عبد الرحمن ح. (تجريبي)', role: 'مرافق · زوج', docsTone: 'success', docsLabel: 'المستندات مكتملة', passport: 'P0DEMO193', nat: 'سعودي', dob: '11 سبتمبر 1975', exp: '30 مارس 2029', docs: [
      { s: 'ok', icon: 'id-card', name: 'صورة صفحة بيانات الجواز', meta: 'passport.jpg · رُفع 20 أكتوبر · راجعته سارة' },
      { s: 'ok', icon: 'image', name: 'صورة شخصية', meta: 'photo.jpg · رُفع 20 أكتوبر · راجعته سارة' },
    ] },
    { initial: 'ر', name: 'ريم ح. (تجريبي)', role: 'مرافقة · ابنة', docsTone: 'info', docsLabel: 'مستند واحد قيد المراجعة', passport: 'P0DEMO194', nat: 'سعودية', dob: '19 فبراير 2009', exp: '4 ديسمبر 2026', docs: [
      { s: 'pending', icon: 'id-card', name: 'صورة صفحة بيانات الجواز', meta: 'passport-reem.jpg · رُفع اليوم 09:12', note: 'قراءة الجواز الآلية: الاسم مطابق · رقم الجواز مطابق' },
      { s: 'ok', icon: 'image', name: 'صورة شخصية', meta: 'photo.jpg · رُفع 20 أكتوبر · راجعته سارة' },
    ], advisory: 'جواز ريم ينتهي في <b>4 ديسمبر 2026</b>، أي بعد أقل من شهر من العودة المتوقعة.' },
  ],
  deliverables: [
    { name: 'برنامج المجموعة ومواعيد الرحلة', meta: 'PDF · رُفع 21 أكتوبر بواسطة سارة · متاح للعميلة' },
    { future: true, name: 'تأشيرات العمرة (3)', meta: 'تُرفع بعد إصدارها', btn: 'رفع التأشيرات', why: 'يتاح بعد إصدار التأشيرات' },
    { future: true, name: 'تذاكر الطيران والسكن', meta: 'تُرفع قبل السفر مع بيانات المجموعة', btn: 'رفع الملف', why: 'يتاح بعد الحجز' },
  ],
  notesCount: 1,
  timeline: [
    { icon: 'upload', title: 'رفع مستند', time: 'اليوم · 09:12', body: 'جواز ريم ح. (نسخة جديدة) · بواسطة العميلة' },
    { icon: 'receipt', tone: 'navy', title: 'رفع إشعار الدفع', time: 'اليوم · 07:40', body: '18,600 SAR · تحويل بنكي · بانتظار المحاسب' },
    { icon: 'file-check-2', tone: 'gold', title: 'مراجعة مستند', time: '28 أكتوبر · 14:02', body: 'جواز ريم ح.: مرفوض · بواسطة سارة', note: 'السبب المرسل للعميلة: الصورة مقصوصة من الأطراف.' },
    { icon: 'package-check', tone: 'success', title: 'تسليم ملف للعميل', time: '21 أكتوبر · 11:30', body: 'برنامج المجموعة · بواسطة سارة' },
    { icon: 'user-round-cog', tone: 'navy', title: 'إسناد الطلب لموظف', time: '20 أكتوبر · 19:05', body: 'إلى سارة · بواسطة مدير النظام (تجريبي)' },
    { icon: 'inbox', title: 'استلام الطلب', time: '20 أكتوبر · 18:47', body: 'من الموقع · 3 مسافرين · مجموعة رجب الأولى' },
  ],
};
umrah.side = [
  card('user', 'العميلة', rows([['الاسم', 'فاطمة ح. (تجريبي)'], ['الهاتف', '+966 5X XXX 0192', 1], ['واتساب', 'نفس الرقم'], ['حساب العميل', 'مسجّل في البوابة'], ['مصدر الطلب', 'الموقع']]) + `<div style="display:flex;gap:8px;padding:0 20px 16px"><button class="nh-btn nh-btn--secondary nh-btn--sm" style="flex:1">${I('phone')}اتصال</button><button class="nh-btn nh-btn--secondary nh-btn--sm" style="flex:1">${I('message-square')}واتساب</button></div>`),
  card('sparkles', 'المجموعة والسفر', rows([['المجموعة', 'رجب الأولى (تجريبي)'], ['المغادرة', '12 نوفمبر 2026'], ['العودة', '26 نوفمبر 2026'], ['طريقة السفر', 'جوًا مع المجموعة'], ['المقاعد', '38 من 45 محجوزة']])),
  card('circle-check', 'جاهزية التنفيذ', check(false, 'المستندات المطلوبة مكتملة', 'جواز ريم ح. قيد مراجعتك') + check(true, 'البيانات المطلوبة مكتملة') + check(false, 'الدفع مكتمل', 'إيصال قيد مراجعة المحاسب')),
  card('wallet', 'الدفع', rows([['الفاتورة', '18,600 SAR', 1], ['الحالة', '<span class="nh-badge nh-badge--info">إيصال قيد المراجعة</span>'], ['الإيصال', 'رُفع اليوم 07:40'], ['المطابقة', '<span class="nh-match nh-match--ok">مطابق للفاتورة</span>']]) + note('lock', 'تأكيد الدفع أو رفضه من صلاحية المحاسب أو المدير، في صفحة مراجعة الدفعات.'), '<span class="nh-badge nh-badge--plain">للاطلاع</span>'),
  card('user-round-cog', 'الإسناد', `<div class="nh-owner" style="padding:14px 20px"><span class="nh-avatar nh-avatar--gold nh-avatar--lg">س</span><div><span class="nh-owner__name">سارة <span class="nh-you">أنت</span></span><span class="nh-owner__role">أسندها مدير النظام · 20 أكتوبر</span></div></div>` + note('lock', 'تغيير الموظف المسؤول من صلاحية المدير.')),
  card('clipboard-check', 'المهام المفتوحة', task({ name: 'مراجعة جواز ريم ح.', due: 'تستحق اليوم', warn: true }) + task({ name: 'تجهيز ملف التأشيرات للإرسال', due: 'بعد تأكيد الدفع' }), `<button class="nh-btn nh-btn--ghost nh-btn--sm">${I('plus')}مهمة</button>`),
  card('landmark', 'الجهة المنفّذة', `<p class="nh-help" style="margin:0;padding:14px 20px">لم تُرسل هذه الحالة إلى أي جهة منفّذة بعد.</p><div style="padding:0 20px 16px"><button class="nh-btn nh-btn--secondary nh-btn--sm" style="width:100%" disabled>${I('send')}إرسال الحالة إلى الجهة</button><span class="nh-help" style="display:block;margin-top:6px;text-align:center">يُفعَّل عند اكتمال الجاهزية</span></div>`),
];

const readme = `# CaseWorkspace

The case workspace (شاشة إدارة الطلب الواحد): one screen per case that tells an employee what this case is, where it stands, what they must do next, and what they are not allowed to do. Two variants: **Egypt security clearance** (EG-DEMO-0431) and **Umrah** (UM-DEMO-1192, card CaseWorkspaceUmrah). **All data is synthetic demonstration data.**

## Reading order (top to bottom)
1. **Case header**: customer, reference, service, status; five facts (travel/entry date with days left, entry or travel method, approval or travelers, payment, assigned employee with SLA).
2. **الإجراء التالي المطلوب منك**: one sentence, the reason, the deadline, one primary button, and what comes after. When nothing is required of the employee it says so.
3. **المرحلة الحالية**: the journey as steps. **Egypt shows two separate phases**: (1) الموافقة الأمنية, from intake to approval delivered, and (2) السفر والتعميم: travel data, booking, ticket review, circular request, circular issued, circular delivered, with the 72-hour rule stated in plain words. Approval issuance is never presented as "ready to travel".
4. **المسافرون والمستندات**: per traveler: passport number, nationality, date of birth, passport expiry, then each document with its state. Accept / reject-with-reason only on documents pending review. Case-intelligence warnings (expiry, OCR mismatch, duplicates) show as amber advisories that never reject automatically.
5. **الملفات المسلّمة للعميل**: deliverables with download; future deliverables (Egypt circular, Umrah visas) appear disabled with the reason.
6. **سجل الحالة**: the audit trail (ACTION_LABEL wording) with a tab for internal notes.
Side column: customer, travel (Egypt: entry mode, date, booking, last safe circular date) or group (Umrah), readiness checks (same three as today), payment (read-only), assignment (read-only), open tasks, provider submission.

## Actions shown = actions the EMPLOYEE role is allowed today
From \`contact-requests.routes.js\`:
| Action on screen | Route | Roles |
|---|---|---|
| قبول / رفض مع سبب (document) | PATCH /:id/documents/:documentId/status | SUPER_ADMIN, ADMIN, EMPLOYEE (+STAFF_REVIEW flag) |
| تنزيل / فتح (customer documents, deliverables) | GET …/file | SUPER_ADMIN, ADMIN, EMPLOYEE, ACCOUNTANT |
| رفع ملف للعميل (approval, circular, visas) | POST /:id/deliverables | SUPER_ADMIN, ADMIN, EMPLOYEE (+DOCUMENTS flag) |
| ملاحظة داخلية | POST /:id/notes | SUPER_ADMIN, ADMIN, EMPLOYEE |
| مهمة / إنهاء مهمة | POST /:id/tasks, PATCH …/complete | SUPER_ADMIN, ADMIN, EMPLOYEE |
| إرسال إلى الجهة | POST /:id/provider-submissions | SUPER_ADMIN, ADMIN, EMPLOYEE |

**Shown read-only, with the reason:** payment confirmation (POST /:id/confirm-payment: SUPER_ADMIN, ADMIN, ACCOUNTANT, done on the Payment Review page) and assignment (PATCH /:id/assign: SUPER_ADMIN, ADMIN). An admin viewing the same screen would additionally get "تغيير المسؤول". The header chip "تعرض بصلاحية: موظف عمليات" makes the role explicit.
Pricing (invoice / offer) is not shown on this employee view; nothing about prices is changed.

## Data the design uses that is not on the case payload today
- Egypt travel plan on the staff side: \`intakeData.egyptTravel\` (entryMode, entryDate, bookingStatus, circularStatus) exists for the customer portal; the staff case payload must include it.
- "Last safe circular date" = entryDate − 72h (derived; matches the portal's rule).
- Umrah group, departure and return dates on the case (from umrah-groups).
- Two-phase Egypt journey needs the circular steps recorded (e.g. as a provider submission and a deliverable labelled as the circular).
These are design intent; no API or logic was changed.

## Layout
1440px: 272px rail, 32px gutters; main column + 352px side column, 24px gaps. Body text 14px/24px, names 16px, facts 15.5px, section titles 16px.
`;

const readmeUmrah = `# CaseWorkspaceUmrah

The Umrah variant of the case workspace (UM-DEMO-1192): a family of three travelling with a group, one passport pending review and the payment receipt waiting for the accountant. Same layout, rules and permissions as CaseWorkspace; see its README. All data is synthetic demonstration data.

## Status: APPROVED visual direction (31 Oct 2026)
The current Umrah case workspace is the approved baseline. The three requirements below are **mandatory for implementation**. None of them exists in the backend today (no sponsor fields, no Umrah package type), so each needs its own data, API and permission review before build. The preview does not show them yet.

## Mandatory implementation requirements
**U1. Sponsor (الكفيل): Iqama and sponsor number, with review status.**
- Per case (or per traveler where the sponsor differs): **رقم الكفيل** (sponsor number) and **إقامة الكفيل** (sponsor's Iqama, an uploaded document).
- Both carry a review status like other documents: قيد المراجعة / مقبول / مرفوض with a reason sent to the customer. They appear in "المسافرون والمستندات" as a **الكفيل** block above the travelers, and the sponsor number shows in the case header facts.
- They count toward "المستندات المطلوبة مكتملة" only where the package requires a sponsor (backend rule, not UI).
- Sensitive personal data: mask the Iqama number in lists (show the last 4 digits) and show it in full only inside the case.

**U2. Different workflows for visa-only, air and sea packages.** The case carries a package type, and the stage track, required documents and deliverables follow it:
- **تأشيرة فقط**: received, documents, payment, sent for visa, visa issued, visa delivered. No travel or booking steps.
- **جوي**: the visa steps, then flight booking, accommodation, travel with the group. Deliverables include tickets and accommodation.
- **بحري**: the visa steps, then ferry booking (existing ferries module), accommodation, travel by sea. Deliverables include the ferry ticket.
- The header's "طريقة السفر" fact and the side "المجموعة والسفر" card switch by type. Steps that don't apply are not shown, rather than shown as skipped.

**U3. Payment and readiness states enforced by real backend rules.**
- Every payment and readiness state on screen comes from the server (the readiness engine: documentsComplete, answersComplete, paymentReady, plus the confirmed payment status). The UI never computes or assumes readiness.
- Buttons such as "إرسال الحالة إلى الجهة" are enabled only when the server reports readiness, and the server rejects the action when it is not ready, even if a client sends it.
- Payment shows only server states (لم يُدفع، بانتظار التحويل، إيصال قيد المراجعة، مدفوع، جزئي). Confirmation stays on the Payment Review page for the roles allowed today.
- Package-specific rules from U2 (e.g. sponsor required, ferry booking before travel) are enforced in the same server readiness check.
`;

module.exports = { page, egypt, umrah, I, svcTag, rows, card, note, check, task, tl, USER };
if (require.main === module) {
const OUT = path.join(__dirname, 'nh-ds/project/components/CaseWorkspace');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'preview.html'), page(egypt));
const OUT_U = path.join(__dirname, 'nh-ds/project/components/CaseWorkspaceUmrah');
fs.mkdirSync(OUT_U, { recursive: true });
fs.writeFileSync(path.join(OUT_U, 'preview.html'), page(umrah));
fs.writeFileSync(path.join(OUT_U, 'README.md'), readmeUmrah);
fs.writeFileSync(path.join(OUT, 'README.md'), readme);
console.log('ok');
}
