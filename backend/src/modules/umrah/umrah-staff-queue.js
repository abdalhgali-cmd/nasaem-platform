// What staff should do next on an Umrah request, from the same facts the
// customer's progress is derived from (request-progress.js). Shown in the
// staff case list; `rank` orders the Umrah queue "needs action first"
// (lower = sooner), then the preferred travel date (provisional, set by the
// customer). Other services get no entry.
import { evaluateReadiness } from "../contact-request-workflow/workflow-policy.js";

export function umrahStaffQueue(request, progress) {
  if (progress?.serviceKind !== "UMRAH") return null;
  const travel = request.intakeData?.umrahTravel || null;
  const step = nextStep(request, progress, travel);
  return { ...step, preferredTravelDate: travel?.preferredDate || null };
}

function nextStep(request, progress, travel) {
  const codes = new Set(evaluateReadiness(request).reasons.map((reason) => reason.code));
  const guarantorMissing = Boolean(request.intakeData?.umrahContacts?.guarantorPhoneMissing);
  const delivered = progress.stage === "DELIVERED";
  const execution = progress.steps?.find((step) => step.key === "EXECUTION")?.label || "التنفيذ";

  if (progress.stage === "CLOSED") return { nextAction: "لا إجراء — الطلب مغلق", rank: 9 };
  if (progress.stage === "PAYMENT_REVIEW") return { nextAction: "مراجعة إيصال الدفع وتأكيده", rank: 0 };
  if (!delivered && codes.has("DOCUMENTS_UNDER_REVIEW")) return { nextAction: "مراجعة مستندات المعتمرين", rank: 1 };
  if (!delivered && guarantorMissing) return { nextAction: "طلب رقم هاتف الضامن من العميل", rank: 2 };
  if (!delivered && travel?.preferredDateMissing) return { nextAction: "طلب تاريخ السفر المفضل من العميل", rank: 2 };
  if (progress.stage === "PAYMENT_ACCEPTED") {
    return progress.canStartExecution
      ? { nextAction: `بدء ${execution}`, rank: 2 }
      : { nextAction: progress.blockers?.[0]?.message || "استكمال المتطلبات قبل التنفيذ", rank: 3 };
  }
  if (progress.stage === "IN_EXECUTION") return { nextAction: "رفع الملفات النهائية لكل معتمر", rank: 3 };
  if (delivered) return { nextAction: "إغلاق الطلب بعد التسليم", rank: 4 };
  if (codes.has("DOCUMENTS_MISSING") || codes.has("DOCUMENTS_REJECTED")) return { nextAction: "بانتظار مستندات العميل", rank: 5 };
  if (progress.stage === "AWAITING_PAYMENT") return { nextAction: "بانتظار تحويل العميل", rank: 6 };
  return { nextAction: "مراجعة الطلب", rank: 4 };
}
