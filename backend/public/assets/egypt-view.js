// Egypt security approval in the back-office: the queue / travel schedule tab
// and the Egypt workspace inside a request's detail. Everything shown comes
// from the server (/contact-requests/egypt/queue, /contact-requests/:id/egypt);
// every action is a server transition that re-checks the request under its
// lock and is audited there. Uses api.js helpers (api, escapeHtml,
// formatDateTime, showAlert).

const EGYPT_CODES = ["VISA-EGYPT-CLEARANCE", "VISA-EGYPT-CLEARANCE-AIR", "VISA-EGYPT-CLEARANCE-BORDER"];
const EGYPT_ENTRY_AR = { AIR: "جوي", BORDER: "بري" };
const EGYPT_CIRCULAR_AR = { NOT_STARTED: "لم يبدأ", PROCESSING: "قيد التجهيز", ISSUED: "صدر" };
const EGYPT_FLIGHT_AR = { REQUEST: "يطلب الحجز عبر نسائم", BOOKED: "حجز بنفسه", LATER: "سيقرر لاحقًا" };
const EGYPT_REMINDER_AR = { SCHEDULED: "مجدول", SENT: "أُرسل", CANCELLED: "أُلغي", SUPERSEDED: "استُبدل بتاريخ أحدث" };
const EGYPT_REMINDER_KIND_AR = { THREE_DAY: "قبل 3 أيام", URGENT: "عاجل" };
const EGYPT_FILTER_AR = {
  PAYMENT_PENDING: "الدفع معلق",
  PAYMENT_VERIFIED: "الدفع مؤكد",
  AWAITING_TRAVEL_DETAILS: "بانتظار بيانات السفر",
  AWAITING_TICKET: "بانتظار التذكرة",
  WITHIN_3_DAYS: "سفر خلال 3 أيام",
  URGENT: "متأخر أو عاجل",
};
const EGYPT_PAYMENT_AR = { NOT_REQUIRED: "لا يوجد سعر", AWAITING_TRANSFER: "بانتظار التحويل", UNDER_REVIEW: "إيصال للمراجعة", CONFIRMED: "مؤكد" };
const EGYPT_TICKET_AR = { AVAILABLE: "متوفرة", BOOKING_REQUESTED: "طلب حجز عبر نسائم", MISSING: "غير مرفوعة" };
const RECEIPT_EMAIL_AR = { PENDING: "بانتظار الإرسال", SENDING: "جارٍ الإرسال", ACCEPTED: "قبله مزود البريد", UNCERTAIN: "غير مؤكد — راجع قبل إعادة الإرسال", FAILED: "فشل", SKIPPED: "لم يُرسل" };
const RECEIPT_ERROR_AR = { NO_RECIPIENT: "لا يوجد بريد إلكتروني للعميل", NOT_CONFIGURED: "خدمة البريد غير مهيأة", RECEIPT_PDF_FAILED: "تعذر إنشاء ملف الإيصال", WAITING_FOR_PDF: "بانتظار ملف الإيصال" };
const QUALITY_AR = {
  LOW_RESOLUTION: "دقة منخفضة",
  TOO_DARK: "مظلمة",
  TOO_BRIGHT: "إضاءة زائدة",
  GLARE: "انعكاس ضوء",
  BLURRY: "غير واضحة",
  CROPPED: "مقصوصة",
  NOT_PASSPORT_PAGE: "قد لا تكون صفحة البيانات",
  PAGE_UNCERTAIN: "تعذر التأكد من الصفحة",
};

function isEgyptRequest(r) {
  return EGYPT_CODES.includes(String(r?.visaType?.code || "").toUpperCase());
}

function egyptToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Khartoum", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function egyptDateBadge(row) {
  if (row.missingDate) return '<span class="badge status-AWAITING_TRANSFER" data-egypt-flag="missing">بلا تاريخ</span>';
  const days = row.daysUntil;
  const when = days === 0 ? "اليوم" : days === 1 ? "غدًا" : days > 1 ? `بعد ${days} يوم` : `مضى ${-days} يوم`;
  const flag = row.overdue
    ? '<span class="badge status-REJECTED" data-egypt-flag="overdue">متأخر</span>'
    : row.imminent
      ? '<span class="badge status-PROCESSING" data-egypt-flag="imminent">قريب</span>'
      : "";
  return `<span dir="ltr">${escapeHtml(row.travelDate)}</span> <span class="muted small">${escapeHtml(when)}</span> ${flag}`;
}

function egyptQueueRowHtml(row) {
  return `<tr data-egypt-id="${escapeHtml(row.id)}" tabindex="0">
    <td><a href="#/requests/${encodeURIComponent(row.id)}" dir="ltr">${escapeHtml(row.id.slice(-8).toUpperCase())}</a><div class="muted small">${formatDate(row.createdAt)}</div></td>
    <td>${escapeHtml(row.name)}<div class="muted small" dir="ltr">${escapeHtml(row.phone)}</div></td>
    <td>${escapeHtml(EGYPT_ENTRY_AR[row.entryMode] || "-")}<div class="muted small">${escapeHtml(row.travelerCount)} مسافر</div></td>
    <td>${escapeHtml(EGYPT_PAYMENT_AR[row.paymentStatus] || row.paymentStatus)}</td>
    <td>${row.approvalIssued ? `صدرت${row.approvalIssuedOn ? ` <span dir="ltr">${escapeHtml(row.approvalIssuedOn)}</span>` : ""}` : "لم تصدر"}</td>
    <td>${egyptDateBadge(row)}</td>
    <td>${escapeHtml(row.ticketStatus ? EGYPT_TICKET_AR[row.ticketStatus] : "—")}${row.flightInquiryId ? ` · <a href="#/requests/${encodeURIComponent(row.flightInquiryId)}">طلب الحجز</a>` : ""}</td>
    <td>${escapeHtml(EGYPT_CIRCULAR_AR[row.circularStatus] || "-")}</td>
    <td>${row.documentIssues?.length ? `<span class="small">${escapeHtml(row.documentIssues.join(" "))}</span>` : row.documentsFlagged ? `<span class="badge status-PROCESSING">${escapeHtml(row.documentsFlagged)} صورة تحتاج تدقيقًا</span>` : "—"}</td>
    <td>${escapeHtml(row.assignedUser?.fullName || "غير مُسند")}</td>
    <td><strong class="small">${escapeHtml(row.nextAction || "")}</strong><div class="muted small">${escapeHtml(row.stageLabel)}</div></td>
  </tr>`;
}

// The Egypt tab: stage counts, filters, queue or travel schedule.
function createEgyptQueueView({ root, onOpen }) {
  let seq = 0;
  const state = { view: "schedule" };
  root.innerHTML = `
    <div class="card">
      <h2>الموافقة الأمنية لمصر</h2>
      <p class="muted small">جدول السفر مرتب بأقرب تاريخ. «قريب» = خلال 3 أيام (توقيت الخرطوم)، «متأخر» = مضى التاريخ والطلب مفتوح.</p>
      <div class="filters">
        <div class="field"><label for="egypt-view">العرض</label>
          <select id="egypt-view"><option value="schedule">جدول السفر</option><option value="queue">الأحدث أولًا</option></select></div>
        <div class="field"><label for="egypt-stage">المرحلة</label><select id="egypt-stage"><option value="">كل المراحل</option></select></div>
        <div class="field"><label for="egypt-filter">تصفية تشغيلية</label><select id="egypt-filter"><option value="">بدون</option>${Object.entries(EGYPT_FILTER_AR).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select></div>
        <div class="field"><label for="egypt-entry">طريقة الدخول</label>
          <select id="egypt-entry"><option value="">الكل</option><option value="AIR">جوي</option><option value="BORDER">بري</option></select></div>
        <div class="field"><label for="egypt-from">سفر من</label><input id="egypt-from" type="date" /></div>
        <div class="field"><label for="egypt-to">سفر إلى</label><input id="egypt-to" type="date" /></div>
        <div class="field"><label for="egypt-search">بحث</label><input id="egypt-search" type="search" placeholder="الاسم أو الهاتف أو المرجع" /></div>
      </div>
      <div id="egypt-counts" class="stack wrap"></div>
      <div class="table-scroll">
        <table class="stack-table">
          <thead><tr><th>المرجع</th><th>العميل</th><th>الدخول</th><th>الدفع</th><th>الموافقة</th><th>تاريخ السفر</th><th>التذكرة</th><th>التعميم</th><th>المستندات</th><th>المسؤول</th><th>الإجراء التالي</th></tr></thead>
          <tbody id="egypt-body"></tbody>
        </table>
      </div>
      <p class="muted small hidden" id="egypt-truncated">النتائج كثيرة؛ ضيّق البحث بالتاريخ أو المرحلة.</p>
    </div>`;
  mountEgyptAlertsAdmin(root);
  mountEgyptPricingAdmin(root);
  const $ = (id) => root.querySelector(`#${id}`);

  async function load() {
    const current = ++seq;
    const params = new URLSearchParams({ view: $("egypt-view").value });
    for (const [key, id] of [["stage", "egypt-stage"], ["filter", "egypt-filter"], ["entryMode", "egypt-entry"], ["from", "egypt-from"], ["to", "egypt-to"], ["search", "egypt-search"]]) {
      const value = $(id).value.trim();
      if (value) params.set(key, value);
    }
    $("egypt-body").innerHTML = '<tr><td colspan="11" class="muted">جارٍ التحميل...</td></tr>';
    try {
      const { data } = await api.get(`/contact-requests/egypt/queue?${params}`);
      if (current !== seq) return;
      const stageSelect = $("egypt-stage");
      if (stageSelect.options.length === 1) {
        stageSelect.insertAdjacentHTML("beforeend", Object.entries(data.stageLabels).map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join(""));
      }
      $("egypt-counts").innerHTML = [
        ...Object.entries(data.counts)
          .filter(([, count]) => count > 0)
          .map(([key, count]) => `<span class="badge" data-egypt-count="${escapeHtml(key)}">${escapeHtml(data.stageLabels[key])}: ${escapeHtml(count)}</span>`),
        ...Object.entries(data.filterCounts || {})
          .filter(([key, count]) => count > 0 && (key === "WITHIN_3_DAYS" || key === "URGENT"))
          .map(([key, count]) => `<span class="badge ${key === "URGENT" ? "status-REJECTED" : "status-PROCESSING"}" data-egypt-count="${escapeHtml(key)}">${escapeHtml(EGYPT_FILTER_AR[key])}: ${escapeHtml(count)}</span>`),
      ].join(" ");
      $("egypt-body").innerHTML = data.rows.length ? data.rows.map(egyptQueueRowHtml).join("") : '<tr><td colspan="11" class="muted">لا توجد طلبات مطابقة.</td></tr>';
      $("egypt-truncated").classList.toggle("hidden", !data.truncated);
      if (typeof labelStackTable === "function") labelStackTable(root.querySelector("table"));
    } catch (error) {
      if (current !== seq) return;
      $("egypt-body").innerHTML = `<tr><td colspan="11"><div class="alert error" role="alert">${escapeHtml(error.message)}</div></td></tr>`;
    }
  }

  root.addEventListener("change", (event) => {
    if (event.target.matches("select, input[type=date]")) load();
  });
  let timer = null;
  $("egypt-search").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(load, 350);
  });
  $("egypt-body").addEventListener("click", (event) => {
    const row = event.target.closest("[data-egypt-id]");
    if (!row || event.target.closest("a")) return;
    onOpen(row.dataset.egyptId);
  });
  $("egypt-body").addEventListener("keydown", (event) => {
    const row = event.target.closest("[data-egypt-id]");
    if (row && event.key === "Enter") onOpen(row.dataset.egyptId);
  });
  return { load, state };
}

// ---- the Egypt workspace inside a request

function egyptFileLink(requestId, d) {
  return `<a href="/api/contact-requests/${encodeURIComponent(requestId)}/deliverables/${encodeURIComponent(d.id)}/file" target="_blank" rel="noopener">${escapeHtml(d.label)} (نسخة ${escapeHtml(d.version)})</a>`;
}

function egyptVersionsHtml(requestId, files, travelers, { showIssued = false } = {}) {
  if (!files.length) return '<p class="muted">لا يوجد.</p>';
  const nameOf = (id) => travelers.find((t) => t.id === id)?.fullName || "—";
  return `<ul class="plain-list">${files
    .map((d) => `<li data-egypt-file="${escapeHtml(d.id)}">${egyptFileLink(requestId, d)}
      <span class="badge ${d.supersededAt ? "" : "status-APPROVED"}">${d.supersededAt ? "نسخة سابقة" : "الحالية — يراها العميل"}</span>
      ${showIssued && d.issuedOn ? `<span class="muted small">تاريخ الإصدار <span dir="ltr">${escapeHtml(String(d.issuedOn).slice(0, 10))}</span></span>` : ""}
      ${d.travelerIds?.length ? `<span class="muted small">يخص: ${escapeHtml(d.travelerIds.map(nameOf).join("، "))}</span>` : ""}
      <span class="muted small">${formatDateTime(d.publishedAt || d.createdAt)}</span></li>`)
    .join("")}</ul>`;
}

function egyptPanelHtml(ws, r) {
  const travelers = r.travelers || [];
  const open = r.status !== "CLOSED";
  const travelerChoices = travelers.length > 1
    ? `<fieldset class="field"><legend>المسافرون الذين تشملهم</legend>${travelers.map((t) => `<label class="inline"><input type="checkbox" name="travelerIds" value="${escapeHtml(t.id)}" checked /> ${escapeHtml(t.fullName)}</label>`).join(" ")}</fieldset>`
    : "";
  const route = ws.route || {};
  const reminders = ws.reminders.length
    ? `<ul class="plain-list">${ws.reminders.map((m) => `<li>${escapeHtml(EGYPT_REMINDER_KIND_AR[m.kind] || m.kind)} · سفر <span dir="ltr">${escapeHtml(m.travelDate)}</span> · ${escapeHtml(EGYPT_REMINDER_AR[m.status] || m.status)} · ${formatDateTime(m.sentAt || m.dueAt)}</li>`).join("")}</ul>`
    : '<p class="muted small">لا توجد تذكيرات (لا يوجد تاريخ سفر).</p>';
  const delivery = ws.receiptDeliveries?.[0];
  const quality = ws.passportQuality.length
    ? `<ul class="plain-list">${ws.passportQuality.map((q) => `<li>${escapeHtml(q.label)}: ${q.warnings.length ? q.warnings.map((w) => `<span class="badge status-PROCESSING">${escapeHtml(QUALITY_AR[w] || w)}</span>`).join(" ") : "لا ملاحظات"}</li>`).join("")}</ul>
       <p class="muted small">ملاحظات قاسها جهاز العميل؛ للمساعدة فقط ولا ترفض المستند. القرار لمراجعة الموظف.</p>`
    : '<p class="muted small">لا توجد ملاحظات جودة على صور الجواز.</p>';
  return `
  <section class="card inset" id="egypt-workspace" data-egypt-stage="${escapeHtml(ws.stage)}">
    <p><span class="badge">${escapeHtml(ws.stageLabel)}</span> · الدخول: <strong>${escapeHtml(EGYPT_ENTRY_AR[ws.entryMode] || "-")}</strong>
      ${ws.entryMode === "AIR" ? ` · من ${escapeHtml(route.departureCity || "-")} إلى ${escapeHtml(route.arrivalAirport || "-")}` : ws.entryMode === "BORDER" ? ` · المنفذ: ${escapeHtml(route.entryPort || "غير محدد")}` : ""}</p>
    <p>تاريخ السفر: ${egyptDateBadge(ws)}</p>
    <p data-egypt-next="1">الإجراء التالي: <strong>${escapeHtml(ws.nextAction || "-")}</strong></p>
    ${ws.approvalIssued && !ws.preparationComplete ? `<p class="alert warning" data-egypt-prep-missing="1">تجهيز السفر ناقص (الموافقة تبقى صادرة): ${escapeHtml(ws.preparationMissing.join("، "))}</p>` : ""}

    <h4>الموافقة الأمنية</h4>
    ${egyptVersionsHtml(r.id, ws.approvals, travelers, { showIssued: true })}
    ${open ? `<form class="card inset" data-cr-form="egypt-approval">
      <div class="grid cols-3">
        <div class="field"><label for="egypt-issued-on">تاريخ الإصدار</label><input id="egypt-issued-on" name="issuedOn" type="date" max="${egyptToday()}" value="${egyptToday()}" required /></div>
        <div class="field"><label for="egypt-approval-file">صورة/ملف الموافقة</label><input id="egypt-approval-file" name="file" type="file" accept=".pdf,image/jpeg,image/png,image/webp" required /></div>
      </div>
      ${travelerChoices}
      <p class="muted small">يُحفظ الملف ويُتحقق منه أولًا، ثم تُسجَّل الموافقة صادرة ويُبلَّغ العميل. نسخة جديدة تستبدل السابقة لنفس المسافرين.</p>
      <button type="submit" class="btn">${ws.approvals.length ? "إصدار نسخة جديدة" : "تسجيل إصدار الموافقة"}</button>
    </form>` : ""}

    <h4>تاريخ السفر</h4>
    ${open ? `<form class="stack wrap" data-cr-form="egypt-travel-date">
      <div class="field"><label for="egypt-travel-date">التاريخ</label><input id="egypt-travel-date" name="entryDate" type="date" min="${egyptToday()}" value="${escapeHtml(ws.travelDate || "")}" required /></div>
      <div class="field"><label for="egypt-travel-reason">السبب (يُسجَّل)</label><input id="egypt-travel-reason" name="reason" minlength="3" maxlength="300" required /></div>
      <button type="submit" class="btn secondary">حفظ التاريخ</button>
    </form>
    ${ws.circularStatus === "ISSUED" ? '<p class="muted small">تغيير التاريخ بعد صدور التعميم يسحب التعميم الحالي ويعيده إلى «قيد التجهيز».</p>' : ""}` : ""}
    <details><summary>تذكيرات الفريق</summary>${reminders}</details>

    <h4>${ws.entryMode === "BORDER" ? "تذاكر الرحلة" : "تذاكر الطيران"}</h4>
    ${egyptVersionsHtml(r.id, ws.tickets, travelers)}
    <p class="muted small">خيار العميل: ${escapeHtml(EGYPT_FLIGHT_AR[ws.flightChoice] || "لم يحدد")}${ws.linkedInquiry ? ` · <a href="#/requests/${encodeURIComponent(ws.linkedInquiry.id)}" data-cr-open-linked="${escapeHtml(ws.linkedInquiry.id)}">طلب الحجز المرتبط</a> (لا يؤثر على الموافقة)` : ""}</p>
    ${open ? `<form class="stack wrap" data-cr-form="egypt-ticket">
      <div class="field"><label for="egypt-ticket-file">رفع تذكرة</label><input id="egypt-ticket-file" name="file" type="file" accept=".pdf,image/jpeg,image/png,image/webp" required /></div>
      <button type="submit" class="btn secondary">إرفاق التذكرة للعميل</button>
    </form>` : ""}

    <h4>التعميم</h4>
    <p>الحالة: <strong data-egypt-circular="${escapeHtml(ws.circularStatus)}">${escapeHtml(EGYPT_CIRCULAR_AR[ws.circularStatus])}</strong></p>
    ${egyptVersionsHtml(r.id, ws.circulars, travelers)}
    ${open && ws.approvalIssued ? `
      ${ws.circularStatus === "NOT_STARTED" ? '<button type="button" class="btn secondary" data-egypt-circular-start="1">بدء تجهيز التعميم</button>' : ""}
      <form class="stack wrap" data-cr-form="egypt-circular">
        <div class="field"><label for="egypt-circular-file">ملف التعميم (PDF فقط)</label><input id="egypt-circular-file" name="file" type="file" accept="application/pdf,.pdf" required /></div>
        <button type="submit" class="btn">رفع التعميم وإبلاغ العميل</button>
      </form>
      <p class="muted small">التعميم مستند رسمي يُرفع كما صدر؛ لا يُنشئه النظام.</p>` : '<p class="muted small">يُجهَّز التعميم بعد إصدار الموافقة واكتمال بيانات السفر.</p>'}

    <h4>إيصال السداد</h4>
    ${ws.receipt ? `<p>رقم <span dir="ltr">${escapeHtml(ws.receipt.receiptNo)}</span> · ${ws.receipt.pdfStatus === "READY" ? `<a href="/api/contact-requests/${encodeURIComponent(r.id)}/payment-receipt/file" target="_blank" rel="noopener">تحميل PDF</a>` : escapeHtml(ws.receipt.pdfStatus === "FAILED" ? "تعذر إنشاء الملف" : "جارٍ إنشاء الملف")}</p>` : '<p class="muted small">يصدر تلقائيًا عند تأكيد الدفع.</p>'}
    ${delivery ? `<p class="muted small">البريد: <span dir="ltr">${escapeHtml(delivery.recipient || "—")}</span> · ${escapeHtml(RECEIPT_EMAIL_AR[delivery.status] || delivery.status)}${delivery.lastError ? ` · ${escapeHtml(RECEIPT_ERROR_AR[delivery.lastError] || delivery.lastError)}` : ""}</p>
      <form class="stack wrap" data-cr-form="egypt-receipt-resend">
        <div class="field"><label for="egypt-receipt-email">بريد العميل (اختياري للتصحيح)</label><input id="egypt-receipt-email" name="email" type="email" dir="ltr" value="${escapeHtml(delivery.recipient || "")}" /></div>
        <button type="submit" class="btn secondary">إعادة إرسال الإيصال</button>
      </form>` : ""}

    <h4>جودة صور الجواز</h4>
    ${quality}
  </section>`;
}

// Submit handlers of the workspace forms. Returns true when handled.
function handleEgyptForm(form, { base, act, alert }) {
  const button = form.querySelector('button[type="submit"]');
  const f = form.elements;
  switch (form.dataset.crForm) {
    case "egypt-approval": {
      const file = f.file.files[0];
      if (!file || !f.issuedOn.value) {
        alert("اختر تاريخ الإصدار والملف.");
        return true;
      }
      const travelerIds = [...form.querySelectorAll('input[name="travelerIds"]:checked')].map((input) => input.value);
      if (form.querySelector('input[name="travelerIds"]') && !travelerIds.length) {
        alert("حدّد المسافرين الذين تشملهم الموافقة.");
        return true;
      }
      const data = new FormData();
      data.append("issuedOn", f.issuedOn.value);
      data.append("file", file);
      if (travelerIds.length) data.append("travelerIds", JSON.stringify(travelerIds));
      act(button, () => api.upload(`${base}/egypt/approval`, data), "تم تسجيل إصدار الموافقة وإبلاغ العميل.");
      return true;
    }
    case "egypt-travel-date":
      act(button, () => api.patch(`${base}/egypt/travel-date`, { entryDate: f.entryDate.value, reason: f.reason.value.trim() }), "تم حفظ تاريخ السفر وتحديث التذكيرات.");
      return true;
    case "egypt-ticket": {
      const data = new FormData();
      data.append("file", f.file.files[0]);
      act(button, () => api.upload(`${base}/egypt/tickets`, data), "تم إرفاق التذكرة وإبلاغ العميل.");
      return true;
    }
    case "egypt-circular": {
      const file = f.file.files[0];
      if (!file || !/\.pdf$/i.test(file.name)) {
        alert("التعميم يُرفع ملف PDF فقط.");
        return true;
      }
      const data = new FormData();
      data.append("file", file);
      act(button, () => api.upload(`${base}/egypt/circular`, data), "تم رفع التعميم وإبلاغ العميل.");
      return true;
    }
    case "egypt-receipt-resend": {
      const email = f.email.value.trim();
      act(button, () => api.post(`${base}/payment-receipt/resend`, email ? { email } : {}), "تمت إعادة إرسال الإيصال.");
      return true;
    }
    default:
      return false;
  }
}

function handleEgyptClick(target, { base, act }) {
  const start = target.closest("[data-egypt-circular-start]");
  if (start) {
    act(start, () => api.post(`${base}/egypt/circular/processing`, {}), "بدأ تجهيز التعميم.");
    return true;
  }
  return false;
}
