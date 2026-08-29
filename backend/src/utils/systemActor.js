import { randomUUID } from "node:crypto";
import prisma from "../config/database.js";
import { hashPassword } from "./password.js";

const SYSTEM_ACTOR_EMAIL = "system.customer-portal@nasaem-platform.local";

let cachedId = null;

// Order/OrderStatusHistory require a real staff User as the actor
// (changedByUserId/assignedUserId reference User, not Customer) — a
// constraint that predates this feature and every existing Order-creating
// code path is staff-initiated, so it's never been an issue before. The
// new customer self-checkout endpoint (customer-portal.service.js)
// creates an Order directly from a Customer session with no staff
// present, so it needs *some* User row to satisfy that FK.
//
// Rather than loosening the schema (making changedByUserId nullable would
// ripple into every report/query that assumes "who changed this" is
// always a real staff member), this find-or-creates one fixed, clearly-
// named system account and reuses it as the actor for every such order.
// It is deliberately status "INACTIVE" (so it can never log in — staff
// login requires ACTIVE — and is excluded from admin-notification and
// user-picker queries that filter on status/role) with an unusable random
// password hash. It is a marker in ActivityLog/OrderStatusHistory, not a
// working account.
export async function getSystemActorId() {
  if (cachedId) return cachedId;

  const existing = await prisma.user.findUnique({ where: { email: SYSTEM_ACTOR_EMAIL }, select: { id: true } });
  if (existing) {
    cachedId = existing.id;
    return cachedId;
  }

  try {
    const created = await prisma.user.create({
      data: {
        employeeNo: "SYS-CUSTOMER-PORTAL",
        fullName: "نظام حساب العميل (تلقائي)",
        email: SYSTEM_ACTOR_EMAIL,
        passwordHash: await hashPassword(randomUUID()),
        role: "EMPLOYEE",
        status: "INACTIVE",
      },
      select: { id: true },
    });
    cachedId = created.id;
    return cachedId;
  } catch (error) {
    // Two concurrent first-callers can both miss the findUnique above and
    // race to create it; the loser hits the unique email constraint and
    // simply re-reads what the winner just created.
    const fallback = await prisma.user.findUnique({ where: { email: SYSTEM_ACTOR_EMAIL }, select: { id: true } });
    if (!fallback) throw error;
    cachedId = fallback.id;
    return cachedId;
  }
}
