// Plain-language, customer-facing translation of a ContactRequest's overall
// state. Kept as its own pure function (rather than inlined in the
// controller) so later phases that enrich ContactRequest (documents,
// execution tracking, ...) have one obvious place to extend the precedence
// instead of scattering status text across the API layer.
// Exported (not just used internally below) so contact-requests.service.js
// can build customer-facing WhatsApp notifications using the exact same
// Arabic copy shown in /track, instead of a second, drifting set of strings.
export const STATUS_LABELS = {
  NEW: "تم استلام طلبك وهو قيد المراجعة",
  CONTACTED: "تم التواصل معك بخصوص طلبك",
  CLOSED: "تم إغلاق الطلب",
};

// Only shown while status is CLOSED — falls back to the generic CLOSED
// label above for any already-closed request predating this outcome field
// (outcome null), so existing data stays valid.
export const OUTCOME_LABELS = {
  COMPLETED: "تم إنجاز طلبك بنجاح",
  REJECTED: "تم رفض الطلب",
  CANCELLED: "تم إلغاء الطلب",
};

// Precedence (highest first): a closed request always wins; then delivered
// final files (the single most concrete, actionable thing a customer can
// see — more useful than repeating "payment confirmed" once there's
// actually something to download); then payment progress (once a price is
// settled — via Invoice approval or an offer selection — the payment side
// of the story matters more than how the price was settled); then the
// still-open pricing decision (an Invoice awaiting approval/rejection, or a
// set of offers awaiting selection — a request only ever has one of the
// two, see contact-requests.service.js); falling back to the bare request
// status.
export function deriveTrackingStatusLabel(contactRequest) {
  const { status, outcome, paymentStatus, invoice, offers, selectedOfferId, deliverables } =
    contactRequest;

  if (status === "CLOSED") {
    return (outcome && OUTCOME_LABELS[outcome]) || STATUS_LABELS.CLOSED;
  }

  if (deliverables?.length > 0) {
    return "ملفاتك النهائية جاهزة للتحميل";
  }

  if (paymentStatus === "CONFIRMED") {
    return "تم تأكيد الدفع، جارٍ تنفيذ طلبك";
  }

  if (paymentStatus === "UNDER_REVIEW") {
    return "بانتظار مراجعة إثبات التحويل";
  }

  if (paymentStatus === "AWAITING_TRANSFER") {
    return "تمت الموافقة على السعر، بانتظار تحويل المبلغ";
  }

  if (invoice?.status === "PENDING") {
    return "يوجد عرض سعر بانتظار موافقتك";
  }

  if (invoice?.status === "REJECTED") {
    return "تم رفض عرض السعر، بانتظار عرض جديد من فريقنا";
  }

  if (offers?.length > 0 && !selectedOfferId) {
    return "توجد عروض أسعار متعددة بانتظار اختيارك";
  }

  return STATUS_LABELS[status] ?? status;
}
