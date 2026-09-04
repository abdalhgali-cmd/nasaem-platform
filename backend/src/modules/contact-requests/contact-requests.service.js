import path from "path";
import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { safeUserSelect } from "../../utils/safeSelects.js";
import { logActivity } from "../../utils/activityLog.js";
import { createNotification } from "../../utils/notifications.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { normalizePhone } from "../../utils/phone.js";
import {
  OUTCOME_LABELS,
  STATUS_LABELS,
} from "../contact-request-tracking/contact-request-tracking.status.js";
import { maybeRunPassportOcr } from "../passport-ocr/passport-ocr.service.js";
import { getPublicChecklist, requirementApplies } from "../requirements/requirements.service.js";
import { deriveSlaState, syncCaseTasks } from "../case-tasks/case-tasks.service.js";
import { isFeatureEnabled } from "../feature-flags/feature-flags.service.js";
import { SERVICE_CATEGORY_FEATURE_FLAGS } from "../feature-flags/feature-flags.constants.js";
import { CONTACT_REQUEST_DOCUMENT_DIR, generateUniqueFilename, saveBufferToDirectory } from "../../middleware/upload.middleware.js";

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
export async function notifyAdmins({ title, message, type, organizationId = "org_nasaem_default" }) {
  const admins = await prisma.user.findMany({
    where: { organizationId, role: { in: ["SUPER_ADMIN", "ADMIN"] }, status: "ACTIVE" },
    select: { id: true },
  });

  await Promise.all(
    admins.map((admin) => createNotification({ title, message, type, userId: admin.id }))
  );
}

// `files` are the Service Intake wizard's uploaded documents (Umrah/Visas/
// Packages), if any — the plain contact form never sends these, so this
// defaults to none and behaves exactly as before. Documents are created in
// the same nested-write as the ContactRequest itself so a request is never
// left without the documents the customer attached to it.
export async function createContactRequest(data, req, files = []) {
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
  if (data.serviceId) {
    const service = await prisma.service.findUnique({ where: { id: data.serviceId }, select: { category: true } });
    const flagKey = service ? SERVICE_CATEGORY_FEATURE_FLAGS[service.category] : null;
    if (flagKey && !(await isFeatureEnabled(flagKey))) {
      return { error: "FEATURE_DISABLED" };
    }
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

      const seenCount = (countByRequirement.get(requirementId) || 0) + 1;
      countByRequirement.set(requirementId, seenCount);
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

  const baseData = {
    name: data.name,
    organizationId: req.customer?.organizationId || "org_nasaem_default",
    phone: data.phone,
    phoneNormalized: normalizePhone(data.phone),
    email: data.email || null,
    service: data.service || null,
    serviceId: data.serviceId || null,
    visaTypeId: data.visaTypeId || null,
    travelerCount: data.travelerCount ?? null,
    // Non-DOCUMENT requirement answers (TEXT/NUMBER/DATE/SELECT/YES_NO) ride
    // alongside the existing free-text intakeData shape as their own key,
    // rather than a new column — intakeData was always meant to hold
    // whatever structured extras a submission carries (see its schema.prisma
    // comment); a submission with neither keeps intakeData exactly as it
    // was before this release.
    intakeData:
      data.intakeData || data.answers
        ? { ...(data.intakeData || {}), ...(data.answers ? { answers: data.answers } : {}) }
        : undefined,
    requirementsSnapshot: requirementsSnapshot && requirementsSnapshot.length ? requirementsSnapshot : undefined,
    message: data.message,
    customerId: req.customer?.id || null,
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
  });

  await notifyAdmins({
    organizationId: contactRequest.organizationId,
    title: "طلب تواصل جديد من الموقع",
    message:
      `${contactRequest.name} (${contactRequest.phone}) — ${contactRequest.message.slice(0, 120)}` +
      (documentCount ? ` — مع ${documentCount} مستند(ات) مرفق(ة)` : ""),
    type: "CONTACT_REQUEST",
  });

  // Not awaited: a slow/unreachable WhatsApp API must not delay the
  // response to whoever submitted the contact form. No-ops entirely when
  // WHATSAPP_* env vars aren't set (see utils/whatsapp.js).
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
  const answers = contactRequest.intakeData?.answers || {};
  const applicableRequired = (contactRequest.requirementsSnapshot || []).filter(
    (r) => r.required && requirementApplies(r, answers)
  );

  const currentDocuments = contactRequest.documents.filter((d) => !d.supersededAt);

  const missingDocumentRequirement = applicableRequired
    .filter((r) => !r.type || r.type === "DOCUMENT")
    .find((r) => !currentDocuments.some((d) => d.requirementId === r.id && d.status === "ACCEPTED"));

  const missingAnswer = applicableRequired
    .filter((r) => r.type && r.type !== "DOCUMENT")
    .find((r) => answers[r.id] === undefined || answers[r.id] === "" || answers[r.id] === null);

  const documentsUnderReview = currentDocuments.some((d) => d.status === "PENDING");
  const documentsRejected = currentDocuments.some((d) => d.status === "REJECTED");
  const paymentReady = contactRequest.paymentStatus === "CONFIRMED" || contactRequest.paymentStatus === "NOT_REQUIRED";

  const documentsComplete = !missingDocumentRequirement;
  const answersComplete = !missingAnswer;
  const ready = documentsComplete && answersComplete && paymentReady && !documentsUnderReview;

  // Staff-facing work-queue bucket — precedence roughly mirrors
  // contact-request-tracking.status.js's deriveTrackingStatusLabel (most
  // actionable/blocking state wins), just for the internal, not
  // customer-facing, view.
  // Release F: a case already sent to a provider is waiting on them, not
  // on us — that outranks "ready to process", which it no longer is.
  const awaitingProvider = (contactRequest.providerSubmissions || []).some((s) => s.status !== "FAILED");
  // Release E: results are in once the customer has something to collect.
  const hasDeliverable = (contactRequest.deliverables || []).length > 0;

  let queue = "READY_FOR_PROCESSING";
  if (contactRequest.status === "CLOSED") queue = "COMPLETED";
  else if (hasDeliverable) queue = "RESULTS_READY";
  else if (documentsRejected) queue = "WAITING_CUSTOMER";
  else if (documentsUnderReview) queue = "NEEDS_REVIEW";
  else if (!documentsComplete || !answersComplete) queue = "MISSING_DOCUMENTS";
  else if (!paymentReady) queue = "WAITING_PAYMENT";
  else if (awaitingProvider) queue = "WAITING_PROVIDER";

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
export async function listContactRequests({ page, limit, skip, status, organizationId, assignedUserId }) {
  const where = {
    organizationId,
    ...(status ? { status } : {}),
    ...(assignedUserId === "unassigned"
      ? { assignedUserId: null }
      : assignedUserId
        ? { assignedUserId }
        : {}),
  };

  const [data, total] = await Promise.all([
    prisma.contactRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
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
        serviceRef: { select: { id: true, name: true, category: true } },
        visaType: { select: { id: true, name: true, country: true } },
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
          select: { id: true, type: true, title: true, status: true, dueAt: true, assignedUserId: true },
        },
      },
    }),
    prisma.contactRequest.count({ where }),
  ]);

  return {
    data: data.map((contactRequest) => ({ ...contactRequest, readiness: computeReadiness(contactRequest) })),
    meta: buildPaginationMeta(page, limit, total),
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
        documents: { where: { supersededAt: null }, select: { requirementId: true, status: true, supersededAt: true } },
        deliverables: { select: { id: true } },
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
        assignedUserId: true,
        documents: { where: { supersededAt: null }, select: { requirementId: true, status: true, supersededAt: true } },
        deliverables: { select: { id: true } },
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

  return { contactRequest: updated };
}

// outcome/outcomeNote/closedAt only mean anything while the request is
// CLOSED — set together with it, and cleared together if the request is
// ever reopened (moved back to NEW/CONTACTED), so a stale outcome from a
// previous closure can never linger on a request that's active again.
export async function updateContactRequestStatus(id, { status, outcome, outcomeNote }, userId, organizationId = null) {
  const existing = await prisma.contactRequest.findFirst({ where: { id, ...(organizationId ? { organizationId } : {}) } });

  if (!existing) {
    return null;
  }

  const updated = await prisma.contactRequest.update({
    where: { id },
    data:
      status === "CLOSED"
        ? { status, outcome, outcomeNote: outcomeNote || null, closedAt: new Date() }
        : { status, outcome: null, outcomeNote: null, closedAt: null },
  });

  logActivity({
    userId,
    action: "CONTACT_REQUEST_STATUS_CHANGED",
    entity: "ContactRequest",
    entityId: id,
  });

  // Guarded on the status actually changing — staff editing only the
  // outcome/note of an already-CLOSED request (see "تعديل النتيجة" in the
  // staff dashboard) re-submits the same CLOSED status and must not re-fire
  // a notification the customer already received.
  if (existing.status !== updated.status) {
    const label =
      updated.status === "CLOSED"
        ? (updated.outcome && OUTCOME_LABELS[updated.outcome]) || STATUS_LABELS.CLOSED
        : STATUS_LABELS[updated.status];

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

// Phase 1.5 — auto-completion. Pure predicate, deliberately side-effect
// free so it's trivially unit-testable and safe to call from both trigger
// points below without worrying about DB access: given a request's current
// status/paymentStatus and whether it already has at least one delivered
// file, decide if it's now safe to auto-close it as COMPLETED. Reuses the
// existing NOT_REQUIRED/AWAITING_TRANSFER/UNDER_REVIEW/CONFIRMED payment
// state machine and the existing CLOSED/COMPLETED status+outcome values —
// no new state is introduced.
export function shouldAutoComplete({ status, paymentStatus, hasDeliverable }) {
  return status !== "CLOSED" && paymentStatus === "CONFIRMED" && Boolean(hasDeliverable);
}

// Re-checks the condition above and closes the request if it now holds.
// Called after either half of it could have just become true (payment
// confirmed, or a deliverable uploaded) — whichever happens second is the
// one that actually closes it; whichever happens first is a no-op here.
// Idempotent: once a request is CLOSED, every later call (e.g. a second
// deliverable) sees status === "CLOSED" and does nothing — no repeat
// update, no repeat notification, no other side effect.
export async function maybeAutoCompleteContactRequest(contactRequestId) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    include: { deliverables: { select: { id: true }, take: 1 } },
  });

  if (!contactRequest) {
    return null;
  }

  const eligible = shouldAutoComplete({
    status: contactRequest.status,
    paymentStatus: contactRequest.paymentStatus,
    hasDeliverable: contactRequest.deliverables.length > 0,
  });

  if (!eligible) {
    return null;
  }

  const updated = await prisma.contactRequest.update({
    where: { id: contactRequestId },
    data: { status: "CLOSED", outcome: "COMPLETED", outcomeNote: null, closedAt: new Date() },
  });

  logActivity({
    action: "CONTACT_REQUEST_AUTO_COMPLETED",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  sendWhatsAppMessage(
    updated.phoneNormalized,
    `${OUTCOME_LABELS.COMPLETED} — ${describeRequest(updated)}.\nشكرًا لثقتك بنا!`
  );

  return updated;
}

// Creates the first quote for a ContactRequest, or reissues one after the
// customer rejected the previous quote. Once a customer has approved a
// quote the price is locked — callers must check for the "ALREADY_APPROVED"
// error and refuse the request rather than silently overwriting an amount
// the customer already agreed to pay. A request also can't mix pricing
// mechanisms — refuses if multi-carrier offers (see createOffer) are
// already in play for it.
export async function createOrUpdateInvoice(contactRequestId, data, userId) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    include: { invoice: true, offers: true },
  });

  if (!contactRequest) {
    return { error: "NOT_FOUND" };
  }

  if (contactRequest.invoice?.status === "APPROVED") {
    return { error: "ALREADY_APPROVED" };
  }

  if (contactRequest.offers.length > 0) {
    return { error: "OFFERS_EXIST" };
  }

  const invoice = await prisma.invoice.upsert({
    where: { contactRequestId },
    create: {
      contactRequestId,
      amount: data.amount,
      currency: data.currency,
      description: data.description || null,
      createdByUserId: userId,
    },
    update: {
      amount: data.amount,
      currency: data.currency,
      description: data.description || null,
      status: "PENDING",
      decidedAt: null,
      createdByUserId: userId,
    },
  });

  logActivity({
    userId,
    action: "CONTACT_REQUEST_INVOICE_SET",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  // Not awaited: same rationale as createContactRequest — a slow/unreachable
  // WhatsApp API must never delay the response, and this silently no-ops
  // when WHATSAPP_* env vars aren't set (dev/test).
  sendWhatsAppMessage(
    contactRequest.phoneNormalized,
    `تم تحديد سعر لطلبك: ${data.amount} ${data.currency}\nيمكنك مراجعته والموافقة عليه عبر صفحة تتبع الطلب.`
  );

  return { invoice };
}

// Adds one priced option to a request's multi-carrier offer set (see the
// ContactRequestOffer schema comment for when to use this instead of
// Invoice). Staff can keep adding offers until the customer selects one;
// a request also can't mix pricing mechanisms — refuses if an Invoice is
// already in play for it.
export async function createOffer(contactRequestId, data, userId) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    include: { invoice: true },
  });

  if (!contactRequest) {
    return { error: "NOT_FOUND" };
  }

  if (contactRequest.invoice) {
    return { error: "INVOICE_EXISTS" };
  }

  if (contactRequest.selectedOfferId) {
    return { error: "ALREADY_SELECTED" };
  }

  const offer = await prisma.contactRequestOffer.create({
    data: {
      contactRequestId,
      carrier: data.carrier,
      description: data.description || null,
      amount: data.amount,
      currency: data.currency,
      createdByUserId: userId,
    },
  });

  logActivity({
    userId,
    action: "CONTACT_REQUEST_OFFER_ADDED",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  // Not awaited: same rationale as elsewhere in this module.
  sendWhatsAppMessage(
    contactRequest.phoneNormalized,
    `تمت إضافة عرض سعر جديد لطلبك (${data.carrier}): ${data.amount} ${data.currency}\nيمكنك مراجعة كل العروض واختيار الأنسب لك عبر صفحة تتبع الطلب.`
  );

  return { offer };
}

// Only moves AWAITING payment confirmation forward from UNDER_REVIEW — a
// customer must have first approved the quote (Invoice.status APPROVED,
// which sets paymentStatus AWAITING_TRANSFER) and then declared the
// transfer sent (paymentStatus UNDER_REVIEW) before staff can confirm it.
export async function confirmContactRequestPayment(contactRequestId, userId) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
  });

  if (!contactRequest) {
    return { error: "NOT_FOUND" };
  }

  if (contactRequest.paymentStatus !== "UNDER_REVIEW") {
    return { error: "INVALID_STATE" };
  }

  const updated = await prisma.contactRequest.update({
    where: { id: contactRequestId },
    data: { paymentStatus: "CONFIRMED", paymentConfirmedAt: new Date() },
  });

  logActivity({
    userId,
    action: "CONTACT_REQUEST_PAYMENT_CONFIRMED",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  // Release E: payment confirmation closes "check payment" and can open
  // "process application".
  await refreshCaseTasks(contactRequestId);

  // Not awaited: same rationale as elsewhere in this module.
  sendWhatsAppMessage(
    updated.phoneNormalized,
    `تم تأكيد استلام تحويلك لطلبك (${describeRequest(updated)}). سنبدأ بتنفيذ طلبك.`
  );

  // A deliverable may already exist from before this payment confirmation
  // (staff sometimes prepare/upload the final file while payment is still
  // under review) — re-check the auto-completion condition now that the
  // payment half of it just became true.
  const completed = await maybeAutoCompleteContactRequest(contactRequestId);

  return { contactRequest: completed ?? updated };
}
