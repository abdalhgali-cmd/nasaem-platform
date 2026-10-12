// The Egypt security approval ("موافقة حربي") is sold as variants, one per
// entry method, each its own VisaType so the agency prices it in the
// back-office like any other item (pricingMode, basePrice, currency):
//   VISA-EGYPT-CLEARANCE-AIR     دخول بالطيران
//   VISA-EGYPT-CLEARANCE-BORDER  دخول عبر المعبر
// The original VISA-EGYPT-CLEARANCE (entry method chosen as an answer) stays
// valid for existing requests and for catalogs without variants.
// The variant fixes the entry method: the server records it and refuses a
// submission that claims the other one.
export const EGYPT_CLEARANCE_CODE = "VISA-EGYPT-CLEARANCE";
export const EGYPT_ENTRY_MODES = Object.freeze(["AIR", "BORDER"]);
export const EGYPT_ENTRY_MODE_ATTACHMENT = "egypt_entry_mode";

const VARIANT_MODES = Object.freeze({
  [`${EGYPT_CLEARANCE_CODE}-AIR`]: "AIR",
  [`${EGYPT_CLEARANCE_CODE}-BORDER`]: "BORDER",
});

export const EGYPT_CLEARANCE_VARIANTS = Object.freeze([
  { code: `${EGYPT_CLEARANCE_CODE}-AIR`, entryMode: "AIR", name: "موافقة حربي — دخول بالطيران" },
  { code: `${EGYPT_CLEARANCE_CODE}-BORDER`, entryMode: "BORDER", name: "موافقة حربي — دخول عبر المعبر" },
]);

export function isEgyptClearanceCode(code) {
  const normalized = String(code || "").toUpperCase();
  return normalized === EGYPT_CLEARANCE_CODE || Object.prototype.hasOwnProperty.call(VARIANT_MODES, normalized);
}

// The entry method a variant stands for; null for the original item.
export function variantEntryMode(code) {
  return VARIANT_MODES[String(code || "").toUpperCase()] || null;
}

// Resolves the entry method of an Egypt submission. The variant decides; an
// answer to the entry-method question must agree with it. For the original
// item the answer is the entry method and must be one of the known values.
// Returns { entryMode } | { error: "ENTRY_MODE_MISMATCH" | "ENTRY_MODE_INVALID", details }.
export function resolveEgyptEntryMode(code, answer) {
  const fixed = variantEntryMode(code);
  const given = answer === undefined || answer === null || answer === "" ? null : String(answer);
  if (fixed) {
    if (given && given !== fixed) return { error: "ENTRY_MODE_MISMATCH", details: { entryMode: fixed } };
    return { entryMode: fixed };
  }
  if (given && !EGYPT_ENTRY_MODES.includes(given)) return { error: "ENTRY_MODE_INVALID", details: { allowed: EGYPT_ENTRY_MODES } };
  return { entryMode: given };
}

// Applies the entry method to a submission's answers: given the visa type
// code and the requirement checklist it was submitted against, returns the
// answers with the entry-method question set to the resolved value (the
// variant's own), or the refusal.
export function applyEgyptEntryMode(code, checklist, answers) {
  if (!isEgyptClearanceCode(code)) return { answers };
  const question = (checklist || []).find((item) => item.attachmentType === EGYPT_ENTRY_MODE_ATTACHMENT);
  const resolved = resolveEgyptEntryMode(code, question ? answers?.[question.id] : undefined);
  if (resolved.error) return resolved;
  if (!question || !resolved.entryMode) return { answers, entryMode: resolved.entryMode };
  return { answers: { ...(answers || {}), [question.id]: resolved.entryMode }, entryMode: resolved.entryMode };
}

// A variant is booked only at its fixed price: it must be active and priced
// FIXED (positive price) by the agency, and the submission must carry the
// total the customer confirmed. There is no quote fallback and no silent
// switch to the original item. (The total itself is checked by
// contact-request-pricing/fixed-price.js.)
export function egyptVariantBookingError(visaType, { acceptedTotal } = {}) {
  if (!variantEntryMode(visaType?.code)) return null;
  const priced = visaType.pricingMode === "FIXED" && Number(visaType.basePrice) > 0 && Boolean(visaType.currency);
  if (!visaType.active || !priced) return { error: "EGYPT_VARIANT_UNAVAILABLE", details: { code: visaType.code } };
  if (acceptedTotal === undefined || acceptedTotal === null || acceptedTotal === "") return { error: "FIXED_TOTAL_REQUIRED", details: { code: visaType.code } };
  return null;
}
