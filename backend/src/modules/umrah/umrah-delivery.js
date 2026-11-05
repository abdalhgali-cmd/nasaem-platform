import { isUmrahServiceCategory } from "../requirements/umrah-guarantor.js";
import { umrahIncludesTickets, umrahPackageKind } from "./umrah-packages.js";

export const UMRAH_TICKET_LINK = "UMRAH_TICKET";

export function umrahTicketBooking(request) {
  const inquiry = request.linkedRequests?.find((r) => r.linkKind === UMRAH_TICKET_LINK);
  const eligible = isUmrahRequest(request) && !["CANCELLED", "REJECTED"].includes(request.outcome) && evaluateUmrahDelivery(request).visas.complete;
  return {
    available: eligible && !inquiry,
    inquiryId: inquiry?.id || null,
    status: inquiry?.status || null,
    mode: umrahPackageKind(request.serviceRef?.features) === "SEA" ? "SEA" : "AIR",
  };
}

// What "delivered" means for an Umrah request (owner decision 2026-11-02):
// every pilgrim's visa is published, and, for a package with flight or sea
// services, the documents of those services are published for every pilgrim
// too. Issuing the visas alone never completes such a package.
//
// Kinds: VISA (a GENERAL final file on an Umrah request, uploaded before the
// kinds existed, counts as that pilgrim's visa) and SERVICE (TICKET counts as
// a service document).
export const UMRAH_VISA_KINDS = Object.freeze(["VISA", "GENERAL"]);
export const UMRAH_SERVICE_KINDS = Object.freeze(["SERVICE", "TICKET"]);

export function isUmrahRequest(request) {
  const visaType = request?.visaType;
  if (visaType) {
    return String(visaType.category || "").toUpperCase() === "UMRAH" || String(visaType.code || "").toUpperCase() === "VISA-UMRAH";
  }
  return isUmrahServiceCategory(String(request?.serviceRef?.category || "").toLowerCase());
}

// A visa type is the visa alone; only a package (Service) can include services.
export function umrahServicesRequired(request) {
  return isUmrahRequest(request) && !request?.visaType && umrahIncludesTickets(request?.serviceRef?.features);
}

function published(request, kinds) {
  return (request?.deliverables || []).filter((d) => d.publishedAt && !d.supersededAt && kinds.includes(d.kind || "GENERAL"));
}

// Which pilgrims a set of published files covers. With a single pilgrim a
// file without an explicit list covers them (as evaluateDelivery does).
export function coverageOf(request, kinds) {
  const files = published(request, kinds);
  const travelers = request?.travelers || [];
  if (travelers.length <= 1) {
    const onlyId = travelers[0]?.id || null;
    const covered = files.some((d) => !d.travelerIds?.length || (onlyId && d.travelerIds.includes(onlyId)));
    return {
      files,
      coveredTravelerIds: covered && onlyId ? [onlyId] : [],
      missingTravelerIds: covered || !onlyId ? [] : [onlyId],
      complete: covered,
    };
  }
  const covered = new Set(files.flatMap((d) => d.travelerIds || []));
  const missingTravelerIds = travelers.filter((t) => !covered.has(t.id)).map((t) => t.id);
  return {
    files,
    coveredTravelerIds: travelers.filter((t) => covered.has(t.id)).map((t) => t.id),
    missingTravelerIds,
    complete: missingTravelerIds.length === 0,
  };
}

function names(request, ids) {
  const travelers = request?.travelers || [];
  return ids.map((id) => {
    const index = travelers.findIndex((t) => t.id === id);
    return travelers[index]?.fullName || `المعتمر ${index + 1}`;
  });
}

// Same shape as evaluateDelivery (workflow-policy.js), for an Umrah request.
export function evaluateUmrahDelivery(request) {
  const visas = coverageOf(request, UMRAH_VISA_KINDS);
  const servicesRequired = umrahServicesRequired(request);
  const services = servicesRequired ? coverageOf(request, UMRAH_SERVICE_KINDS) : null;
  const reasons = [];
  if (!visas.complete) {
    const missing = names(request, visas.missingTravelerIds);
    reasons.push({ code: "VISAS_INCOMPLETE", message: missing.length ? `لم تُنشر التأشيرة بعد لـ: ${missing.join("، ")}.` : "لم تُنشر التأشيرة بعد." });
  }
  if (services && !services.complete) {
    const missing = names(request, services.missingTravelerIds);
    reasons.push({ code: "SERVICES_INCOMPLETE", message: missing.length ? `لم تُسلَّم مستندات الخدمات المشمولة بعد لـ: ${missing.join("، ")}.` : "لم تُسلَّم مستندات الخدمات المشمولة بعد." });
  }
  const missingTravelerIds = [...new Set([...visas.missingTravelerIds, ...(services?.missingTravelerIds || [])])];
  const travelers = request?.travelers || [];
  return {
    complete: visas.complete && (!services || services.complete),
    coveredTravelerIds: travelers.map((t) => t.id).filter((id) => !missingTravelerIds.includes(id)),
    missingTravelerIds,
    reasons,
    visas,
    services,
    servicesRequired,
  };
}

// The kind a staff upload gets on an Umrah request: VISA unless SERVICE is
// asked for (and only a package with services has SERVICE documents).
export function umrahDeliverableKind(request, requested) {
  if (requested === "SERVICE") {
    return umrahServicesRequired(request) ? { kind: "SERVICE" } : { error: { status: 400, code: "SERVICES_NOT_INCLUDED", message: "هذه الباقة لا تشمل خدمات طيران أو بحر: ارفع التأشيرة فقط." } };
  }
  if (requested && requested !== "VISA") return { error: { status: 400, code: "INVALID_KIND", message: "نوع الملف غير صالح لطلب عمرة." } };
  return { kind: "VISA" };
}
