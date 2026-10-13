import { deriveRequestProgress } from "../contact-request-progress/request-progress.js";

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

// The label is the service-aware progress label (request-progress.js), so
// the tracking page, the account screens and the back-office all say the
// same thing. Payment acceptance reads "awaiting execution"; the
// service-specific execution text appears only once staff record it.
export function deriveTrackingStatusLabel(contactRequest) {
  return deriveRequestProgress(contactRequest).label;
}
