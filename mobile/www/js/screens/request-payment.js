// The payment step straight after a fixed-price submission: the amount and
// currency the customer accepted, the agency's accounts in that currency
// (with copy buttons) and the transfer receipt, on one screen. Uses the
// request-scoped token from the creation response (X-Payment-Access), which
// opens nothing but this request's payment. A receipt puts the payment
// «بانتظار مراجعة التحويل» — never paid — until staff confirm it.
import { api, apiUpload } from "../api.js";
import { esc, toast, setLoading, errorState } from "../ui.js";
import { icon } from "../icons.js";
import { replace, goToTab } from "../router.js";
import { setTrackingPrefill } from "../tracking.js";
import { validateFile } from "../intake-core.js";
import { formatAmount } from "../payment-view.js";
import { savePendingPayment, clearPendingPayment, clearPendingPaymentFor } from "../experience-core.js";
import { egyptStepsHtml, isEgyptPaymentJourney } from "../egypt-view.js";

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

function accountCard(account, currency) {
  return `
    <div class="payment-card" data-testid="payment-account">
      <strong>${esc(account.bankName || account.name || "حساب الدفع")}</strong>
      ${account.accountName ? `<span>صاحب الحساب: ${esc(account.accountName)}</span>` : ""}
      ${account.accountNumber ? `<div class="copy-row"><code dir="ltr">${esc(account.accountNumber)}</code><button type="button" class="chip-btn" data-copy="${esc(account.accountNumber)}">نسخ رقم الحساب</button></div>` : ""}
      ${account.iban ? `<div class="copy-row"><code dir="ltr">${esc(account.iban)}</code><button type="button" class="chip-btn" data-copy="${esc(account.iban)}">نسخ IBAN</button></div>` : ""}
      <small>${esc(account.currency || currency || "")}</small>
    </div>`;
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
  const accounts = summary.accounts || [];

  bodyEl.innerHTML = `
    ${egyptPayment ? egyptStepsHtml(3, esc) : ""}
    <div class="detail-block payment-step" data-testid="direct-payment-step">
      ${params.resumed ? `<p class="field-hint" id="paymentResumed">طلبك محفوظ مسبقًا ولن يُرسل مرة أخرى؛ أكمل الدفع من هنا.</p>` : ""}
      <p class="field-hint">طلبك محفوظ برقم <code dir="ltr">${esc(summary.id)}</code>. حوّل المبلغ إلى الحساب المعتمد ثم ارفع إشعار التحويل.</p>
      <h4>الدفع بالتحويل البنكي</h4>
      <p class="payment-amount">المبلغ المطلوب: <strong id="directPaymentAmount"><bdi>${esc(amountText)}</bdi></strong></p>
      ${sdgText ? `<p class="field-hint">ما يعادل <bdi>${esc(sdgText)}</bdi> بسعر الصرف المعتمد وقت تأكيد الطلب</p>`
        : summary.currency && summary.currency !== "SDG" ? `<p class="field-hint" id="paymentSdgUnavailable">المقابل بالجنيه السوداني غير متاح حاليًا؛ حوّل بالعملة الظاهرة.</p>` : ""}
      ${summary.rejectionReason ? `<p class="field-error" role="alert">لم يُقبل الإشعار السابق: ${esc(summary.rejectionReason)}</p>` : ""}
      ${summary.paymentOpen
        ? `
          <p class="field-hint">حوّل المبلغ بالعملة نفسها (${esc(summary.currency || "")}) إلى أحد الحسابات التالية فقط.</p>
          ${accounts.length
            ? accounts.map((account) => accountCard(account, summary.currency)).join("")
            : `<p class="field-hint" id="noPaymentAccount">لا يوجد حساب دفع مفعّل لهذه العملة حاليًا. لا تحوّل أي مبلغ قبل تواصل الوكالة معك؛ طلبك محفوظ.</p>`}
          ${accounts.length ? `<form id="directReceiptForm" class="form">
            <label class="field">
              <span>إشعار التحويل (صورة أو PDF) *</span>
              <input name="file" type="file" accept="image/*,.pdf" required>
            </label>
            <div class="upload-progress-wrap" id="directReceiptProgressWrap" hidden>
              <div class="upload-progress-bar"><div class="upload-progress-fill" id="directReceiptProgressFill"></div></div>
            </div>
            <button type="submit" class="primary" id="sendReceiptBtn">إرسال إشعار التحويل</button>
            <small>يؤكد موظف الوكالة استلام المبلغ، وحتى ذلك تكون حالة الدفع «بانتظار مراجعة التحويل».</small>
          </form>` : ""}`
        : `<p class="field-hint"><b>${esc(summary.paymentStatusLabel || "")}</b></p>${(summary.lockReasons || []).map((reason) => `<p class="field-hint">${esc(reason)}</p>`).join("")}`}
      <button type="button" class="secondary" id="paymentLaterBtn">${summary.paymentOpen ? accounts.length ? "سأحوّل لاحقًا" : "متابعة بدون دفع الآن" : "متابعة"}</button>
      <button type="button" class="secondary" id="trackRequestNowBtn">عرض مراحل الطلب في طلباتي</button>
      <p class="field-hint">يمكنك متابعة مراحل الطلب من «طلباتي» بعد التحقق من رقم الهاتف، حتى لو لم تدفع بعد.</p>
      ${summary.paymentOpen ? `<p class="field-hint">يبقى «أكمل الدفع» ظاهرًا في الرئيسية حتى ترفع الإشعار.</p>` : ""}
    </div>`;

  bodyEl.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        toast("تم النسخ");
      } catch {
        toast("انسخ الرقم يدويًا", { tone: "error" });
      }
    });
  });
  bodyEl.querySelector("#paymentLaterBtn").addEventListener("click", () => finish(paymentParams, summary, { keepPending: Boolean(summary.paymentOpen) }));
  bodyEl.querySelector("#trackRequestNowBtn").addEventListener("click", () => {
    if (params.phone) setTrackingPrefill(params.phone);
    goToTab("requests", "requests", { title: "طلباتي" });
  });

  const form = bodyEl.querySelector("#directReceiptForm");
  if (!form) return;
  let sending = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    // One upload at a time: repeated taps never send a second receipt.
    if (sending) return;
    const file = new FormData(form).get("file");
    const problem = !file || !file.size ? "اختر صورة أو ملف PDF لإشعار التحويل." : validateFile(file, null);
    if (problem) {
      toast(problem, { tone: "error" });
      return;
    }
    sending = true;
    // Leaving mid-upload would race the upload's own completion.
    bodyEl.querySelector("#paymentLaterBtn").disabled = true;
    const button = form.querySelector("#sendReceiptBtn");
    setLoading(button, true, "جارٍ الإرسال…");
    const progressWrap = bodyEl.querySelector("#directReceiptProgressWrap");
    const progressFill = bodyEl.querySelector("#directReceiptProgressFill");
    progressWrap.hidden = false;
    const payload = new FormData();
    payload.set("file", file);
    try {
      const res = await apiUpload(`${paymentPath(params.id)}/receipt`, payload, (percent) => { progressFill.style.width = `${percent}%`; }, headers);
      toast("تم إرسال إشعار التحويل للمراجعة");
      // The customer left this screen during the upload: the receipt is in,
      // so the resume offer goes, but the screen they are on now stays.
      if (!bodyEl.isConnected) {
        clearPendingPaymentFor(localStorage, params.id);
        return;
      }
      finish(paymentParams, res.data?.request || summary);
    } catch (error) {
      sending = false;
      bodyEl.querySelector("#paymentLaterBtn").disabled = false;
      setLoading(button, false);
      progressWrap.hidden = true;
      toast(error.message, { tone: "error" });
    }
  });
}
