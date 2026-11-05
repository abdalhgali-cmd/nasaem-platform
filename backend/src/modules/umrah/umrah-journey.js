import { evaluateReadiness } from "../contact-request-workflow/workflow-policy.js";
import { evaluateUmrahDelivery, isUmrahRequest, umrahTicketBooking } from "./umrah-delivery.js";
import { umrahPackageKind } from "./umrah-packages.js";

// «رحلتي إلى الحرمين»: everything the customer's Umrah screen shows, derived
// on the server from the same facts as the progress steps (request-progress.js),
// so the app, the website and the staff dashboard never disagree. Clients
// only render it: no stage is inferred on the device.
export const NO_ACTION_MESSAGE = "لا يوجد إجراء مطلوب منك حالياً. سنُحدّث حالة طلبك عند اكتمال الخطوة التالية.";

const PACKAGE_LABELS = { VISA_ONLY: "تأشيرة عمرة فقط", AIR: "عمرة بالخدمات بالطيران", SEA: "عمرة بالخدمات بالبحر" };
const DOCUMENT_CODES = new Set(["DOCUMENTS_MISSING", "DOCUMENTS_REJECTED", "TRAVELERS_MISSING", "TRAVELER_INFO_MISSING", "ANSWERS_MISSING"]);

// The one thing the customer can do now, or null. Keys are stable; each
// client maps them to its own screen. Never offered when it cannot be done.
function customerAction(request, progress, delivery) {
  const readiness = evaluateReadiness(request);
  const documentsNeeded = readiness.reasons.some((reason) => DOCUMENT_CODES.has(reason.code));
  if (progress.stage === "CLOSED") {
    return delivery.visas.files.length ? { key: "VIEW_FILES", label: "عرض المستندات النهائية" } : null;
  }
  if (documentsNeeded && !request.executionStartedAt) {
    return { key: "COMPLETE_DOCUMENTS", label: "استكمال المستندات", message: readiness.reasons.find((r) => DOCUMENT_CODES.has(r.code))?.message };
  }
  if (request.paymentStatus === "AWAITING_TRANSFER" && !progress.paymentLocked) {
    if (request.paymentRejectionReason) {
      return { key: "REUPLOAD_RECEIPT", label: "رفع إيصال بديل", message: `رُفض الإيصال السابق: ${request.paymentRejectionReason}` };
    }
    return { key: "PAY", label: "إكمال الدفع", message: "حوّل المبلغ إلى أحد حسابات الوكالة ثم ارفع إيصال التحويل." };
  }
  return null;
}

// The seven customer stages, always in this order, each from the server's
// progress steps. Payment merges the transfer and its review; a visa-only
// package shows the services stage as not included.
const STAGES = [
  { key: "SUBMITTED", label: "تقديم الطلب", steps: ["RECEIVED"] },
  { key: "DOCUMENTS", label: "مراجعة المستندات", steps: ["DOCUMENTS"] },
  { key: "PAYMENT", label: "تأكيد الدفع", steps: ["PAYMENT", "PAYMENT_REVIEW"] },
  { key: "VISA_PROCEDURES", label: "إجراءات التأشيرة", steps: ["EXECUTION"] },
  { key: "VISAS", label: "إصدار التأشيرات", steps: ["VISAS"] },
  { key: "SERVICES", label: "تسليم الخدمات المشمولة", steps: ["SERVICES"] },
  { key: "COMPLETE", label: "اكتمال الرحلة", steps: ["DELIVERY"] },
];

function journeyStages(steps) {
  const byKey = new Map(steps.map((step) => [step.key, step]));
  return STAGES.map(({ key, label, steps: keys }) => {
    const parts = keys.map((k) => byKey.get(k)).filter(Boolean);
    if (!parts.length) return { key, label, state: "not_included", status: "غير مشمولة في باقتك (تأشيرة فقط)." };
    const state = parts.every((p) => p.state === "done") ? "done" : parts.some((p) => p.state === "current") ? "current" : "upcoming";
    const shown = parts.find((p) => p.state === "current") || parts[parts.length - 1];
    return { key, label, state, status: shown.status || "" };
  });
}

export function umrahJourney(request, progress) {
  if (!isUmrahRequest(request) || !progress) return null;
  const delivery = evaluateUmrahDelivery(request);
  const travelers = request.travelers || [];
  const started = Boolean(request.executionStartedAt);
  const visaCovered = new Set(delivery.visas.coveredTravelerIds);
  const servicesCovered = new Set(delivery.services?.coveredTravelerIds || []);
  const filesFor = (files, travelerId) => files
    .filter((d) => !d.travelerIds?.length ? travelers.length <= 1 : d.travelerIds.includes(travelerId))
    .map((d) => ({ id: d.id, label: d.label, publishedAt: d.publishedAt }));

  const pilgrims = travelers.map((traveler, index) => ({
    id: traveler.id,
    name: traveler.fullName || `المعتمر ${index + 1}`,
    visa: visaCovered.has(traveler.id) ? "ISSUED" : started ? "IN_PROGRESS" : "PENDING",
    visaFiles: filesFor(delivery.visas.files, traveler.id),
    ...(delivery.services
      ? { services: servicesCovered.has(traveler.id) ? "DELIVERED" : started ? "PREPARING" : "PENDING", serviceFiles: filesFor(delivery.services.files, traveler.id) }
      : {}),
  }));

  const steps = progress.steps || [];
  const stages = journeyStages(steps);
  const currentIndex = stages.findIndex((stage) => stage.state === "current");
  const current = currentIndex >= 0 ? stages[currentIndex] : null;
  const next = currentIndex >= 0 ? stages.slice(currentIndex + 1).find((stage) => stage.state !== "not_included") || null : null;
  const action = customerAction(request, progress, delivery);
  const anyFiles = delivery.visas.files.length > 0 || (delivery.services?.files.length || 0) > 0;
  // With nothing for the customer to do, a published visa is what they can use.
  const primaryAction = action || (anyFiles ? { key: "DOWNLOAD_VISAS", label: delivery.visas.files.length ? "تحميل التأشيرة" : "عرض المستندات النهائية" } : null);
  const closed = progress.stage === "CLOSED";

  return {
    title: "رحلتي إلى الحرمين",
    reference: request.id,
    packageKind: request.visaType ? "VISA_ONLY" : umrahPackageKind(request.serviceRef?.features),
    packageLabel: request.serviceRef?.name || request.visaType?.name || PACKAGE_LABELS[umrahPackageKind(request.serviceRef?.features)] || "العمرة",
    pilgrimCount: travelers.length || request.travelerCount || 1,
    status: progress.label,
    updatedAt: request.updatedAt || null,
    servicesIncluded: delivery.servicesRequired,
    visasIssued: delivery.visas.coveredTravelerIds.length,
    servicesDelivered: delivery.services ? delivery.services.coveredTravelerIds.length : null,
    pilgrims,
    stages,
    now: closed
      ? { stepKey: null, stepLabel: progress.label, actor: "NONE", actionRequired: false, message: progress.label, nextStepLabel: null }
      : {
          stepKey: current?.key || null,
          stepLabel: current?.label || progress.label,
          // Who the current step waits on.
          actor: action ? "CUSTOMER" : "AGENCY",
          actionRequired: Boolean(action),
          message: action?.message || current?.status || NO_ACTION_MESSAGE,
          noActionMessage: action ? null : NO_ACTION_MESSAGE,
          nextStepLabel: next?.label || null,
        },
    primaryAction,
    ticketBooking: umrahTicketBooking(request),
  };
}
