import prisma from "../../config/database.js";
import { logActivity } from "../../utils/activityLog.js";

// Taking an unassigned request. The only way a regular EMPLOYEE gets to change
// an Umrah request nobody has yet: one conditional UPDATE decides, so of two
// simultaneous claims exactly one wins and the other is told who has it. A
// repeat by the current assignee is a harmless no-op. A request already
// assigned to someone else is never taken: only a manager reassigns
// (PATCH /:id/assign).
export async function claimContactRequest(id, userId, organizationId) {
  const claimed = await prisma.contactRequest.updateMany({
    where: { id, organizationId, assignedUserId: null },
    data: { assignedUserId: userId },
  });
  if (claimed.count === 1) {
    logActivity({ userId, action: "CONTACT_REQUEST_CLAIMED", entity: "ContactRequest", entityId: id, organizationId });
    return { claimed: true };
  }
  const row = await prisma.contactRequest.findFirst({ where: { id, organizationId }, select: { assignedUserId: true } });
  if (!row) return { error: "NOT_FOUND" };
  if (row.assignedUserId === userId) return { claimed: false, alreadyMine: true };
  return { error: "ALREADY_ASSIGNED" };
}

export async function postClaim(req, res, next) {
  try {
    const result = await claimContactRequest(req.params.id, req.user.id, req.user.organizationId);
    if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "Contact request not found" });
    if (result.error === "ALREADY_ASSIGNED") {
      return res.status(409).json({ success: false, code: "ALREADY_ASSIGNED", message: "سبقك موظف آخر إلى هذا الطلب." });
    }
    return res.status(200).json({ success: true, data: { assignedUserId: req.user.id, claimed: result.claimed } });
  } catch (error) {
    next(error);
  }
}
