// Image-quality hints a customer's device measured on a passport photo
// (mobile/www/js/passport-quality.js). Untrusted input: only known warning
// codes and bounded numbers are kept; anything else is dropped. Stored for
// staff as hints — never a reason to refuse a file — and never any text
// read from the passport.
export const QUALITY_WARNINGS = Object.freeze([
  "LOW_RESOLUTION",
  "TOO_DARK",
  "TOO_BRIGHT",
  "GLARE",
  "BLURRY",
  "CROPPED",
  "NOT_PASSPORT_PAGE",
  "PAGE_UNCERTAIN",
]);
const CHECKS = ["width", "height", "brightness", "glare", "sharpness", "aspect"];

export function sanitizeQualitySignal(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const warnings = Array.isArray(raw.warnings) ? [...new Set(raw.warnings.filter((code) => QUALITY_WARNINGS.includes(code)))] : [];
  const checks = {};
  for (const key of CHECKS) {
    const value = Number(raw.checks?.[key]);
    if (Number.isFinite(value) && Math.abs(value) < 1e6) checks[key] = Math.round(value * 1000) / 1000;
  }
  const capture = raw.capture === "CAMERA" || raw.capture === "UPLOAD" ? raw.capture : null;
  const acceptedWithWarnings = raw.acceptedWithWarnings === true && warnings.length > 0;
  if (!warnings.length && !Object.keys(checks).length && !capture) return null;
  return { source: "DEVICE", warnings, checks, capture, acceptedWithWarnings };
}
