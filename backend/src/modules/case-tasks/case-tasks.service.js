import prisma from "../../config/database.js";
import { safeUserSelect } from "../../utils/safeSelects.js";
import { logActivity } from "../../utils/activityLog.js";

// Smart Case Operations — Release E (internal work management). Lightweight
// case tasks and a deterministic SLA state. Deliberately not a BPM engine:
// a fixed set of task types, one open task per type per case, and no
// configurable workflow — see schema.prisma's CaseTaskType comment.

const TASK_TITLES = {
  REVIEW_DOCUMENTS: "مراجعة المستندات",
  CHECK_PAYMENT: "التحقق من الدفع",
  PROCESS_APPLICATION: "تنفيذ الطلب",
  FOLLOW_UP_PROVIDER: "متابعة الجهة الخارجية",
  OTHER: "مهمة",
};

// Opens a system task for a case event, unless an identical OPEN task is
// already there — case events fire repeatedly (every document upload, every
// payment change), and a queue that grows a duplicate row each time would
// be worse than useless. A previously COMPLETED task of the same type can
// legitimately reopen later (e.g. a replacement document arrives after
// review was finished), which is why this is a query rather than a unique
// index.
export async function ensureSystemTask(contactRequestId, type, { assignedUserId = null, dueAt = null } = {}) {
  const existing = await prisma.caseTask.findFirst({
    where: { contactRequestId, type, status: "OPEN" },
    select: { id: true },
  });
  if (existing) return { task: null, created: false };

  const task = await prisma.caseTask.create({
    data: {
      contactRequestId,
      type,
      title: TASK_TITLES[type] || TASK_TITLES.OTHER,
      source: "SYSTEM",
      assignedUserId,
      dueAt,
    },
  });

  logActivity({ action: "TASK_CREATED", entity: "ContactRequest", entityId: contactRequestId });

  return { task, created: true };
}

// Closes any OPEN task of a type whose work is now demonstrably done —
// called from the same events that would otherwise leave a stale task
// sitting in someone's queue.
export async function completeSystemTasks(contactRequestId, type) {
  const result = await prisma.caseTask.updateMany({
    where: { contactRequestId, type, status: "OPEN" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  if (result.count > 0) {
    logActivity({ action: "TASK_COMPLETED", entity: "ContactRequest", entityId: contactRequestId });
  }

  return result.count;
}

// The single place case events turn into task changes. Driven off the same
// deterministic readiness signal staff already see (computeReadiness), so a
// case's queue bucket and its open tasks can never disagree.
//
// Intentionally a small, closed set of rules — the spec's "keep automation
// limited, do not build BPM".
export async function syncCaseTasks(contactRequestId, readiness, { assignedUserId = null } = {}) {
  if (!readiness) return;

  if (readiness.documentsUnderReview) {
    await ensureSystemTask(contactRequestId, "REVIEW_DOCUMENTS", { assignedUserId });
  } else {
    await completeSystemTasks(contactRequestId, "REVIEW_DOCUMENTS");
  }

  if (readiness.documentsComplete && readiness.answersComplete && !readiness.paymentReady) {
    await ensureSystemTask(contactRequestId, "CHECK_PAYMENT", { assignedUserId });
  } else if (readiness.paymentReady) {
    await completeSystemTasks(contactRequestId, "CHECK_PAYMENT");
  }

  if (readiness.overall === "READY_FOR_PROCESSING") {
    await ensureSystemTask(contactRequestId, "PROCESS_APPLICATION", { assignedUserId });
  }
}

// Deterministic SLA state from the case's own recorded expectation. No
// guessing: a case with no dueAt has no SLA state at all, rather than an
// invented deadline — and none of this is ever shown to a customer as a
// promise (see the spec's "do not make unsupported customer guarantees").
export function deriveSlaState(dueAt, now = new Date()) {
  if (!dueAt) return null;

  const due = new Date(dueAt);
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (startOfDue < startOfToday) return "OVERDUE";
  if (startOfDue.getTime() === startOfToday.getTime()) return "DUE_TODAY";
  return "ON_TIME";
}

const TASK_INCLUDE = {
  assignedUser: { select: safeUserSelect },
  completedBy: { select: safeUserSelect },
};

export async function listCaseTasks(contactRequestId, organizationId) {
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, organizationId },
    select: { id: true },
  });
  if (!contactRequest) return { error: "NOT_FOUND" };

  const tasks = await prisma.caseTask.findMany({
    where: { contactRequestId },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: TASK_INCLUDE,
  });

  return { tasks };
}

export async function createManualTask(contactRequestId, { title, type, assignedUserId, dueAt }, userId, organizationId) {
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, organizationId },
    select: { id: true },
  });
  if (!contactRequest) return { error: "NOT_FOUND" };

  // An assignee must be real, active staff in this same organization —
  // same rule as case assignment (contact-requests.service.js).
  if (assignedUserId) {
    const assignee = await prisma.user.findFirst({
      where: { id: assignedUserId, organizationId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!assignee) return { error: "ASSIGNEE_NOT_FOUND" };
  }

  const task = await prisma.caseTask.create({
    data: {
      contactRequestId,
      type: type || "OTHER",
      title,
      source: "MANUAL",
      assignedUserId: assignedUserId || null,
      dueAt: dueAt ? new Date(dueAt) : null,
      createdByUserId: userId,
    },
    include: TASK_INCLUDE,
  });

  logActivity({ userId, action: "TASK_CREATED", entity: "ContactRequest", entityId: contactRequestId, organizationId });

  return { task };
}

export async function completeCaseTask(contactRequestId, taskId, userId, organizationId) {
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, organizationId },
    select: { id: true },
  });
  if (!contactRequest) return { error: "NOT_FOUND" };

  // Scoped by contactRequestId too — never taskId alone.
  const existing = await prisma.caseTask.findFirst({ where: { id: taskId, contactRequestId } });
  if (!existing) return { error: "TASK_NOT_FOUND" };
  if (existing.status !== "OPEN") return { error: "TASK_NOT_OPEN" };

  const task = await prisma.caseTask.update({
    where: { id: taskId },
    data: { status: "COMPLETED", completedAt: new Date(), completedByUserId: userId },
    include: TASK_INCLUDE,
  });

  logActivity({ userId, action: "TASK_COMPLETED", entity: "ContactRequest", entityId: contactRequestId, organizationId });

  return { task };
}

export { TASK_TITLES };
