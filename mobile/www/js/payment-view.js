// What the customer sees about a request's price and payment, derived only from
// the fields the API sends (invoice / offers / paymentStatus / paymentRejection).
// Pure functions, no DOM: unit-tested in tests/payment-view.test.mjs.
//
// Rules this encodes:
//  - the price keeps its ORIGINAL currency; the Sudanese-pound equivalent is
//    shown only as the figure the agency froze when it issued the price;
//  - payment details are offered only after the customer approved the price;
//  - uploading a receipt means "under review", never "paid".

export function pricingOf(request) {
  const invoice = request?.invoice;
  if (invoice) {
    const fixed = request.progress?.pricingMode === "FIXED";
    return { kind: "invoice", ...pick(invoice), status: invoice.status, ...(fixed ? { label: "سعر ثابت أكّدته عند الطلب" } : {}) };
  }
  const offer = (request?.offers || []).find((candidate) => candidate.id === request.selectedOfferId);
  if (offer) return { kind: "offer", ...pick(offer), label: offer.carrier, status: "APPROVED" };
  return null;
}

function pick(price) {
  return {
    amount: Number(price.amount),
    currency: price.currency,
    amountSdg: price.amountSdg == null ? null : Number(price.amountSdg),
    exchangeRateToSdg: price.exchangeRateToSdg == null ? null : Number(price.exchangeRateToSdg),
  };
}

const NUMBER = new Intl.NumberFormat("ar", { maximumFractionDigits: 2 });

export function formatAmount(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "";
  return `${NUMBER.format(value)} ${currency || ""}`.trim();
}

// "≈ 160,000 SDG" for the price in a foreign currency; "" when the agency had
// no rate to freeze or the price is already in SDG.
export function sdgEquivalent(pricing) {
  if (!pricing || pricing.currency === "SDG" || !(pricing.amountSdg > 0)) return "";
  return `ما يعادل ${formatAmount(pricing.amountSdg, "SDG")} بسعر الصرف وقت إصدار السعر`;
}

// A price in a foreign currency whose SDG equivalent was never frozen (the
// agency had no active rate when it was issued): say so instead of converting.
export function sdgUnavailable(pricing) {
  return Boolean(pricing) && pricing.currency !== "SDG" && !(pricing.amountSdg > 0);
}

export const SDG_UNAVAILABLE_NOTICE = "المقابل بالجنيه السوداني غير متاح حاليًا";

export function paymentState(request) {
  const pricing = pricingOf(request);
  const pending = (request?.offers || []).length > 0 && !request.selectedOfferId && !request.invoice;

  if (request?.paymentStatus === "CONFIRMED") {
    // Accepting the payment means "awaiting execution" — the service stage
    // is shown only once the agency has recorded it (request.progress).
    const executing = ["IN_EXECUTION", "DELIVERED"].includes(request.progress?.stage) || request.status === "CLOSED";
    return {
      key: "CONFIRMED",
      tone: "ok",
      label: "تم قبول الدفع",
      detail: executing ? "استلمت الوكالة دفعتك." : "استلمت الوكالة دفعتك، وطلبك بانتظار بدء التنفيذ.",
    };
  }
  if (request?.paymentStatus === "UNDER_REVIEW") {
    return { key: "UNDER_REVIEW", tone: "wait", label: "بانتظار مراجعة الدفع", detail: "رفعت الإيصال، ولم يُعتمد الدفع بعد. ستصلك نتيجة المراجعة." };
  }
  if (request?.paymentStatus === "AWAITING_TRANSFER") {
    // Fixed price paid after the document review (server: progress.paymentLocked).
    if (request.progress?.paymentLocked) {
      return { key: "PAYMENT_LOCKED", tone: "wait", label: "الدفع بعد اعتماد المستندات", detail: "طلبك مؤكد بالسعر الثابت. يُفتح الدفع بعد اعتماد مستنداتك، بالسعر نفسه." };
    }
    if (request.paymentRejection) {
      return { key: "RECEIPT_REJECTED", tone: "bad", label: "تم رفض إيصال الدفع", detail: `السبب: ${request.paymentRejection.reason}. ارفع إيصالًا صحيحًا.` };
    }
    return { key: "AWAITING_TRANSFER", tone: "action", label: "بانتظار التحويل", detail: "حوّل المبلغ إلى أحد الحسابات المعتمدة ثم ارفع صورة الإيصال." };
  }
  if (request?.invoice?.status === "PENDING") {
    return { key: "PRICE_PENDING_APPROVAL", tone: "action", label: "السعر بانتظار موافقتك", detail: "راجع السعر ووافق عليه ليظهر لك طريقة الدفع." };
  }
  if (request?.invoice?.status === "REJECTED") {
    return { key: "PRICE_REJECTED", tone: "wait", label: "رفضت السعر", detail: "بانتظار عرض جديد من الوكالة." };
  }
  if (pending) {
    return { key: "OFFERS_PENDING", tone: "action", label: "اختر أحد العروض", detail: "اختر العرض المناسب ليظهر لك طريقة الدفع." };
  }
  if (!pricing) {
    return { key: "NO_PRICE", tone: "wait", label: "لم يُحدد السعر بعد", detail: "تراجع الوكالة طلبك وسيصلك السعر هنا." };
  }
  return { key: "NONE", tone: "wait", label: "", detail: "" };
}

// What the customer may do about the price and payment. The server sends
// allowedActions (the same policy it enforces); without it (an older
// server) a closed request still offers nothing.
export function paymentActions(request) {
  const state = paymentState(request);
  const closed = request?.status === "CLOSED";
  const allowed = Array.isArray(request?.allowedActions) ? new Set(request.allowedActions) : null;
  const may = (action, fallback) => !closed && (allowed ? allowed.has(action) : fallback);
  return {
    canApprove: may("APPROVE_QUOTE", request?.invoice?.status === "PENDING"),
    canPay: may("UPLOAD_RECEIPT", state.key === "AWAITING_TRANSFER" || state.key === "RECEIPT_REJECTED"),
    state,
  };
}
