import crypto from "crypto";
import path from "path";
import prisma from "../../config/database.js";
import { logActivity } from "../../utils/activityLog.js";
import { normalizePhone } from "../../utils/phone.js";
import { maybeRunPassportOcr } from "../passport-ocr/passport-ocr.service.js";
import { getPublicChecklist } from "../requirements/requirements.service.js";
import { announceNewContactRequest } from "../contact-requests/contact-requests.service.js";
import { CONTACT_REQUEST_DOCUMENT_DIR, generateUniqueFilename, saveBufferToDirectory } from "../../middleware/upload.middleware.js";

// Smart Case Operations — Release B (server-side intake drafts). The
// authoritative pre-submission state for an in-progress intake, so a weak
// connection can't lose a half-finished application. See schema.prisma's
// IntakeDraft comment for why this is deliberately not a ContactRequest
// row in a DRAFT status.

// How long an abandoned draft stays resumable. Long enough that a customer
// can come back the next day for a document they had to go fetch, short
// enough that unfinished personal data isn't kept indefinitely.
const DRAFT_TTL_DAYS = 30;

// The token is the anonymous customer's ONLY credential for their draft, so
// it comes from crypto random bytes — never a cuid or anything derived from
// row identity/time, which an attacker could enumerate or predict.
function generateDraftToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function draftExpiry() {
  return new Date(Date.now() + DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// Everything the wizard needs to rehydrate itself, and nothing else — the
// token is never echoed back in a fetch response (the caller already has
// it; not repeating it keeps it out of any response logging).
const DRAFT_PUBLIC_SELECT = {
  id: true,
  serviceKind: true,
  serviceId: true,
  visaTypeId: true,
  step: true,
  name: true,
  phone: true,
  email: true,
  travelerCount: true,
  notes: true,
  answers: true,
  travelers: true,
  submittedContactRequestId: true,
  expiresAt: true,
  updatedAt: true,
  documents: {
    where: { supersededAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      requirementId: true,
      travelerId: true,
      ocrResult: true,
      createdAt: true,
    },
  },
};

export async function createDraft(data, organizationId = "org_nasaem_default") {
  const token = generateDraftToken();

  const draft = await prisma.intakeDraft.create({
    data: {
      token,
      organizationId,
      serviceKind: data.serviceKind || null,
      serviceId: data.serviceId || null,
      visaTypeId: data.visaTypeId || null,
      expiresAt: draftExpiry(),
    },
    select: DRAFT_PUBLIC_SELECT,
  });

  logActivity({ action: "INTAKE_DRAFT_CREATED", entity: "IntakeDraft", entityId: draft.id, organizationId });

  return { draft, token };
}

// A draft is only ever reachable by its own token — never by id, and never
// listed. An expired or already-submitted draft is treated as gone for
// mutations (see assertMutable below), but still readable so the wizard can
// show "this was already submitted" instead of a blank error.
export async function getDraftByToken(token) {
  return prisma.intakeDraft.findUnique({ where: { token }, select: DRAFT_PUBLIC_SELECT });
}

async function findMutableDraft(token) {
  const draft = await prisma.intakeDraft.findUnique({
    where: { token },
    select: { id: true, organizationId: true, submittedContactRequestId: true, expiresAt: true, serviceId: true, visaTypeId: true },
  });

  if (!draft) return { error: "NOT_FOUND" };
  if (draft.submittedContactRequestId) return { error: "ALREADY_SUBMITTED" };
  if (draft.expiresAt < new Date()) return { error: "EXPIRED" };
  return { draft };
}

// Autosave. Only the fields actually sent are written (the wizard sends
// partial state as the customer moves), and every save pushes the expiry
// out so an actively-used draft never times out mid-application.
export async function updateDraft(token, data) {
  const found = await findMutableDraft(token);
  if (found.error) return found;

  const updated = await prisma.intakeDraft.update({
    where: { id: found.draft.id },
    data: {
      ...(data.serviceKind !== undefined ? { serviceKind: data.serviceKind || null } : {}),
      ...(data.serviceId !== undefined ? { serviceId: data.serviceId || null } : {}),
      ...(data.visaTypeId !== undefined ? { visaTypeId: data.visaTypeId || null } : {}),
      ...(data.step !== undefined ? { step: data.step } : {}),
      ...(data.name !== undefined ? { name: data.name || null } : {}),
      ...(data.email !== undefined ? { email: data.email || null } : {}),
      ...(data.travelerCount !== undefined ? { travelerCount: data.travelerCount } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      ...(data.answers !== undefined ? { answers: data.answers } : {}),
      ...(data.travelers !== undefined ? { travelers: data.travelers } : {}),
      // phoneNormalized is derived, never accepted from the client — it's
      // what lets an OTP-verified customer recover this draft later, so it
      // must always match the phone actually stored on it.
      ...(data.phone !== undefined
        ? { phone: data.phone || null, phoneNormalized: data.phone ? normalizePhone(data.phone) : null }
        : {}),
      expiresAt: draftExpiry(),
    },
    select: DRAFT_PUBLIC_SELECT,
  });

  return { draft: updated };
}

// Resilient uploads (Release B): a document is uploaded and stored the
// moment the customer picks it, against the draft rather than a
// ContactRequest that doesn't exist yet — so a failed upload retries on its
// own without touching the rest of the application, and a lost connection
// never costs the files already sent. Reuses the exact same storage path
// convention, requirement validation and passport OCR as every other
// upload path in this codebase (see contact-request-documents.service.js).
export async function addDraftDocument(token, { label, file, requirementId, travelerIndex }) {
  const found = await findMutableDraft(token);
  if (found.error) return found;
  const draft = found.draft;

  let requirement = null;
  if (requirementId) {
    requirement = await prisma.visaRequirement.findUnique({ where: { id: requirementId } });

    // Same cross-scope rule the submitted-request upload path enforces: a
    // requirement must belong to whichever service/visa type this draft is
    // actually for.
    const belongsToDraft =
      requirement &&
      ((requirement.visaTypeId && requirement.visaTypeId === draft.visaTypeId) ||
        (requirement.serviceId && requirement.serviceId === draft.serviceId));
    if (!belongsToDraft) return { error: "REQUIREMENT_NOT_FOUND" };

    if (requirement.allowedMimeTypes.length > 0 && !requirement.allowedMimeTypes.includes(file.mimetype)) {
      return {
        error: "INVALID_MIME",
        details: {
          receivedMimeType: file.mimetype,
          allowedMimeTypes: requirement.allowedMimeTypes,
          fileName: file.originalname
        }
      };
    }
    if (requirement.maxSizeBytes && file.size > requirement.maxSizeBytes) {
      return { error: "FILE_TOO_LARGE", details: { maxSizeBytes: requirement.maxSizeBytes } };
    }

    const existingCount = await prisma.contactRequestDocument.count({
      where: { draftId: draft.id, requirementId, supersededAt: null },
    });
    if (existingCount >= requirement.maxFiles) {
      return { error: "MAX_FILES_REACHED", details: { maxFiles: requirement.maxFiles } };
    }
  }

  const ocrResult = await maybeRunPassportOcr(requirement, file);

  let storagePath;
  if (file.buffer) {
    const filename = generateUniqueFilename(file.originalname);
    saveBufferToDirectory(file.buffer, CONTACT_REQUEST_DOCUMENT_DIR, filename);
    storagePath = path.join("contact-request-documents", filename);
  } else {
    storagePath = path.join("contact-request-documents", file.filename);
  }

  const document = await prisma.contactRequestDocument.create({
    data: {
      draftId: draft.id,
      label,
      requirementId: requirementId || null,
      // Left null on purpose: ContactRequestDocument.travelerId is a real FK
      // and this draft's Traveler rows don't exist yet. Which traveler owns
      // this document is recorded as an index in the draft's
      // documentTravelerRefs below, and resolved by submitDraft().
      travelerId: null,
      ocrResult: ocrResult ?? undefined,
      fileName: file.originalname,
      storagePath,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    },
    select: { id: true, label: true, fileName: true, mimeType: true, sizeBytes: true, requirementId: true, ocrResult: true, createdAt: true },
  });

  const travelerRef = travelerIndex === undefined || travelerIndex === null || travelerIndex === "" ? null : String(travelerIndex);
  const existingRefs = (await prisma.intakeDraft.findUnique({ where: { id: draft.id }, select: { documentTravelerRefs: true } }))
    ?.documentTravelerRefs;

  await prisma.intakeDraft.update({
    where: { id: draft.id },
    data: {
      ...(travelerRef !== null
        ? { documentTravelerRefs: { ...(existingRefs || {}), [document.id]: travelerRef } }
        : {}),
      expiresAt: draftExpiry(),
    },
  });

  logActivity({
    action: "INTAKE_DRAFT_DOCUMENT_UPLOADED",
    entity: "IntakeDraft",
    entityId: draft.id,
    organizationId: draft.organizationId,
  });

  return { document, travelerRef };
}

export async function removeDraftDocument(token, documentId) {
  const found = await findMutableDraft(token);
  if (found.error) return found;

  // Scoped by draftId, never documentId alone — a document id from another
  // draft (or a submitted request) must never be deletable through this token.
  const deleted = await prisma.contactRequestDocument.deleteMany({
    where: { id: documentId, draftId: found.draft.id },
  });

  if (deleted.count === 0) return { error: "DOCUMENT_NOT_FOUND" };
  return { deleted: true };
}

// DRAFT → SUBMITTED. Creates exactly one ContactRequest from the draft's
// accumulated state, re-points the already-uploaded documents at it (they
// keep their id, file, OCR result and requirement link — nothing is
// re-uploaded), resolves each document's draft traveler index to the real
// Traveler row just created, and marks the draft submitted so it can never
// produce a second request.
//
// Everything runs in one transaction: either the request exists with all
// its travelers and documents attached, or nothing changed and the
// customer's draft is still intact to retry.
export async function submitDraft(token, { message }) {
  const found = await findMutableDraft(token);
  if (found.error) return found;

  const draft = await prisma.intakeDraft.findUnique({
    where: { id: found.draft.id },
    include: { documents: { where: { supersededAt: null } } },
  });

  if (!draft.name || !draft.phone) return { error: "INCOMPLETE_DRAFT" };

  const requirementsSnapshot = draft.visaTypeId
    ? await getPublicChecklist({ visaTypeId: draft.visaTypeId })
    : draft.serviceId
      ? await getPublicChecklist({ serviceId: draft.serviceId })
      : null;

  const travelers = Array.isArray(draft.travelers) ? draft.travelers : [];
  const travelerRefs = draft.documentTravelerRefs || {};

  const contactRequest = await prisma.$transaction(async (tx) => {
    const created = await tx.contactRequest.create({
      data: {
        name: draft.name,
        organizationId: draft.organizationId,
        phone: draft.phone,
        phoneNormalized: normalizePhone(draft.phone),
        email: draft.email || null,
        serviceId: draft.serviceId || null,
        visaTypeId: draft.visaTypeId || null,
        travelerCount: draft.travelerCount ?? null,
        intakeData: {
          ...(travelers.length ? { travelers } : {}),
          ...(draft.notes ? { notes: draft.notes } : {}),
          ...(draft.answers ? { answers: draft.answers } : {}),
        },
        requirementsSnapshot: requirementsSnapshot && requirementsSnapshot.length ? requirementsSnapshot : undefined,
        message: message || draft.notes || "طلب خدمة عبر نموذج الحجز الإلكتروني",
        travelers: travelers.length
          ? {
              create: travelers
                .filter((traveler) => traveler?.fullName)
                .map((traveler, index) => ({
                  fullName: traveler.fullName,
                  passportNo: traveler.passportNo || null,
                  nationality: traveler.nationality || null,
                  birthDate: traveler.birthDate ? new Date(traveler.birthDate) : null,
                  gender: traveler.gender || null,
                  isPrimary: Boolean(traveler.isPrimary),
                  sortOrder: index,
                })),
            }
          : undefined,
      },
      include: { travelers: { orderBy: { sortOrder: "asc" } } },
    });

    for (const document of draft.documents) {
      const ref = travelerRefs[document.id];
      const travelerId = ref !== undefined && created.travelers[Number(ref)] ? created.travelers[Number(ref)].id : null;

      await tx.contactRequestDocument.update({
        where: { id: document.id },
        data: { contactRequestId: created.id, draftId: null, travelerId },
      });
    }

    await tx.intakeDraft.update({
      where: { id: draft.id },
      data: { submittedContactRequestId: created.id },
    });

    return created;
  });

  await announceNewContactRequest(contactRequest, { documentCount: draft.documents.length });

  return { contactRequest };
}

export { findMutableDraft, draftExpiry };
