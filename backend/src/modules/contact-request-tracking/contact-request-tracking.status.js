// Plain-language, customer-facing translation of a ContactRequest's overall
// state. Kept as its own pure function (rather than inlined in the
// controller) so later phases that enrich ContactRequest (documents,
// execution tracking, ...) have one obvious place to extend the precedence
// instead of scattering status text across the API layer.
const STATUS_LABELS = {
  NEW: "تم استلام طلبك وهو قيد المراجعة",
  CONTACTED: "تم التواصل معك بخصوص طلبك",
  CLOSED: "تم إغلاق الطلب",
};

// Precedence (highest first): a closed request always wins; then payment
// progress (once an invoice is approved, the payment side of the story
// matters more than the invoice's own PENDING/REJECTED state); then the
// invoice's own decision state; falling back to the bare request status.
export function deriveTrackingStatusLabel(contactRequest) {
  const { status, paymentStatus, invoice } = contactRequest;

  if (status === "CLOSED") {
    return STATUS_LABELS.CLOSED;
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

  return STATUS_LABELS[status] ?? status;
}
