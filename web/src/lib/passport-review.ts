// Issue #103 — client-side checks on the travelers a customer is about to
// submit. Advisory where the decision belongs to staff (passport validity),
// blocking only where the data is certainly wrong (the same passport twice
// in one request).

// Same fallback as the backend's case-intelligence DEFAULT_PASSPORT_VALIDITY_MONTHS:
// no service configures its own rule yet, so this is a warning, never a block.
export const PASSPORT_VALIDITY_MONTHS = 6;

export function normalizePassportNo(value: string | undefined | null) {
  return String(value || "").toUpperCase().replace(/\s+/g, "");
}

// Indexes of travelers whose passport number also appears on another traveler.
export function duplicatePassportIndexes(travelers: Array<{ passportNo?: string | null }>) {
  const seen = new Map<string, number[]>();
  travelers.forEach((traveler, index) => {
    const key = normalizePassportNo(traveler.passportNo);
    if (key) seen.set(key, [...(seen.get(key) || []), index]);
  });
  return new Set([...seen.values()].filter((group) => group.length > 1).flat());
}

function parseIsoDate(value: string | undefined | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Warns when the passport expires before, or within the validity window
// after, the expected travel date (today when no date was given).
export function passportValidityWarning(
  expiry: string | undefined | null,
  travelDate?: string | null,
  { now = new Date(), months = PASSPORT_VALIDITY_MONTHS }: { now?: Date; months?: number } = {}
) {
  const expiresAt = parseIsoDate(expiry);
  if (!expiresAt) return null;
  const from = parseIsoDate(travelDate) ?? now;
  if (expiresAt < now) return "الجواز منتهي الصلاحية — سيراجع فريقنا الطلب، وقد تحتاج إلى تجديده.";
  const threshold = new Date(from);
  threshold.setUTCMonth(threshold.getUTCMonth() + months);
  if (expiresAt < threshold) {
    return `صلاحية الجواز أقل من ${months} أشهر بعد موعد السفر — قد تطلب جهة الإصدار جوازًا أطول صلاحية.`;
  }
  return null;
}

export function mrzSexToGender(sex: string | undefined | null): "MALE" | "FEMALE" | undefined {
  if (sex === "male") return "MALE";
  if (sex === "female") return "FEMALE";
  return undefined;
}
