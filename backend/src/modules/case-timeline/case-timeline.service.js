import prisma from "../../config/database.js";
import { safeUserSelect } from "../../utils/safeSelects.js";

// Smart Case Operations — a single case's history, read from the
// ActivityLog rows the platform already writes for every case event
// (received, document uploaded/reviewed, assigned, invoiced, paid, task
// opened/completed, sent to a provider, closed). Nothing new is recorded
// here: this is the read side of an audit trail that already exists, which
// is why it cannot drift from what actually happened.
//
// Deliberately not returning oldValue/newValue. Those are the audit
// record's forensic detail — they can carry a case's previous field values,
// and the case workspace only needs to answer "what happened, when, by
// whom". The full record stays available to SUPER_ADMIN/ADMIN through the
// existing /api/activity endpoint.
const TIMELINE_SELECT = {
  id: true,
  action: true,
  createdAt: true,
  user: { select: safeUserSelect },
};

// Capped rather than paginated: a case's history is small and bounded by
// how many times staff and one customer touched it, and an employee
// scanning a timeline wants the recent end of it. The cap is a guard
// against a pathological row count, not a paging contract.
const TIMELINE_LIMIT = 200;

export async function getCaseTimeline(contactRequestId, organizationId) {
  // Scoped by the parent case's own organization, not by the log rows'
  // organizationId — the case is the thing being authorized here, and a
  // log row written before organizations existed carries none.
  const contactRequest = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, organizationId },
    select: { id: true },
  });
  if (!contactRequest) return { error: "NOT_FOUND" };

  const entries = await prisma.activityLog.findMany({
    where: { entity: "ContactRequest", entityId: contactRequestId },
    orderBy: { createdAt: "desc" },
    take: TIMELINE_LIMIT,
    select: TIMELINE_SELECT,
  });

  return { entries };
}

export { TIMELINE_LIMIT };
