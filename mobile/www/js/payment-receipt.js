// The bank-transfer step shared by the payment screen after submission and
// the payment step in «طلباتي»: which agency account the customer pays into
// (and how much, in which currency), and the transfer receipt — taken with
// the camera, picked from the gallery, or a PDF — with a preview before it
// is sent. The server checks the chosen account and the invoice version
// again when the receipt arrives (payment-settlement.service.js); a receipt
// only puts the payment under review, never paid.
import { formatAmount } from "./payment-view.js";

export const RECEIPT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const RECEIPT_PDF_TYPE = "application/pdf";

// The ways to pay, from the server's `settlementOptions`. A server without
// them (older backend) sends only `accounts` in the invoice currency.
export function normalizeSettlementOptions({ settlementOptions, accounts, amount, currency } = {}) {
  if (Array.isArray(settlementOptions)) return settlementOptions.filter((option) => option && option.accountId);
  return (accounts || []).map((account) => ({
    ...account,
    accountId: account.id,
    kind: "INVOICE_CURRENCY",
    payCurrency: account.currency || currency,
    payAmount: amount,
  }));
}

function copyRow(value, label, esc) {
  return `<div class="copy-row"><code dir="ltr">${esc(value)}</code><button type="button" class="chip-btn" data-copy="${esc(value)}" aria-label="${esc(label)}">${esc(label)}</button></div>`;
}

// One card per account. With more than one way to pay, the customer picks the
// account they transferred to; with one, it is selected for them.
export function settlementOptionsHtml(options, esc, { invoiceAmount, invoiceCurrency } = {}) {
  const single = options.length === 1;
  return `<div class="settlement-options" role="radiogroup" aria-label="الحساب الذي حوّلت إليه" data-testid="settlement-options">${options
    .map((option) => {
      const pay = formatAmount(option.payAmount, option.payCurrency);
      const sdg = option.kind === "SDG_EQUIVALENT";
      return `
      <label class="payment-card settlement-option${sdg ? " settlement-sdg" : ""}" data-testid="payment-account" data-settlement-kind="${esc(option.kind)}">
        <span class="settlement-head">
          <input type="radio" name="settlementAccountId" value="${esc(option.accountId)}" ${single ? "checked" : ""} required>
          <strong>${esc(option.bankName || option.name || "حساب الدفع")}</strong>
          <small dir="ltr">${esc(option.currency || option.payCurrency || "")}</small>
        </span>
        <span class="settlement-amount">حوّل <strong><bdi>${esc(pay)}</bdi></strong></span>
        ${sdg ? `<span class="field-hint settlement-note">سداد بالجنيه السوداني بالمبلغ المثبّت على فاتورتك عند إصدارها (سعر الصرف <bdi>${esc(Number(option.rate).toLocaleString("en-US"))}</bdi>). فاتورتك الأصلية <bdi>${esc(formatAmount(invoiceAmount, invoiceCurrency))}</bdi> لا تتغيّر.</span>` : ""}
        ${option.accountName ? `<span>صاحب الحساب: ${esc(option.accountName)}</span>` : ""}
        ${option.accountNumber ? copyRow(option.accountNumber, "نسخ رقم الحساب", esc) : ""}
        ${option.iban ? copyRow(option.iban, "نسخ IBAN", esc) : ""}
      </label>`;
    })
    .join("")}</div>`;
}

// When no active account can take this payment, say exactly that.
export function noSettlementAccountHtml(esc, currency) {
  return `<p class="field-hint" id="noPaymentAccount" role="status">لا يوجد حاليًا حساب دفع مفعّل يقبل السداد ${currency && currency !== "SDG" ? `بعملة الفاتورة (${esc(currency)}) أو بمقابلها بالجنيه` : "لهذه العملة"}. لا تحوّل أي مبلغ قبل أن تتواصل معك الوكالة؛ طلبك محفوظ ويمكنك متابعته من «طلباتي».</p>`;
}

export function receiptPickerHtml(esc, icon) {
  return `
    <div class="receipt-picker" data-receipt-picker>
      <span class="field-label">إشعار التحويل *</span>
      <div class="receipt-preview" data-receipt-preview hidden></div>
      <div class="receipt-sources">
        <label class="chip-btn receipt-source">${icon("camera", { size: 16 })}<span>تصوير الإشعار</span>
          <input type="file" class="sr-only" accept="image/*" capture="environment" data-receipt-input="CAMERA" aria-label="تصوير إشعار التحويل بالكاميرا">
        </label>
        <label class="chip-btn receipt-source">${icon("upload", { size: 16 })}<span>صورة من المعرض</span>
          <input type="file" class="sr-only" accept="${esc(RECEIPT_IMAGE_TYPES.join(","))}" data-receipt-input="GALLERY" aria-label="اختيار صورة الإشعار من المعرض">
        </label>
        <label class="chip-btn receipt-source">${icon("document", { size: 16 })}<span>ملف PDF</span>
          <input type="file" class="sr-only" accept="application/pdf,.pdf" data-receipt-input="PDF" aria-label="اختيار إشعار التحويل بصيغة PDF">
        </label>
      </div>
      <p class="field-error" data-receipt-error role="alert" hidden></p>
      <div class="upload-progress-wrap" data-receipt-progress hidden>
        <div class="upload-progress-bar"><div class="upload-progress-fill" data-receipt-progress-fill></div></div>
        <small data-receipt-progress-text></small>
      </div>
    </div>`;
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// The receipt the customer chose, previewed (image) or named (PDF), with
// replace and remove. `validate(file)` returns an Arabic problem or null.
export function bindReceiptPicker(root, { esc, icon, validate }) {
  const picker = root.querySelector("[data-receipt-picker]");
  const preview = picker.querySelector("[data-receipt-preview]");
  const error = picker.querySelector("[data-receipt-error]");
  const progress = picker.querySelector("[data-receipt-progress]");
  const fill = picker.querySelector("[data-receipt-progress-fill]");
  const progressText = picker.querySelector("[data-receipt-progress-text]");
  let file = null;
  let objectUrl = null;

  function showError(message) {
    error.textContent = message || "";
    error.hidden = !message;
  }

  function render() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    picker.classList.toggle("receipt-chosen", Boolean(file));
    picker.querySelectorAll(".receipt-source span").forEach((label, index) => {
      label.textContent = file ? ["إعادة التصوير", "استبدال بصورة", "استبدال بملف PDF"][index] : ["تصوير الإشعار", "صورة من المعرض", "ملف PDF"][index];
    });
    if (!file) {
      preview.hidden = true;
      preview.innerHTML = "";
      return;
    }
    const isImage = RECEIPT_IMAGE_TYPES.includes(file.type);
    if (isImage && typeof URL?.createObjectURL === "function") objectUrl = URL.createObjectURL(file);
    preview.hidden = false;
    preview.innerHTML = `
      ${objectUrl ? `<img class="receipt-preview-img" src="${esc(objectUrl)}" alt="معاينة إشعار التحويل">` : `<span class="slot-file">${icon("document", { size: 16 })} ${esc(file.name || "إشعار التحويل.pdf")}</span>`}
      <span class="field-hint" data-receipt-name>${esc(file.name || "")} · ${esc(formatBytes(file.size || 0))}</span>
      <button type="button" class="chip-btn" data-receipt-remove>${icon("close", { size: 14 })}<span>إزالة</span></button>`;
    preview.querySelector("[data-receipt-remove]").addEventListener("click", () => {
      file = null;
      showError("");
      render();
    });
  }

  picker.querySelectorAll("[data-receipt-input]").forEach((input) => {
    input.addEventListener("change", () => {
      const chosen = input.files?.[0] || null;
      input.value = "";
      if (!chosen) return;
      const problem = validate(chosen);
      if (problem) {
        showError(problem);
        return;
      }
      showError("");
      file = chosen;
      render();
    });
  });

  return {
    get file() {
      return file;
    },
    showError,
    setBusy(busy) {
      picker.querySelectorAll("[data-receipt-input], [data-receipt-remove]").forEach((control) => { control.disabled = busy; });
      progress.hidden = !busy;
      if (busy) this.setProgress(0);
    },
    setProgress(percent) {
      fill.style.width = `${percent}%`;
      progressText.textContent = `جارٍ الرفع… ${Math.round(percent)}%`;
    },
  };
}

export function selectedSettlementAccount(root) {
  return root.querySelector('[name="settlementAccountId"]:checked')?.value || "";
}

// The multipart body of a receipt: the chosen account and the invoice version
// shown first, then the file.
export function receiptFormData(file, { accountId, invoiceVersion, label } = {}) {
  const form = new FormData();
  if (accountId) form.set("settlementAccountId", accountId);
  if (invoiceVersion !== undefined && invoiceVersion !== null && invoiceVersion !== "") form.set("invoiceVersion", String(invoiceVersion));
  if (label) form.set("label", label);
  form.append("file", file);
  return form;
}

// A second upload is refused once a receipt is in (409 PAYMENT_NOT_AWAITING):
// after a lost response the receipt may well be stored, so the caller re-reads
// the payment state instead of reporting a failure.
export function isAlreadySubmitted(error) {
  return error?.status === 409 && error?.code === "PAYMENT_NOT_AWAITING";
}

// Settlement refusals that a refreshed payment screen fixes.
export function needsRefresh(error) {
  return error?.status === 409 && ["INVOICE_CHANGED", "SETTLEMENT_ACCOUNT_INVALID"].includes(error?.code);
}

export function bindCopyButtons(root, toast) {
  root.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        toast("تم النسخ");
      } catch {
        toast("انسخ الرقم يدويًا", { tone: "error" });
      }
    });
  });
}
