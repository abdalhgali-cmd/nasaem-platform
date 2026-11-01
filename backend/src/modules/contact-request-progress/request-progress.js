import { umrahIncludesTickets } from "../umrah/umrah-packages.js";
import { isEgyptClearanceCode } from "../egypt-clearance/egypt-clearance-variants.js";
import { completionBlockers, egyptTravelBlockers, evaluateDelivery, evaluateReadiness, executionBlockers, isFixedPrice, paymentLockReasons, deliveryDeliverables } from "../contact-request-workflow/workflow-policy.js";

// One service-aware description of where a request stands, shared by the
// staff back-office, the customer app (account and phone tracking) and the
// tracking status label, so the three never disagree.
//
// The execution stage (ticket issuance, visa processing, hotel
// confirmation, ...) is only ever reported once staff have actually
// recorded it (executionStartedAt). Accepting a payment means exactly
// "payment accepted; awaiting execution" — nothing more is implied.

export const SERVICE_KINDS = {
  FLIGHT: {
    label: "تذاكر الطيران",
    execution: "جارٍ إصدار تذكرة الطيران",
    executionStep: "إصدار التذكرة",
    deliveryStep: "تسليم التذكرة",
  },
  FERRY: {
    label: "تذاكر العبّارات",
    execution: "جارٍ إصدار تذكرة العبّارة",
    executionStep: "إصدار تذكرة العبّارة",
    deliveryStep: "تسليم التذكرة",
  },
  HOTEL: {
    label: "حجز الفنادق",
    execution: "جارٍ تأكيد حجز الفندق",
    executionStep: "تأكيد الحجز مع الفندق",
    deliveryStep: "تسليم تأكيد الحجز",
  },
  UMRAH: {
    label: "العمرة",
    execution: "جارٍ إصدار التأشيرة",
    executionStep: "إصدار تأشيرة العمرة",
    deliveryStep: "تسليم التأشيرة",
  },
  FAMILY_VISIT: {
    label: "الزيارة العائلية",
    execution: "جارٍ استخراج تأشيرة الزيارة العائلية",
    executionStep: "استخراج تأشيرة الزيارة",
    deliveryStep: "تسليم التأشيرة",
  },
  EGYPT_CLEARANCE: {
    label: "الموافقة الأمنية لمصر",
    execution: "جارٍ استخراج الموافقة الأمنية",
    executionStep: "استخراج الموافقة الأمنية",
    deliveryStep: "تسليم الموافقة",
  },
  VISA: {
    label: "التأشيرات",
    execution: "جارٍ استخراج التأشيرة",
    executionStep: "استخراج التأشيرة",
    deliveryStep: "تسليم التأشيرة",
  },
  GENERAL: {
    label: "خدمة",
    execution: "جارٍ تنفيذ طلبك",
    executionStep: "تنفيذ الطلب",
    deliveryStep: "تسليم الملفات النهائية",
  },
};

// An Umrah package with flight or sea services (umrah/umrah-packages.js)
// issues the tickets as well as the visa.
const UMRAH_WITH_TICKETS = {
  ...SERVICE_KINDS.UMRAH,
  execution: "جارٍ إصدار التذاكر",
  executionStep: "إصدار التأشيرة والتذاكر",
  deliveryStep: "تسليم التأشيرة والتذاكر",
};

function serviceCopy(kind, request) {
  if (kind === "UMRAH" && !request?.visaType && umrahIncludesTickets(request?.serviceRef?.features)) return UMRAH_WITH_TICKETS;
  return SERVICE_KINDS[kind];
}

const SERVICE_CATEGORY_KINDS = {
  flight: "FLIGHT",
  ferry: "FERRY",
  hotel: "HOTEL",
  umrah: "UMRAH",
  umrah_package: "UMRAH",
  family_visit: "FAMILY_VISIT",
  egypt_clearance: "EGYPT_CLEARANCE",
  work_visa: "VISA",
  intl_visa: "VISA",
};

// A visa type (configured from the back-office) always wins over the
// service it hangs off: its own category says what is being processed.
export function deriveServiceKind(request) {
  const visaType = request?.visaType;
  if (visaType) {
    const code = String(visaType.code || "").toUpperCase();
    const category = String(visaType.category || "").toUpperCase();
    if (isEgyptClearanceCode(code)) return "EGYPT_CLEARANCE";
    if (category === "UMRAH" || code === "VISA-UMRAH") return "UMRAH";
    if (category === "FAMILY_VISIT" || code === "VISA-FAMILY-VISIT") return "FAMILY_VISIT";
    return "VISA";
  }
  const category = String(request?.serviceRef?.category || "").toLowerCase();
  return SERVICE_CATEGORY_KINDS[category] || "GENERAL";
}

const CLOSED_LABELS = {
  COMPLETED: "تم إنجاز طلبك بنجاح",
  REJECTED: "تم رفض الطلب",
  CANCELLED: "تم إلغاء الطلب",
};

// Stage keys are stable API values; labels are customer-facing Arabic.
//
// Step states describe what actually happened, from the same facts the
// workflow policy uses (workflow-policy.js):
//   RECEIVED   always done once the request exists
//   DOCUMENTS  done only when every required document is accepted and the
//              required information is complete (receiving is not reviewing)
//   QUOTE      done when the customer approved a price / chose an offer.
//              QUOTE-mode requests only: a fixed price was accepted with the
//              order itself (RECEIVED), so there is no quote step at all
//   PAYMENT    done once the customer sent the transfer receipt
//   PAYMENT_REVIEW done only when staff accepted the payment (a receipt
//              uploaded is not an accepted payment)
//   EXECUTION  current from the recorded start until the first final file
//              is published; done after that (started is not finished)
//   DELIVERY   done only when every traveler's final file is published
// "current" is the first step not done; a closed request has no current
// step, and a cancelled/rejected one never shows its delivery as done.
export function deriveRequestProgress(request) {
  const kind = deriveServiceKind(request);
  const copy = serviceCopy(kind, request);
  const { status, outcome, paymentStatus, invoice, offers, selectedOfferId } = request;
  const published = deliveryDeliverables(request);
  const delivery = evaluateDelivery(request);
  const readiness = evaluateReadiness(request);
  const executionStartedAt = request.executionStartedAt || null;
  const completed = status === "CLOSED" && outcome === "COMPLETED";
  const fixed = isFixedPrice(request);
  const lockReasons = status === "CLOSED" ? [] : paymentLockReasons(request);
  const paymentLocked = lockReasons.length > 0;

  let stage;
  let label;
  if (status === "CLOSED") {
    stage = "CLOSED";
    label = (outcome && CLOSED_LABELS[outcome]) || "تم إغلاق الطلب";
  } else if (delivery.complete && published.length) {
    stage = "DELIVERED";
    label = "ملفاتك النهائية جاهزة للتحميل";
  } else if (paymentStatus === "CONFIRMED" && executionStartedAt) {
    stage = "IN_EXECUTION";
    label = copy.execution;
  } else if (paymentStatus === "CONFIRMED") {
    stage = "PAYMENT_ACCEPTED";
    label = "تم قبول الدفع، بانتظار بدء التنفيذ";
  } else if (paymentStatus === "UNDER_REVIEW") {
    stage = "PAYMENT_REVIEW";
    label = "بانتظار مراجعة إثبات التحويل";
  } else if (paymentStatus === "AWAITING_TRANSFER" && paymentLocked) {
    stage = "AWAITING_DOCUMENT_REVIEW";
    label = "طلبك مؤكد بالسعر الثابت؛ يُفتح الدفع بعد اعتماد المستندات";
  } else if (paymentStatus === "AWAITING_TRANSFER") {
    stage = "AWAITING_PAYMENT";
    label = fixed ? "طلبك مؤكد بالسعر الثابت، بانتظار تحويل المبلغ" : "تمت الموافقة على السعر، بانتظار تحويل المبلغ";
  } else if (invoice?.status === "PENDING") {
    stage = "QUOTE_PENDING";
    label = "يوجد عرض سعر بانتظار موافقتك";
  } else if (invoice?.status === "REJECTED") {
    stage = "QUOTE_REJECTED";
    label = "تم رفض عرض السعر، بانتظار عرض جديد من فريقنا";
  } else if (offers?.length > 0 && !selectedOfferId) {
    stage = "QUOTE_PENDING";
    label = "توجد عروض أسعار متعددة بانتظار اختيارك";
  } else {
    stage = "REVIEW";
    label = status === "CONTACTED" ? "تم التواصل معك بخصوص طلبك" : "تم استلام طلبك وهو قيد المراجعة";
  }

  const quoteAccepted = invoice?.status === "APPROVED" || Boolean(selectedOfferId) || ["AWAITING_TRANSFER", "UNDER_REVIEW", "CONFIRMED"].includes(paymentStatus);
  const fullyDelivered = (delivery.complete && published.length > 0) || completed;
  const doneFlags = {
    RECEIVED: true,
    DOCUMENTS: readiness.ready || completed,
    QUOTE: quoteAccepted || completed,
    PAYMENT: paymentStatus === "UNDER_REVIEW" || paymentStatus === "CONFIRMED" || completed,
    PAYMENT_REVIEW: paymentStatus === "CONFIRMED" || completed,
    EXECUTION: (Boolean(executionStartedAt) && published.length > 0) || fullyDelivered,
    DELIVERY: fullyDelivered,
    TRAVEL_PLAN: completed || egyptTravelBlockers(request).length === 0,
  };
  const steps = [
    { key: "RECEIVED", label: fixed ? "تأكيد الطلب بالسعر الثابت" : "استلام الطلب" },
    { key: "DOCUMENTS", label: "مراجعة المستندات والبيانات" },
    ...(fixed ? [] : [{ key: "QUOTE", label: "عرض السعر والموافقة عليه" }]),
    { key: "PAYMENT", label: "تحويل المبلغ ورفع الإيصال" },
    { key: "PAYMENT_REVIEW", label: "مراجعة الإيصال وقبول الدفع" },
    { key: "EXECUTION", label: copy.executionStep },
    { key: "DELIVERY", label: copy.deliveryStep },
    // Egypt clearance only: the customer's travel plan and the agency's
    // booking/circular tasks it opens, required before completion.
    ...(isEgyptClearanceCode(request.visaType?.code) ? [{ key: "TRAVEL_PLAN", label: "بيانات السفر والتعميم" }] : []),
  ];
  const currentIndex = status === "CLOSED" ? -1 : steps.findIndex((step) => !doneFlags[step.key]);
  const money = (amount, currency) => `${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`;
  const snapshotForStatus = request.pricingSnapshot || null;
  // One factual status line per step (what happened / what is awaited),
  // shown when the customer opens that step.
  const travelPlanBlockers = egyptTravelBlockers(request);
  const stepStatus = {
    RECEIVED: fixed && snapshotForStatus?.total !== undefined
      ? `أكّدت الطلب بإجمالي ${money(snapshotForStatus.total, snapshotForStatus.currency)} (سعر ثابت).`
      : "تم استلام طلبك.",
    DOCUMENTS: readiness.ready ? "تم اعتماد المستندات والبيانات المطلوبة." : readiness.reasons.map((r) => r.message).join(" "),
    QUOTE: invoice?.status === "PENDING"
      ? "عرض السعر بانتظار موافقتك."
      : invoice?.status === "REJECTED"
        ? "رفضت عرض السعر؛ بانتظار عرض جديد من الوكالة."
        : offers?.length > 0 && !selectedOfferId
          ? "توجد عروض بانتظار اختيارك."
          : quoteAccepted
            ? "تمت الموافقة على السعر."
            : "لم تُصدر الوكالة عرض السعر بعد.",
    PAYMENT: paymentLocked
      ? lockReasons[0].message
      : paymentStatus === "AWAITING_TRANSFER"
        ? "بانتظار تحويل المبلغ ورفع إيصال الدفع."
        : paymentStatus === "UNDER_REVIEW" || paymentStatus === "CONFIRMED"
          ? "تم رفع إيصال الدفع."
          : "يُفتح الدفع بعد تحديد السعر.",
    PAYMENT_REVIEW: paymentStatus === "CONFIRMED"
      ? "قبلت الوكالة الدفع."
      : paymentStatus === "UNDER_REVIEW"
        ? "الإيصال قيد مراجعة الوكالة؛ لم يُقبل الدفع بعد."
        : "لم يُرفع إيصال للمراجعة بعد.",
    EXECUTION: doneFlags.EXECUTION
      ? "اكتمل التنفيذ."
      : executionStartedAt
        ? `${copy.execution} — بدأ التنفيذ ولم يكتمل بعد.`
        : paymentStatus === "CONFIRMED"
          ? "تم قبول الدفع، بانتظار بدء التنفيذ."
          : "يبدأ التنفيذ بعد قبول الدفع واعتماد المستندات.",
    DELIVERY: fullyDelivered
      ? "الملفات النهائية منشورة وجاهزة للتحميل."
      : published.length
        ? `نُشر جزء من الملفات النهائية؛ ${delivery.reasons.map((r) => r.message).join(" ")}`
        : "لم تُنشر الملفات النهائية بعد.",
    TRAVEL_PLAN: travelPlanBlockers.length ? travelPlanBlockers.map((r) => r.message).join(" ") : "اكتملت بيانات السفر والتعميم.",
  };
  const progressSteps = steps.map((step, index) => ({
    ...step,
    state: doneFlags[step.key] ? "done" : index === currentIndex ? "current" : "upcoming",
    status: stepStatus[step.key],
    // EXECUTION only: recorded start (in progress) versus finished.
    ...(step.key === "EXECUTION" ? { started: Boolean(executionStartedAt) } : {}),
  }));

  const blockers = status === "CLOSED" ? [] : executionStartedAt ? [] : executionBlockers(request);
  const snapshot = request.pricingSnapshot || null;
  return {
    serviceKind: kind,
    // "FIXED" (catalog price accepted at submission, no quote step) or
    // "QUOTE"; with the accepted snapshot for FIXED.
    pricingMode: fixed ? "FIXED" : "QUOTE",
    pricing: fixed && snapshot
      ? { total: snapshot.total, currency: snapshot.currency, unitPrice: snapshot.unitPrice, priceUnit: snapshot.priceUnit, units: snapshot.units, paymentAfterDocumentReview: Boolean(snapshot.paymentAfterDocumentReview), acceptedAt: snapshot.acceptedAt }
      : null,
    // Fixed price with payment after the document review: why payment is
    // not open yet (empty once it is).
    paymentLocked,
    paymentLockReasons: lockReasons,
    serviceKindLabel: copy.label,
    stage,
    label,
    executionStartedAt,
    canStartExecution: !executionStartedAt && status !== "CLOSED" && blockers.length === 0,
    // Why execution cannot start yet (Arabic, actionable); empty once started.
    blockers,
    // Why it cannot be closed as completed yet (same list the server
    // answers with); empty when it can, or once closed.
    completionBlockers: status === "CLOSED" ? [] : completionBlockers(request),
    delivery: {
      complete: delivery.complete && published.length > 0,
      coveredTravelerIds: delivery.coveredTravelerIds,
      missingTravelerIds: delivery.missingTravelerIds,
    },
    steps: progressSteps,
  };
}
