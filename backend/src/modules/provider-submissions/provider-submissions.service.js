import prisma from "../../config/database.js";
import { safeUserSelect } from "../../utils/safeSelects.js";
import { logActivity } from "../../utils/activityLog.js";
import {
  buildProviderEmailBody,
  isValidRecipient,
  sendProviderEmail,
} from "../../utils/providerEmail.js";

// Smart Case Operations — Release F (provider operations). Handing a case
// to the external party that actually processes it (embassy, agency,
// carrier), with an append-only audit record of every attempt.

// A provider package may only ever contain documents the customer supplied
// or that were produced for the provider. Internal working files and
// financial records (payment receipts) are excluded by default — sending a
// customer's payment receipt to an embassy would be a real privacy
// incident, so it takes an explicit, logged override by the employee.
const DEFAULT_PACKAGE_CLASSIFICATIONS = ["CUSTOMER_DOCUMENT", "PROVIDER_DOCUMENT"];

// What an employee sees before choosing what to send: every current
// (non-superseded) document on the case, each marked with whether it is
// eligible for a provider package by default and why not, if not.
export async function buildProviderPackage(contactRequestId, organizationId) {
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, organizationId },
    include: {
      travelers: { orderBy: { sortOrder: "asc" } },
      documents: { where: { supersededAt: null }, orderBy: { createdAt: "asc" } },
      serviceRef: { select: { id: true, name: true } },
      visaType: { select: { id: true, name: true } },
    },
  });

  if (!contactRequest) return { error: "NOT_FOUND" };

  const travelersById = new Map(contactRequest.travelers.map((traveler) => [traveler.id, traveler]));

  const documents = contactRequest.documents.map((document) => ({
    id: document.id,
    label: document.label,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    status: document.status,
    classification: document.classification,
    travelerId: document.travelerId,
    travelerName: document.travelerId ? (travelersById.get(document.travelerId)?.fullName ?? null) : null,
    eligibleByDefault: DEFAULT_PACKAGE_CLASSIFICATIONS.includes(document.classification),
    // Surfaced so the UI can explain a greyed-out row rather than silently
    // hiding a document the employee is looking for.
    excludedReason: DEFAULT_PACKAGE_CLASSIFICATIONS.includes(document.classification)
      ? null
      : document.classification === "FINANCIAL_DOCUMENT"
        ? "مستند مالي — لا يُرسل للجهة الخارجية افتراضيًا"
        : "مستند داخلي — لا يُرسل للجهة الخارجية افتراضيًا",
  }));

  return {
    package: {
      contactRequestId: contactRequest.id,
      customerName: contactRequest.name,
      service: contactRequest.service || contactRequest.serviceRef?.name || contactRequest.visaType?.name || null,
      travelers: contactRequest.travelers.map((t) => ({ id: t.id, fullName: t.fullName })),
      documents,
      defaultSelectedDocumentIds: documents.filter((d) => d.eligibleByDefault).map((d) => d.id),
    },
  };
}

const SUBMISSION_INCLUDE = {
  supplier: { select: { id: true, name: true, code: true, submissionChannel: true } },
  createdBy: { select: safeUserSelect },
  documents: {
    select: {
      document: { select: { id: true, label: true, fileName: true, classification: true } },
    },
  },
};

export async function listProviderSubmissions(contactRequestId, organizationId) {
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, organizationId },
    select: { id: true },
  });
  if (!contactRequest) return { error: "NOT_FOUND" };

  const submissions = await prisma.providerSubmission.findMany({
    where: { contactRequestId },
    orderBy: { createdAt: "desc" },
    include: SUBMISSION_INCLUDE,
  });

  return { submissions };
}

// Staff who work a case need a deliberately small provider directory in
// order to hand that case off.  The general /suppliers admin endpoint also
// exposes configuration/contact fields and therefore remains manager-only;
// this case-scoped projection exposes only what the submission form needs.
export async function listAvailableProviders(contactRequestId, organizationId) {
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, organizationId },
    select: { id: true },
  });
  if (!contactRequest) return { error: "NOT_FOUND" };

  const providers = await prisma.supplier.findMany({
    where: {
      active: true,
      submissionChannel: { not: null },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      submissionChannel: true,
      expectedProcessingDays: true,
    },
  });

  return { providers };
}

// Creates one submission attempt. A resend is simply another call — this
// never mutates or replaces an earlier submission, so the history of what
// was sent, to whom and by whom stays intact (schema.prisma's
// ProviderSubmission comment).
//
// EMAIL dispatches through the provider email transport and records the
// real outcome: an unconfigured platform yields a FAILED row with
// NOT_CONFIGURED rather than a row that claims a case was sent.
// MANUAL_PORTAL records IN_PROGRESS for the employee to complete and mark
// submitted once they've finished in the provider's own portal.
export async function createProviderSubmission(
  contactRequestId,
  { supplierId, documentIds = [], notes, allowRestrictedDocuments = false },
  userId,
  organizationId
) {
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, organizationId },
    include: {
      travelers: { orderBy: { sortOrder: "asc" } },
      serviceRef: { select: { id: true, name: true } },
      visaType: { select: { id: true, name: true } },
    },
  });
  if (!contactRequest) return { error: "NOT_FOUND" };

  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, active: true } });
  if (!supplier) return { error: "PROVIDER_NOT_FOUND" };
  if (!supplier.submissionChannel) return { error: "PROVIDER_NOT_CONFIGURED" };

  // Every selected document must belong to THIS case and still be current —
  // a document id from another customer's case must never be packaged out,
  // even by an authenticated employee who guessed one.
  const documents = documentIds.length
    ? await prisma.contactRequestDocument.findMany({
        where: { id: { in: documentIds }, contactRequestId, supersededAt: null },
      })
    : [];

  if (documents.length !== documentIds.length) return { error: "DOCUMENT_NOT_FOUND" };

  const restricted = documents.filter((d) => !DEFAULT_PACKAGE_CLASSIFICATIONS.includes(d.classification));
  if (restricted.length > 0 && !allowRestrictedDocuments) {
    return {
      error: "RESTRICTED_DOCUMENT",
      details: { documentIds: restricted.map((d) => d.id), classifications: restricted.map((d) => d.classification) },
    };
  }

  const recipient = supplier.submissionChannel === "EMAIL" ? supplier.submissionEmail : supplier.portalUrl;
  if (supplier.submissionChannel === "EMAIL" && !isValidRecipient(recipient)) {
    return { error: "PROVIDER_RECIPIENT_INVALID" };
  }

  let status = "IN_PROGRESS";
  let failureReason = null;
  let submittedAt = null;

  if (supplier.submissionChannel === "EMAIL") {
    const result = await sendProviderEmail({
      to: recipient,
      subject: `NASAEM case ${contactRequest.id} — ${contactRequest.name}`,
      body: buildProviderEmailBody({ contactRequest, travelers: contactRequest.travelers, documents, notes }),
      attachments: documents,
    });

    status = result.sent ? "SUBMITTED" : "FAILED";
    failureReason = result.sent ? null : result.reason;
    submittedAt = result.sent ? new Date() : null;
  }

  const submission = await prisma.providerSubmission.create({
    data: {
      contactRequestId,
      supplierId,
      channel: supplier.submissionChannel,
      status,
      failureReason,
      submittedAt,
      recipient: recipient || null,
      notes: notes || null,
      createdByUserId: userId,
      documents: documents.length
        ? { create: documents.map((document) => ({ documentId: document.id })) }
        : undefined,
    },
    include: SUBMISSION_INCLUDE,
  });

  logActivity({
    userId,
    action: "PROVIDER_SUBMISSION_CREATED",
    entity: "ContactRequest",
    entityId: contactRequestId,
    organizationId,
  });

  return { submission };
}

// Completing a MANUAL_PORTAL submission: the employee has finished in the
// provider's own portal and records the reference the provider gave them.
export async function completeProviderSubmission(
  contactRequestId,
  submissionId,
  { externalReference, notes },
  userId,
  organizationId
) {
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, organizationId },
    select: { id: true },
  });
  if (!contactRequest) return { error: "NOT_FOUND" };

  // Scoped by contactRequestId too — never by submissionId alone.
  const existing = await prisma.providerSubmission.findFirst({ where: { id: submissionId, contactRequestId } });
  if (!existing) return { error: "SUBMISSION_NOT_FOUND" };
  if (existing.status === "SUBMITTED") return { error: "ALREADY_SUBMITTED" };

  const submission = await prisma.providerSubmission.update({
    where: { id: submissionId },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      failureReason: null,
      externalReference: externalReference || existing.externalReference,
      notes: notes ?? existing.notes,
    },
    include: SUBMISSION_INCLUDE,
  });

  logActivity({
    userId,
    action: "PROVIDER_SUBMITTED",
    entity: "ContactRequest",
    entityId: contactRequestId,
    organizationId,
  });

  return { submission };
}

export { DEFAULT_PACKAGE_CLASSIFICATIONS };
