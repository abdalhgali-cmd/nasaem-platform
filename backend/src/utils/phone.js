// Sudanese mobile numbers only, matching the "+249 9XX XXX XXX" format used
// across every request form on the marketing site — a 9-digit subscriber
// number starting with 9, however the customer happened to type it
// (+249..., 00249..., 0..., or bare). Returns one canonical "249XXXXXXXXX"
// key so the same customer's requests match regardless of which format they
// used when submitting each one, or null if the input isn't recognized.
export function normalizePhone(raw) {
  if (typeof raw !== "string") return null;

  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  const withoutIntlPrefix = digits.startsWith("00") ? digits.slice(2) : digits;

  let subscriber;
  if (withoutIntlPrefix.startsWith("249") && withoutIntlPrefix.length === 12) {
    subscriber = withoutIntlPrefix.slice(3);
  } else if (withoutIntlPrefix.startsWith("0") && withoutIntlPrefix.length === 10) {
    subscriber = withoutIntlPrefix.slice(1);
  } else if (withoutIntlPrefix.length === 9) {
    subscriber = withoutIntlPrefix;
  } else {
    return null;
  }

  if (!/^9\d{8}$/.test(subscriber)) return null;

  return `249${subscriber}`;
}
