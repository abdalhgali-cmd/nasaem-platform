// Staff view of flight bookings: list (filter + search), details, documents
// and the three staff actions (provisional ticket, payment confirmation,
// final ticket). Mounted by flight-bookings.html and by the dashboard's
// "حجوزات الطيران" tab. No inline scripts or handlers (CSP), every server
// value escaped, buttons disabled while their request runs, and a detail
// response that arrives after the user opened another booking is dropped.
const FLIGHT_STATUS_LABELS_AR = {
  REQUESTED: "طلب جديد",
  RESERVATION_PENDING: "جاري الحجز المبدئي",
  PROVISIONAL_TICKET: "تم إصدار الحجز المبدئي",
  PAYMENT_PENDING: "بانتظار الدفع",
  PAYMENT_UNDER_REVIEW: "إشعار الدفع قيد المراجعة",
  PAYMENT_CONFIRMED: "تم تأكيد الدفع",
  FINAL_TICKET_ISSUED: "تم إصدار الحجز النهائي",
  CANCELLED: "ملغي",
};

const FLIGHT_NEXT_ACTION_AR = {
  REQUESTED: "رفع الحجز المبدئي",
  RESERVATION_PENDING: "رفع الحجز المبدئي",
  PAYMENT_PENDING: "بانتظار إشعار الدفع من العميل",
  PAYMENT_UNDER_REVIEW: "مراجعة إشعار الدفع (المحاسبة)",
  PAYMENT_CONFIRMED: "إصدار التذكرة النهائية",
  FINAL_TICKET_ISSUED: "مكتمل — التذكرة متاحة للعميل",
  CANCELLED: "لا إجراء",
};

// Mirrors flight-bookings.routes.js. The backend stays authoritative.
const FLIGHT_ROLE_CAN = {
  uploadTickets: ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"],
  confirmPayment: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"],
};

function flightStatusBadge(status) {
  const label = FLIGHT_STATUS_LABELS_AR[status] || status || "-";
  const safeClass = String(status || "").replace(/[^A-Z_]/g, "");
  return `<span class="badge flight-status-${safeClass}">${escapeHtml(label)}</span>`;
}

function flightStaffFileUrl(id, kind) {
  // Staff-only path (session cookie). The plain /file/:kind route is the
  // customer's and requires the customer's phone number.
  return `/api/flight-bookings/${encodeURIComponent(id)}/staff-file/${encodeURIComponent(kind)}`;
}

function createFlightBookingsView({ user, listBody, statusFilter, searchInput, detailCard, alertBox, onOpen }) {
  let bookings = [];
  let detailSeq = 0;
  let openId = null;

  const can = (action) => FLIGHT_ROLE_CAN[action].includes(user.role);

  function matchesSearch(b, term) {
    if (!term) return true;
    const haystack = [b.booking_number, b.customer_name, b.customer_phone, b.order_id].join(" ").toLowerCase();
    return haystack.includes(term.toLowerCase());
  }

  function renderList() {
    const term = (searchInput?.value || "").trim();
    const rows = bookings.filter((b) => matchesSearch(b, term));
    listBody.innerHTML = rows.length
      ? rows
          .map(
            (b) => `
        <tr data-flight-booking-id="${escapeHtml(b.id)}" class="clickable-row">
          <td><button type="button" class="link-button" data-flight-booking-id="${escapeHtml(b.id)}" aria-label="فتح الحجز ${escapeHtml(b.booking_number)}" dir="ltr">${escapeHtml(b.booking_number)}</button></td>
          <td>${escapeHtml(b.customer_name || "-")}<br><small dir="ltr">${escapeHtml(b.customer_phone || "")}</small></td>
          <td>${formatMoney(b.amount, b.currency)}</td>
          <td>${flightStatusBadge(b.status)}</td>
          <td>${escapeHtml(FLIGHT_NEXT_ACTION_AR[b.status] || "-")}</td>
          <td>${formatDate(b.created_at)}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="6" class="muted">${term ? "لا توجد نتائج مطابقة للبحث." : "لا توجد حجوزات بهذه الحالة."}</td></tr>`;
  }

  async function load() {
    listBody.innerHTML = '<tr><td colspan="6" class="muted">جارٍ التحميل...</td></tr>';
    try {
      const status = statusFilter?.value || "";
      const response = await api.get(`/flight-bookings/admin/list${status ? `?status=${encodeURIComponent(status)}` : ""}`);
      bookings = response.bookings || [];
      renderList();
    } catch (error) {
      listBody.innerHTML = `<tr><td colspan="6"><div class="alert error" role="alert">${escapeHtml(error.message)} <button type="button" class="btn secondary" data-flight-retry="1">إعادة المحاولة</button></div></td></tr>`;
    }
  }

  function documentLink(b, kind, label, emptyText) {
    const field = { provisional: "provisional_ticket_path", receipt: "payment_receipt_path", final: "final_ticket_path" }[kind];
    if (!b[field]) return `<span class="muted">${escapeHtml(emptyText)}</span>`;
    return `<a class="btn secondary" href="${flightStaffFileUrl(b.id, kind)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
  }

  function renderDetail(b) {
    const passengers = Array.isArray(b.passengers) ? b.passengers : [];
    const passengerRows = passengers
      .map(
        (p, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(`${p.firstName || ""} ${p.lastName || ""}`.trim() || "-")}</td><td>${escapeHtml(p.nationality || "-")}</td><td dir="ltr">${escapeHtml(p.passportNo || "-")}</td><td>${escapeHtml(p.birthDate || "-")}</td></tr>`
      )
      .join("");

    const actions = [];
    if (can("uploadTickets") && ["REQUESTED", "RESERVATION_PENDING"].includes(b.status)) {
      actions.push(`<form class="stack" data-flight-action="provisional">
        <label for="fb-provisional-file">رفع الحجز المبدئي (PDF أو صورة)</label>
        <input id="fb-provisional-file" name="file" type="file" accept=".pdf,image/jpeg,image/png,image/webp" required />
        <button class="btn" type="submit">رفع وإتاحته للعميل</button>
      </form>`);
    }
    if (can("confirmPayment") && b.status === "PAYMENT_UNDER_REVIEW") {
      actions.push(`<form class="stack" data-flight-action="confirm-payment">
        <label for="fb-payment-note">ملاحظة التحقق من الدفع (اختياري)</label>
        <input id="fb-payment-note" name="note" maxlength="500" />
        <button class="btn" type="submit">تأكيد استلام الدفع</button>
      </form>`);
    }
    if (can("uploadTickets") && b.status === "PAYMENT_CONFIRMED") {
      actions.push(`<form class="stack" data-flight-action="final">
        <label for="fb-final-file">رفع التذكرة النهائية (PDF أو صورة)</label>
        <input id="fb-final-file" name="file" type="file" accept=".pdf,image/jpeg,image/png,image/webp" required />
        <button class="btn" type="submit">إصدار الحجز النهائي</button>
      </form>`);
    }

    detailCard.innerHTML = `
      <div class="detail-header">
        <div>
          <h2 tabindex="-1" id="flight-detail-title">الحجز <span dir="ltr">${escapeHtml(b.booking_number)}</span></h2>
          <p class="muted">${escapeHtml(b.customer_name || "-")} · <span dir="ltr">${escapeHtml(b.customer_phone || "-")}</span></p>
        </div>
        <div>${flightStatusBadge(b.status)}</div>
        <button type="button" class="btn secondary" data-flight-close="1">إغلاق</button>
      </div>
      <dl class="detail-grid">
        <div><dt>المبلغ</dt><dd>${formatMoney(b.amount, b.currency)}</dd></div>
        <div><dt>الإجراء التالي</dt><dd>${escapeHtml(FLIGHT_NEXT_ACTION_AR[b.status] || "-")}</dd></div>
        <div><dt>تاريخ الطلب</dt><dd>${formatDateTime(b.created_at)}</dd></div>
        <div><dt>آخر تحديث</dt><dd>${formatDateTime(b.updated_at)}</dd></div>
        ${b.payment_review_note ? `<div><dt>ملاحظة مراجعة الدفع</dt><dd>${escapeHtml(b.payment_review_note)}</dd></div>` : ""}
      </dl>
      <h3>المسافرون</h3>
      <div class="table-scroll"><table>
        <thead><tr><th>#</th><th>الاسم</th><th>الجنسية</th><th>الجواز</th><th>الميلاد</th></tr></thead>
        <tbody>${passengerRows || '<tr><td colspan="5" class="muted">لا توجد بيانات.</td></tr>'}</tbody>
      </table></div>
      <h3>المستندات</h3>
      <div class="stack wrap">
        <div><strong>الحجز المبدئي:</strong> ${documentLink(b, "provisional", "عرض الحجز المبدئي", "لم يُرفع بعد")}</div>
        <div><strong>إشعار الدفع:</strong> ${documentLink(b, "receipt", "عرض إشعار الدفع", "لم يرفعه العميل")}</div>
        <div><strong>التذكرة النهائية:</strong> ${documentLink(b, "final", "عرض التذكرة النهائية", "لم تصدر بعد")}</div>
      </div>
      <div id="flight-action-alert" aria-live="polite"></div>
      <h3>إجراءات الموظف</h3>
      <div class="stack wrap">${actions.join("") || '<p class="muted">لا توجد إجراءات متاحة لك في هذه المرحلة.</p>'}</div>`;
  }

  async function openDetail(id, { focus = true } = {}) {
    const seq = ++detailSeq;
    openId = id;
    detailCard.classList.remove("hidden");
    detailCard.innerHTML = '<p class="muted">جارٍ تحميل بيانات الحجز...</p>';
    if (onOpen) onOpen(id);
    try {
      const response = await api.get(`/flight-bookings/${encodeURIComponent(id)}`);
      if (seq !== detailSeq) return; // a newer booking was opened meanwhile
      renderDetail(response.booking);
      if (focus) {
        detailCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
        document.getElementById("flight-detail-title")?.focus();
      }
    } catch (error) {
      if (seq !== detailSeq) return;
      detailCard.innerHTML = `<div class="alert error" role="alert">${escapeHtml(error.message)}</div>
        <button type="button" class="btn secondary" data-flight-reopen="${escapeHtml(id)}">إعادة المحاولة</button>`;
    }
  }

  function closeDetail() {
    detailSeq += 1;
    openId = null;
    detailCard.classList.add("hidden");
    detailCard.innerHTML = "";
    if (onOpen) onOpen(null);
  }

  async function runAction(form) {
    const button = form.querySelector('button[type="submit"]');
    if (button.disabled) return;
    const kind = form.dataset.flightAction;
    const id = openId;
    const actionAlert = document.getElementById("flight-action-alert");
    button.disabled = true;
    try {
      if (kind === "confirm-payment") {
        await api.post(`/flight-bookings/${encodeURIComponent(id)}/confirm-payment`, { note: form.elements.note.value.trim() });
      } else {
        const file = form.elements.file.files[0];
        if (!file) throw new Error("اختر الملف أولًا.");
        const data = new FormData();
        data.append("file", file);
        const path = kind === "provisional" ? "provisional-ticket" : "final-ticket";
        await api.upload(`/flight-bookings/${encodeURIComponent(id)}/${path}`, data);
      }
      await Promise.all([openDetail(id, { focus: false }), load()]);
      showAlert(document.getElementById("flight-action-alert"), "تم تنفيذ الإجراء بنجاح.", "success");
    } catch (error) {
      showAlert(actionAlert, error.message);
      button.disabled = false;
    }
  }

  listBody.addEventListener("click", (event) => {
    if (event.target.closest("[data-flight-retry]")) return void load();
    const target = event.target.closest("[data-flight-booking-id]");
    if (target) openDetail(target.dataset.flightBookingId);
  });
  detailCard.addEventListener("click", (event) => {
    if (event.target.closest("[data-flight-close]")) closeDetail();
    const reopen = event.target.closest("[data-flight-reopen]");
    if (reopen) openDetail(reopen.dataset.flightReopen);
  });
  detailCard.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-flight-action]");
    if (!form) return;
    event.preventDefault();
    runAction(form);
  });
  statusFilter?.addEventListener("change", load);
  let searchTimer = null;
  searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderList, 200);
  });

  return { load, openDetail, closeDetail, get openId() { return openId; } };
}
