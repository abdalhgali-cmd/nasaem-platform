import { EGYPT_CLEARANCE_CODE, completionBlockers, egyptTravelBlockers, evaluateDelivery, evaluateReadiness, executionBlockers, publishedDeliverables } from "../contact-request-workflow/workflow-policy.js";

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
    execution: "جارٍ استخراج تأشيرة العمرة",
    executionStep: "استخراج تأشيرة العمرة",
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
    if (code === "VISA-EGYPT-CLEARANCE") return "EGYPT_CLEARANCE";
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
//   QUOTE      done when the customer approved a price / chose an offer
//   PAYMENT    done only when staff accepted the payment (a receipt is not)
//   EXECUTION  current from the recorded start until the first final file
//              is published; done after that (started is not finished)
//   DELIVERY   done only when every traveler's final file is published
// "current" is the first step not done; a closed request has no current
// step, and a cancelled/rejected one never shows its delivery as done.
export function deriveRequestProgress(request) {
  const kind = deriveServiceKind(request);
  const copy = SERVICE_KINDS[kind];
  const { status, outcome, paymentStatus, invoice, offers, selectedOfferId } = request;
  const published = publishedDeliverables(request);
  const delivery = evaluateDelivery(request);
  const readiness = evaluateReadiness(request);
  const executionStartedAt = request.executionStartedAt || null;
  const completed = status === "CLOSED" && outcome === "COMPLETED";

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
  } else if (paymentStatus === "AWAITING_TRANSFER") {
    stage = "AWAITING_PAYMENT";
    label = "تمت الموافقة على السعر، بانتظار تحويل المبلغ";
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
    PAYMENT: paymentStatus === "CONFIRMED" || completed,
    EXECUTION: (Boolean(executionStartedAt) && published.length > 0) || fullyDelivered,
    DELIVERY: fullyDelivered,
    TRAVEL_PLAN: completed || egyptTravelBlockers(request).length === 0,
  };
  const steps = [
    { key: "RECEIVED", label: "استلام الطلب" },
    { key: "DOCUMENTS", label: "مراجعة المستندات والبيانات" },
    { key: "QUOTE", label: "عرض السعر والموافقة عليه" },
    { key: "PAYMENT", label: "مراجعة الدفع وقبوله" },
    { key: "EXECUTION", label: copy.executionStep },
    { key: "DELIVERY", label: copy.deliveryStep },
    // Egypt clearance only: the customer's travel plan and the agency's
    // booking/circular tasks it opens, required before completion.
    ...(request.visaType?.code === EGYPT_CLEARANCE_CODE ? [{ key: "TRAVEL_PLAN", label: "بيانات السفر والتعميم" }] : []),
  ];
  const currentIndex = status === "CLOSED" ? -1 : steps.findIndex((step) => !doneFlags[step.key]);
  const progressSteps = steps.map((step, index) => ({
    ...step,
    state: doneFlags[step.key] ? "done" : index === currentIndex ? "current" : "upcoming",
  }));

  const blockers = status === "CLOSED" ? [] : executionStartedAt ? [] : executionBlockers(request);
  return {
    serviceKind: kind,
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
