// Which services accept NEW customer applications (owner decision, PR #151:
// customers are offered only Umrah and Egypt security approval).
//
// Enforced on the server for every public way to start an application:
// POST /contact-requests, POST /intake-drafts/:token/submit,
// POST /customer/orders and POST /flight-bookings. Nothing else changes:
// existing requests (tracking, documents, payment, delivery), staff-created
// requests, general inquiries without a service (the contact form), Egypt's
// optional linked flight inquiry (created by the server) and every service's
// data and back-office screens stay as they are.
//
// PUBLIC_INTAKE_SCOPE (env): comma-separated service kinds
// (request-progress.js deriveServiceKind), or "ALL" for no restriction.
// Unset → the approved scope below. Read on every call, so a change to the
// environment needs no code change.
import prisma from "../../config/database.js";
import { deriveServiceKind } from "../contact-request-progress/request-progress.js";

export const APPROVED_INTAKE_SCOPE = Object.freeze(["UMRAH", "EGYPT_CLEARANCE"]);

export const SERVICE_NOT_OFFERED_MESSAGE =
  "هذه الخدمة غير متاحة للطلب حاليًا. نستقبل حاليًا طلبات العمرة والموافقة الأمنية لمصر فقط.";

/** The kinds open to new applications, or null when every service is open. */
export function intakeScope(env = process.env) {
  const raw = String(env.PUBLIC_INTAKE_SCOPE || "").trim();
  if (!raw) return [...APPROVED_INTAKE_SCOPE];
  if (raw.toUpperCase() === "ALL") return null;
  return raw.split(",").map((kind) => kind.trim().toUpperCase()).filter(Boolean);
}

export function kindOpenForIntake(kind, env = process.env) {
  const scope = intakeScope(env);
  return !scope || scope.includes(String(kind || "").toUpperCase());
}

/**
 * null when a new application for this service / visa type may be created;
 * otherwise { error: "SERVICE_NOT_OFFERED", details: { kind } }. A request that
 * names neither is a general inquiry and is always allowed.
 */
export async function newApplicationRefusal({ serviceId = null, visaTypeId = null } = {}, { db = prisma, env = process.env } = {}) {
  if (!serviceId && !visaTypeId) return null;
  if (!intakeScope(env)) return null;
  const [visaType, serviceRef] = await Promise.all([
    visaTypeId ? db.visaType.findUnique({ where: { id: visaTypeId }, select: { code: true, category: true } }) : null,
    serviceId ? db.service.findUnique({ where: { id: serviceId }, select: { code: true, category: true } }) : null,
  ]);
  // Unknown ids are left to the existing validation (not found / unavailable).
  if (!visaType && !serviceRef) return null;
  const kind = deriveServiceKind({ visaType, serviceRef });
  return kindOpenForIntake(kind, env) ? null : { error: "SERVICE_NOT_OFFERED", details: { kind } };
}
