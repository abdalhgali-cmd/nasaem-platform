// Runs one workflow transition on one request, serialized with every other
// transition on the same request: the request row is locked (SELECT ... FOR
// UPDATE) inside a transaction, the request is re-read under that lock, the
// policy decides on that state, and the writes happen in the same
// transaction. Two concurrent callers therefore never both see the "before"
// state: the second waits, then sees the first one's result and is refused
// (or treated as an idempotent repeat) by the policy.
//
// The audit row of a transition is written inside the same transaction, so
// it exists exactly when the transition happened (the loser writes none).
// Notifications are sent by the caller after commit, only for the winner.
import prismaPackage from "@prisma/client";
import prisma from "../../config/database.js";
import { redactSensitive } from "../../utils/activityLog.js";

const { Prisma } = prismaPackage;

export const WORKFLOW_INCLUDE = {
  invoice: true,
  offers: { orderBy: { createdAt: "desc" } },
  documents: { orderBy: { createdAt: "desc" } },
  travelers: { orderBy: { sortOrder: "asc" } },
  deliverables: { orderBy: { createdAt: "desc" } },
  serviceRef: { select: { id: true, name: true, category: true, features: true } },
  visaType: { select: { id: true, code: true, name: true, country: true, category: true } },
  // Open system tasks: the Egypt travel-plan tasks gate completion.
  tasks: { where: { status: "OPEN", source: "SYSTEM" }, select: { id: true, title: true, status: true, source: true, systemKey: true } },
};

export class WorkflowRefusal extends Error {
  constructor(refusal) {
    super(refusal.message);
    this.refusal = refusal;
  }
}

// scope: extra where-conditions that must hold for the caller to see the
// request at all (organization for staff, phone for tracking, customer for
// an account). A request outside the scope reads as not found.
export async function withLockedRequest(id, scope, work) {
  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`SELECT id FROM "ContactRequest" WHERE id = ${id} FOR UPDATE`;
      if (locked.length === 0) return { error: "NOT_FOUND" };
      const request = await tx.contactRequest.findFirst({ where: { id, ...(scope || {}) }, include: WORKFLOW_INCLUDE });
      if (!request) return { error: "NOT_FOUND" };
      return work(tx, request);
    });
  } catch (error) {
    if (error instanceof WorkflowRefusal) return { refusal: error.refusal };
    throw error;
  }
}

// Throw inside `work` to roll back everything written so far and answer
// with this refusal.
export function refuseWith(refusal) {
  throw new WorkflowRefusal(refusal);
}

export async function auditInTransaction(tx, { userId = null, action, entityId, organizationId, oldValue, newValue }) {
  await tx.activityLog.create({
    data: {
      userId,
      action,
      entity: "ContactRequest",
      entityId,
      ...(organizationId ? { organizationId } : {}),
      ...(oldValue !== undefined ? { oldValue: redactSensitive(oldValue) ?? Prisma.JsonNull } : {}),
      ...(newValue !== undefined ? { newValue: redactSensitive(newValue) ?? Prisma.JsonNull } : {}),
    },
  });
}

// Standard HTTP answer for a refused transition.
export function sendRefusal(res, refusal) {
  return res.status(refusal.status || 409).json({
    success: false,
    code: refusal.code,
    message: refusal.message,
    ...(refusal.reasons ? { reasons: refusal.reasons } : {}),
  });
}
