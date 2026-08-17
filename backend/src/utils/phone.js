// Normalizes a freely-typed phone number into digits-only, international
// (country-code-prefixed) form so the same real number matches regardless
// of how it was typed (+249 91..., 249 91..., 0091..., 091... all collapse
// to the same string). Used to match a /track login attempt's phone against
// the phone a ContactRequest was originally submitted with.
//
// Assumes Sudan (+249) for local-format numbers (leading 0), matching the
// business's own numbers (see site-config.ts / WHATSAPP_ADMIN_NUMBER) —
// this platform currently only serves Sudan-based customers.
export function normalizePhone(rawPhone) {
  const digitsOnly = String(rawPhone ?? "").replace(/\D/g, "");

  if (digitsOnly.startsWith("00")) {
    return digitsOnly.slice(2);
  }

  if (digitsOnly.startsWith("0")) {
    return `249${digitsOnly.slice(1)}`;
  }

  return digitsOnly;
}
