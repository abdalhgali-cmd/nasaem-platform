// The payment step straight after a fixed-price submission: the amount and
// currency the customer accepted, the agency accounts that may take it (the
// invoice currency, or the frozen SDG equivalent where the agency allows it;
// with copy buttons) and the transfer receipt (camera, gallery or PDF, with a
// preview), on one screen. Uses the
// request-scoped token from the creation response (X-Payment-Access), which
// opens nothing but this request's payment. A receipt puts the payment
// «بانتظار مراجعة الدفع» — never paid — until staff confirm it.
import { api, apiUpload } from "../api.js";
import { esc, toast, setLoading, errorState } from "../ui.js";
import { icon } from "../icons.js";
import { replace, goToTab } from "../router.js";
import { setTrackingPrefill } from "../tracking.js";
import { validateFile } from "../intake-core.js";
import { formatAmount } from "../payment-view.js";
import {
  bindCopyButtons,
  bindReceiptPicker,
  isAlreadySubmitted,
  needsRefresh,
  noSettlementAccountHtml,
  normalizeSettlementOptions,
  receiptFormData,
  receiptPickerHtml,
  selectedSettlementAccount,
  settlementOptionsHtml,
  paymentSafetyHtml,
} from "../payment-receipt.js";
import { savePendingPayment, clearPendingPayment, clearPendingPaymentFor } from "../experience-core.js";
import { egyptStepsHtml, isEgyptPaymentJourney } from "../egypt-view.js";
import { paymentJourneyHtml } from "../payment-journey.js";

function paymentPath(id) {
  return `/contact-requests/${encodeURIComponent(id)}/payment-access`;
}

// `keepPending`: the customer chose to transfer later (or the payment could
// not load offline) — the home screen keeps offering «أكمل الدفع».
function finish(params, summary, { keepPending = false } = {}) {
  if (!keepPending) clearPendingPayment(localStorage);
  replace(
    "requestSubmitted",
    {
      id: params.id,
      customerConfirmation: params.customerConfirmation,
      serviceName: params.serviceName,
      phone: params.phone,
      travelerCount: params.travelerCount,
      steps: params.steps || null,
      paymentSummary: summary || null,
    },
    { title: "تم استلام طلبك" }
  );
}

export async function renderRequestPaymentScreen({ bodyEl, params }) {
  const access = params.paymentAccess;
  const pending = {
    id: params.id,
    paymentAccess: access,
    customerConfirmation: params.customerConfirmation,
    serviceName: params.serviceName,
    phone: params.phone,
    travelerCount: params.travelerCount,
    steps: params.steps || null,
  };
  savePendingPayment(localStorage, pending);
  const headers = { "X-Payment-Access": access?.token || "" };
  bodyEl.innerHTML = `<div class="loading-block">${icon("clock", { size: 22 })}<p>جارٍ تحميل بيانات الدفع…</p></div>`;

  let summary;
  try {
    summary = (await api(paymentPath(params.id), { headers })).data;
  } catch (error) {
    bodyEl.innerHTML = `
      ${errorState(error.message)}
      <button type="button" class="secondary" id="paymentLaterBtn">متابعة بدون الدفع الآن</button>`;
    // Only a definitive refusal of the payment link drops the resume; offline,
    // rate-limited or a server error leave it for later.
    const refused = [401, 403, 404, 410].includes(error?.status);
    bodyEl.querySelector("#paymentLaterBtn").addEventListener("click", () => finish(params, null, { keepPending: !refused }));
    return;
  }

  // Restore the service's journey after restart, including older pending
  // records saved before we persisted "steps". The server returns only the
  // authenticated request's public visa type code, never private tracking data.
  const egyptPayment = isEgyptPaymentJourney(params, summary);
  if (egyptPayment && pending.steps !== "EGYPT") {
    pending.steps = "EGYPT";
    savePendingPayment(localStorage, pending);
  }
  const paymentParams = { ...params, steps: egyptPayment ? "EGYPT" : params.steps || null };
  const amountText = formatAmount(summary.amount, summary.currency);
  const sdgText = summary.currency !== "SDG" && Number(summary.amountSdg) > 0 ? formatAmount(summary.amountSdg, "SDG") : "";
  const options = normalizeSettlementOptions(summary);
  const underReview = summary.paymentStatus === "UNDER_REVIEW";
  const confirmed = summary.paymentStatus === "CONFIRMED";

  bodyEl.innerHTML = `
    ${egyptPayment ? egyptStepsHtml(3, esc) : ""}
    <div class="detail-block payment-step" data-testid="direct-payment-step">
      ${paymentJourneyHtml(summary)}
      ${params.resumed ? `<p class="field-hint" id="paymentResumed">طلبك محفوظ مسبقًا ولن يُرسل مرة أخرى؛ أكمل الدفع من هنا.</p>` : ""}
      <p class="field-hint">طلبك محفوظ برقم <code dir="ltr">${esc(summary.id)}</code>. حوّل المبلغ إلى أحد الحسابات المعتمدة ثم ارفع إشعار التحويل.</p>
      <h4>الدفع بالتحويل البنكي</h4>
      ${paymentSafetyHtml()}
      <p class="payment-amount">قيمة الفاتورة: <strong id="directPaymentAmount"><bdi>${esc(amountText)}</bdi></strong></p>
      ${sdgText ? `<p class="field-hint">ما يعادل <bdi>${esc(sdgText)}</bdi> بسعر الصرف المثبّت على الفاتورة وقت تأكيد الطلب</p>`
        : summary.currency && summary.currency !== "SDG" ? `<p class="field-hint" id="paymentSdgUnavailable">المقابل بالجنيه السوداني غير متاح لهذه الفاتورة؛ حوّل بالعملة الظاهرة.</p>` : ""}
      ${summary.rejectionReason ? `<p class="field-error" role="alert">لم يُقبل الإشعار السابق: ${esc(summary.rejectionReason)}</p>` : ""}
      ${underReview ? `<p class="status-note" id="paymentUnderReview" role="status"><b>بانتظار مراجعة الدفع</b> — وصل إشعار التحويل، ويؤكد موظف الوكالة استلام المبلغ بعد مطابقته مع البنك.</p>` : ""}
      ${confirmed ? `<p class="status-note status-success" id="paymentConfirmed" role="status"><b>تم تأكيد الدفع</b> — لا تحتاج إلى إجراء آخر الآن. طلبك في انتظار بدء التنفيذ من فريق الوكالة.</p>` : ""}
      ${summary.paymentOpen && !underReview
        ? options.length
          ? `
          <p class="field-hint">اختر الحساب الذي ستحوّل إليه، وحوّل المبلغ الظاهر عليه بالضبط.</p>
          ${settlementOptionsHtml(options, esc, { invoiceAmount: summary.amount, invoiceCurrency: summary.currency })}
          <form id="directReceiptForm" class="form" novalidate>
            ${receiptPickerHtml(esc, icon)}
            <button type="submit" class="primary" id="sendReceiptBtn">إرسال إشعار التحويل</button>
            <small>يؤكد موظف الوكالة استلام المبلغ، وحتى ذلك تكون حالة الدفع «بانتظار مراجعة الدفع». رفع الإشعار لا يعني أن الدفع تم.</small>
          </form>`
          : noSettlementAccountHtml(esc, summary.currency)
        : !underReview ? `<p class="field-hint"><b>${esc(summary.paymentStatusLabel || "")}</b></p>${(summary.lockReasons || []).map((reason) => `<p class="field-hint">${esc(reason)}</p>`).join("")}` : ""}
      ${!underReview && !confirmed ? `<button type="button" class="secondary" id="paymentLaterBtn">${summary.paymentOpen ? options.length ? "سأحوّل لاحقًا" : "متابعة بدون دفع الآن" : "متابعة"}</button>` : ""}
      <button type="button" class="secondary" id="trackRequestNowBtn">عرض مراحل الطلب في طلباتي</button>
      <p class="field-hint">يمكنك متابعة مراحل الطلب من «طلباتي» بعد التحقق من رقم الهاتف، حتى لو لم تدفع بعد.</p>
      ${summary.paymentOpen && !underReview ? `<p class="field-hint">يبقى «أكمل الدفع» ظاهرًا في الرئيسية حتى ترفع الإشعار.</p>` : ""}
    </div>`;

  bindCopyButtons(bodyEl, toast);
  bodyEl.querySelector("#paymentLaterBtn")?.addEventListener("click", () => finish(paymentParams, summary, { keepPending: Boolean(summary.paymentOpen) && !underReview }));
  bodyEl.querySelector("#trackRequestNowBtn").addEventListener("click", () => {
    if (params.phone) setTrackingPrefill(params.phone);
    goToTab("requests", "requests", { title: "طلباتي" });
  });

  // Keep the customer in one continuous journey after uploading the receipt.
  // While finance reviews it, refresh this same screen until the server says
  // the payment is confirmed (or rejected). The server remains the sole source
  // of truth; the client never turns an upload into a confirmed payment.
  if (underReview) {
    const refreshPaymentState = async () => {
      if (!bodyEl.isConnected || !bodyEl.querySelector("#paymentUnderReview")) return;
      try {
        const current = (await api(paymentPath(params.id), { headers })).data;
        if (current.paymentStatus !== summary.paymentStatus || current.rejectionReason !== summary.rejectionReason) {
          await renderRequestPaymentScreen({ bodyEl, params: paymentParams });
          return;
        }
      } catch {
        // A temporary refresh failure does not interrupt the visible journey.
      }
      if (bodyEl.isConnected) setTimeout(refreshPaymentState, 15_000);
    };
    setTimeout(refreshPaymentState, 15_000);
  }

  const form = bodyEl.querySelector("#directReceiptForm");
  if (!form) return;
  const picker = bindReceiptPicker(form, { esc, icon, validate: (file) => validateFile(file, null), initialFile: params.keptReceipt || null });
  if (params.notice) picker.showError(params.notice);
  let sending = false;

  // After a refused duplicate or a lost response: what the server holds now.
  async function reloadState() {
    try {
      return (await api(paymentPath(params.id), { headers })).data;
    } catch {
      return null;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    // One upload at a time: repeated taps never send a second receipt.
    if (sending) return;
    const accountId = selectedSettlementAccount(bodyEl);
    if (!accountId) {
      picker.showError("اختر الحساب الذي حوّلت إليه.");
      return;
    }
    const file = picker.file;
    if (!file) {
      picker.showError("صوّر إشعار التحويل أو اختر صورته أو ملف PDF.");
      return;
    }
    picker.showError("");
    sending = true;
    // Leaving mid-upload would race the upload's own completion.
    bodyEl.querySelector("#paymentLaterBtn").disabled = true;
    const button = form.querySelector("#sendReceiptBtn");
    setLoading(button, true, "جارٍ الإرسال…");
    picker.setBusy(true);
    const payload = receiptFormData(file, { accountId, invoiceVersion: summary.invoiceVersion });
    const done = (request) => {
      picker.dispose();
      toast("تم إرسال إشعار التحويل — بانتظار مراجعة الدفع");
      // The customer left this screen during the upload: the receipt is in,
      // so the resume offer goes, but the screen they are on now stays.
      if (!bodyEl.isConnected) {
        clearPendingPaymentFor(localStorage, params.id);
        return;
      }
      clearPendingPaymentFor(localStorage, params.id);
      renderRequestPaymentScreen({ bodyEl, params: paymentParams });
    };
    try {
      const res = await apiUpload(`${paymentPath(params.id)}/receipt`, payload, (percent) => picker.setProgress(percent), headers);
      done(res.data?.request);
    } catch (error) {
      if (isAlreadySubmitted(error)) {
        const current = await reloadState();
        if (current?.paymentStatus === "UNDER_REVIEW" || current?.paymentStatus === "CONFIRMED") return done(current);
      }
      sending = false;
      bodyEl.querySelector("#paymentLaterBtn").disabled = false;
      setLoading(button, false);
      button.textContent = "إعادة المحاولة";
      picker.setBusy(false);
      if (needsRefresh(error)) {
        // The accounts or the invoice changed: show the current ones, keep
        // the receipt the customer already picked, and say why.
        picker.dispose();
        await renderRequestPaymentScreen({ bodyEl, params: { ...params, keptReceipt: file, notice: error.message } });
        return;
      }
      picker.showError(error.offline ? "تعذّر الاتصال. تحقق من الإنترنت ثم اضغط «إعادة المحاولة»؛ الإشعار المختار ما زال جاهزًا." : error.message);
      toast(error.message, { tone: "error" });
    }
  });
}
