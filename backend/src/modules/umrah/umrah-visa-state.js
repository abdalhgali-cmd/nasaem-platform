import { z } from "zod";
import { auditInTransaction, refuseWith, sendRefusal, withLockedRequest } from "../contact-request-workflow/workflow-lock.js";
import { ACTIONS, checkAction } from "../contact-request-workflow/workflow-policy.js";
import { coverageOf, UMRAH_VISA_KINDS } from "./umrah-delivery.js";

// One pilgrim's visa processing state, recorded by staff while the request is
// in execution. It is information, never a shortcut:
//  - "issued" is not a state here: it exists only when a published visa file
//    covers the pilgrim (umrah-delivery.js), and a pilgrim who has one cannot
//    be marked rejected or delayed;
//  - a REJECTED or DELAYED pilgrim keeps the whole request open (the delivery
//    check needs every pilgrim's visa), and nothing here closes, refunds or
//    reprices anything: that stays an explicit, owner-controlled decision;
//  - every change is audited with who, when, from and to.
export const VISA_STATES = Object.freeze(["PENDING", "IN_PROGRESS", "DELAYED", "REJECTED"]);
export const MIN_REASON = 5;

const bodySchema = z.object({
  state: z.enum(VISA_STATES),
  reason: z.string().trim().max(500).optional().nullable(),
  followUpAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "followUpAt must be YYYY-MM-DD").optional().nullable(),
});

const STATE_LABEL_AR = { PENDING: "بانتظار المعالجة", IN_PROGRESS: "قيد المعالجة", DELAYED: "متأخرة", REJECTED: "مرفوضة" };

function parseDay(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

// Pure rules, tested without a database. Returns { data } or { error }.
export function validateVisaStateInput(input, now = new Date()) {
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success) return { error: { status: 400, code: "VALIDATION_ERROR", message: "بيانات حالة التأشيرة غير صالحة." } };
  const { state } = parsed.data;
  const reason = (parsed.data.reason || "").trim();
  const followUp = parsed.data.followUpAt ? parseDay(parsed.data.followUpAt) : null;
  if (parsed.data.followUpAt && !followUp) return { error: { status: 400, code: "FOLLOW_UP_INVALID", message: "تاريخ المتابعة غير صالح." } };
  if ((state === "DELAYED" || state === "REJECTED") && reason.length < MIN_REASON) {
    return { error: { status: 400, code: "REASON_REQUIRED", message: "اكتب سبب التأخير أو الرفض (٥ أحرف على الأقل)؛ يظهر للعميل." } };
  }
  if (state === "DELAYED") {
    if (!followUp) return { error: { status: 400, code: "FOLLOW_UP_REQUIRED", message: "حدّد تاريخ المتابعة التالي للتأشيرة المتأخرة." } };
    const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
    if (followUp.getTime() < today) return { error: { status: 400, code: "FOLLOW_UP_PASSED", message: "تاريخ المتابعة يجب ألا يكون في الماضي." } };
  }
  // Reason and date belong only to the states that need them.
  const keep = state === "DELAYED" || state === "REJECTED";
  return { data: { state, reason: keep ? reason : null, followUpAt: state === "DELAYED" ? followUp : null } };
}

export async function setPilgrimVisaState(requestId, travelerId, input, { userId, organizationId }) {
  const checked = validateVisaStateInput(input);
  if (checked.error) return { refusal: checked.error };
  const next = checked.data;
  const result = await withLockedRequest(requestId, { organizationId }, async (tx, request) => {
    const refusal = checkAction(ACTIONS.SET_VISA_STATE, request);
    if (refusal) refuseWith(refusal);
    const traveler = request.travelers.find((t) => t.id === travelerId);
    if (!traveler) refuseWith({ status: 404, code: "TRAVELER_NOT_FOUND", message: "المعتمر غير موجود في هذا الطلب." });
    if (coverageOf(request, UMRAH_VISA_KINDS).coveredTravelerIds.includes(travelerId)) {
      refuseWith({ status: 409, code: "VISA_ALREADY_ISSUED", message: "صدرت تأشيرة هذا المعتمر ونُشرت؛ لا تُغيَّر حالته." });
    }
    const before = { state: traveler.visaState || null, reason: traveler.visaStateReason || null, followUpAt: traveler.visaFollowUpAt || null };
    const now = new Date();
    const updated = await tx.traveler.update({
      where: { id: travelerId },
      data: { visaState: next.state, visaStateReason: next.reason, visaFollowUpAt: next.followUpAt, visaStateChangedAt: now, visaStateChangedBy: userId },
      select: { id: true, fullName: true, visaState: true, visaStateReason: true, visaFollowUpAt: true, visaStateChangedAt: true },
    });
    await auditInTransaction(tx, {
      userId,
      action: "UMRAH_VISA_STATE_CHANGED",
      entityId: requestId,
      organizationId,
      oldValue: { travelerId, ...before },
      newValue: { travelerId, state: next.state, reason: next.reason, followUpAt: next.followUpAt },
    });
    // The customer's in-app notice is written with the change (not after).
    if ((next.state === "DELAYED" || next.state === "REJECTED") && request.customerId) {
      await tx.notification.create({
        data: {
          customerId: request.customerId,
          contactRequestId: requestId,
          type: next.state === "REJECTED" ? "UMRAH_VISA_REJECTED" : "UMRAH_VISA_DELAYED",
          title: next.state === "REJECTED" ? "تأشيرة معتمر تحتاج قرارًا" : "تأخر في تأشيرة معتمر",
          message: `${traveler.fullName || "أحد المعتمرين"}: ${STATE_LABEL_AR[next.state]}. ${next.reason}${next.followUpAt ? ` — المتابعة القادمة ${next.followUpAt.toISOString().slice(0, 10)}` : ""}. سنتواصل معك بالقرار.`,
        },
      });
    }
    return { traveler: updated };
  });
  return result;
}

const idParam = z.string().min(1).max(64);

export async function patchPilgrimVisaState(req, res, next) {
  try {
    if (!idParam.safeParse(req.params.id).success || !idParam.safeParse(req.params.travelerId).success) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }
    const result = await setPilgrimVisaState(req.params.id, req.params.travelerId, req.body, { userId: req.user.id, organizationId: req.user.organizationId });
    if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "الطلب غير موجود" });
    if (result.refusal) return sendRefusal(res, result.refusal);
    return res.status(200).json({ success: true, data: result.traveler });
  } catch (error) {
    next(error);
  }
}
