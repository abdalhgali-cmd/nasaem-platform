// Which ContactRequestExecutionStage values are legal for a given
// ContactRequest.department — mirrors contact-request-department.js's shape
// (a frozen lookup table + small pure functions, no I/O). Cross-reference:
// backend/frontend/assets/admin-management.js keeps a client-side copy of
// this same table (no dedicated endpoint) — keep both in sync.
export const SHARED_EXECUTION_STAGES = ["AWAITING_EXECUTION", "IN_PROGRESS"];
export const TERMINAL_EXECUTION_STAGES = ["DELIVERED_TO_CUSTOMER", "CANCELLED", "VISA_REJECTED"];

// Ordered: the array order is what the staff dropdown renders and what a
// reviewer reads as "the intended path". Order is NOT enforced as a
// forward-only progression — see isValidExecutionStageForDepartment.
export const EXECUTION_STAGES_BY_DEPARTMENT = {
  VISAS: [...SHARED_EXECUTION_STAGES, "SUBMITTED_TO_AUTHORITY", "VISA_ISSUED", "VISA_REJECTED", "DELIVERED_TO_CUSTOMER", "CANCELLED"],
  FLIGHTS: [...SHARED_EXECUTION_STAGES, "TICKETS_BOOKED", "TICKETS_ISSUED", "DELIVERED_TO_CUSTOMER", "CANCELLED"],
  FERRY: [...SHARED_EXECUTION_STAGES, "TICKETS_BOOKED", "TICKETS_ISSUED", "DELIVERED_TO_CUSTOMER", "CANCELLED"],
  UMRAH: [...SHARED_EXECUTION_STAGES, "UMRAH_DOCUMENTS_PREPARED", "UMRAH_PACKAGE_READY", "DELIVERED_TO_CUSTOMER", "CANCELLED"],
  HOTELS_PACKAGES: [...SHARED_EXECUTION_STAGES, "BOOKING_CONFIRMED_WITH_SUPPLIER", "VOUCHER_ISSUED", "DELIVERED_TO_CUSTOMER", "CANCELLED"],
};

// A request with an unmapped `service` string (department: null — see
// ContactRequest.department's schema comment) can still be tracked, just
// with the generic + terminal stages only, since there's no department-
// specific vocabulary to offer.
const UNMAPPED_DEPARTMENT_STAGES = [...SHARED_EXECUTION_STAGES, "DELIVERED_TO_CUSTOMER", "CANCELLED"];

export function getAllowedExecutionStages(department) {
  return department ? EXECUTION_STAGES_BY_DEPARTMENT[department] || [] : UNMAPPED_DEPARTMENT_STAGES;
}

export function isValidExecutionStageForDepartment(department, stage) {
  return getAllowedExecutionStages(department).includes(stage);
}

export function isTerminalExecutionStage(stage) {
  return TERMINAL_EXECUTION_STAGES.includes(stage);
}

// Kept in the backend (not just the client-side copy) because
// deriveCustomerFacingStatus (also backend, also Arabic) needs it too.
export const EXECUTION_STAGE_LABELS_AR = {
  AWAITING_EXECUTION: "بانتظار بدء التنفيذ",
  IN_PROGRESS: "قيد التنفيذ",
  SUBMITTED_TO_AUTHORITY: "تم التقديم للجهة المختصة",
  VISA_ISSUED: "تم إصدار التأشيرة",
  VISA_REJECTED: "تم رفض التأشيرة",
  TICKETS_BOOKED: "تم حجز التذاكر",
  TICKETS_ISSUED: "تم إصدار التذاكر",
  UMRAH_DOCUMENTS_PREPARED: "تم تجهيز مستندات العمرة",
  UMRAH_PACKAGE_READY: "الباقة جاهزة",
  BOOKING_CONFIRMED_WITH_SUPPLIER: "تم تأكيد الحجز مع المورد",
  VOUCHER_ISSUED: "تم إصدار الفاوتشر",
  DELIVERED_TO_CUSTOMER: "تم التسليم للعميل",
  CANCELLED: "تم الإلغاء",
};

// Not every stage is worth a WhatsApp interruption — only the ones a
// customer actually cares about hearing regardless of what they last saw.
export const CUSTOMER_NOTIFIABLE_EXECUTION_STAGES = new Set([
  "VISA_ISSUED",
  "VISA_REJECTED",
  "TICKETS_ISSUED",
  "UMRAH_PACKAGE_READY",
  "VOUCHER_ISSUED",
  "DELIVERED_TO_CUSTOMER",
  "CANCELLED",
]);
