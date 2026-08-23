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
export async function logActivity({ userId, action, entity, entityId, req, oldValue, newValue }) {
  try {
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
      },
    });
  } catch (error) {
    console.error("Failed to write activity log:", error);
  }
}
