import prisma from "../../config/database.js";

// Smart Case Operations — Release G (intelligence). Deterministic,
// explainable warnings only — every rule below is a plain comparison a
// person can check by hand. Nothing here ever rejects a case, deletes
// anything, or merges records: these are advisory signals for staff and
// (where safe) the customer.

// A passport is commonly required to stay valid some months beyond travel.
// The exact number is a per-service commercial rule, so it comes from the
// service's own configuration when set; this is only the fallback used when
// a service has expressed no rule of its own — chosen because 6 months is
// the near-universal baseline, and it is surfaced as a WARNING, never a
// hard block.
const DEFAULT_PASSPORT_VALIDITY_MONTHS = 6;

function monthsFromNow(months, now = new Date()) {
  const date = new Date(now);
  date.setMonth(date.getMonth() + months);
  return date;
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Passport/residence expiry, evaluated against OCR-extracted expiry dates
// (the only expiry data the platform actually holds) and the traveler's own
// recorded values.
export function buildExpiryWarnings({ documents = [], travelers = [] }, { now = new Date(), validityMonths } = {}) {
  const threshold = monthsFromNow(validityMonths ?? DEFAULT_PASSPORT_VALIDITY_MONTHS, now);
  const warnings = [];
  const travelersById = new Map(travelers.map((t) => [t.id, t]));

  for (const document of documents) {
    if (document.supersededAt) continue;

    const expiry = parseDate(document.ocrResult?.expirationDate);
    if (!expiry) continue;

    const travelerName = document.travelerId ? (travelersById.get(document.travelerId)?.fullName ?? null) : null;

    if (expiry < now) {
      warnings.push({
        code: "DOCUMENT_EXPIRED",
        documentId: document.id,
        travelerId: document.travelerId,
        message: travelerName
          ? `جواز ${travelerName} منتهي الصلاحية`
          : "المستند منتهي الصلاحية",
        expiresAt: expiry.toISOString().slice(0, 10),
      });
    } else if (expiry < threshold) {
      warnings.push({
        code: "DOCUMENT_EXPIRING_SOON",
        documentId: document.id,
        travelerId: document.travelerId,
        message: travelerName
          ? `صلاحية جواز ${travelerName} أقل من المدة المطلوبة`
          : "صلاحية المستند أقل من المدة المطلوبة",
        expiresAt: expiry.toISOString().slice(0, 10),
      });
    }
  }

  return warnings;
}

function normalize(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "").trim();
}

// Where OCR read something different from what the customer confirmed.
// Reported for a human to look at — never auto-corrected and never a
// rejection, since OCR is assistive and the confirmed value is the one the
// customer stands behind (see the passport-first flow).
export function buildOcrMismatchWarnings({ documents = [], travelers = [] }) {
  const warnings = [];
  const travelersById = new Map(travelers.map((t) => [t.id, t]));

  for (const document of documents) {
    if (document.supersededAt || !document.ocrResult || !document.travelerId) continue;

    const traveler = travelersById.get(document.travelerId);
    if (!traveler) continue;

    const extracted = normalize(document.ocrResult.documentNumber);
    const confirmed = normalize(traveler.passportNo);
    if (!extracted || !confirmed || extracted === confirmed) continue;

    warnings.push({
      code: "OCR_PASSPORT_MISMATCH",
      documentId: document.id,
      travelerId: traveler.id,
      message: `رقم الجواز المُدخل لـ${traveler.fullName} يختلف عمّا قُرئ من صورة الجواز`,
      // Both values are shown to staff so they can decide which is right;
      // this is exactly the comparison a person would do by eye.
      entered: traveler.passportNo,
      extracted: document.ocrResult.documentNumber,
    });
  }

  return warnings;
}

// Another active case for the same traveler passport + same service.
// Warns only — never merges or closes anything, since a customer
// legitimately re-applying (e.g. after a rejection) looks identical to a
// duplicate from the data alone.
export async function findDuplicateWarnings(contactRequest) {
  const passportNumbers = (contactRequest.travelers || [])
    .map((traveler) => traveler.passportNo)
    .filter(Boolean);

  if (passportNumbers.length === 0) return [];

  const others = await prisma.contactRequest.findMany({
    where: {
      id: { not: contactRequest.id },
      organizationId: contactRequest.organizationId,
      status: { not: "CLOSED" },
      ...(contactRequest.serviceId ? { serviceId: contactRequest.serviceId } : {}),
      ...(contactRequest.visaTypeId ? { visaTypeId: contactRequest.visaTypeId } : {}),
      travelers: { some: { passportNo: { in: passportNumbers } } },
    },
    select: {
      id: true,
      createdAt: true,
      travelers: { where: { passportNo: { in: passportNumbers } }, select: { passportNo: true, fullName: true } },
    },
    take: 5,
  });

  return others.map((other) => ({
    code: "POSSIBLE_DUPLICATE_APPLICATION",
    contactRequestId: other.id,
    message: `يوجد طلب آخر نشط لنفس الخدمة بنفس رقم الجواز (${other.travelers[0]?.fullName ?? ""})`,
    createdAt: other.createdAt,
  }));
}

// Everything a case's staff view should flag, in one call.
export async function buildCaseWarnings(contactRequestId, organizationId) {
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, organizationId },
    include: {
      travelers: { orderBy: { sortOrder: "asc" } },
      documents: { where: { supersededAt: null } },
      serviceRef: { select: { id: true } },
    },
  });

  if (!contactRequest) return { error: "NOT_FOUND" };

  const [duplicates] = await Promise.all([findDuplicateWarnings(contactRequest)]);

  return {
    warnings: [
      ...buildExpiryWarnings(contactRequest),
      ...buildOcrMismatchWarnings(contactRequest),
      ...duplicates,
    ],
  };
}

// Smart Case Operations — Release G (document reuse). A traveler's own
// previously-accepted passport, offered for reuse on a new case so the
// customer isn't asked to photograph the same document again.
//
// Scoped strictly to cases that belong to this same customer (matched on
// the verified phone the tracking session is authenticated as), and only
// documents that were actually ACCEPTED and are still current. The file is
// never copied and never auto-attached — the customer must explicitly
// choose it (see reuseDocument).
export async function findReusableDocuments(phoneNormalized, { requirementId } = {}) {
  const documents = await prisma.contactRequestDocument.findMany({
    where: {
      status: "ACCEPTED",
      supersededAt: null,
      ...(requirementId ? { requirementId } : {}),
      classification: "CUSTOMER_DOCUMENT",
      contactRequest: { phoneNormalized },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      label: true,
      fileName: true,
      mimeType: true,
      createdAt: true,
      ocrResult: true,
      requirementId: true,
      traveler: { select: { id: true, fullName: true, passportNo: true } },
    },
  });

  // Anything still valid tomorrow is worth offering; an already-expired
  // document is not, and offering it would just waste the customer's time.
  const now = new Date();
  return documents
    .filter((document) => {
      const expiry = parseDate(document.ocrResult?.expirationDate);
      return !expiry || expiry > now;
    })
    .map((document) => ({
      id: document.id,
      label: document.label,
      fileName: document.fileName,
      createdAt: document.createdAt,
      travelerName: document.traveler?.fullName ?? null,
      // Masked: enough for the customer to recognise which passport this
      // is, without reprinting the full number in a list view.
      passportHint: document.traveler?.passportNo
        ? `${"*".repeat(Math.max(0, document.traveler.passportNo.length - 2))}${document.traveler.passportNo.slice(-2)}`
        : null,
      expiresAt: parseDate(document.ocrResult?.expirationDate)?.toISOString().slice(0, 10) ?? null,
    }));
}

export { DEFAULT_PASSPORT_VALIDITY_MONTHS };
