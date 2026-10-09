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

function flightStatusBadge(status) {
  return `<span class="badge">${FLIGHT_STATUS_LABELS_AR[status] || status}</span>`;
}

function flightFileUrl(id, kind) {
  // Staff-only path (requires the logged-in staff session cookie) — the
  // plain /file/:kind route now requires the customer's phone number to
  // prevent one customer from downloading another customer's documents.
  return `/api/flight-bookings/${encodeURIComponent(id)}/staff-file/${kind}`;
}

function flightFormData(file) {
  const data = new FormData();
  data.append("file", file);
  return data;
}

async function loadFlightBookings() {
  const status = el("flight-status-filter")?.value || "";
  try {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const response = await api.get(`/flight-bookings/admin/list${query}`);
    const bookings = response.data?.bookings || response.bookings || [];
    el("flight-bookings-body").innerHTML = bookings.map((b) => `
      <tr>
        <td><strong>${b.booking_number}</strong></td>
        <td>${b.customer_name || "-"}<br><small>${b.customer_phone || ""}</small></td>
        <td>${Number(b.amount || 0).toLocaleString()} ${b.currency || "SDG"}</td>
        <td>${flightStatusBadge(b.status)}</td>
        <td>${formatDate(b.created_at)}</td>
        <td><button type="button" class="btn secondary" data-flight-booking-id="${b.id}">عرض وإدارة</button></td>
      </tr>`).join("") || `<tr><td colspan="6">لا توجد حجوزات.</td></tr>`;
  } catch (error) {
    showAlert(pageAlert, error.message);
  }
}

async function openFlightBookingDetail(id) {
  const card = el("flight-booking-detail");
  card.classList.remove("hidden");
  card.innerHTML = "<p>جارٍ تحميل بيانات الحجز...</p>";
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  try {
    const response = await api.get(`/flight-bookings/${id}`);
    const b = response.data?.booking || response.booking;
    if (!b) throw new Error("تعذر العثور على الحجز");
    renderFlightBookingDetail(b);
  } catch (error) {
    card.innerHTML = `<div class="alert error">${error.message}</div>`;
  }
}

function renderFlightBookingDetail(b) {
  const card = el("flight-booking-detail");
  const passengers = Array.isArray(b.passengers) ? b.passengers : [];
  const passengerRows = passengers.map((p, i) => `<tr><td>${i + 1}</td><td>${p.firstName || ""} ${p.lastName || ""}</td><td>${p.nationality || "-"}</td><td>${p.passportNo || "-"}</td><td>${p.birthDate || "-"}</td></tr>`).join("");
  const provisional = b.provisional_ticket_path ? `<a class="btn secondary" href="${flightFileUrl(b.id, "provisional")}" target="_blank">عرض الحجز المبدئي</a>` : "<span class="muted">لم يتم رفعه بعد</span>";
  const receipt = b.payment_receipt_path ? `<a class="btn secondary" href="${flightFileUrl(b.id, "receipt")}" target="_blank">عرض إشعار الدفع</a>` : "<span class="muted">لم يرفع العميل الإشعار</span>";
  const finalTicket = b.final_ticket_path ? `<a class="btn secondary" href="${flightFileUrl(b.id, "final")}" target="_blank">عرض التذكرة النهائية</a>` : "<span class="muted">لم تصدر بعد</span>";

  card.innerHTML = `
    <div class="stack" style="justify-content:space-between">
      <div><h2 style="margin:0">الحجز ${b.booking_number}</h2><p class="muted">${b.customer_name || "-"} · ${b.customer_phone || "-"}</p></div>
      <div>${flightStatusBadge(b.status)}</div>
      <button type="button" class="btn secondary" id="close-flight-detail">إغلاق</button>
    </div>
    <div class="card" style="margin-top:14px;background:var(--surface-2,#f8fafc)">
      <p><strong>المبلغ:</strong> ${Number(b.amount || 0).toLocaleString()} ${b.currency || "SDG"}</p>
      <p><strong>بيانات العميل:</strong> ${b.customer_name || "-"} — ${b.customer_phone || "-"}</p>
      <p><strong>المرحلة:</strong> ${b.statusLabel || FLIGHT_STATUS_LABELS_AR[b.status] || b.status}</p>
    </div>
    <h3>المسافرون</h3>
    <table><thead><tr><th>#</th><th>الاسم</th><th>الجنسية</th><th>الجواز</th><th>الميلاد</th></tr></thead><tbody>${passengerRows || '<tr><td colspan="5">لا توجد بيانات.</td></tr>'}</tbody></table>
    <h3>المستندات</h3>
    <div class="stack" style="flex-wrap:wrap"><div><strong>الحجز المبدئي:</strong> ${provisional}</div><div><strong>إشعار الدفع:</strong> ${receipt}</div><div><strong>التذكرة النهائية:</strong> ${finalTicket}</div></div>
    <div id="flight-action-alert" style="margin-top:14px"></div>
    <hr/>
    <h3>إجراءات الموظف</h3>
    <div class="stack" style="flex-wrap:wrap">
      <div><label>1. رفع الحجز المبدئي</label><input type="file" id="provisional-file" accept=".pdf,image/*"/><button class="btn" id="upload-provisional">رفع الحجز المبدئي</button></div>
      ${["PAYMENT_UNDER_REVIEW"].includes(b.status) ? `<div><label>2. مراجعة الدفع</label><input id="payment-review-note" placeholder="ملاحظة التحقق (اختياري)"/><button class="btn" id="confirm-flight-payment">✓ تأكيد الدفع</button></div>` : ""}
      ${b.status === "PAYMENT_CONFIRMED" ? `<div><label>3. إصدار الحجز النهائي</label><input type="file" id="final-ticket-file" accept=".pdf,image/*"/><button class="btn" id="issue-final-ticket">إصدار الحجز النهائي</button></div>` : ""}
    </div>
  `;

  el("close-flight-detail").onclick = () => { card.classList.add("hidden"); card.innerHTML = ""; };
  el("upload-provisional").onclick = async () => {
    const file = el("provisional-file").files[0];
    if (!file) return showAlert(el("flight-action-alert"), "اختر ملف الحجز المبدئي أولاً.");
    await flightAction(`/flight-bookings/${b.id}/provisional-ticket`, "POST", flightFormData(file), b.id);
  };
  if (el("confirm-flight-payment")) el("confirm-flight-payment").onclick = async () => {
    await flightAction(`/flight-bookings/${b.id}/confirm-payment`, "POST", { note: el("payment-review-note").value.trim() }, b.id);
  };
  if (el("issue-final-ticket")) el("issue-final-ticket").onclick = async () => {
    const file = el("final-ticket-file").files[0];
    if (!file) return showAlert(el("flight-action-alert"), "اختر التذكرة النهائية أولاً.");
    await flightAction(`/flight-bookings/${b.id}/final-ticket`, "POST", flightFormData(file), b.id);
  };
}

async function flightAction(path, method, body, id) {
  try {
    const options = { method, body };
    if (!(body instanceof FormData)) {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(body);
    }
    await api.request(path, options);
    showAlert(el("flight-action-alert"), "تم تنفيذ العملية بنجاح.");
    await openFlightBookingDetail(id);
    await loadFlightBookings();
  } catch (error) {
    showAlert(el("flight-action-alert"), error.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const originalLoadActiveTabData = window.loadActiveTabData;
  window.loadActiveTabData = function () {
    if (typeof originalLoadActiveTabData === "function") originalLoadActiveTabData();
    if (activeTabKey() === "flight-bookings") loadFlightBookings();
  };
  document.addEventListener("click", (e) => {
    const button = e.target.closest("[data-flight-booking-id]");
    if (button) openFlightBookingDetail(button.dataset.flightBookingId);
  });
  el("flight-status-filter")?.addEventListener("change", loadFlightBookings);
});
