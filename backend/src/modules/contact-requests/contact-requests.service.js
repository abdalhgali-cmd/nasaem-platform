import path from "path";
import prismaPackage from "@prisma/client";
import { publicOrganizationId } from "../../utils/publicOrganization.js";
import { pendingConfirmationCreate, sendRequestConfirmation } from "../customer-messages/customer-messages.service.js";
import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { safeUserSelect } from "../../utils/safeSelects.js";
import { logActivity } from "../../utils/activityLog.js";
import { createNotification, notifyRequestCustomer } from "../../utils/notifications.js";
import { sdgSnapshot } from "../finance/fx-snapshot.js";
import { deriveRequestProgress } from "../contact-request-progress/request-progress.js";
import { resolveUmrahContacts } from "../umrah/umrah-packages.js";
import { ACTIONS, autoCompletes, checkAction, completionBlockers, evaluateDelivery, evaluateReadiness, publishedDeliverables, allowedActions } from "../contact-request-workflow/workflow-policy.js";
import { WORKFLOW_INCLUDE, auditInTransaction, refuseWith, withLockedRequest } from "../contact-request-workflow/workflow-lock.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { resolveSubmissionPricing } from "../contact-request-pricing/fixed-price.js";
import { normalizePhone } from "../../utils/phone.js";
import {
  OUTCOME_LABELS,
  STATUS_LABELS,
} from "../contact-request-tracking/contact-request-tracking.status.js";
import { maybeRunPassportOcr } from "../passport-ocr/passport-ocr.service.js";
import { getPublicChecklist } from "../requirements/requirements.service.js";
import { deriveSlaState, syncCaseTasks } from "../case-tasks/case-tasks.service.js";
import { isFeatureEnabled } from "../feature-flags/feature-flags.service.js";
import { applyEgyptEntryMode, egyptVariantBookingError, resolveEgyptRoute, EGYPT_CLEARANCE_CODE, EGYPT_CLEARANCE_VARIANTS } from "../egypt-clearance/egypt-clearance-variants.js";
import { SERVICE_CATEGORY_FEATURE_FLAGS } from "../feature-flags/feature-flags.constants.js";
import { CONTACT_REQUEST_DOCUMENT_DIR, generateUniqueFilename, saveBufferToDirectory } from "../../middleware/upload.middleware.js";

const { Prisma } = prismaPackage;

// Short, consistent "which request is this about" prefix for every
// customer-facing WhatsApp notification below — reuses the same `service`
// label and `id` the customer already sees on the wizard's confirmation
// screen and in /track, so the reference is recognizable, not a new format.
// Exported so the sibling document/deliverable modules can build the same
// reference in their own customer notifications instead of duplicating it.
export function describeRequest(contactRequest) {
  return contactRequest.service
    ? `${contactRequest.service} (رقم ${contactRequest.id})`
    : `رقم ${contactRequest.id}`;
}

function prepareFileForStorage(file) {
  let storagePath;
  if (file.buffer) {
    const filename = generateUniqueFilename(file.originalname);
    saveBufferToDirectory(file.buffer, CONTACT_REQUEST_DOCUMENT_DIR, filename);
    storagePath = path.join("contact-request-documents", filename);
  } else {
    storagePath = path.join("contact-request-documents", file.filename);
  }
  return storagePath;
}

// Fans out an internal notification to every active SUPER_ADMIN/ADMIN —
// originally inlined in createContactRequest only; extracted so every other
// contact-request event staff should know about (customer approved a price,
// selected an offer, uploaded a document, ...) can reuse the same fan-out
// instead of staff having to poll the Contact Requests tab to notice.
// `contactRequestId` links the notification to the request it is about, so
// opening it in the back-office goes straight to that request. `alsoRoles`
// adds the staff roles that do the work the event asks for (e.g. ACCOUNTANT
// for a payment receipt) on top of the administrators.
export async function notifyAdmins({ title, message, type, organizationId = "org_nasaem_default", contactRequestId, alsoRoles = [] }) {
  const admins = await prisma.user.findMany({
    where: { organizationId, role: { in: ["SUPER_ADMIN", "ADMIN", ...alsoRoles] }, status: "ACTIVE" },
    select: { id: true },
  });

  await Promise.all(
    admins.map((admin) => createNotification({ title, message, type, userId: admin.id, contactRequestId }))
  );
}

// `files` are the Service Intake wizard's uploaded documents (Umrah/Visas/
// Packages), if any — the plain contact form never sends these, so this
// defaults to none and behaves exactly as before. Documents are created in
// the same nested-write as the ContactRequest itself so a request is never
// left without the documents the customer attached to it.
// A retried submission (same client submissionKey) returns the request the
// first attempt already created. The phone must match, so a key alone never
// reveals someone else's request.
async function findExistingSubmission(data) {
  if (!data.submissionKey) return null;
  const existing = await prisma.contactRequest.findUnique({
    where: { submissionKey: data.submissionKey },
    select: { id: true, phoneNormalized: true },
  });
  if (!existing) return null;
  if (existing.phoneNormalized !== normalizePhone(data.phone)) return { error: "SUBMISSION_KEY_CONFLICT" };
  return { id: existing.id, duplicate: true };
}

export async function createContactRequest(data, req, files = []) {
  const existingSubmission = await findExistingSubmission(data);
  if (existingSubmission) return existingSubmission;

  try {
    return await createContactRequestOnce(data, req, files);
  } catch (error) {
    // Two concurrent retries with the same key: the loser of the unique
    // index race gets the winner's request.
    if (error?.code === "P2002" && data.submissionKey) {
      const raced = await findExistingSubmission(data);
      if (raced) return raced;
    }
    throw error;
  }
}

async function createContactRequestOnce(data, req, files) {
  const documentLabels = data.documentLabels || [];
  const documentRequirementIds = data.documentRequirementIds || [];
  // Smart Case Operations — Release A (Customer/Traveler separation). Both
  // optional and additive: a wizard build that doesn't send them creates
  // exactly the request it always did (zero Traveler rows, every document
  // case/customer-scoped) — see the schema.prisma Traveler model comment.
  const travelers = data.travelers || [];
  const documentTravelerIndexes = data.documentTravelerIndexes || [];

  // Platform 3.0 Phase 13: HOTEL_SEARCH/SECURITY_APPROVAL gate intake for
  // the specific, real Service categories that already exist for those
  // capabilities (seeded in Phase 3/8: "hotel", "egypt_clearance") — not
  // a guessed/invented rule for what else might count as one. See
  // SERVICE_CATEGORY_FEATURE_FLAGS's own comment for this disclosed
  // boundary.
  let umrahContacts = null;
  if (data.serviceId) {
    const service = await prisma.service.findUnique({ where: { id: data.serviceId }, select: { category: true } });
    const flagKey = service ? SERVICE_CATEGORY_FEATURE_FLAGS[service.category] : null;
    if (flagKey && !(await isFeatureEnabled(flagKey))) {
      return { error: "FEATURE_DISABLED" };
    }
    // Umrah package (not a visa type): the guarantor's phone and an optional
    // extra contact (an invalid one is refused before anything is created).
    const umrah = resolveUmrahContacts(data.visaTypeId ? null : service?.category, data);
    if (umrah.error) return umrah;
    umrahContacts = umrah.contacts;
  }

  // Platform 3.0 Phase 5: capture the selected visa type's (or, since
  // Phase 8, service's — e.g. Security Approvals) active requirements
  // checklist AS IT IS RIGHT NOW. This is a point-in-time copy, not a
  // live reference — an admin editing/deactivating a requirement later
  // must never change what this specific application's checklist said at
  // submission time.
  const requirementsSnapshot = data.visaTypeId
    ? await getPublicChecklist({ visaTypeId: data.visaTypeId })
    : data.serviceId
      ? await getPublicChecklist({ serviceId: data.serviceId })
      : null;

  // Platform 3.0 Phase 6: validate each file tagged with a requirementId
  // against that requirement's own rules — reusing the snapshot just
  // fetched above rather than a second query per file. Rejects the whole
  // submission (nothing is created) rather than silently dropping/
  // mislabeling a file that doesn't satisfy its requirement.
  // Platform 3.0 Phase 7: OCR result per file index, populated only for
  // files tagged with a requirementId whose ocrEnabled is set (see the
  // validation loop below, which also builds requirementsById).
  const ocrResults = new Array(files.length).fill(null);

  if (documentRequirementIds.some(Boolean)) {
    const requirementsById = new Map((requirementsSnapshot || []).map((r) => [r.id, r]));
    const countByRequirement = new Map();

    for (let i = 0; i < files.length; i += 1) {
      const requirementId = documentRequirementIds[i];
      if (!requirementId) continue;

      const requirement = requirementsById.get(requirementId);
      if (!requirement) return { error: "REQUIREMENT_NOT_FOUND" };

      const file = files[i];
      if (requirement.allowedMimeTypes.length > 0 && !requirement.allowedMimeTypes.includes(file.mimetype)) {
        return { error: "INVALID_MIME", details: { requirementId, allowedMimeTypes: requirement.allowedMimeTypes } };
      }
      if (requirement.maxSizeBytes && file.size > requirement.maxSizeBytes) {
        return { error: "FILE_TOO_LARGE", details: { requirementId, maxSizeBytes: requirement.maxSizeBytes } };
      }

      // A TRAVELER-scoped requirement (e.g. "passport copy") is satisfied
      // once PER TRAVELER, not once total — each traveler independently
      // gets up to maxFiles for it. Counting by requirementId alone would
      // reject traveler #2's passport as MAX_FILES_REACHED once traveler
      // #1's was already attached. CUSTOMER/CASE-scoped requirements keep
      // the original single, request-wide count.
      const countKey =
        requirement.scope === "TRAVELER" ? `${requirementId}::${documentTravelerIndexes[i] ?? ""}` : requirementId;
      const seenCount = (countByRequirement.get(countKey) || 0) + 1;
      countByRequirement.set(countKey, seenCount);
      if (seenCount > requirement.maxFiles) {
        return { error: "MAX_FILES_REACHED", details: { requirementId, maxFiles: requirement.maxFiles } };
      }

      ocrResults[i] = await maybeRunPassportOcr(requirement, file);
    }
  }

  // Smart Case Operations — Release A. Each entry in documentTravelerIndexes
  // must be "" (case/customer-scoped) or a valid index into `travelers` —
  // validated up front, alongside the MIME/size/requirement checks above,
  // so a bad reference rejects the whole submission rather than silently
  // creating an orphaned or wrongly-owned document.
  for (let i = 0; i < files.length; i += 1) {
    const ref = documentTravelerIndexes[i];
    if (!ref) continue;
    const index = Number(ref);
    if (!Number.isInteger(index) || index < 0 || index >= travelers.length) {
      return { error: "TRAVELER_NOT_FOUND" };
    }
  }

  // Egypt clearance: the variant (air / border crossing) fixes the entry
  // method; it is recorded as the answer, and a submission claiming the other
  // one is refused before anything is created.
  let egyptEntryMode = null;
  let egyptRoute = null;
  if (data.visaTypeId) {
    const visaType = await prisma.visaType.findUnique({ where: { id: data.visaTypeId }, select: { code: true, active: true, pricingMode: true, basePrice: true, currency: true } });
    const unavailable = egyptVariantBookingError(visaType, { acceptedTotal: data.acceptedTotal });
    if (unavailable) return unavailable;
    const egypt = applyEgyptEntryMode(visaType?.code, requirementsSnapshot, data.answers);
    if (egypt.error) return egypt;
    if (egypt.entryMode) {
      egyptEntryMode = egypt.entryMode;
      data = { ...data, answers: egypt.answers };
    }
    const route = resolveEgyptRoute(visaType?.code, data);
    if (route.error) return route;
    egyptRoute = route.route;
  }

  // Fixed catalog price: recomputed here from the catalog and compared with
  // the total the customer confirmed; a mismatch creates nothing (409).
  const pricing = await resolveSubmissionPricing(data, { travelers: travelers.length });
  if (pricing.error) return pricing;

  const baseData = {
    name: data.name,
    organizationId: req.customer?.organizationId || publicOrganizationId(),
    phone: data.phone,
    phoneNormalized: normalizePhone(data.phone),
    email: data.email || null,
    service: data.service || null,
    serviceId: data.serviceId || null,
    visaTypeId: data.visaTypeId || null,
    travelerCount: data.travelerCount ?? null,
    // Recorded once, from what was submitted (see schema.prisma): choosing a
    // service or visa, or sending travelers, documents or a requirement
    // checklist, is a service application; anything else is an inquiry.
    requestKind:
      data.serviceId || data.visaTypeId || travelers.length > 0 || files.length > 0 || Number(data.travelerCount) > 0 || (requirementsSnapshot?.length ?? 0) > 0
        ? "SERVICE_APPLICATION"
        : "INQUIRY",
    // Non-DOCUMENT requirement answers (TEXT/NUMBER/DATE/SELECT/YES_NO) ride
    // alongside the existing free-text intakeData shape as their own key,
    // rather than a new column — intakeData was always meant to hold
    // whatever structured extras a submission carries (see its schema.prisma
    // comment); a submission with neither keeps intakeData exactly as it
    // was before this release.
    intakeData:
      data.intakeData || data.answers || egyptEntryMode || umrahContacts || egyptRoute
        ? {
            ...(data.intakeData || {}),
            ...(data.answers ? { answers: data.answers } : {}),
            ...(egyptEntryMode ? { egyptEntryMode } : {}),
            ...(umrahContacts ? { umrahContacts } : {}),
            ...(egyptRoute ? { egyptRoute } : {}),
          }
        : undefined,
    requirementsSnapshot: requirementsSnapshot && requirementsSnapshot.length ? requirementsSnapshot : undefined,
    pricingMode: pricing.mode,
    pricingSnapshot: pricing.snapshot ?? undefined,
    // The accepted fixed price is the approved price: payment is next (or
    // after the document review, see workflow-policy.js paymentLockReasons).
    ...(pricing.mode === "FIXED" ? { invoice: { create: pricing.invoice }, paymentStatus: "AWAITING_TRANSFER" } : {}),
    message: data.message,
    customerId: req.customer?.id || null,
    submissionKey: data.submissionKey || null,
    customerMessages: pendingConfirmationCreate(normalizePhone(data.phone)),
  };

  // Two code paths on purpose: when the submission doesn't use the new
  // structured `travelers` field (every submission before this release, and
  // still most of them — plain contact form, wizard builds not yet updated),
  // this is byte-for-byte the original single create() call below. Only a
  // submission that actually sends travelers needs the two-step transaction
  // (travelers must exist before a document can reference one).
  const contactRequest =
    travelers.length === 0
      ? await prisma.contactRequest.create({
          data: {
            ...baseData,
            documents: files.length
              ? {
                  create: files.map((file, index) => ({
                    label: documentLabels[index] || file.originalname,
                    requirementId: documentRequirementIds[index] || null,
                    ocrResult: ocrResults[index] ?? undefined,
                    fileName: file.originalname,
                    storagePath: prepareFileForStorage(file),
                    mimeType: file.mimetype,
                    sizeBytes: file.size,
                  })),
                }
              : undefined,
          },
        })
      : await prisma.$transaction(async (tx) => {
          const created = await tx.contactRequest.create({
            data: {
              ...baseData,
              travelers: {
                create: travelers.map((traveler, index) => ({
                  fullName: traveler.fullName,
                  passportNo: traveler.passportNo || null,
                  nationality: traveler.nationality || null,
                  birthDate: traveler.birthDate ? new Date(traveler.birthDate) : null,
                  gender: traveler.gender || null,
                  isPrimary: Boolean(traveler.isPrimary),
                  sortOrder: index,
                })),
              },
            },
            include: { travelers: true },
          });

          if (files.length) {
            await tx.contactRequestDocument.createMany({
              data: files.map((file, index) => {
                const ref = documentTravelerIndexes[index];
                const travelerId = ref ? created.travelers[Number(ref)].id : null;
                return {
                  contactRequestId: created.id,
                  label: documentLabels[index] || file.originalname,
                  requirementId: documentRequirementIds[index] || null,
                  travelerId,
                  ocrResult: ocrResults[index] ?? undefined,
                  fileName: file.originalname,
                  storagePath: prepareFileForStorage(file),
                  mimeType: file.mimetype,
                  sizeBytes: file.size,
                };
              }),
            });
          }

          return created;
        });

  await announceNewContactRequest(contactRequest, { documentCount: files.length, req, customerId: req.customer?.id });

  return contactRequest;
}

// Everything that must happen once a ContactRequest exists, regardless of
// which path created it — the public form/wizard (createContactRequest
// above) or a submitted server-side draft (Release B, see
// intake-drafts.service.js). Extracted so a draft submission can never
// silently skip the staff notification/audit trail a direct submission
// gets.
export async function announceNewContactRequest(contactRequest, { documentCount = 0, req = undefined, customerId = null } = {}) {
  logActivity({
    action: "CONTACT_REQUEST_RECEIVED",
    entity: "ContactRequest",
    entityId: contactRequest.id,
    req,
  });

  await createNotification({
    customerId: customerId || undefined,
    title: "تم استلام طلبك",
    message: `تم استلام طلب الخدمة رقم ${contactRequest.id} وسيتم التواصل معك عند وجود تحديث.`,
    type: "CONTACT_REQUEST_RECEIVED",
    contactRequestId: contactRequest.id,
  });

  await notifyAdmins({
    organizationId: contactRequest.organizationId,
    title: "طلب تواصل جديد من الموقع",
    message:
      `${contactRequest.name} (${contactRequest.phone}) — ${contactRequest.message.slice(0, 120)}` +
      (documentCount ? ` — مع ${documentCount} مستند(ات) مرفق(ة)` : ""),
    type: "CONTACT_REQUEST",
    contactRequestId: contactRequest.id,
    alsoRoles: ["EMPLOYEE"],
  });

  // Not awaited: a slow/unreachable WhatsApp API must not delay the
  // response to whoever submitted the contact form. No-ops entirely when
  // WHATSAPP_* env vars aren't set (see utils/whatsapp.js).
  // Confirmation to the customer who submitted (recorded per attempt in
  // CustomerMessageDelivery). Not awaited: the request is already stored and
  // a slow provider must not delay or fail the submission.
  sendRequestConfirmation(contactRequest.id).catch((error) => console.error("[customer-messages] confirmation failed", error?.message));

  sendWhatsAppMessage(
    process.env.WHATSAPP_ADMIN_NUMBER,
    `طلب تواصل جديد من الموقع\nالاسم: ${contactRequest.name}\nالهاتف: ${contactRequest.phone}\nالرسالة: ${contactRequest.message.slice(0, 200)}`
  );
}

// Smart Case Operations — Release C groundwork (readiness engine). Purely
// computed from data that already exists — requirementsSnapshot (the
// point-in-time checklist captured at submission), the request's own
// documents, and paymentStatus — never stored, so it can never go stale
// and needs no migration. Deterministic business rules only, no AI.
//
// requirementsSnapshot rows captured before Release A have no `type` field
// at all — treated as "DOCUMENT" (matches VisaRequirement.type's own
// default, i.e. exactly what every requirement meant before that field
// existed).
export function computeReadiness(contactRequest) {
  // Same facts the workflow policy uses to allow execution and completion
  // (payment receipts are decided in the payment step, not as documents).
  const evaluation = evaluateReadiness(contactRequest);
  const documentsComplete = evaluation.documentsComplete;
  const answersComplete = evaluation.answersComplete;
  const documentsUnderReview = evaluation.documentsUnderReview;
  const documentsRejected = (contactRequest.documents || []).some(
    (d) => !d.supersededAt && d.status === "REJECTED" && d.classification !== "FINANCIAL_DOCUMENT"
  );
  const paymentReady = contactRequest.paymentStatus === "CONFIRMED" || contactRequest.paymentStatus === "NOT_REQUIRED";
  const ready = documentsComplete && answersComplete && paymentReady && !documentsUnderReview;

  // Staff-facing work-queue bucket — the most actionable/blocking state wins.
  // Release F: a case already sent to a provider is waiting on them, not
  // on us — that outranks "ready to process", which it no longer is.
  const awaitingProvider = (contactRequest.providerSubmissions || []).some((s) => s.status !== "FAILED");
  const delivered = evaluateDelivery(contactRequest).complete && publishedDeliverables(contactRequest).length > 0;

  let queue = "READY_FOR_PROCESSING";
  if (contactRequest.status === "CLOSED") queue = "COMPLETED";
  else if (delivered) queue = "RESULTS_READY";
  else if (contactRequest.executionStartedAt) queue = "IN_EXECUTION";
  else if (documentsRejected) queue = "WAITING_CUSTOMER";
  else if (documentsUnderReview) queue = "NEEDS_REVIEW";
  else if (!documentsComplete || !answersComplete || !evaluation.ready) queue = "MISSING_DOCUMENTS";
  else if (!paymentReady) queue = "WAITING_PAYMENT";
  else if (awaitingProvider) queue = "WAITING_PROVIDER";
  else if (contactRequest.paymentStatus === "CONFIRMED") queue = "AWAITING_EXECUTION";

  return {
    documentsComplete,
    answersComplete,
    paymentReady,
    documentsUnderReview,
    awaitingProvider,
    overall: ready ? "READY_FOR_PROCESSING" : "NOT_READY",
    queue,
    // Release E (SLA). Null whenever the case carries no recorded
    // expectation — never an invented deadline.
    sla: deriveSlaState(contactRequest.dueAt),
  };
}

// Smart Case Operations — Release C groundwork. `assignedUserId` accepts a
// real user id (exact match), or the sentinel "unassigned" for the "New" /
// unowned work-queue view — kept as one filter param rather than a second
// boolean flag, mirroring how `status` already works here.
const CONTACT_REQUEST_CASE_INCLUDE = {
  invoice: true,
  documents: { orderBy: { createdAt: "desc" } },
  offers: { orderBy: { createdAt: "desc" } },
  deliverables: { orderBy: { createdAt: "desc" } },
  // Smart Case Operations — Release A. Empty array for every request
  // predating this release (or any submission that doesn't use the
  // structured traveler form) — same shape staff already handle for
  // documents/offers/deliverables.
  travelers: { orderBy: { sortOrder: "asc" } },
  // Selected fields only — staff need the human-readable name/category
  // for a Service Intake submission, not the full catalog row.
  serviceRef: { select: { id: true, name: true, category: true, features: true } },
  visaType: { select: { id: true, code: true, name: true, country: true, category: true } },
  // Smart Case Operations — Release C groundwork.
  assignedUser: { select: safeUserSelect },
  // Release F/E: needed by computeReadiness's WAITING_PROVIDER bucket
  // and by the case workspace's Provider/Activity sections. Selected
  // fields only — the full submission detail has its own endpoint.
  providerSubmissions: {
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, channel: true, submittedAt: true, externalReference: true, supplierId: true },
  },
  tasks: {
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, title: true, status: true, source: true, systemKey: true, dueAt: true, assignedUserId: true },
  },
};

// Staff search: the reference (request id), the customer's name, phone
// (any formatting), e-mail, or a traveler's name / passport number.
// Case-insensitive.
function contactRequestSearchWhere(search) {
  const term = String(search || "").trim();
  if (!term) return {};
  const digits = term.replace(/\D/g, "");
  return {
    OR: [
      { id: term },
      { id: { startsWith: term } },
      { name: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
      { phone: { contains: term } },
      ...(digits.length >= 4 ? [{ phoneNormalized: { contains: digits } }] : []),
      ...(term.length >= 3
        ? [
            { travelers: { some: { passportNo: { contains: term, mode: "insensitive" } } } },
            { travelers: { some: { fullName: { contains: term, mode: "insensitive" } } } },
          ]
        : []),
    ],
  };
}

const REQUEST_STATUSES = new Set(["NEW", "CONTACTED", "CLOSED"]);
const PAYMENT_STATUSES = new Set(["NOT_REQUIRED", "AWAITING_TRANSFER", "UNDER_REVIEW", "CONFIRMED"]);

function parseDay(value, endOfDay) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(value.length === 10 ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Staff filter by what a request is for, matching deriveServiceKind
// (request-progress.js): a visa type decides, else the service category.
const UMRAH_SERVICE_CATEGORIES = ["umrah", "UMRAH_PACKAGE", "umrah_package"];
export const SERVICE_KIND_FILTERS = Object.freeze({
  UMRAH: {
    OR: [
      { visaType: { OR: [{ category: "UMRAH" }, { code: "VISA-UMRAH" }] } },
      { visaTypeId: null, serviceRef: { category: { in: UMRAH_SERVICE_CATEGORIES } } },
    ],
  },
  EGYPT_CLEARANCE: {
    OR: [
      { visaType: { code: { in: [EGYPT_CLEARANCE_CODE, ...EGYPT_CLEARANCE_VARIANTS.map((variant) => variant.code)] } } },
      { visaTypeId: null, serviceRef: { category: "egypt_clearance" } },
    ],
  },
});

export async function listContactRequests({ page, limit, skip, status, organizationId, assignedUserId, search, paymentStatus, serviceId, category, serviceKind, createdFrom, createdTo }) {
  const from = parseDay(createdFrom, false);
  const to = parseDay(createdTo, true);
  const where = {
    organizationId,
    ...(REQUEST_STATUSES.has(status) ? { status } : {}),
    ...(PAYMENT_STATUSES.has(paymentStatus) ? { paymentStatus } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(serviceId ? { serviceId } : {}),
    ...(category ? { serviceRef: { category } } : {}),
    // AND-wrapped so it never collides with the search's own OR.
    ...(SERVICE_KIND_FILTERS[serviceKind] ? { AND: [SERVICE_KIND_FILTERS[serviceKind]] } : {}),
    ...(assignedUserId === "unassigned"
      ? { assignedUserId: null }
      : assignedUserId
        ? { assignedUserId }
        : {}),
    ...contactRequestSearchWhere(search),
  };

  const [data, total] = await Promise.all([
    prisma.contactRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: CONTACT_REQUEST_CASE_INCLUDE,
    }),
    prisma.contactRequest.count({ where }),
  ]);

  return {
    data: data.map((contactRequest) => ({ ...contactRequest, readiness: computeReadiness(contactRequest), progress: deriveRequestProgress(contactRequest) })),
    meta: buildPaginationMeta(page, limit, total),
  };
}

// One request with everything the staff detail view shows. Scoped to the
// organization (null for another tenant's id, same as a missing one).
export async function getContactRequestById(id, organizationId, { role } = {}) {
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id, organizationId },
    include: {
      ...CONTACT_REQUEST_CASE_INCLUDE,
      customer: { select: { id: true, customerNo: true, fullName: true, phone: true, email: true, nationality: true } },
      selectedOffer: true,
    },
  });
  if (!contactRequest) return null;
  return {
    ...contactRequest,
    readiness: computeReadiness(contactRequest),
    progress: deriveRequestProgress(contactRequest),
    // What this staff member may do now (same policy the server enforces).
    allowedActions: allowedActions(contactRequest, { audience: "staff", role }),
  };
}

// Smart Case Operations — Release E. Recomputes a single case's readiness
// and brings its open system tasks in line with it. Called from the events
// that can change readiness (a document review decision, a payment
// confirmation) so a queue never shows work that's already done, or misses
// work that just appeared. Best-effort by design: a task-sync failure must
// never fail the staff action that triggered it.
export async function refreshCaseTasks(contactRequestId) {
  try {
    const contactRequest = await prisma.contactRequest.findUnique({
      where: { id: contactRequestId },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        dueAt: true,
        assignedUserId: true,
        requirementsSnapshot: true,
        intakeData: true,
        travelerCount: true,
        executionStartedAt: true,
        documents: { where: { supersededAt: null }, select: { requirementId: true, travelerId: true, status: true, supersededAt: true, classification: true, label: true } },
        travelers: { select: { id: true, fullName: true } },
        deliverables: { select: { id: true, publishedAt: true, travelerIds: true } },
        providerSubmissions: { select: { status: true } },
      },
    });
    if (!contactRequest) return;

    await syncCaseTasks(contactRequestId, computeReadiness(contactRequest), {
      assignedUserId: contactRequest.assignedUserId,
    });
  } catch {
    // Intentionally swallowed — see this function's comment.
  }
}

// Smart Case Operations — Release G (management operations metrics). Counts
// of open work per queue bucket, for the operations dashboard. Computed off
// the same computeReadiness() every case list already uses, so the numbers a
// manager sees can never disagree with the queues employees actually work.
//
// Deliberately bounded: it reads the open (non-CLOSED) cases for the
// organization with only the fields readiness needs — not every column, not
// every closed case in history — and counts them in memory. Closed/completed
// totals come from a plain indexed count rather than being materialized.
export async function getOperationsQueueSummary(organizationId) {
  const [openCases, completedCount] = await Promise.all([
    prisma.contactRequest.findMany({
      where: { organizationId, status: { not: "CLOSED" } },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        dueAt: true,
        requirementsSnapshot: true,
        intakeData: true,
        travelerCount: true,
        executionStartedAt: true,
        assignedUserId: true,
        documents: { where: { supersededAt: null }, select: { requirementId: true, travelerId: true, status: true, supersededAt: true, classification: true, label: true } },
        travelers: { select: { id: true, fullName: true } },
        deliverables: { select: { id: true, publishedAt: true, travelerIds: true } },
        providerSubmissions: { select: { status: true } },
      },
    }),
    prisma.contactRequest.count({ where: { organizationId, status: "CLOSED" } }),
  ]);

  const queues = {
    MISSING_DOCUMENTS: 0,
    NEEDS_REVIEW: 0,
    WAITING_CUSTOMER: 0,
    WAITING_PAYMENT: 0,
    READY_FOR_PROCESSING: 0,
    WAITING_PROVIDER: 0,
    AWAITING_EXECUTION: 0,
    IN_EXECUTION: 0,
    RESULTS_READY: 0,
  };
  let overdue = 0;
  let unassigned = 0;

  for (const contactRequest of openCases) {
    const readiness = computeReadiness(contactRequest);
    if (queues[readiness.queue] !== undefined) queues[readiness.queue] += 1;
    if (readiness.sla === "OVERDUE") overdue += 1;
    if (!contactRequest.assignedUserId) unassigned += 1;
  }

  return {
    queues,
    open: openCases.length,
    unassigned,
    overdue,
    completed: completedCount,
  };
}

// Smart Case Operations — Release C groundwork (employee assignment).
// assignedUserId null clears the assignment (unassigns). The target user,
// when set, must be real, active staff in this same organization — never
// trusted as an opaque id, same posture as every other cross-entity
// reference in this module.
export async function assignContactRequest(id, assignedUserId, actingUserId, organizationId) {
  const contactRequest = await prisma.contactRequest.findFirst({ where: { id, organizationId } });
  if (!contactRequest) return { error: "NOT_FOUND" };

  if (assignedUserId) {
    const assignee = await prisma.user.findFirst({
      where: { id: assignedUserId, organizationId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!assignee) return { error: "ASSIGNEE_NOT_FOUND" };
  }

  const updated = await prisma.contactRequest.update({
    where: { id },
    data: { assignedUserId: assignedUserId || null },
    include: { assignedUser: { select: safeUserSelect } },
  });

  logActivity({
    userId: actingUserId,
    action: assignedUserId ? "CONTACT_REQUEST_ASSIGNED" : "CONTACT_REQUEST_UNASSIGNED",
    entity: "ContactRequest",
    entityId: id,
  });

  // Assignment previously updated the row silently — the newly-assigned
  // employee had no way to know a case landed in their queue short of
  // polling the list. Best-effort, same as every other notification here.
  if (assignedUserId) {
    await createNotification({
      title: "تم إسناد طلب لك",
      message: `تم إسنادك للطلب ${describeRequest(updated)}.`,
      type: "CASE_ASSIGNED",
      userId: assignedUserId,
      // Opening the notification goes straight to the assigned request.
      contactRequestId: updated.id,
    });
  }

  return { contactRequest: updated };
}

// outcome/outcomeNote/closedAt only mean anything while the request is
// CLOSED — set together with it, and cleared together if the request is
// ever reopened (moved back to NEW/CONTACTED), so a stale outcome from a
// previous closure can never linger on a request that's active again.
// Contact request lifecycle:
//   NEW -> CONTACTED -> CLOSED(outcome)      NEW -> CLOSED(outcome)
//   CLOSED -> NEW | CONTACTED                 re-open: SUPER_ADMIN/ADMIN only,
//                                             with a written reason (audited)
//   CONTACTED -> NEW                          not allowed (no backward step)
//   CLOSED -> CLOSED                          not allowed: a closed request is
//                                             not silently re-labelled; reopen
//                                             (audited) and close again
// Outcomes are distinct:
//   COMPLETED  the service was delivered: the completion policy must hold
//              (workflow-policy.js completionBlockers: documents and
//              information accepted, payment accepted, execution recorded,
//              every traveler's final file published). An unpriced inquiry
//              can be completed once answered.
//   REJECTED   the agency declined (e.g. ineligible); no payment needed.
//   CANCELLED  the customer withdrew; no payment needed.
//   Rejecting/cancelling after a payment was confirmed needs a note saying
//   how the money is being handled (there is no refund record for requests).
const CONTACT_TRANSITIONS = {
  NEW: new Set(["NEW", "CONTACTED", "CLOSED"]),
  CONTACTED: new Set(["CONTACTED", "CLOSED"]),
  CLOSED: new Set(["NEW", "CONTACTED"]),
};
const REOPEN_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);

const COMPLETION_CODES = [
  ["PAYMENT_NOT_CONFIRMED", "COMPLETION_NEEDS_PAYMENT"],
  ["QUOTE_MISSING", "COMPLETION_NEEDS_PAYMENT"],
  ["EXECUTION_NOT_STARTED", "COMPLETION_NEEDS_EXECUTION"],
  ["DELIVERY_INCOMPLETE", "COMPLETION_NEEDS_DELIVERABLE"],
];

// Returns null when allowed, or a refusal { status, code, message, reasons? }.
export function checkContactRequestTransition(existing, { status, outcome, outcomeNote, reason }, actorRole) {
  if (existing.status === "CLOSED" && status === "CLOSED") {
    return { status: 409, code: "ALREADY_CLOSED", message: "الطلب مغلق بالفعل؛ لتغيير نتيجته أعد فتحه أولًا (إجراء إداري مسجّل)." };
  }
  if (!CONTACT_TRANSITIONS[existing.status]?.has(status)) {
    return { status: 409, code: "INVALID_TRANSITION", message: "لا يمكن إرجاع الطلب إلى حالة سابقة إلا بإعادة فتحه بعد الإغلاق." };
  }
  if (existing.status === "CLOSED") {
    if (!REOPEN_ROLES.has(actorRole)) {
      return { status: 403, code: "REOPEN_FORBIDDEN", message: "إعادة فتح طلب مغلق متاحة للمدير فقط." };
    }
    if (!reason || reason.trim().length < 5) {
      return { status: 400, code: "REOPEN_REASON_REQUIRED", message: "اكتب سبب إعادة فتح الطلب (5 أحرف على الأقل)." };
    }
    return null;
  }
  if (status !== "CLOSED") return null;

  if (outcome === "COMPLETED") {
    const refusal = checkAction(ACTIONS.COMPLETE, existing);
    if (refusal) {
      const codes = new Set(refusal.reasons.map((r) => r.code));
      const mapped = COMPLETION_CODES.find(([reasonCode]) => codes.has(reasonCode))?.[1] || "COMPLETION_NEEDS_DOCUMENTS";
      return { ...refusal, code: mapped };
    }
  }
  if ((outcome === "REJECTED" || outcome === "CANCELLED") && existing.paymentStatus === "CONFIRMED" && (!outcomeNote || outcomeNote.trim().length < 5)) {
    return { status: 400, code: "REFUND_NOTE_REQUIRED", message: "الدفع مؤكد لهذا الطلب: اكتب في الملاحظة كيف سيُعالج المبلغ (استرجاع أو غيره)." };
  }
  return null;
}

export async function updateContactRequestStatus(id, { status, outcome, outcomeNote, reason }, actor, organizationId = null) {
  const userId = typeof actor === "string" ? actor : actor?.id;
  const actorRole = typeof actor === "string" ? null : actor?.role;

  // Under the request's row lock: a completion (publishing the last file)
  // and a cancellation racing each other are serialized; the second sees
  // CLOSED and is refused instead of overwriting the first one's outcome.
  const result = await withLockedRequest(id, organizationId ? { organizationId } : null, async (tx, existing) => {
    const refusal = checkContactRequestTransition(existing, { status, outcome, outcomeNote, reason }, actorRole);
    if (refusal) refuseWith(refusal);
    const updated = await tx.contactRequest.update({
      where: { id },
      data:
        status === "CLOSED"
          ? { status, outcome, outcomeNote: outcomeNote || null, closedAt: new Date() }
          : { status, outcome: null, outcomeNote: null, closedAt: null },
    });
    const reopened = existing.status === "CLOSED" && updated.status !== "CLOSED";
    await auditInTransaction(tx, {
      userId,
      action: reopened ? "CONTACT_REQUEST_REOPENED" : "CONTACT_REQUEST_STATUS_CHANGED",
      entityId: id,
      organizationId: existing.organizationId,
      oldValue: { status: existing.status, outcome: existing.outcome, outcomeNote: existing.outcomeNote },
      newValue: { status: updated.status, outcome: updated.outcome, outcomeNote: updated.outcomeNote, ...(reopened ? { reason } : {}) },
    });
    return { existing, updated };
  });

  if (result.refusal) return result;
  if (result.error) return null;
  const { existing, updated } = result;

  if (existing.status !== updated.status) {
    const label =
      updated.status === "CLOSED"
        ? (updated.outcome && OUTCOME_LABELS[updated.outcome]) || STATUS_LABELS.CLOSED
        : STATUS_LABELS[updated.status];

    await notifyRequestCustomer(updated, { title: "تحديث على طلبك", message: label, type: "CONTACT_REQUEST_STATUS_CHANGED" });

    // Not awaited: same rationale as every other WhatsApp send in this
    // module — never let a slow/unreachable WhatsApp API delay the staff
    // response, and this silently no-ops when WHATSAPP_* env vars aren't
    // set (dev/test).
    sendWhatsAppMessage(
      updated.phoneNormalized,
      `تحديث بخصوص طلبك (${describeRequest(updated)}):\n${label}\nيمكنك متابعة كل التفاصيل عبر صفحة تتبع الطلب.`
    );
  }

  return updated;
}

// Completion. A request closes as COMPLETED only when the completion policy
// (contact-request-workflow/workflow-policy.js completionBlockers) holds:
// required information and documents accepted, payment accepted, execution
// recorded, and every traveler's final file published. Called inside the
// transaction that published the last file, under the request's row lock,
// so it can neither double-close nor overwrite a concurrent cancellation.
// Services with a step after the final file (Egypt clearance: travel plan
// and circular) are completed by staff, never automatically.
export async function completeIfDone(tx, request, { userId = null } = {}) {
  if (!autoCompletes(request) || completionBlockers(request).length) return null;
  const closed = await tx.contactRequest.updateMany({
    where: { id: request.id, status: { not: "CLOSED" } },
    data: { status: "CLOSED", outcome: "COMPLETED", outcomeNote: null, closedAt: new Date() },
  });
  if (closed.count !== 1) return null;
  await auditInTransaction(tx, { userId, action: "CONTACT_REQUEST_AUTO_COMPLETED", entityId: request.id, organizationId: request.organizationId });
  return tx.contactRequest.findUnique({ where: { id: request.id } });
}

export async function announceCompletion(updated) {
  await notifyRequestCustomer(updated, { title: "تحديث على طلبك", message: OUTCOME_LABELS.COMPLETED, type: "CONTACT_REQUEST_STATUS_CHANGED" });
  sendWhatsAppMessage(updated.phoneNormalized, `${OUTCOME_LABELS.COMPLETED} — ${describeRequest(updated)}.\nشكرًا لثقتك بنا!`);
}

// Creates the first quote for a ContactRequest, or reissues one after the
// customer rejected the previous quote. Once a customer has approved a
// quote the price is locked, a request can't mix a single price with
// multi-carrier offers, and a closed request takes no new price. Runs under
// the request's row lock, so a customer approval and a staff revision are
// serialized (the customer's approval also carries the version they saw).
export async function createOrUpdateInvoice(contactRequestId, data, userId) {
  // The SDG equivalent is frozen with the price (see finance/fx-snapshot.js).
  const fx = await sdgSnapshot(data.currency, data.amount);
  const result = await withLockedRequest(contactRequestId, null, async (tx, contactRequest) => {
    const refusal = checkAction(ACTIONS.ISSUE_QUOTE, contactRequest);
    if (refusal) refuseWith(refusal);
    const invoice = await tx.invoice.upsert({
      where: { contactRequestId },
      create: { contactRequestId, amount: data.amount, currency: data.currency, ...fx, description: data.description || null, createdByUserId: userId },
      // Every revision is a new version: a customer decision on the old one
      // is refused (workflow-policy.js APPROVE_QUOTE/REJECT_QUOTE).
      update: { amount: data.amount, currency: data.currency, ...fx, description: data.description || null, status: "PENDING", decidedAt: null, createdByUserId: userId, version: { increment: 1 } },
    });
    // Publishing the price confirms that the agency has reviewed the request.
    await tx.contactRequest.updateMany({ where: { id: contactRequestId, status: "NEW" }, data: { status: "CONTACTED" } });
    await auditInTransaction(tx, {
      userId,
      action: "CONTACT_REQUEST_INVOICE_SET",
      entityId: contactRequestId,
      organizationId: contactRequest.organizationId,
      oldValue: contactRequest.invoice ? { amount: contactRequest.invoice.amount, currency: contactRequest.invoice.currency, status: contactRequest.invoice.status } : undefined,
      newValue: { amount: data.amount, currency: data.currency },
    });
    return { invoice, contactRequest };
  });
  if (result.error || result.refusal) return result;

  await notifyRequestCustomer(result.contactRequest, {
    title: "وصل عرض السعر لطلبك",
    message: `حدّدت الوكالة السعر: ${data.amount} ${data.currency}. راجعه ووافق عليه من صفحة الطلب.`,
    type: "CONTACT_REQUEST_INVOICE_SET",
  });
  // Not awaited: a slow/unreachable WhatsApp API must never delay the
  // response, and this silently no-ops when WHATSAPP_* env vars aren't set.
  sendWhatsAppMessage(
    result.contactRequest.phoneNormalized,
    `تم تحديد سعر لطلبك: ${data.amount} ${data.currency}\nيمكنك مراجعته والموافقة عليه عبر صفحة تتبع الطلب.`
  );
  return { invoice: result.invoice };
}

// Adds one priced option to a request's multi-carrier offer set (see the
// ContactRequestOffer schema comment for when to use this instead of
// Invoice). Staff can keep adding offers until the customer selects one.
export async function createOffer(contactRequestId, data, userId) {
  const fx = await sdgSnapshot(data.currency, data.amount);
  const result = await withLockedRequest(contactRequestId, null, async (tx, contactRequest) => {
    const refusal = checkAction(ACTIONS.ADD_OFFER, contactRequest);
    if (refusal) refuseWith(refusal);
    const offer = await tx.contactRequestOffer.create({
      data: { contactRequestId, carrier: data.carrier, description: data.description || null, amount: data.amount, currency: data.currency, ...fx, createdByUserId: userId },
    });
    await tx.contactRequest.updateMany({ where: { id: contactRequestId, status: "NEW" }, data: { status: "CONTACTED" } });
    await auditInTransaction(tx, { userId, action: "CONTACT_REQUEST_OFFER_ADDED", entityId: contactRequestId, organizationId: contactRequest.organizationId, newValue: { carrier: data.carrier, amount: data.amount, currency: data.currency } });
    return { offer, contactRequest };
  });
  if (result.error || result.refusal) return result;

  await notifyRequestCustomer(result.contactRequest, {
    title: "عرض سعر جديد لطلبك",
    message: `أضافت الوكالة عرضًا (${data.carrier}): ${data.amount} ${data.currency}.`,
    type: "CONTACT_REQUEST_OFFER_ADDED",
  });
  sendWhatsAppMessage(
    result.contactRequest.phoneNormalized,
    `تمت إضافة عرض سعر جديد لطلبك (${data.carrier}): ${data.amount} ${data.currency}\nيمكنك مراجعة كل العروض واختيار الأنسب لك عبر صفحة تتبع الطلب.`
  );
  return { offer: result.offer };
}

// Accepting and rejecting a receipt are decided under the request's row
// lock from UNDER_REVIEW: of two simultaneous decisions exactly one wins,
// the other is refused (PAYMENT_NOT_UNDER_REVIEW), and only the winner is
// audited and announced. Accepting the payment also accepts its pending
// receipts; it means "awaiting execution", nothing more.
export async function confirmContactRequestPayment(contactRequestId, userId) {
  const result = await withLockedRequest(contactRequestId, null, async (tx, contactRequest) => {
    const refusal = checkAction(ACTIONS.CONFIRM_PAYMENT, contactRequest);
    if (refusal) refuseWith(refusal);
    const now = new Date();
    const updated = await tx.contactRequest.update({
      where: { id: contactRequestId },
      data: { paymentStatus: "CONFIRMED", paymentConfirmedAt: now, paymentRejectionReason: null, paymentRejectedAt: null },
    });
    await tx.contactRequestDocument.updateMany({
      where: { contactRequestId, classification: "FINANCIAL_DOCUMENT", status: "PENDING", supersededAt: null },
      data: { status: "ACCEPTED", reviewedByUserId: userId, reviewedAt: now },
    });
    await auditInTransaction(tx, { userId, action: "CONTACT_REQUEST_PAYMENT_CONFIRMED", entityId: contactRequestId, organizationId: contactRequest.organizationId });
    return { updated };
  });
  if (result.error || result.refusal) return result;
  const { updated } = result;

  // Release E: payment confirmation closes "check payment" and can open
  // "process application".
  await refreshCaseTasks(contactRequestId);
  await notifyRequestCustomer(updated, {
    title: "تم قبول الدفع",
    message: `تم قبول دفعك لطلبك (${describeRequest(updated)}). طلبك الآن بانتظار بدء التنفيذ، وسنخبرك عند بدئه.`,
    type: "CONTACT_REQUEST_PAYMENT_CONFIRMED",
  });
  sendWhatsAppMessage(updated.phoneNormalized, `تم تأكيد استلام تحويلك لطلبك (${describeRequest(updated)}). طلبك بانتظار بدء التنفيذ.`);
  return { contactRequest: updated };
}

// Staff reject the transfer receipt. Nothing is marked paid: the request goes
// back to AWAITING_TRANSFER so the customer can send a correct receipt, and the
// reason stays visible to them (paymentRejectionReason) until they do.
export async function rejectContactRequestPayment(contactRequestId, userId, reason) {
  const result = await withLockedRequest(contactRequestId, null, async (tx, contactRequest) => {
    const refusal = checkAction(ACTIONS.REJECT_PAYMENT, contactRequest);
    if (refusal) refuseWith(refusal);
    const now = new Date();
    const updated = await tx.contactRequest.update({
      where: { id: contactRequestId },
      data: { paymentStatus: "AWAITING_TRANSFER", paymentRejectionReason: reason, paymentRejectedAt: now },
    });
    await tx.contactRequestDocument.updateMany({
      where: { contactRequestId, classification: "FINANCIAL_DOCUMENT", status: "PENDING", supersededAt: null },
      data: { status: "REJECTED", reviewNote: reason, reviewedByUserId: userId, reviewedAt: now },
    });
    await auditInTransaction(tx, { userId, action: "CONTACT_REQUEST_PAYMENT_REJECTED", entityId: contactRequestId, organizationId: contactRequest.organizationId, newValue: { reason } });
    return { updated };
  });
  if (result.error || result.refusal) return result;
  const { updated } = result;

  await refreshCaseTasks(contactRequestId);
  await notifyRequestCustomer(updated, {
    title: "تم رفض إيصال الدفع",
    message: `لم تقبل الوكالة إيصال الدفع لطلبك (${describeRequest(updated)}). السبب: ${reason}. ارفع إيصالًا صحيحًا من صفحة الطلب.`,
    type: "CONTACT_REQUEST_PAYMENT_REJECTED",
  });
  sendWhatsAppMessage(
    updated.phoneNormalized,
    `لم يتم قبول إيصال الدفع لطلبك (${describeRequest(updated)}).\nالسبب: ${reason}\nيرجى رفع إيصال صحيح عبر صفحة تتبع الطلب.`
  );
  return { contactRequest: updated };
}

// Staff record that work on a paid, ready request has actually started.
// Only then does the customer see the service-specific stage. Decided from
// the stored request under its row lock: readiness (travelers, answers,
// every required document accepted), accepted payment, open request, not
// started yet. Of simultaneous calls one wins; the original actor and time
// are never overwritten, and only the winner is audited and announced.
export async function startContactRequestExecution(contactRequestId, organizationId, userId, note) {
  const result = await withLockedRequest(contactRequestId, { organizationId }, async (tx, contactRequest) => {
    const refusal = checkAction(ACTIONS.START_EXECUTION, contactRequest);
    if (refusal) refuseWith(refusal);
    const now = new Date();
    const started = await tx.contactRequest.updateMany({
      where: { id: contactRequestId, executionStartedAt: null, status: { not: "CLOSED" } },
      data: { executionStartedAt: now, executionStartedByUserId: userId, executionNote: note || null },
    });
    if (started.count !== 1) refuseWith({ status: 409, code: "ALREADY_STARTED", message: "تم تسجيل بدء التنفيذ لهذا الطلب مسبقًا." });
    const updated = await tx.contactRequest.findUnique({ where: { id: contactRequestId }, include: WORKFLOW_INCLUDE });
    const progress = deriveRequestProgress(updated);
    await auditInTransaction(tx, { userId, action: "CONTACT_REQUEST_EXECUTION_STARTED", entityId: contactRequestId, organizationId, newValue: { serviceKind: progress.serviceKind, note: note || null, executionStartedAt: now } });
    return { updated, progress };
  });
  if (result.error || result.refusal) return result;
  const { updated, progress } = result;

  await refreshCaseTasks(contactRequestId);
  await notifyRequestCustomer(updated, { title: "بدأ تنفيذ طلبك", message: `${progress.label} (${describeRequest(updated)}).`, type: "CONTACT_REQUEST_EXECUTION_STARTED" });
  sendWhatsAppMessage(updated.phoneNormalized, `${progress.label} لطلبك (${describeRequest(updated)}).`);
  const { documents, deliverables, travelers, offers, invoice, ...row } = updated;
  return { contactRequest: { ...row, progress } };
}

// Correction of an accidental "start execution" (SUPER_ADMIN/ADMIN, written
// reason). Allowed only while no final file was published to the customer.
// Nothing is erased: the original actor and time are kept in the audit row
// (oldValue), and the request returns to "awaiting execution".
export async function revertContactRequestExecution(contactRequestId, organizationId, userId, reason) {
  const result = await withLockedRequest(contactRequestId, { organizationId }, async (tx, contactRequest) => {
    const refusal = checkAction(ACTIONS.REVERT_EXECUTION, contactRequest);
    if (refusal) refuseWith(refusal);
    const updated = await tx.contactRequest.update({
      where: { id: contactRequestId },
      data: { executionStartedAt: null, executionStartedByUserId: null, executionNote: null },
    });
    await auditInTransaction(tx, {
      userId,
      action: "CONTACT_REQUEST_EXECUTION_REVERTED",
      entityId: contactRequestId,
      organizationId,
      oldValue: { executionStartedAt: contactRequest.executionStartedAt.toISOString(), executionStartedByUserId: contactRequest.executionStartedByUserId, executionNote: contactRequest.executionNote },
      newValue: { reason },
    });
    return { updated };
  });
  if (result.error || result.refusal) return result;
  await refreshCaseTasks(contactRequestId);
  await notifyRequestCustomer(result.updated, {
    title: "تصحيح حالة طلبك",
    message: `صحّحت الوكالة حالة طلبك (${describeRequest(result.updated)}): طلبك بانتظار بدء التنفيذ.`,
    type: "CONTACT_REQUEST_EXECUTION_REVERTED",
  });
  return { contactRequest: { ...result.updated, progress: deriveRequestProgress({ ...result.updated, deliverables: [] }) } };
}
