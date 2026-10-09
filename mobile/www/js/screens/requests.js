import { api, ApiError, getToken } from "../api.js";
import { CONFIG } from "../config.js";
import { esc, money, toast, skeletonList, emptyState, errorState, setLoading } from "../ui.js";
import { icon } from "../icons.js";
import { go } from "../router.js";
import * as tracking from "../tracking.js";
import { showOtpSupport } from "../otp-support.js";
import { getCustomer, isAccountUnlocked, getSessionState, SessionState } from "../auth.js";

// ContactRequest.status (the case lifecycle a staff member works) only has
// these three values — everything a customer actually cares about day to
// day (reviewed? waiting on documents? priced? paid?) lives in nextAction/
// outcome/paymentStatus instead, which is why the list/detail views below
// lead with nextAction rather than this label. Order.status is a separate,
// richer enum (used only by orderDetail further down this file).
const REQUEST_STATUS_AR = { NEW: "جديد", CONTACTED: "تم التواصل", CLOSED: "مغلق" };
const REQUEST_OUTCOME_AR = { COMPLETED: "مكتمل", REJECTED: "مرفوض", CANCELLED: "ملغي" };
const ORDER_STATUS_AR = {
  NEW: "جديد",
  UNDER_REVIEW: "قيد المراجعة",
  WAITING_DOCUMENTS: "بانتظار المستندات",
  PAYMENT_PENDING: "بانتظار الدفع",
  PROCESSING: "قيد التنفيذ",
  APPROVED: "معتمد",
  COMPLETED: "مكتمل",
  REJECTED: "مرفوض",
  CANCELLED: "ملغي",
};
const DOCUMENT_STATUS_AR = { PENDING: "قيد المراجعة", APPROVED: "مقبول", REJECTED: "مرفوض" };
const PAYMENT_STATUS_AR = { UNPAID: "غير مدفوع", PARTIAL: "مدفوع جزئياً", PAID: "مدفوع", REFUNDED: "مسترد" };
// Every logActivity({action: "..."}) the backend can write for a
// ContactRequest (see contact-requests/contact-request-tracking modules) —
// shown to the customer as their own request's timeline, so a raw
// SCREAMING_SNAKE_CASE code must never leak through untranslated.
const TIMELINE_ACTION_AR = {
  CONTACT_REQUEST_RECEIVED: "تم استلام طلبك",
  CONTACT_REQUEST_STATUS_CHANGED: "تم تحديث حالة الطلب",
  CONTACT_REQUEST_DOCUMENT_UPLOADED: "تم رفع مستند",
  CONTACT_REQUEST_DOCUMENT_REVIEWED: "تمت مراجعة مستند",
  CONTACT_REQUEST_INVOICE_SET: "تم إرسال السعر من الوكالة",
  CONTACT_REQUEST_INVOICE_APPROVED: "تمت الموافقة على السعر",
  CONTACT_REQUEST_INVOICE_REJECTED: "تم رفض السعر",
  CONTACT_REQUEST_OFFER_ADDED: "تمت إضافة عرض جديد",
  CONTACT_REQUEST_OFFER_SELECTED: "تم اختيار عرض",
  CONTACT_REQUEST_PAYMENT_RECEIPT_UPLOADED: "تم رفع إثبات الدفع",
  CONTACT_REQUEST_PAYMENT_CONFIRMED: "تم تأكيد الدفع",
  CONTACT_REQUEST_TRANSFER_MARKED_SENT: "تم إعلام الوكالة بالتحويل",
  CONTACT_REQUEST_DELIVERABLE_UPLOADED: "تم رفع ملف نهائي",
  CONTACT_REQUEST_AUTO_COMPLETED: "تم إكمال الطلب",
  EGYPT_CLEARANCE_TRAVEL_PLAN_UPDATED: "تم حفظ بيانات السفر",
};

function timelineLabel(action) {
  return TIMELINE_ACTION_AR[action] || action;
}

function requestStatusLabel(request) {
  if (request.status === "CLOSED" && request.outcome) return REQUEST_OUTCOME_AR[request.outcome] || request.outcome;
  return REQUEST_STATUS_AR[request.status] || request.status;
}

function statusLabel(status) {
  return ORDER_STATUS_AR[status] || status;
}

// The Requests tab: the account's requests when the account is unlocked
// and verified; otherwise phone-verified guest tracking. The banner always
// says which of the two is on screen.
export async function renderRequestsTabScreen(ctx) {
  if (isAccountUnlocked()) return renderMyRequestsScreen(ctx);
  return renderGuestTrackingScreen(ctx);
}

export async function renderMyRequestsScreen({ bodyEl }) {
  bodyEl.innerHTML = `
    <p class="mode-banner">${icon("user", { size: 16 })}<span>طلبات حسابك</span></p>
    <div class="segmented" id="requestsFilter">
      <button class="segmented-btn active" data-filter="current">الحالية</button>
      <button class="segmented-btn" data-filter="past">السابقة</button>
    </div>
    <div id="requestsList" class="list">${skeletonList(4)}</div>
    <button class="link-btn track-other-btn" id="trackOtherBtn">تتبع طلب أُرسل برقم هاتف آخر</button>
  `;
  bodyEl.querySelector("#trackOtherBtn").addEventListener("click", () => go("guestTracking", {}, { title: "تتبع برقم الهاتف", tab: "requests" }));

  let all = [];
  const listEl = bodyEl.querySelector("#requestsList");

  async function load() {
    try {
      const res = await api("/customer/requests?limit=100");
      all = res.data || [];
      renderFilter(bodyEl.querySelector(".segmented-btn.active").dataset.filter);
    } catch (error) {
      listEl.innerHTML = errorState(error.message, { onRetry: load });
    }
  }

  function renderFilter(filter) {
    const items = all.filter((request) => (filter === "current" ? request.status !== "CLOSED" : request.status === "CLOSED"));
    if (!items.length) {
      listEl.innerHTML = emptyState({
        icon: "requests",
        title: filter === "current" ? "لا توجد طلبات حالية" : "لا توجد طلبات سابقة",
        hint: filter === "current" ? "ابدأ طلبًا جديدًا من الصفحة الرئيسية." : "",
      });
      return;
    }
    listEl.innerHTML = items.map((request) => `
      <button class="list-item request-row" data-id="${esc(request.id)}">
        <div class="list-item-icon">${icon("requests", { size: 20 })}</div>
        <div class="list-item-body">
          <strong>${esc(request.service?.name || request.visaType?.name || "طلب خدمة")}</strong>
          <p>${esc(request.nextAction || "")}</p>
        </div>
        <span class="status-pill">${esc(requestStatusLabel(request))}</span>
      </button>`).join("");
    listEl.querySelectorAll(".request-row").forEach((row) => {
      row.addEventListener("click", () => go("requestDetail", { requestId: row.dataset.id }, { title: "تفاصيل الطلب", tab: "requests" }));
    });
  }

  bodyEl.querySelector("#requestsFilter").addEventListener("click", (event) => {
    const btn = event.target.closest(".segmented-btn");
    if (!btn) return;
    bodyEl.querySelectorAll(".segmented-btn").forEach((b) => b.classList.toggle("active", b === btn));
    renderFilter(btn.dataset.filter);
  });

  await load();
}

// ---- Guest tracking (no account) -------------------------------------------
// Requests are shown only after the phone is proven with a WhatsApp code
// (POST /tracking/request-code → /tracking/verify-code). A request id alone
// never opens anything. The tracking token is separate from any account token.
export async function renderGuestTrackingScreen({ bodyEl }) {
  const locked = getSessionState() === SessionState.LOCKED;
  bodyEl.innerHTML = `
    <p class="mode-banner mode-banner-guest">${icon("phone", { size: 16 })}<span>متابعة برقم الهاتف — بدون حساب</span></p>
    ${locked ? `<p class="field-hint">حسابك مقفل بالبصمة. افتحه من «حسابي» لعرض طلبات الحساب.</p>` : ""}
    <div id="guestTrackingBody"></div>`;
  const container = bodyEl.querySelector("#guestTrackingBody");

  const showList = async () => {
    container.innerHTML = `<div class="list">${skeletonList(3)}</div>`;
    try {
      const requests = await tracking.listTrackedRequests();
      const phone = await tracking.getTrackedPhone();
      container.innerHTML = `
        <div class="tracking-head">
          <span>الرقم: <b dir="ltr">${esc(phone || "")}</b></span>
          <button class="link-btn" id="changePhoneBtn">تغيير الرقم</button>
        </div>
        <div class="list" id="trackedList">
          ${requests.length ? requests.map((request) => `
            <button class="list-item request-row" data-id="${esc(request.id)}">
              <div class="list-item-icon">${icon("requests", { size: 20 })}</div>
              <div class="list-item-body">
                <strong>${esc(request.serviceRef?.name || request.visaType?.name || request.service || "طلب خدمة")}</strong>
                <p>${esc(request.statusLabel || "")}</p>
                <small dir="ltr">${esc(request.id)}</small>
              </div>
            </button>`).join("") : emptyState({ icon: "requests", title: "لا توجد طلبات بهذا الرقم", hint: "تأكد أن الرقم هو نفسه المستخدم في الطلب." })}
        </div>`;
      container.querySelector("#changePhoneBtn").addEventListener("click", async () => {
        await tracking.clearTrackingSession();
        showPhoneStep();
      });
      container.querySelectorAll(".request-row").forEach((row) => {
        row.addEventListener("click", () => go("trackedRequestDetail", { requestId: row.dataset.id }, { title: "تفاصيل الطلب", tab: "requests" }));
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await tracking.clearTrackingSession();
        showPhoneStep("انتهت صلاحية التحقق، أدخل رقمك لإرسال رمز جديد.");
        return;
      }
      container.innerHTML = errorState(error.message, { onRetry: showList });
    }
  };

  const showPhoneStep = (notice = "") => {
    const prefill = tracking.takeTrackingPrefill();
    container.innerHTML = `
      <section class="form-section">
        <h3>تتبع طلبك</h3>
        <p class="field-hint">أدخل رقم الهاتف الذي استخدمته في الطلب، وسنرسل إليه رمز تحقق عبر واتساب. لا تحتاج إلى حساب.</p>
        ${notice ? `<p class="session-notice">${esc(notice)}</p>` : ""}
        <form id="trackPhoneForm" class="form" novalidate>
          <label class="field"><span>رقم الهاتف *</span><input name="phone" inputmode="tel" autocomplete="tel" required value="${esc(prefill)}"></label>
          <button type="submit" class="primary" id="sendCodeBtn">إرسال رمز التحقق</button>
        </form>
        <div id="otpSupportSlot"></div>
      </section>`;
    const form = container.querySelector("#trackPhoneForm");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const phone = String(new FormData(form).get("phone") || "").trim();
      if (phone.length < 6) {
        toast("أدخل رقم هاتف صحيح", { tone: "error" });
        return;
      }
      const btn = container.querySelector("#sendCodeBtn");
      setLoading(btn, true, "جارٍ الإرسال…");
      const slot = container.querySelector("#otpSupportSlot");
      try {
        await tracking.requestTrackingCode(phone);
        showCodeStep(phone);
      } catch (error) {
        setLoading(btn, false);
        // No code was sent: say so on the screen and offer a person instead.
        if (!(await showOtpSupport(slot, error, { context: "تتبع طلب" }))) toast(error.message, { tone: "error" });
      }
    });
  };

  const showCodeStep = (phone) => {
    container.innerHTML = `
      <section class="form-section">
        <h3>أدخل رمز التحقق</h3>
        <p class="field-hint">إذا كان الرقم <b dir="ltr">${esc(phone)}</b> مستخدمًا في طلب، طلبنا إرسال رمز من 6 أرقام إليه عبر واتساب. الرمز صالح 10 دقائق. إن لم يصلك خلال دقائق، أعد الإرسال أو تواصل معنا.</p>
        <form id="trackCodeForm" class="form" novalidate>
          <label class="field"><span>رمز التحقق *</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
          <button type="submit" class="primary" id="verifyCodeBtn">تأكيد</button>
          <button type="button" class="link-btn" id="backToPhoneBtn">تغيير الرقم أو إعادة الإرسال</button>
        </form>
      </section>`;
    container.querySelector("#backToPhoneBtn").addEventListener("click", () => {
      tracking.setTrackingPrefill(phone);
      showPhoneStep();
    });
    const form = container.querySelector("#trackCodeForm");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const code = String(new FormData(form).get("code") || "").trim();
      const btn = container.querySelector("#verifyCodeBtn");
      setLoading(btn, true, "جارٍ التحقق…");
      try {
        await tracking.verifyTrackingCode(phone, code);
        await showList();
      } catch (error) {
        setLoading(btn, false);
        toast(error.message || "رمز التحقق غير صحيح", { tone: "error" });
      }
    });
  };

  if (await tracking.hasTrackingSession()) await showList();
  else showPhoneStep();
}

// Detail of a phone-tracked request (same view as an account request, data
// from GET /tracking/requests, actions through the tracking session).
export async function renderTrackedRequestDetailScreen(ctx) {
  return renderRequestDetailScreen({ ...ctx, params: { ...ctx.params, source: "tracking" } });
}

function fromTracking(request) {
  return {
    ...request,
    service: request.serviceRef || (request.service ? { name: request.service } : null),
    nextAction: request.statusLabel || "",
    timeline: [],
  };
}

function trackingLoginPanel({ phone, onVerified }) {
  return `
    <div class="tracking-panel" id="trackingPanel">
      <p class="field-hint">لحماية بيانات الدفع، أكّد رقم هاتفك المسجل لإتمام هذا الإجراء.</p>
      <form id="trackingPhoneForm" class="form">
        <label class="field">
          <span>رقم الهاتف</span>
          <input name="phone" value="${esc(phone || "")}" required>
        </label>
        <button type="submit" class="secondary">إرسال رمز التحقق</button>
      </form>
    </div>`;
}

async function ensureTrackingAndRun(containerEl, action, { onDone } = {}) {
  if (await tracking.hasTrackingSession()) {
    try {
      await action();
      onDone?.();
      return;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        toast(error.message, { tone: "error" });
        return;
      }
      // Tracking session expired — fall through to re-verify.
    }
  }

  const customer = getCustomer();
  containerEl.innerHTML = trackingLoginPanel({ phone: customer?.phone });
  const phoneForm = containerEl.querySelector("#trackingPhoneForm");
  phoneForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = new FormData(phoneForm).get("phone");
    const submitBtn = phoneForm.querySelector("button");
    setLoading(submitBtn, true, "جارٍ الإرسال…");
    try {
      await tracking.requestTrackingCode(phone);
      renderOtpStep(containerEl, phone, action, onDone);
    } catch (error) {
      setLoading(submitBtn, false);
      toast(error.message, { tone: "error" });
    }
  });
}

function renderOtpStep(containerEl, phone, action, onDone) {
  containerEl.innerHTML = `
    <div class="tracking-panel">
      <p class="field-hint">أدخل رمز التحقق المرسل عبر واتساب إلى ${esc(phone)}.</p>
      <form id="trackingOtpForm" class="form">
        <label class="field">
          <span>رمز التحقق (6 أرقام)</span>
          <input name="code" inputmode="numeric" maxlength="6" required>
        </label>
        <button type="submit" class="primary">تأكيد</button>
      </form>
    </div>`;
  const otpForm = containerEl.querySelector("#trackingOtpForm");
  otpForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = new FormData(otpForm).get("code");
    const submitBtn = otpForm.querySelector("button");
    setLoading(submitBtn, true, "جارٍ التأكيد…");
    try {
      await tracking.verifyTrackingCode(phone, code);
      await action();
      containerEl.innerHTML = "";
      onDone?.();
    } catch (error) {
      setLoading(submitBtn, false);
      toast(error.message, { tone: "error" });
    }
  });
}

export async function renderRequestDetailScreen({ bodyEl, setTitle, params }) {
  setTitle("تفاصيل الطلب");
  bodyEl.innerHTML = `<div class="loading-block">${icon("clock", { size: 28 })}<p>جارٍ تحميل الطلب…</p></div>`;

  const viaTracking = params.source === "tracking";

  async function load() {
    try {
      if (viaTracking) {
        const list = await tracking.listTrackedRequests();
        const found = list.find((request) => request.id === params.requestId);
        if (!found) throw new ApiError("الطلب غير متاح لهذا الرقم", { status: 404 });
        renderDetail(fromTracking(found));
        return;
      }
      const res = await api(`/customer/requests/${params.requestId}`);
      renderDetail(res.data);
    } catch (error) {
      bodyEl.innerHTML = errorState(error.message, { onRetry: load });
    }
  }

  function renderDetail(request) {
    const price = request.invoice ? money(request.invoice.amount, request.invoice.currency) : "";
    const canApprove = Boolean(request.invoice && request.invoice.status === "PENDING");
    const canPay = Boolean(request.invoice && request.invoice.status === "APPROVED" && request.paymentStatus === "AWAITING_TRANSFER");
    const underReview = request.paymentStatus === "UNDER_REVIEW";
    const isEgyptClearance = request.visaType?.code === "VISA-EGYPT-CLEARANCE" && request.status !== "CLOSED";

    bodyEl.innerHTML = `
      <div class="request-summary">
        <span class="status-pill">${esc(requestStatusLabel(request))}</span>
        <h2>${esc(request.service?.name || request.visaType?.name || "طلب خدمة")}</h2>
        <p>${esc(request.nextAction || "")}</p>
      </div>

      ${request.invoice ? `
        <div class="detail-block quote-block">
          <h4>السعر المرسل من الوكالة</h4>
          <strong class="quote-amount">${price}</strong>
          ${canApprove ? `<button class="primary" id="approveBtn">موافق على السعر</button><button class="secondary" id="rejectBtn">رفض العرض</button>` : ""}
          ${canPay ? `<button class="primary" id="paymentInfoBtn">عرض بيانات الدفع</button><button class="secondary" id="uploadReceiptBtn">رفع إثبات الدفع</button>` : ""}
          ${underReview ? `<span class="review-state">${icon("clock", { size: 14 })} تم استلام إثبات الدفع، قيد مراجعة الوكالة</span>` : ""}
        </div>` : ""}

      ${request.offers?.length ? `
        <div class="detail-block">
          <h4>عروض الوكالة</h4>
          ${request.offers.map((offer) => `
            <div class="offer-row">
              <div>
                <strong>${esc(offer.carrier || "عرض")}</strong>
                <p>${esc(offer.description || "")}</p>
                <small>${money(offer.amount, offer.currency)}</small>
              </div>
              ${request.selectedOfferId === offer.id ? `<span class="status-pill">مختار</span>` : `<button class="secondary select-offer-btn" data-offer-id="${esc(offer.id)}">اختيار</button>`}
            </div>`).join("")}
        </div>` : ""}

      ${request.documents?.length ? `
        <div class="detail-block">
          <h4>المستندات</h4>
          ${request.documents.map((doc) => `
            <div class="doc-row">
              <span>${esc(doc.label)}</span>
              <b class="doc-status doc-status-${esc((doc.status || "").toLowerCase())}">${esc(DOCUMENT_STATUS_AR[doc.status] || doc.status)}</b>
            </div>
            ${doc.status === "REJECTED" && doc.reviewNote ? `<p class="field-error">${esc(doc.reviewNote)}</p>` : ""}`).join("")}
        </div>` : ""}

      ${request.deliverables?.length ? `
        <div class="detail-block">
          <h4>الملفات النهائية</h4>
          ${request.deliverables.map((file) => `<button class="secondary deliverable-btn" data-id="${esc(file.id)}">${icon("download", { size: 16 })} ${esc(file.label || file.fileName)}</button>`).join("")}
        </div>` : ""}

      ${isEgyptClearance ? `<button class="primary" id="egyptTravelBtn">استكمال بيانات السفر والتعميم</button>` : ""}

      <div id="trackingActionPanel"></div>

      ${request.timeline?.length ? `
        <div class="detail-block">
          <h4>سجل الطلب</h4>
          ${request.timeline.map((entry) => `<div class="timeline-row">${icon("check-circle", { size: 14 })}<span>${esc(timelineLabel(entry.action))}</span></div>`).join("")}
        </div>` : ""}
    `;

    const panel = bodyEl.querySelector("#trackingActionPanel");

    bodyEl.querySelector("#approveBtn")?.addEventListener("click", () => {
      ensureTrackingAndRun(panel, () => tracking.approveInvoice(request.id), { onDone: () => { toast("تمت الموافقة على السعر"); load(); } });
    });
    bodyEl.querySelector("#rejectBtn")?.addEventListener("click", () => {
      ensureTrackingAndRun(panel, () => tracking.rejectInvoice(request.id), { onDone: () => { toast("تم رفض العرض"); load(); } });
    });
    bodyEl.querySelector("#paymentInfoBtn")?.addEventListener("click", () => showPaymentAccounts(panel, request.invoice.currency));
    bodyEl.querySelector("#uploadReceiptBtn")?.addEventListener("click", () => showReceiptUpload(panel, request.id, load));
    bodyEl.querySelector("#egyptTravelBtn")?.addEventListener("click", () => showEgyptTravelPlan(panel, request.id, load));
    bodyEl.querySelectorAll(".select-offer-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        ensureTrackingAndRun(panel, () => tracking.selectOffer(request.id, btn.dataset.offerId), {
          onDone: () => { toast("تم اختيار العرض"); load(); },
        });
      });
    });
    bodyEl.querySelectorAll(".deliverable-btn").forEach((btn) => {
      btn.addEventListener("click", () => (viaTracking ? downloadTrackedDeliverable(request.id, btn.dataset.id) : downloadDeliverable(request.id, btn.dataset.id)));
    });
  }

  await load();
}

async function showPaymentAccounts(panel, currency) {
  panel.innerHTML = `<div class="loading-block">${icon("clock", { size: 22 })}<p>جارٍ تحميل بيانات الدفع…</p></div>`;
  try {
    const res = await tracking.getPaymentAccounts(currency);
    const accounts = res.data || [];
    panel.innerHTML = accounts.length
      ? `<div class="detail-block">${accounts.map((account) => `
          <div class="payment-card">
            <strong>${esc(account.name || account.bankName || "حساب الدفع")}</strong>
            ${account.accountName ? `<span>${esc(account.accountName)}</span>` : ""}
            ${account.accountNumber ? `<code>${esc(account.accountNumber)}</code>` : ""}
            ${account.iban ? `<code>${esc(account.iban)}</code>` : ""}
            <small>${esc(account.currency || currency)}</small>
          </div>`).join("")}</div>`
      : emptyState({ icon: "wallet", title: "بيانات الدفع غير متاحة حالياً", hint: "تواصل مع الوكالة بعد اعتماد السعر." });
  } catch (error) {
    panel.innerHTML = errorState(error.message);
  }
}

function showReceiptUpload(panel, requestId, onUploaded) {
  panel.innerHTML = `
    <form id="receiptForm" class="form detail-block">
      <h4>رفع إثبات الدفع</h4>
      <label class="field">
        <span>إشعار التحويل (صورة أو PDF) *</span>
        <input name="file" type="file" accept="image/*,.pdf" required>
      </label>
      <div class="upload-progress-wrap" id="receiptProgressWrap" hidden>
        <div class="upload-progress-bar"><div class="upload-progress-fill" id="receiptProgressFill"></div></div>
      </div>
      <button type="submit" class="primary">رفع الإثبات</button>
    </form>`;
  const form = panel.querySelector("#receiptForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = new FormData(form).get("file");
    const submitBtn = form.querySelector("button");
    setLoading(submitBtn, true, "جارٍ الرفع…");
    const progressWrap = panel.querySelector("#receiptProgressWrap");
    const progressFill = panel.querySelector("#receiptProgressFill");
    progressWrap.hidden = false;
    await ensureTrackingAndRun(panel, () => tracking.uploadPaymentReceipt(requestId, file, (percent) => { progressFill.style.width = `${percent}%`; }), {
      onDone: () => { toast("تم رفع إثبات الدفع للمراجعة"); onUploaded(); },
    });
  });
}

function showEgyptTravelPlan(panel, requestId, onSaved) {
  const today = new Date().toISOString().slice(0, 10);
  panel.innerHTML = `
    <form id="egyptPlanForm" class="form detail-block">
      <h4>بيانات السفر والتعميم</h4>
      <label class="field">
        <span>طريقة الدخول</span>
        <select name="entryMode">
          <option value="AIR">منفذ جوي</option>
          <option value="BORDER">منفذ بري</option>
        </select>
      </label>
      <label class="field">
        <span>حالة الحجز</span>
        <select name="bookingStatus">
          <option value="EXISTING">لدي حجز بالفعل</option>
          <option value="NEEDS_NASAEM">أريد الحجز من نسائم الحرمين</option>
        </select>
      </label>
      <label class="field">
        <span>تاريخ الدخول المتوقع *</span>
        <input name="entryDate" type="date" min="${today}" required>
      </label>
      <label class="field" data-doc-field>
        <span>التذكرة أو الحجز إن وجد</span>
        <input name="file" type="file" accept="image/*,.pdf">
      </label>
      <p class="field-hint">مرحلة التعميم تحتاج وقتًا كافيًا قبل الدخول، وستظهر حالة الطلب الفعلية دون أي تأكيد غير دقيق.</p>
      <button type="submit" class="primary">حفظ بيانات السفر</button>
    </form>`;
  const form = panel.querySelector("#egyptPlanForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = new FormData(form);
    const file = raw.get("file");
    const submitBtn = form.querySelector("button");
    setLoading(submitBtn, true, "جارٍ الحفظ…");
    await ensureTrackingAndRun(
      panel,
      () => tracking.saveEgyptTravelPlan(requestId, { entryMode: raw.get("entryMode"), bookingStatus: raw.get("bookingStatus"), entryDate: raw.get("entryDate") }, file?.size ? file : null),
      { onDone: () => { toast("تم حفظ بيانات السفر"); onSaved(); } }
    );
  });
}

// Order is the separate, simpler self-checkout resource (customer-portal's
// POST /customer/orders) — most of this app's service flows create a
// ContactRequest instead (renderRequestDetailScreen above), but an Order
// can still exist (coupon redemption, a future direct-purchase flow) and
// needs its own detail view rather than erroring out.
export async function renderOrderDetailScreen({ bodyEl, setTitle, params }) {
  setTitle("تفاصيل الطلب");
  bodyEl.innerHTML = `<div class="loading-block">${icon("clock", { size: 28 })}<p>جارٍ تحميل الطلب…</p></div>`;
  try {
    const res = await api(`/customer/orders/${params.orderId}`);
    const order = res.data;
    bodyEl.innerHTML = `
      <div class="request-summary">
        <span class="status-pill">${esc(statusLabel(order.status))}</span>
        <h2>${esc(order.orderNumber)}</h2>
        <p>${money(order.totalAmount, order.currency)}</p>
      </div>
      ${order.items?.length ? `
        <div class="detail-block">
          <h4>عناصر الطلب</h4>
          ${order.items.map((orderItem) => `<div class="doc-row"><span>${esc(orderItem.service?.name || "")}</span><b>${money(orderItem.total, order.currency)}</b></div>`).join("")}
        </div>` : ""}
      ${order.payments?.length ? `
        <div class="detail-block">
          <h4>المدفوعات</h4>
          ${order.payments.map((payment) => `<div class="doc-row"><span>${esc(payment.paymentMethod || "دفعة")}</span><b class="doc-status-${esc((payment.status || "").toLowerCase())}">${money(payment.amount, payment.currency)} — ${esc(PAYMENT_STATUS_AR[payment.status] || payment.status)}</b></div>`).join("")}
        </div>` : ""}
      ${order.history?.length ? `
        <div class="detail-block">
          <h4>سجل الحالة</h4>
          ${order.history.map((entry) => `<div class="timeline-row">${icon("check-circle", { size: 14 })}<span>${esc(statusLabel(entry.newStatus))}</span></div>`).join("")}
        </div>` : ""}
    `;
  } catch (error) {
    bodyEl.innerHTML = errorState(error.message, { onRetry: () => renderOrderDetailScreen({ bodyEl, setTitle, params }) });
  }
}

async function downloadDeliverable(requestId, deliverableId) {
  try {
    const token = await getToken();
    const response = await fetch(`${CONFIG.apiBaseUrl}/customer/requests/${requestId}/deliverables/${deliverableId}/file`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error("تعذر فتح الملف");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  } catch (error) {
    toast(error.message, { tone: "error" });
  }
}

async function downloadTrackedDeliverable(requestId, deliverableId) {
  try {
    const blob = await tracking.fetchTrackedFile(`/tracking/requests/${requestId}/deliverables/${deliverableId}/file`);
    window.open(URL.createObjectURL(blob), "_blank");
  } catch (error) {
    toast(error.message, { tone: "error" });
  }
}
