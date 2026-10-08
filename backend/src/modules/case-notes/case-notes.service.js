import prisma from "../../config/database.js";
import { safeUserSelect } from "../../utils/safeSelects.js";
import { logActivity } from "../../utils/activityLog.js";

// Internal staff notes on a case — never customer-facing, never part of any
// tracking response (see the CaseNote schema comment). Append-only: list +
// create, no edit/delete, same posture as ActivityLog.

const NOTE_INCLUDE = {
  author: { select: safeUserSelect },
};

export async function listCaseNotes(contactRequestId, organizationId) {
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, organizationId },
    select: { id: true },
  });
  if (!contactRequest) return { error: "NOT_FOUND" };

  const notes = await prisma.caseNote.findMany({
    where: { contactRequestId },
    orderBy: { createdAt: "desc" },
    include: NOTE_INCLUDE,
  });

  return { notes };
}

export async function createCaseNote(contactRequestId, { body }, userId, organizationId) {
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, organizationId },
    select: { id: true },
  });
  if (!contactRequest) return { error: "NOT_FOUND" };

  const note = await prisma.caseNote.create({
    data: { contactRequestId, body, authorUserId: userId },
    include: NOTE_INCLUDE,
  });

  logActivity({ userId, action: "CASE_NOTE_ADDED", entity: "ContactRequest", entityId: contactRequestId, organizationId });

  return { note };
}
