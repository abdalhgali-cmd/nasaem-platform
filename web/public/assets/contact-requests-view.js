/* GENERATED from backend/public by scripts/sync-static-admin.mjs. Do not edit here: edit backend/public and run `node scripts/sync-static-admin.mjs`. */
// Staff view of customer requests (ContactRequest): list with search and
// filters, and a full detail view with every action the backend allows for
// the current role. Separate from Orders and Flight Bookings on purpose:
// they are different records with different lifecycles.
//
// Server-side checks stay authoritative; ROLE_CAN below only hides controls
// a role would be refused anyway.
const CR_STATUS_AR = { NEW: "جديد", CONTACTED: "تم التواصل", CLOSED: "مغلق" };
const CR_OUTCOME_AR = { COMPLETED: "مكتمل", REJECTED: "مرفوض", CANCELLED: "ملغي" };
const CR_PAYMENT_AR = { NOT_REQUIRED: "لا يوجد سعر بعد", AWAITING_TRANSFER: "بانتظار التحويل", UNDER_REVIEW: "إشعار دفع للمراجعة", CONFIRMED: "الدفع مؤكد" };
const CR_DOC_STATUS_AR = { PENDING: "بانتظار المراجعة", ACCEPTED: "مقبول", REJECTED: "مرفوض" };
const CR_CURRENCIES = ["SAR", "USD", "SDG", "EGP", "AED", "EUR", "GBP", "QAR"];

const CR_ROLE_CAN = {
  work: ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"],          // status, documents, pricing, deliverables, notes
  confirmPayment: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"],
  assign: ["SUPER_ADMIN", "ADMIN"],
  reopen: ["SUPER_ADMIN", "ADMIN"],
  timeline: ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"],
};

// Mirrors dashboard.service.js contactNextAction so the list and the
// operations center agree on "what happens next".
function crNextAction(r) {
  if (r.status === "CLOSED") return "مغلق";
  if (r.paymentStatus === "UNDER_REVIEW") return "مراجعة إشعار الدفع";
  if (r.paymentStatus === "AWAITING_TRANSFER") return "متابعة الدفع مع العميل";
  if (!r.invoice && (!r.offers || r.offers.length === 0)) return "تحديد السعر";
  if ((r.documents || []).some((d) => d.status === "PENDING")) return "مراجعة المستندات";
  if (r.invoice?.status === "PENDING" || ((r.offers || []).length > 0 && !r.selectedOfferId)) return "بانتظار موافقة العميل";
  if (r.paymentStatus === "CONFIRMED" && (r.deliverables || []).length === 0) return "إصدار وتسليم الملف النهائي";
  if (r.paymentStatus === "CONFIRMED") return "إغلاق الطلب كمكتمل";
  return "معالجة الطلب";
}

function crReference(id) {
  return String(id || "").slice(-8).toUpperCase();
}

function crStatusBadge(r) {
  const label = r.status === "CLOSED" && r.outcome ? `${CR_STATUS_AR.CLOSED} — ${CR_OUTCOME_AR[r.outcome] || r.outcome}` : CR_STATUS_AR[r.status] || r.status;
  return `<span class="badge cr-status-${escapeHtml(r.status)}">${escapeHtml(label)}</span>`;
}

function crPaymentBadge(status) {
  return `<span class="badge cr-pay-${escapeHtml(status)}">${escapeHtml(CR_PAYMENT_AR[status] || status)}</span>`;
}

// intakeData is free-form JSON from the customer form: rendered as an
// escaped definition list (nested values as escaped JSON), never as HTML.
function crIntakeHtml(intake) {
  if (!intake || typeof intake !== "object" || Object.keys(intake).length === 0) return '<p class="muted">لا توجد بيانات إضافية.</p>';
  return `<dl class="detail-grid">${Object.entries(intake)
    .map(([key, value]) => {
      const text = value !== null && typeof value === "object" ? JSON.stringify(value, null, 1) : String(value ?? "-");
      return `<div><dt>${escapeHtml(key)}</dt><dd class="pre-wrap">${escapeHtml(text)}</dd></div>`;
    })
    .join("")}</dl>`;
}

function createContactRequestsView({ user, listBody, pagination, filters, detailCard, onOpen }) {
  const can = (action) => CR_ROLE_CAN[action].includes(user.role);
  const state = { page: 1, limit: 20 };
  let detailSeq = 0;
  let listSeq = 0;
  let openId = null;
  let current = null;
  let staffDirectory = null;

  function query() {
    const params = new URLSearchParams({ page: state.page, limit: state.limit });
    const search = filters.search.value.trim();
    if (search) params.set("search", search);
    if (filters.status.value) params.set("status", filters.status.value);
    if (filters.payment.value) params.set("paymentStatus", filters.payment.value);
    if (filters.assignee.value) params.set("assignedUserId", filters.assignee.value);
    if (filters.category.value) params.set("category", filters.category.value);
    return params.toString();
  }

  async function load() {
    const seq = ++listSeq;
    listBody.innerHTML = '<tr><td colspan="8" class="muted">جارٍ التحميل...</td></tr>';
    try {
      const { data, meta } = await api.get(`/contact-requests?${query()}`);
      if (seq !== listSeq) return; // a newer filter/search replaced this one
      listBody.innerHTML = data.length
        ? data
            .map(
              (r) => `
          <tr class="clickable-row" data-cr-id="${escapeHtml(r.id)}">
            <td><button type="button" class="link-button" data-cr-id="${escapeHtml(r.id)}" aria-label="فتح الطلب ${escapeHtml(crReference(r.id))}" dir="ltr">${escapeHtml(crReference(r.id))}</button></td>
            <td>${escapeHtml(r.name)}<br><small dir="ltr">${escapeHtml(r.phone)}</small></td>
            <td>${escapeHtml(r.serviceRef?.name || r.service || "استفسار")}</td>
            <td>${crStatusBadge(r)}</td>
            <td>${crPaymentBadge(r.paymentStatus)}</td>
            <td>${escapeHtml(r.assignedUser?.fullName || "غير مُسند")}</td>
            <td>${escapeHtml(crNextAction(r))}</td>
            <td>${formatDate(r.createdAt)}</td>
          </tr>`
            )
            .join("")
        : '<tr><td colspan="8" class="muted">لا توجد طلبات مطابقة.</td></tr>';
      renderPagination(pagination.id, meta, (page) => {
        state.page = page;
        load();
      });
    } catch (error) {
      if (seq !== listSeq) return;
      listBody.innerHTML = `<tr><td colspan="8"><div class="alert error" role="alert">${escapeHtml(error.message)} <button type="button" class="btn secondary" data-cr-list-retry="1">إعادة المحاولة</button></div></td></tr>`;
    }
  }

  async function loadStaffDirectory() {
    if (staffDirectory || !can("assign")) return staffDirectory || [];
    try {
      const { data } = await api.get("/users");
      staffDirectory = data.filter((u) => u.status === "ACTIVE" && ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"].includes(u.role));
    } catch (error) {
      staffDirectory = [];
    }
    return staffDirectory;
  }

  function documentsHtml(r) {
    const docs = (r.documents || []).filter((d) => !d.supersededAt);
    if (!docs.length) return '<p class="muted">لم يرفع العميل مستندات.</p>';
    const traveler = (id) => (r.travelers || []).find((t) => t.id === id);
    return `<div class="table-scroll"><table>
      <thead><tr><th>المستند</th><th>المسافر</th><th>الحالة</th><th>إجراء</th></tr></thead>
      <tbody>${docs
        .map((d) => {
          const t = traveler(d.travelerId);
          const controls =
            can("work") && d.status === "PENDING"
              ? `<div class="stack wrap">
                  <button type="button" class="btn secondary" data-doc-accept="${escapeHtml(d.id)}">قبول</button>
                  <label class="sr-only" for="reject-note-${escapeHtml(d.id)}">سبب الرفض</label>
                  <input id="reject-note-${escapeHtml(d.id)}" placeholder="سبب الرفض" maxlength="500" style="max-width: 180px" />
                  <button type="button" class="btn secondary" data-doc-reject="${escapeHtml(d.id)}">رفض</button>
                </div>`
              : d.reviewNote
                ? `<span class="muted small">${escapeHtml(d.reviewNote)}</span>`
                : "";
          return `<tr>
            <td><a href="/api/contact-requests/${encodeURIComponent(r.id)}/documents/${encodeURIComponent(d.id)}/file" target="_blank" rel="noopener">${escapeHtml(d.label)}</a></td>
            <td>${escapeHtml(t?.fullName || t?.name || "-")}</td>
            <td><span class="badge">${escapeHtml(CR_DOC_STATUS_AR[d.status] || d.status)}</span></td>
            <td>${controls}</td>
          </tr>`;
        })
        .join("")}</tbody></table></div>`;
  }

  function pricingHtml(r) {
    const parts = [];
    if (r.invoice) {
      parts.push(`<p>السعر: <strong>${formatMoney(r.invoice.amount, r.invoice.currency)}</strong> — ${statusBadge(r.invoice.status)}${r.invoice.description ? ` · ${escapeHtml(r.invoice.description)}` : ""}</p>`);
    }
    if ((r.offers || []).length) {
      parts.push(`<ul class="plain-list">${r.offers
        .map((o) => `<li>${escapeHtml(o.carrier)}: ${formatMoney(o.amount, o.currency)} ${o.id === r.selectedOfferId ? '<span class="badge status-APPROVED">اختاره العميل</span>' : ""}</li>`)
        .join("")}</ul>`);
    }
    if (!parts.length) parts.push('<p class="muted">لم يُحدد سعر بعد.</p>');

    const canPrice = can("work") && r.status !== "CLOSED" && r.invoice?.status !== "APPROVED" && !r.selectedOfferId;
    if (canPrice) {
      const currencyOptions = CR_CURRENCIES.map((c) => `<option value="${c}" ${(r.invoice?.currency || "SAR") === c ? "selected" : ""}>${c}</option>`).join("");
      parts.push(`
        <form class="card inset" data-cr-form="${r.offers?.length ? "offer" : "invoice"}">
          <h4>${r.offers?.length ? "إضافة عرض آخر" : r.invoice ? "تحديث السعر" : "تحديد السعر أو إضافة عرض"}</h4>
          <div class="grid cols-4">
            ${r.invoice ? "" : `<div class="field"><label for="cr-price-kind">النوع</label><select id="cr-price-kind" name="kind"><option value="invoice">سعر واحد</option><option value="offer">عرض من ناقل/جهة</option></select></div>`}
            <div class="field"><label for="cr-carrier">الناقل/الجهة (للعروض)</label><input id="cr-carrier" name="carrier" maxlength="120" /></div>
            <div class="field"><label for="cr-amount">المبلغ</label><input id="cr-amount" name="amount" type="number" min="0.01" step="0.01" required value="${r.invoice ? escapeHtml(r.invoice.amount) : ""}" /></div>
            <div class="field"><label for="cr-currency">العملة</label><select id="cr-currency" name="currency">${currencyOptions}</select></div>
          </div>
          <button type="submit" class="btn">حفظ</button>
        </form>`);
    }
    return parts.join("");
  }

  function paymentHtml(r) {
    const lines = [`<p>حالة الدفع: ${crPaymentBadge(r.paymentStatus)}${r.paymentConfirmedAt ? ` · ${formatDateTime(r.paymentConfirmedAt)}` : ""}</p>`];
    if (r.paymentStatus === "UNDER_REVIEW" && can("confirmPayment")) {
      lines.push(`<button type="button" class="btn" data-cr-confirm-payment="1">تأكيد استلام الدفع</button>`);
    } else if (r.paymentStatus === "UNDER_REVIEW") {
      lines.push('<p class="muted small">تأكيد الدفع من صلاحيات المحاسبة أو الإدارة.</p>');
    }
    return lines.join("");
  }

  function deliverablesHtml(r) {
    const list = (r.deliverables || []).length
      ? `<ul class="plain-list">${r.deliverables
          .map((d) => `<li><a href="/api/contact-requests/${encodeURIComponent(r.id)}/deliverables/${encodeURIComponent(d.id)}/file" target="_blank" rel="noopener">${escapeHtml(d.label)}</a> <span class="muted small">${formatDateTime(d.createdAt)}</span></li>`)
          .join("")}</ul>`
      : '<p class="muted">لم يُسلّم ملف نهائي بعد.</p>';
    const form = can("work") && r.status !== "CLOSED"
      ? `<form class="card inset" data-cr-form="deliverable">
          <h4>تسليم ملف نهائي للعميل</h4>
          <div class="grid cols-3">
            <div class="field"><label for="cr-deliverable-label">اسم الملف</label><input id="cr-deliverable-label" name="label" required maxlength="120" placeholder="التأشيرة، التذكرة..." /></div>
            <div class="field"><label for="cr-deliverable-file">الملف (PDF أو صورة)</label><input id="cr-deliverable-file" name="file" type="file" accept=".pdf,image/jpeg,image/png,image/webp" required /></div>
          </div>
          <button type="submit" class="btn">رفع وتسليم</button>
        </form>`
      : "";
    return list + form;
  }

  function statusControlsHtml(r) {
    if (r.status === "CLOSED") {
      if (!can("reopen")) return '<p class="muted small">إعادة فتح الطلب من صلاحيات الإدارة.</p>';
      return `<form class="card inset" data-cr-form="reopen">
        <h4>إعادة فتح الطلب</h4>
        <div class="field"><label for="cr-reopen-reason">سبب إعادة الفتح (إلزامي)</label><input id="cr-reopen-reason" name="reason" required minlength="5" maxlength="1000" /></div>
        <button type="submit" class="btn secondary">إعادة الفتح</button>
      </form>`;
    }
    if (!can("work")) return "";
    return `<div class="stack wrap">
        ${r.status === "NEW" ? '<button type="button" class="btn secondary" data-cr-contacted="1">تم التواصل مع العميل</button>' : ""}
      </div>
      <form class="card inset" data-cr-form="close">
        <h4>إغلاق الطلب</h4>
        <div class="grid cols-3">
          <div class="field"><label for="cr-outcome">النتيجة</label>
            <select id="cr-outcome" name="outcome">
              <option value="COMPLETED">مكتمل (تم تقديم الخدمة)</option>
              <option value="CANCELLED">ملغي (انسحب العميل)</option>
              <option value="REJECTED">مرفوض (غير مؤهل/غير ممكن)</option>
            </select></div>
          <div class="field"><label for="cr-outcome-note">ملاحظة${r.paymentStatus === "CONFIRMED" ? " (إلزامية عند الإلغاء/الرفض بعد الدفع)" : ""}</label><input id="cr-outcome-note" name="outcomeNote" maxlength="2000" /></div>
        </div>
        <button type="submit" class="btn">إغلاق</button>
      </form>`;
  }

  async function assignmentHtml(r) {
    const assigned = escapeHtml(r.assignedUser?.fullName || "غير مُسند");
    if (!can("assign")) return `<p>المسؤول: <strong>${assigned}</strong></p>`;
    const staff = await loadStaffDirectory();
    const options = [`<option value="">— غير مُسند —</option>`]
      .concat(staff.map((u) => `<option value="${escapeHtml(u.id)}" ${u.id === r.assignedUserId ? "selected" : ""}>${escapeHtml(u.fullName)}</option>`))
      .join("");
    return `<form class="stack wrap" data-cr-form="assign">
      <label for="cr-assignee">المسؤول</label>
      <select id="cr-assignee" name="assignedUserId" style="max-width: 240px">${options}</select>
      <button type="submit" class="btn secondary">حفظ الإسناد</button>
    </form>`;
  }

  async function notesAndTimelineHtml(r) {
    if (!can("timeline")) return "";
    const [notes, timeline] = await Promise.all([
      api.get(`/contact-requests/${encodeURIComponent(r.id)}/notes`).then((p) => p.data || []).catch(() => null),
      api.get(`/contact-requests/${encodeURIComponent(r.id)}/timeline`).then((p) => p.data || []).catch(() => null),
    ]);
    const notesList = notes === null
      ? '<p class="muted">تعذر تحميل الملاحظات.</p>'
      : notes.length
        ? `<ul class="plain-list">${notes.map((n) => `<li><strong>${escapeHtml(n.author?.fullName || "-")}</strong> <span class="muted small">${formatDateTime(n.createdAt)}</span><div class="pre-wrap">${escapeHtml(n.body)}</div></li>`).join("")}</ul>`
        : '<p class="muted">لا توجد ملاحظات داخلية.</p>';
    const timelineList = timeline === null
      ? '<p class="muted">تعذر تحميل السجل.</p>'
      : timeline.length
        ? `<ul class="plain-list">${timeline.map((t) => `<li>${formatDateTime(t.createdAt)} — ${escapeHtml((typeof ACTIVITY_ACTION_LABELS_AR !== "undefined" && ACTIVITY_ACTION_LABELS_AR[t.action]) || t.action)}${t.user?.fullName ? ` · ${escapeHtml(t.user.fullName)}` : ""}${t.newValue?.reason ? ` · السبب: ${escapeHtml(t.newValue.reason)}` : ""}</li>`).join("")}</ul>`
        : '<p class="muted">لا يوجد سجل.</p>';
    return `
      <h3>ملاحظات داخلية</h3>
      ${notesList}
      <form class="stack wrap" data-cr-form="note">
        <label for="cr-note" class="sr-only">ملاحظة جديدة</label>
        <textarea id="cr-note" name="body" rows="2" minlength="2" maxlength="4000" placeholder="اكتب ملاحظة للفريق (لا تظهر للعميل)" required></textarea>
        <button type="submit" class="btn secondary">إضافة ملاحظة</button>
      </form>
      <h3>سجل الإجراءات</h3>
      ${timelineList}`;
  }

  async function renderDetail(r, seq) {
    const travelers = (r.travelers || [])
      .map((t, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(t.fullName || t.name || "-")}</td><td dir="ltr">${escapeHtml(t.passportNo || "-")}</td><td>${escapeHtml(t.nationality || "-")}</td></tr>`)
      .join("");
    const [assignment, extra] = await Promise.all([assignmentHtml(r), notesAndTimelineHtml(r)]);
    if (seq !== detailSeq) return;
    const link = `${window.location.origin}/admin-dashboard.html#/requests/${encodeURIComponent(r.id)}`;
    detailCard.innerHTML = `
      <div class="detail-header">
        <div>
          <h2 tabindex="-1" id="cr-detail-title">طلب <span dir="ltr">${escapeHtml(crReference(r.id))}</span></h2>
          <p class="muted">${escapeHtml(r.name)} · <span dir="ltr">${escapeHtml(r.phone)}</span>${r.email ? ` · <span dir="ltr">${escapeHtml(r.email)}</span>` : ""}</p>
          <p class="muted small">المرجع الكامل: <span dir="ltr">${escapeHtml(r.id)}</span> · <a href="${escapeHtml(link)}">رابط مباشر</a></p>
        </div>
        <div>${crStatusBadge(r)} ${crPaymentBadge(r.paymentStatus)}</div>
        <button type="button" class="btn secondary" data-cr-close="1">إغلاق</button>
      </div>
      <div id="cr-action-alert" aria-live="polite"></div>
      <dl class="detail-grid">
        <div><dt>الخدمة</dt><dd>${escapeHtml(r.serviceRef?.name || r.service || "استفسار")}${r.visaType ? ` · ${escapeHtml(r.visaType.name)}` : ""}</dd></div>
        <div><dt>عدد المسافرين</dt><dd>${escapeHtml(r.travelerCount ?? (r.travelers || []).length ?? "-")}</dd></div>
        <div><dt>الإجراء التالي</dt><dd>${escapeHtml(crNextAction(r))}</dd></div>
        <div><dt>تاريخ الطلب</dt><dd>${formatDateTime(r.createdAt)}</dd></div>
        ${r.customer ? `<div><dt>حساب العميل</dt><dd>${escapeHtml(r.customer.customerNo || "-")}</dd></div>` : ""}
        ${r.outcomeNote ? `<div><dt>ملاحظة الإغلاق</dt><dd>${escapeHtml(r.outcomeNote)}</dd></div>` : ""}
      </dl>
      ${assignment}
      <h3>رسالة العميل</h3>
      <p class="pre-wrap">${escapeHtml(r.message || "-")}</p>
      <details><summary>بيانات النموذج</summary>${crIntakeHtml(r.intakeData)}</details>
      <h3>المسافرون</h3>
      ${travelers ? `<div class="table-scroll"><table><thead><tr><th>#</th><th>الاسم</th><th>الجواز</th><th>الجنسية</th></tr></thead><tbody>${travelers}</tbody></table></div>` : '<p class="muted">لا توجد بيانات مسافرين منفصلة.</p>'}
      <h3>مستندات العميل</h3>
      ${documentsHtml(r)}
      <h3>السعر</h3>
      ${pricingHtml(r)}
      <h3>الدفع</h3>
      ${paymentHtml(r)}
      <h3>الملفات النهائية</h3>
      ${deliverablesHtml(r)}
      <h3>الحالة</h3>
      ${statusControlsHtml(r)}
      ${extra}`;
  }

  async function openDetail(id, { focus = true } = {}) {
    const seq = ++detailSeq;
    openId = id;
    detailCard.classList.remove("hidden");
    detailCard.innerHTML = '<p class="muted">جارٍ تحميل الطلب...</p>';
    if (onOpen) onOpen(id);
    try {
      const { data } = await api.get(`/contact-requests/${encodeURIComponent(id)}`);
      if (seq !== detailSeq) return;
      current = data;
      await renderDetail(data, seq);
      if (seq !== detailSeq) return;
      if (focus) {
        detailCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
        document.getElementById("cr-detail-title")?.focus();
      }
    } catch (error) {
      if (seq !== detailSeq) return;
      detailCard.innerHTML = `<div class="alert error" role="alert">${escapeHtml(error.message)}</div>
        <button type="button" class="btn secondary" data-cr-reopen-detail="${escapeHtml(id)}">إعادة المحاولة</button>`;
    }
  }

  function closeDetail() {
    detailSeq += 1;
    openId = null;
    current = null;
    detailCard.classList.add("hidden");
    detailCard.innerHTML = "";
    if (onOpen) onOpen(null);
  }

  // Runs one write; the triggering control stays disabled until it ends, and
  // the view re-reads the request afterwards so it always shows the server's
  // state (not an optimistic guess).
  async function act(control, request, successMessage) {
    if (control.disabled) return;
    control.disabled = true;
    const id = openId;
    try {
      await request();
      await Promise.all([openDetail(id, { focus: false }), load()]);
      showAlert(document.getElementById("cr-action-alert"), successMessage, "success");
    } catch (error) {
      showAlert(document.getElementById("cr-action-alert"), error.message);
      control.disabled = false;
    }
  }

  detailCard.addEventListener("click", (event) => {
    const t = event.target;
    if (t.closest("[data-cr-close]")) return closeDetail();
    const retry = t.closest("[data-cr-reopen-detail]");
    if (retry) return openDetail(retry.dataset.crReopenDetail);
    const base = `/contact-requests/${encodeURIComponent(openId)}`;
    const accept = t.closest("[data-doc-accept]");
    if (accept) return act(accept, () => api.patch(`${base}/documents/${encodeURIComponent(accept.dataset.docAccept)}/status`, { status: "ACCEPTED" }), "تم قبول المستند.");
    const reject = t.closest("[data-doc-reject]");
    if (reject) {
      const note = document.getElementById(`reject-note-${reject.dataset.docReject}`)?.value.trim();
      if (!note) return showAlert(document.getElementById("cr-action-alert"), "اكتب سبب رفض المستند.");
      return act(reject, () => api.patch(`${base}/documents/${encodeURIComponent(reject.dataset.docReject)}/status`, { status: "REJECTED", reviewNote: note }), "تم رفض المستند وإبلاغ العميل بالسبب.");
    }
    const confirm = t.closest("[data-cr-confirm-payment]");
    if (confirm) return act(confirm, () => api.post(`${base}/confirm-payment`, {}), "تم تأكيد استلام الدفع.");
    const contacted = t.closest("[data-cr-contacted]");
    if (contacted) return act(contacted, () => api.patch(`${base}/status`, { status: "CONTACTED" }), "تم تحديث الحالة.");
  });

  detailCard.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-cr-form]");
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const base = `/contact-requests/${encodeURIComponent(openId)}`;
    const f = form.elements;
    switch (form.dataset.crForm) {
      case "invoice":
      case "offer": {
        const kind = f.kind ? f.kind.value : form.dataset.crForm;
        const amount = Number(f.amount.value);
        if (!(amount > 0)) return showAlert(document.getElementById("cr-action-alert"), "أدخل مبلغًا أكبر من صفر.");
        if (kind === "offer") {
          const carrier = f.carrier.value.trim();
          if (!carrier) return showAlert(document.getElementById("cr-action-alert"), "اكتب اسم الناقل/الجهة للعرض.");
          return act(button, () => api.post(`${base}/offers`, { carrier, amount, currency: f.currency.value }), "تم إضافة العرض.");
        }
        return act(button, () => api.post(`${base}/invoice`, { amount, currency: f.currency.value }), "تم حفظ السعر وإرساله للعميل.");
      }
      case "deliverable": {
        const file = f.file.files[0];
        if (!file || !f.label.value.trim()) return showAlert(document.getElementById("cr-action-alert"), "اكتب اسم الملف واختر الملف.");
        const data = new FormData();
        data.append("label", f.label.value.trim());
        data.append("file", file);
        return act(button, () => api.upload(`${base}/deliverables`, data), "تم رفع الملف وإتاحته للعميل.");
      }
      case "close":
        return act(button, () => api.patch(`${base}/status`, { status: "CLOSED", outcome: f.outcome.value, outcomeNote: f.outcomeNote.value.trim() || undefined }), "تم إغلاق الطلب.");
      case "reopen":
        return act(button, () => api.patch(`${base}/status`, { status: "CONTACTED", reason: f.reason.value.trim() }), "تم إعادة فتح الطلب.");
      case "assign":
        return act(button, () => api.patch(`${base}/assign`, { assignedUserId: f.assignedUserId.value || null }), "تم حفظ الإسناد.");
      case "note":
        return act(button, () => api.post(`${base}/notes`, { body: f.body.value.trim() }), "تمت إضافة الملاحظة.");
      default:
        return undefined;
    }
  });

  listBody.addEventListener("click", (event) => {
    if (event.target.closest("[data-cr-list-retry]")) return void load();
    const row = event.target.closest("[data-cr-id]");
    if (row) openDetail(row.dataset.crId);
  });

  let searchTimer = null;
  filters.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.page = 1;
      load();
    }, 350);
  });
  for (const select of [filters.status, filters.payment, filters.assignee, filters.category]) {
    select.addEventListener("change", () => {
      state.page = 1;
      load();
    });
  }

  return { load, openDetail, closeDetail, get openId() { return openId; }, get current() { return current; } };
}
