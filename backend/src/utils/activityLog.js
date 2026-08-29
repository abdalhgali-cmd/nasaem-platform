import { Prisma } from "@prisma/client";
import prisma from "../config/database.js";

// Platform 3.0 Phase 16 — matched case-insensitively against object keys
// anywhere in oldValue/newValue (recursively). Covers the plan's explicit
// "never log passwords, tokens, payment secrets or passport image bytes"
// requirement structurally, not just by caller discipline: even if a
// caller ever passed a full user/payment/document record by mistake, the
// sensitive fields never reach the database.
const REDACTED_KEY_PATTERN =
  /password|passwordHash|token|secret|apiKey|accountNumber|iban|cardNumber|cvv|(passport|image|file).*(data|bytes|base64|buffer)|^data$|^base64$/i;

const REDACTED = "[REDACTED]";

export function redactSensitive(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, seen));
  }

  if (typeof value === "object") {
    if (value instanceof Date) return value;
    // Prisma money/quantity fields (e.g. VisaType.basePrice) come back as
    // Decimal.js instances, not plain numbers. Walking one as a generic
    // object (the fallback below) serializes its internal representation
    // (constructor/s/e/d) instead of the value, which Prisma's Json
    // column then rejects outright — found via a real CI failure where
    // VISA_TYPE_CREATED's activity log silently failed to write. Stored
    // as a string, not a number, to preserve exact decimal precision for
    // this money-adjacent field the same way the database itself does.
    if (value instanceof Prisma.Decimal) return value.toString();
    if (seen.has(value)) return undefined; // guard against circular refs
    seen.add(value);

    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = REDACTED_KEY_PATTERN.test(key) ? REDACTED : redactSensitive(val, seen);
    }
    return result;
  }

  return value;
}

// Resolves which organization an activity log entry belongs to, without
// requiring every one of this function's ~50 call sites to be touched
// individually. Tried in order:
//   1. an explicit `organizationId` the caller already had in hand;
//   2. the authenticated actor on the request (staff `req.user` or
//      customer `req.customer`/`req.organizationId`, set by the auth
//      middlewares);
//   3. a DB lookup of `userId`'s own organization — covers call sites that
//      pass `userId` but not `req` (e.g. LOGIN, where req.user isn't set
//      yet on the request that just authenticated it);
//   4. for the customer-tracking-portal actions that carry neither req nor
//      userId (phone-based auth, not a logged-in session), the target
//      ContactRequest's own organization.
// Returning null lets the caller omit the column and fall back to the
// schema's own DEFAULT — an accepted, disclosed degradation for the rare
// action with no discernible actor or entity, not a way to skip scoping.
async function resolveOrganizationId({ organizationId, userId, entity, entityId, req }) {
  if (organizationId) return organizationId;

  const fromRequest = req?.user?.organizationId || req?.customer?.organizationId || req?.organizationId;
  if (fromRequest) return fromRequest;

  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
    if (user?.organizationId) return user.organizationId;
  }

  if (entity === "ContactRequest" && entityId) {
    const contactRequest = await prisma.contactRequest.findUnique({ where: { id: entityId }, select: { organizationId: true } });
    if (contactRequest?.organizationId) return contactRequest.organizationId;
  }

  return null;
}

// Best-effort: a logging failure must never break the business operation
// that triggered it, so errors are swallowed (after being logged to stderr)
// rather than propagated.
//
// oldValue/newValue (Phase 16) are optional plain objects — the entity's
// state before/after this action, for sensitive configuration changes
// where recording it is safe. Both are run through redactSensitive()
// before being stored; pass only the fields relevant to the change, not
// an entire unrelated record, to keep the log readable and minimize what
// even reaches the redaction step.
export async function logActivity({ userId, action, entity, entityId, req, oldValue, newValue, organizationId }) {
  try {
    const resolvedOrganizationId = await resolveOrganizationId({ organizationId, userId, entity, entityId, req });

    await prisma.activityLog.create({
      data: {
        userId: userId || null,
        action,
        entity,
        entityId: entityId || null,
        ipAddress: req?.ip || null,
        userAgent: req?.headers?.["user-agent"] || null,
        oldValue: oldValue === undefined ? undefined : redactSensitive(oldValue),
        newValue: newValue === undefined ? undefined : redactSensitive(newValue),
        ...(resolvedOrganizationId ? { organizationId: resolvedOrganizationId } : {}),
      },
    });
  } catch (error) {
    console.error("Failed to write activity log:", error);
  }
}
