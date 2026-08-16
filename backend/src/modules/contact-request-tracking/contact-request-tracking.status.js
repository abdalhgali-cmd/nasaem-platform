// Plain-language, customer-facing translation of ContactRequestStatus.
// Kept as its own pure function (rather than inlined in the controller) so
// later phases that enrich ContactRequest (pricing, documents, payment) have
// one obvious place to extend the precedence instead of scattering status
// text across the API layer.
const STATUS_LABELS = {
  NEW: "تم استلام طلبك وهو قيد المراجعة",
  CONTACTED: "تم التواصل معك بخصوص طلبك",
  CLOSED: "تم إغلاق الطلب",
};

export function deriveTrackingStatusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}
