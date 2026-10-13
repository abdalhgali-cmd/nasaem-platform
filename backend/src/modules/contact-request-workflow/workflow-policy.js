// The request workflow policy: which action is allowed on a customer request
// in its current stored state, and why not. One place, used by every
// mutation (staff, phone tracking, customer account), by the progress
// model, and by the screens (allowedActions), so a button is offered only
// when the server would accept it, and a stale click is refused with the
// same Arabic reason.
//
// Pure: no database access. The callers load the request (with
// invoice, offers, documents, travelers, deliverables) inside a
// transaction holding the request's row lock (workflow-lock.js) and pass
// it here, so the decision is made on the state that will be written.
import { requirementApplies } from "../requirements/requirement-conditions.js";
import { isEgyptTravelTask } from "../contact-request-tracking/egypt-travel-tasks.js";
import { requestPricingMode } from "../contact-request-pricing/fixed-price.js";

export const ACTIONS = Object.freeze({
  ISSUE_QUOTE: "ISSUE_QUOTE",
  ADD_OFFER: "ADD_OFFER",
  APPROVE_QUOTE: "APPROVE_QUOTE",
  REJECT_QUOTE: "REJECT_QUOTE",
  SELECT_OFFER: "SELECT_OFFER",
  DECLARE_TRANSFER: "DECLARE_TRANSFER",
  UPLOAD_RECEIPT: "UPLOAD_RECEIPT",
  CONFIRM_PAYMENT: "CONFIRM_PAYMENT",
  REJECT_PAYMENT: "REJECT_PAYMENT",
  UPLOAD_DOCUMENT: "UPLOAD_DOCUMENT",
  REVIEW_DOCUMENT: "REVIEW_DOCUMENT",
  START_EXECUTION: "START_EXECUTION",
  REVERT_EXECUTION: "REVERT_EXECUTION",
  PREPARE_DELIVERABLE: "PREPARE_DELIVERABLE",
  PUBLISH_DELIVERABLE: "PUBLISH_DELIVERABLE",
  SAVE_TRAVEL_PLAN: "SAVE_TRAVEL_PLAN",
  COMPLETE: "COMPLETE",
  CLOSE: "CLOSE",
  REOPEN: "REOPEN",
});

export const CUSTOMER_ACTIONS = Object.freeze([
  ACTIONS.APPROVE_QUOTE,
  ACTIONS.REJECT_QUOTE,
  ACTIONS.SELECT_OFFER,
  ACTIONS.DECLARE_TRANSFER,
  ACTIONS.UPLOAD_RECEIPT,
  ACTIONS.UPLOAD_DOCUMENT,
  ACTIONS.SAVE_TRAVEL_PLAN,
]);

// Which staff roles may perform each staff action (mirrors the route
// guards pinned in tests/fixtures/rbac-baseline.json; the routes stay
// authoritative, this only decides what the screens offer).
const WORK = ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"];
const FINANCE = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];
const MANAGERS = ["SUPER_ADMIN", "ADMIN"];
export const STAFF_ACTION_ROLES = Object.freeze({
  [ACTIONS.ISSUE_QUOTE]: WORK,
  [ACTIONS.ADD_OFFER]: WORK,
  [ACTIONS.CONFIRM_PAYMENT]: FINANCE,
  [ACTIONS.REJECT_PAYMENT]: FINANCE,
  [ACTIONS.REVIEW_DOCUMENT]: WORK,
  [ACTIONS.START_EXECUTION]: WORK,
  [ACTIONS.REVERT_EXECUTION]: MANAGERS,
  [ACTIONS.PREPARE_DELIVERABLE]: WORK,
  [ACTIONS.PUBLISH_DELIVERABLE]: WORK,
  [ACTIONS.COMPLETE]: WORK,
  [ACTIONS.CLOSE]: WORK,
  [ACTIONS.REOPEN]: MANAGERS,
});

const CLOSED_MESSAGE = "هذا الطلب مغلق ولا يقبل إجراءات جديدة. يمكن للإدارة إعادة فتحه بسبب مكتوب عند الحاجة.";

function refuse(code, message, reasons) {
  return { status: 409, code, message, ...(reasons ? { reasons } : {}) };
}

export function isClosed(request) {
  return request.status === "CLOSED";
}

// A request has a price once an invoice or an offer exists, or the payment
// flow has started (legacy rows). Only a priced request can be executed.
export function isPriced(request) {
  return Boolean(request.invoice) || (request.offers?.length ?? 0) > 0 || (request.paymentStatus && request.paymentStatus !== "NOT_REQUIRED");
}

export function isPublished(deliverable) {
  return Boolean(deliverable?.publishedAt);
}

export function publishedDeliverables(request) {
  return (request.deliverables || []).filter(isPublished);
}

function travelerName(request, travelerId, index) {
  const traveler = (request.travelers || []).find((t) => t.id === travelerId);
  return traveler?.fullName || `المسافر ${index + 1}`;
}

// Required information and documents, from the request's own snapshot of
// its requirements (what the customer was asked at submission) and its
// stored answers, travelers and current documents. Payment receipts are
// not "documents" here: they are decided in the payment step.
export function evaluateReadiness(request) {
  const reasons = [];
  const answers = request.intakeData?.answers || {};
  const travelers = request.travelers || [];
  const applicable = (request.requirementsSnapshot || []).filter((r) => r.required && requirementApplies(r, answers));
  const documents = (request.documents || []).filter((d) => !d.supersededAt && d.classification !== "FINANCIAL_DOCUMENT");

  if (Number.isInteger(request.travelerCount) && request.travelerCount > travelers.length) {
    reasons.push({ code: "TRAVELERS_MISSING", message: `بيانات ${request.travelerCount - travelers.length} من المسافرين غير مسجلة.` });
  }
  travelers.forEach((traveler, index) => {
    if (!String(traveler.fullName || "").trim()) {
      reasons.push({ code: "TRAVELER_INFO_MISSING", message: `اسم المسافر ${index + 1} غير مسجل.` });
    }
  });

  const missing = [];
  const rejected = [];
  const underReview = [];
  for (const requirement of applicable.filter((r) => !r.type || r.type === "DOCUMENT")) {
    const owners = requirement.scope === "TRAVELER" && travelers.length > 0 ? travelers.map((t) => t.id) : [null];
    owners.forEach((travelerId, index) => {
      const own = documents.filter((d) => d.requirementId === requirement.id && (travelerId === null || d.travelerId === travelerId));
      const who = travelerId === null ? "" : ` — ${travelerName(request, travelerId, index)}`;
      if (own.some((d) => d.status === "ACCEPTED")) return;
      if (own.some((d) => d.status === "PENDING")) underReview.push(`${requirement.name}${who}`);
      else if (own.some((d) => d.status === "REJECTED")) rejected.push(`${requirement.name}${who}`);
      else missing.push(`${requirement.name}${who}`);
    });
  }
  // Any other uploaded document still waiting for a decision is review work too.
  const extraPending = documents.filter((d) => d.status === "PENDING" && !applicable.some((r) => r.id === d.requirementId));
  for (const document of extraPending) underReview.push(document.label);

  if (missing.length) reasons.push({ code: "DOCUMENTS_MISSING", message: `مستندات مطلوبة لم تُرفع: ${missing.join("، ")}.` });
  if (rejected.length) reasons.push({ code: "DOCUMENTS_REJECTED", message: `مستندات مرفوضة بانتظار بديل: ${rejected.join("، ")}.` });
  if (underReview.length) reasons.push({ code: "DOCUMENTS_UNDER_REVIEW", message: `مستندات بانتظار مراجعة الموظف: ${underReview.join("، ")}.` });

  const missingAnswers = applicable
    .filter((r) => r.type && r.type !== "DOCUMENT")
    .filter((r) => answers[r.id] === undefined || answers[r.id] === "" || answers[r.id] === null);
  if (missingAnswers.length) {
    reasons.push({ code: "ANSWERS_MISSING", message: `معلومات مطلوبة لم تُستكمل: ${missingAnswers.map((r) => r.name).join("، ")}.` });
  }

  return {
    ready: reasons.length === 0,
    documentsComplete: missing.length === 0 && rejected.length === 0,
    documentsRejected: rejected.length > 0,
    documentsUnderReview: underReview.length > 0,
    answersComplete: missingAnswers.length === 0,
    reasons,
  };
}

// A fixed price accepted at submission is the approved price: there is no
// quote stage. When the item requires the document review before payment,
// payment stays locked (same price) until the documents are approved.
export function isFixedPrice(request) {
  return requestPricingMode(request) === "FIXED";
}

export function paymentLockReasons(request) {
  if (!isFixedPrice(request) || !request.pricingSnapshot?.paymentAfterDocumentReview) return [];
  if (request.paymentStatus === "UNDER_REVIEW" || request.paymentStatus === "CONFIRMED") return [];
  const readiness = evaluateReadiness(request);
  if (readiness.ready) return [];
  return [
    { code: "PAYMENT_AFTER_DOCUMENT_REVIEW", message: "يُفتح الدفع بعد اعتماد المستندات، بالسعر نفسه الذي قبلته." },
    ...readiness.reasons,
  ];
}

export function evaluatePayment(request) {
  if (request.paymentStatus === "CONFIRMED") return { satisfied: true, reasons: [] };
  if (!isPriced(request)) {
    return { satisfied: false, reasons: [{ code: "QUOTE_MISSING", message: "لم يُحدَّد سعر الخدمة بعد." }] };
  }
  const message =
    request.paymentStatus === "UNDER_REVIEW"
      ? "إيصال الدفع ما زال قيد المراجعة؛ اقبل الدفع أولًا."
      : "لم يُقبل الدفع بعد.";
  return { satisfied: false, reasons: [{ code: "PAYMENT_NOT_CONFIRMED", message }] };
}

// Every traveler must be covered by a published file. A request with no
// traveler rows, or a single one, is covered by any published file that is
// not explicitly assigned to someone else.
export function evaluateDelivery(request) {
  const published = publishedDeliverables(request);
  const travelers = request.travelers || [];
  if (travelers.length <= 1) {
    const onlyId = travelers[0]?.id;
    const covered = published.some((d) => !d.travelerIds?.length || (onlyId && d.travelerIds.includes(onlyId)));
    return {
      complete: covered,
      coveredTravelerIds: covered && onlyId ? [onlyId] : [],
      missingTravelerIds: covered || !onlyId ? [] : [onlyId],
      reasons: covered ? [] : [{ code: "DELIVERY_INCOMPLETE", message: "لم يُنشر الملف النهائي للعميل بعد." }],
    };
  }
  const covered = new Set(published.flatMap((d) => d.travelerIds || []));
  const missingTravelerIds = travelers.filter((t) => !covered.has(t.id)).map((t) => t.id);
  const names = travelers
    .map((t, index) => ({ t, index }))
    .filter(({ t }) => missingTravelerIds.includes(t.id))
    .map(({ t, index }) => travelerName(request, t.id, index));
  return {
    complete: missingTravelerIds.length === 0,
    coveredTravelerIds: travelers.filter((t) => covered.has(t.id)).map((t) => t.id),
    missingTravelerIds,
    reasons: missingTravelerIds.length
      ? [{ code: "DELIVERY_INCOMPLETE", message: `لم يُنشر الملف النهائي بعد لـ: ${names.join("، ")}.` }]
      : [],
  };
}

// Why execution cannot start now (empty when it can).
export function executionBlockers(request) {
  if (isClosed(request)) return [{ code: "REQUEST_CLOSED", message: CLOSED_MESSAGE }];
  if (request.executionStartedAt) return [{ code: "ALREADY_STARTED", message: "تم تسجيل بدء التنفيذ لهذا الطلب مسبقًا." }];
  return [...evaluatePayment(request).reasons, ...evaluateReadiness(request).reasons];
}

// What a request is. Recorded at submission (requestKind); never inferred
// from the absence of a price, an execution or a file. Requests created
// before requestKind existed (null) are classified conservatively from what
// they carry, without writing anything: any service, visa, traveler,
// requirement checklist or customer document makes it a service
// application; only a request with none of those is a legacy inquiry.
export function requestKindOf(request) {
  if (request.requestKind === "INQUIRY" || request.requestKind === "SERVICE_APPLICATION") return request.requestKind;
  const referencesService =
    Boolean(request.serviceId || request.visaTypeId) ||
    (request.requirementsSnapshot?.length ?? 0) > 0 ||
    (request.travelers?.length ?? 0) > 0 ||
    Number(request.travelerCount) > 0 ||
    (request.documents || []).some((d) => d.classification !== "FINANCIAL_DOCUMENT");
  return referencesService ? "SERVICE_APPLICATION" : "LEGACY_INQUIRY";
}

export const EGYPT_CLEARANCE_CODE = "VISA-EGYPT-CLEARANCE";

// The Egypt clearance continues after the approval file: the customer's
// travel plan (egypt-clearance-travel.service.js) and the agency's tasks it
// opens. Completion needs: the plan saved with its required fields; for an
// existing booking, its ticket document present and not rejected (a ticket
// still under review is already blocked by readiness); and none of the
// plan's system tasks (booking by the agency, circular) still open.
export function egyptTravelBlockers(request) {
  if (request.visaType?.code !== EGYPT_CLEARANCE_CODE) return [];
  const plan = request.intakeData?.egyptTravel;
  if (!plan || !plan.entryMode || !plan.bookingStatus || !plan.entryDate) {
    return [{ code: "TRAVEL_PLAN_MISSING", message: "لم تُستكمل بيانات السفر والتعميم (طريقة الدخول، حالة الحجز، تاريخ الدخول) من العميل." }];
  }
  const reasons = [];
  if (plan.bookingStatus === "EXISTING") {
    const ticket = (request.documents || []).find((d) => d.id === plan.ticketDocumentId && !d.supersededAt);
    if (!ticket) reasons.push({ code: "TRAVEL_TICKET_MISSING", message: "تذكرة/إثبات حجز الرحلة غير مرفوع." });
    else if (ticket.status === "REJECTED") reasons.push({ code: "TRAVEL_TICKET_REJECTED", message: "تذكرة/إثبات حجز الرحلة مرفوض وبانتظار بديل." });
  }
  const openTasks = (request.tasks || []).filter((t) => t.status === "OPEN" && isEgyptTravelTask(t));
  if (openTasks.length) {
    reasons.push({ code: "TRAVEL_TASKS_OPEN", message: `مهام السفر لم تُنجز بعد: ${openTasks.map((t) => t.title).join("، ")}.` });
  }
  return reasons;
}

// Why the request cannot be closed as completed now (empty when it can).
// A genuine inquiry (requestKind INQUIRY, or a legacy request with no
// service reference) that was never priced, executed or delivered can be
// closed as completed once answered. Everything else — every service
// application, priced or not — must be ready, paid, executed and fully
// delivered, plus any service-specific step (Egypt travel plan).
export function completionBlockers(request) {
  if (isClosed(request)) return [{ code: "REQUEST_CLOSED", message: CLOSED_MESSAGE }];
  const kind = requestKindOf(request);
  const untouched = !isPriced(request) && !request.executionStartedAt && (request.deliverables || []).length === 0;
  if ((kind === "INQUIRY" || kind === "LEGACY_INQUIRY") && untouched) return [];
  const reasons = [...evaluateReadiness(request).reasons, ...evaluatePayment(request).reasons];
  if (!request.executionStartedAt) reasons.push({ code: "EXECUTION_NOT_STARTED", message: "لم يُسجَّل بدء التنفيذ." });
  reasons.push(...evaluateDelivery(request).reasons);
  reasons.push(...egyptTravelBlockers(request));
  return reasons;
}

// Services whose request continues after the final file (the Egypt
// clearance travel plan and circular) are never closed automatically.
const POST_DELIVERY_STAGE = new Set([EGYPT_CLEARANCE_CODE]);
export function autoCompletes(request) {
  return !POST_DELIVERY_STAGE.has(request.visaType?.code);
}

// Validates the travelers a final file is said to cover.
export function checkCoverage(request, travelerIds) {
  const travelers = request.travelers || [];
  const ids = [...new Set((travelerIds || []).filter(Boolean))];
  if (ids.some((id) => !travelers.some((t) => t.id === id))) {
    return { status: 400, code: "INVALID_COVERAGE", message: "الملف مُسند إلى مسافر لا ينتمي إلى هذا الطلب." };
  }
  if (travelers.length > 1 && ids.length === 0) {
    return { status: 400, code: "COVERAGE_REQUIRED", message: "حدّد المسافرين الذين يخصهم هذا الملف (أو جميعهم لملف مشترك)." };
  }
  return null;
}

// The single decision function. Returns null when allowed, otherwise
// { status, code, message, reasons? } for the API response.
export function checkAction(action, request, context = {}) {
  if (action === ACTIONS.REOPEN) {
    return isClosed(request) ? null : refuse("NOT_CLOSED", "الطلب ليس مغلقًا.");
  }
  if (isClosed(request)) return refuse("REQUEST_CLOSED", CLOSED_MESSAGE);

  switch (action) {
    case ACTIONS.ISSUE_QUOTE:
      if (isFixedPrice(request)) return refuse("FIXED_PRICE", "سعر هذا الطلب ثابت وقبله العميل عند التقديم؛ لا يُصدر له عرض سعر.");
      if (request.invoice?.status === "APPROVED") return refuse("ALREADY_APPROVED", "وافق العميل على السعر، ولا يمكن تعديله الآن.");
      if ((request.offers?.length ?? 0) > 0) return refuse("OFFERS_EXIST", "لهذا الطلب عروض أسعار متعددة؛ أضف عرضًا بدل تحديد سعر واحد.");
      return null;
    case ACTIONS.ADD_OFFER:
      if (isFixedPrice(request)) return refuse("FIXED_PRICE", "سعر هذا الطلب ثابت وقبله العميل عند التقديم؛ لا تُضاف له عروض.");
      if (request.invoice) return refuse("INVOICE_EXISTS", "لهذا الطلب سعر واحد محدد؛ لا يمكن إضافة عروض متعددة.");
      if (request.selectedOfferId) return refuse("ALREADY_SELECTED", "اختار العميل عرضًا بالفعل.");
      return null;
    case ACTIONS.APPROVE_QUOTE:
    case ACTIONS.REJECT_QUOTE: {
      if (request.invoice?.status !== "PENDING") return refuse("QUOTE_NOT_PENDING", "لا يوجد سعر بانتظار قرارك؛ حدّث الصفحة.");
      // The customer decides on the exact price version displayed to them.
      // No version, a malformed one, or an older one: nothing is decided.
      const version = context.invoiceVersion;
      if (version === undefined || version === null || version === "") {
        return refuse("QUOTE_VERSION_REQUIRED", "تعذّر التأكد من السعر الذي تراه. حدّث الصفحة أو حدّث التطبيق إلى آخر إصدار، ثم راجع السعر وقرر.");
      }
      if (!/^[1-9]\d{0,8}$/.test(String(version))) {
        return refuse("QUOTE_VERSION_INVALID", "تعذّر التأكد من السعر الذي تراه. حدّث الصفحة أو حدّث التطبيق إلى آخر إصدار، ثم راجع السعر وقرر.");
      }
      if (Number(version) !== request.invoice.version) {
        return refuse("QUOTE_CHANGED", "عدّلت الوكالة السعر بعد أن فتحته؛ راجع السعر الجديد ثم قرر.");
      }
      return null;
    }
    case ACTIONS.SELECT_OFFER:
      if (request.selectedOfferId) return refuse("ALREADY_SELECTED", "تم اختيار عرض لهذا الطلب بالفعل.");
      if (!(request.offers?.length > 0)) return refuse("NO_OFFERS", "لا توجد عروض لهذا الطلب.");
      return null;
    case ACTIONS.DECLARE_TRANSFER:
    case ACTIONS.UPLOAD_RECEIPT:
      if (request.paymentStatus !== "AWAITING_TRANSFER") return refuse("PAYMENT_NOT_AWAITING", "لا ينتظر هذا الطلب تحويلًا الآن؛ حدّث الصفحة.");
      {
        const locked = paymentLockReasons(request);
        if (locked.length) return refuse("PAYMENT_AFTER_DOCUMENT_REVIEW", `${locked[0].message} ${locked.slice(1).map((r) => r.message).join(" ")}`.trim(), locked);
      }
      return null;
    case ACTIONS.CONFIRM_PAYMENT:
    case ACTIONS.REJECT_PAYMENT:
      if (request.paymentStatus !== "UNDER_REVIEW") return refuse("PAYMENT_NOT_UNDER_REVIEW", "لا يوجد إيصال دفع قيد المراجعة لهذا الطلب؛ ربما سبقك موظف آخر. حدّث الصفحة.");
      return null;
    case ACTIONS.UPLOAD_DOCUMENT:
      return null;
    case ACTIONS.REVIEW_DOCUMENT:
      if (context.document && context.document.status !== "PENDING") {
        return refuse("DOCUMENT_ALREADY_REVIEWED", "تمت مراجعة هذا المستند بالفعل؛ حدّث الصفحة.");
      }
      if (context.document?.classification === "FINANCIAL_DOCUMENT") {
        return refuse("RECEIPT_IN_PAYMENT_STEP", "إيصال الدفع يُقبل أو يُرفض من قسم الدفع.");
      }
      return null;
    case ACTIONS.START_EXECUTION: {
      const reasons = executionBlockers(request);
      if (!reasons.length) return null;
      if (reasons[0].code === "ALREADY_STARTED") return refuse("ALREADY_STARTED", reasons[0].message);
      return refuse("NOT_READY", `لا يمكن بدء التنفيذ الآن: ${reasons.map((r) => r.message).join(" ")}`, reasons);
    }
    case ACTIONS.REVERT_EXECUTION:
      if (!request.executionStartedAt) return refuse("EXECUTION_NOT_STARTED", "لم يُسجَّل بدء التنفيذ لهذا الطلب.");
      if (publishedDeliverables(request).length) return refuse("ALREADY_DELIVERED", "نُشر ملف نهائي للعميل؛ لا يمكن التراجع عن بدء التنفيذ.");
      return null;
    case ACTIONS.PREPARE_DELIVERABLE:
      return null;
    case ACTIONS.PUBLISH_DELIVERABLE: {
      if (context.deliverable && isPublished(context.deliverable)) return refuse("ALREADY_PUBLISHED", "هذا الملف منشور للعميل بالفعل.");
      const reasons = [...evaluatePayment(request).reasons];
      if (!request.executionStartedAt) reasons.push({ code: "EXECUTION_NOT_STARTED", message: "سجّل بدء التنفيذ قبل نشر الملف النهائي." });
      if (!reasons.length) return null;
      return refuse("NOT_RELEASABLE", `لا يمكن نشر الملف للعميل الآن: ${reasons.map((r) => r.message).join(" ")} يمكنك حفظه مسودة.`, reasons);
    }
    case ACTIONS.SAVE_TRAVEL_PLAN:
      return null;
    case ACTIONS.COMPLETE: {
      const reasons = completionBlockers(request);
      if (!reasons.length) return null;
      return refuse("NOT_COMPLETABLE", `لا يمكن إغلاق الطلب كمكتمل: ${reasons.map((r) => r.message).join(" ")}`, reasons);
    }
    case ACTIONS.CLOSE:
      return null;
    default:
      return refuse("UNKNOWN_ACTION", "إجراء غير معروف.");
  }
}

// What the screens may offer. Customer actions for the customer surfaces;
// staff actions filtered by the viewer's role.
export function allowedActions(request, { audience, role } = {}) {
  const candidates =
    audience === "customer"
      ? CUSTOMER_ACTIONS
      : Object.keys(STAFF_ACTION_ROLES).filter((action) => !role || STAFF_ACTION_ROLES[action].includes(role));
  return candidates.filter((action) => {
    if (action === ACTIONS.SAVE_TRAVEL_PLAN && request.visaType?.code !== EGYPT_CLEARANCE_CODE) return false;
    if (action === ACTIONS.PUBLISH_DELIVERABLE && !(request.deliverables || []).some((d) => !isPublished(d))) return false;
    if (action === ACTIONS.REVIEW_DOCUMENT && !(request.documents || []).some((d) => !d.supersededAt && d.status === "PENDING" && d.classification !== "FINANCIAL_DOCUMENT")) return false;
    // Offered when allowed for the version currently stored (what the
    // screen will display and send back).
    return checkAction(action, request, { invoiceVersion: request.invoice?.version }) === null;
  });
}
