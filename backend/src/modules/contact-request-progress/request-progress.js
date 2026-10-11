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
export function deriveRequestProgress(request) {
  const kind = deriveServiceKind(request);
  const copy = SERVICE_KINDS[kind];
  const { status, outcome, paymentStatus, invoice, offers, selectedOfferId } = request;
  const delivered = (request.deliverables?.length ?? 0) > 0;
  const executionStartedAt = request.executionStartedAt || null;

  let stage;
  let label;
  if (status === "CLOSED") {
    stage = "CLOSED";
    label = (outcome && CLOSED_LABELS[outcome]) || "تم إغلاق الطلب";
  } else if (delivered) {
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

  const paymentAccepted = paymentStatus === "CONFIRMED";
  const completed = status === "CLOSED" && outcome === "COMPLETED";
  const doneFlags = {
    RECEIVED: true,
    QUOTE: paymentStatus !== "NOT_REQUIRED" || completed,
    PAYMENT: paymentAccepted || completed,
    EXECUTION: Boolean(executionStartedAt) || delivered || completed,
    DELIVERY: delivered || completed,
  };
  // The step currently being worked on is the first one not done; a
  // closed request that wasn't completed has no current step.
  const steps = [
    { key: "RECEIVED", label: "استلام الطلب ومراجعة المستندات" },
    { key: "QUOTE", label: "عرض السعر والموافقة عليه" },
    { key: "PAYMENT", label: "مراجعة الدفع وقبوله" },
    { key: "EXECUTION", label: copy.executionStep },
    { key: "DELIVERY", label: copy.deliveryStep },
  ];
  const currentIndex = status === "CLOSED" ? -1 : steps.findIndex((step) => !doneFlags[step.key]);
  const progressSteps = steps.map((step, index) => ({
    ...step,
    state: doneFlags[step.key] ? "done" : index === currentIndex ? "current" : "upcoming",
  }));

  return {
    serviceKind: kind,
    serviceKindLabel: copy.label,
    stage,
    label,
    executionStartedAt,
    canStartExecution: status !== "CLOSED" && paymentAccepted && !executionStartedAt && !delivered,
    steps: progressSteps,
  };
}
