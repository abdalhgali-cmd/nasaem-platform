// Recurring staff alerts for open Egypt approval requests, on top of the
// travel reminder (travel-reminders.service.js):
//   PAYMENT_REVIEW_OVERDUE  a transfer receipt waiting for review too long
//   APPROVAL_OVERDUE        paid, approval not issued after the set hours
//   CIRCULAR_DUE            travel close, circular not issued
//   TRAVEL_DOCS_MISSING     travel close, ticket / date / crossing missing
//   UNASSIGNED              nobody assigned after the set hours
// Lead times come from the administrator settings (alert-settings.service.js).
//
// Each alert fires once per occurrence: `cycleKey` names the occurrence (the
// receipt, the payment confirmation, the travel date…) and the pair
// (request, kind, cycleKey) is unique in OperationalAlert. A new travel date
// is a new occurrence, so a changed date alerts again for the new date and
// never twice for the same one. The row and the staff notifications are
// written in one transaction under the request's row lock, after the
// condition is checked again on the locked row.
import prisma from "../../config/database.js";
import { alertSettings } from "./alert-settings.service.js";
import { EGYPT_CLEARANCE_CODE } from "./egypt-clearance-variants.js";
import { calendarDaysUntil, circularState, isApprovalIssued, requestTravelDate, travelPreparation } from "./egypt-approval-rules.js";

const HOUR = 60 * 60 * 1000;
const ADMINS = ["SUPER_ADMIN", "ADMIN"];
const FINANCE = ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"];

export const ALERT_KINDS = Object.freeze({
  PAYMENT_REVIEW_OVERDUE: "PAYMENT_REVIEW_OVERDUE",
  APPROVAL_OVERDUE: "APPROVAL_OVERDUE",
  CIRCULAR_DUE: "CIRCULAR_DUE",
  TRAVEL_DOCS_MISSING: "TRAVEL_DOCS_MISSING",
  UNASSIGNED: "UNASSIGNED",
});

export const ALERT_REQUEST_SELECT = {
  id: true, name: true, status: true, organizationId: true, createdAt: true, assignedUserId: true,
  paymentStatus: true, paymentConfirmedAt: true, travelEntryDate: true, intakeData: true, circularProcessingAt: true,
  visaType: { select: { code: true } },
  travelers: { select: { id: true } },
  documents: { where: { supersededAt: null }, select: { id: true, status: true, supersededAt: true, label: true, classification: true, createdAt: true } },
  deliverables: { where: { publishedAt: { not: null }, supersededAt: null }, select: { id: true, kind: true, publishedAt: true, supersededAt: true, travelerIds: true, label: true, issuedOn: true } },
  linkedRequests: { select: { id: true, linkKind: true, deliverables: { where: { publishedAt: { not: null }, supersededAt: null }, select: { id: true, label: true, publishedAt: true, supersededAt: true } } } },
};

function hoursSince(date, now) {
  return date ? (now.getTime() - new Date(date).getTime()) / HOUR : -Infinity;
}

// Pure: the alerts this request is due for now. Each one names who is told
// (`roles`, plus the assigned employee when `toAssignee`).
export function dueOperationalAlerts(request, settings, now = new Date()) {
  if (!request || request.status === "CLOSED") return [];
  const alerts = [];
  const ref = `الطلب: ${request.id}.`;

  if (request.paymentStatus === "UNDER_REVIEW") {
    const receipt = (request.documents || [])
      .filter((d) => d.classification === "FINANCIAL_DOCUMENT" && d.status === "PENDING" && !d.supersededAt)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    if (receipt && hoursSince(receipt.createdAt, now) >= settings.paymentReviewHours) {
      alerts.push({
        kind: ALERT_KINDS.PAYMENT_REVIEW_OVERDUE, cycleKey: `receipt:${receipt.id}`, roles: FINANCE, toAssignee: true,
        title: "إشعار دفع ينتظر المراجعة",
        message: `إشعار تحويل ${request.name} ينتظر التأكيد أو الرفض منذ أكثر من ${settings.paymentReviewHours} ساعة. ${ref}`,
      });
    }
  }

  if (request.paymentStatus === "CONFIRMED" && !isApprovalIssued(request) && hoursSince(request.paymentConfirmedAt, now) >= settings.approvalIssuanceHours) {
    alerts.push({
      kind: ALERT_KINDS.APPROVAL_OVERDUE, cycleKey: `paid:${new Date(request.paymentConfirmedAt).toISOString()}`, roles: ADMINS, toAssignee: true,
      title: "موافقة أمنية بانتظار الإصدار",
      message: `تم تأكيد دفع ${request.name} منذ أكثر من ${settings.approvalIssuanceHours} ساعة ولم تصدر الموافقة بعد. ${ref}`,
    });
  }

  const date = requestTravelDate(request);
  const days = date ? calendarDaysUntil(date, now) : null;
  if (days !== null && days >= 0) {
    const when = days === 0 ? "اليوم" : days === 1 ? "غدًا" : `بعد ${days} أيام`;
    if (days <= settings.circularLeadDays && circularState(request).status !== "ISSUED") {
      alerts.push({
        kind: ALERT_KINDS.CIRCULAR_DUE, cycleKey: `travel:${date}`, roles: ADMINS, toAssignee: true,
        title: "التعميم لم يصدر والسفر قريب",
        message: `يسافر ${request.name} ${when} (${date}) ولم يصدر التعميم. ${ref}`,
      });
    }
    const preparation = travelPreparation(request);
    if (days <= settings.missingTravelDocsLeadDays && preparation.missing.length) {
      alerts.push({
        kind: ALERT_KINDS.TRAVEL_DOCS_MISSING, cycleKey: `travel:${date}`, roles: ADMINS, toAssignee: true,
        title: "بيانات سفر ناقصة",
        message: `يسافر ${request.name} ${when} (${date}). ناقص: ${preparation.missing.map((m) => m.message).join(" ")} ${ref}`,
      });
    }
  }

  if (!request.assignedUserId && hoursSince(request.createdAt, now) >= settings.unassignedHours) {
    alerts.push({
      kind: ALERT_KINDS.UNASSIGNED, cycleKey: "unassigned", roles: ADMINS, toAssignee: false,
      title: "طلب موافقة أمنية بلا موظف مسؤول",
      message: `طلب ${request.name} لم يُسند لأي موظف منذ أكثر من ${settings.unassignedHours} ساعة. ${ref}`,
    });
  }
  return alerts;
}

// One alert for one request, under the request's row lock: the condition is
// evaluated again on the locked row, then the unique alert row and the
// notifications commit together (a crash writes none or all).
async function raiseAlert(requestId, kind, settings, now) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ContactRequest" WHERE id = ${requestId} FOR UPDATE`;
    const request = await tx.contactRequest.findUnique({ where: { id: requestId }, select: ALERT_REQUEST_SELECT });
    const alert = dueOperationalAlerts(request, settings, now).find((candidate) => candidate.kind === kind);
    if (!alert) return "STALE";
    const inserted = await tx.operationalAlert.createMany({
      data: [{ contactRequestId: requestId, kind, cycleKey: alert.cycleKey }],
      skipDuplicates: true,
    });
    if (inserted.count !== 1) return "DUPLICATE";
    const staff = await tx.user.findMany({
      where: {
        organizationId: request.organizationId,
        status: "ACTIVE",
        OR: [{ role: { in: alert.roles } }, ...(alert.toAssignee && request.assignedUserId ? [{ id: request.assignedUserId }] : [])],
      },
      select: { id: true },
    });
    if (staff.length) {
      await tx.notification.createMany({
        data: staff.map((user) => ({ userId: user.id, contactRequestId: requestId, type: `EGYPT_ALERT_${kind}`, title: alert.title, message: alert.message })),
      });
    }
    return "SENT";
  });
}

// Open Egypt requests, checked against the current settings. Bounded per run;
// the worker runs every few minutes.
export async function processOperationalAlerts({ now = new Date(), limit = 300 } = {}) {
  const settings = await alertSettings();
  const requests = await prisma.contactRequest.findMany({
    where: { status: { not: "CLOSED" }, visaType: { code: { startsWith: EGYPT_CLEARANCE_CODE } } },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: ALERT_REQUEST_SELECT,
  });
  const outcomes = {};
  for (const request of requests) {
    for (const alert of dueOperationalAlerts(request, settings, now)) {
      const exists = await prisma.operationalAlert.findUnique({
        where: { contactRequestId_kind_cycleKey: { contactRequestId: request.id, kind: alert.kind, cycleKey: alert.cycleKey } },
        select: { id: true },
      });
      if (exists) continue;
      const outcome = await raiseAlert(request.id, alert.kind, settings, now).catch((error) => {
        console.error("[operational-alerts] failed", error?.message);
        return "ERROR";
      });
      outcomes[outcome] = (outcomes[outcome] || 0) + 1;
    }
  }
  return { checked: requests.length, outcomes };
}
