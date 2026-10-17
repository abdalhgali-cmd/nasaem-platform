import { isUmrahServiceCategory } from "../requirements/umrah-guarantor.js";

// Umrah offers three package types: visa only, with flight services, or with
// sea (ferry) services. The type is stored like the package's other display
// facts, as a `KIND: <type>` entry in Service.features (set from the admin
// package screen), so no schema change is needed. It decides what the
// execution step says: issuing the visa, or issuing the tickets.
export const UMRAH_PACKAGE_KINDS = Object.freeze(["VISA_ONLY", "AIR", "SEA"]);

export function umrahPackageKind(features) {
  const entry = (Array.isArray(features) ? features : []).find((feature) => typeof feature === "string" && feature.startsWith("KIND:"));
  const kind = entry ? entry.slice("KIND:".length).trim().toUpperCase() : "";
  return UMRAH_PACKAGE_KINDS.includes(kind) ? kind : null;
}

export function umrahIncludesTickets(features) {
  const kind = umrahPackageKind(features);
  return kind === "AIR" || kind === "SEA";
}

const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{5,19}$/;

function cleanPhone(value) {
  const phone = typeof value === "string" ? value.trim() : "";
  return phone && PHONE_PATTERN.test(phone) ? phone : null;
}

// An Umrah request carries the guarantor's phone number (the guarantor whose
// residence permit is uploaded); a second contact person is optional. Any
// other service ignores these fields. Returns { contacts } to store in
// intakeData.umrahContacts, or { error } and nothing is created.
//
// The current website and app require the guarantor's phone before they
// submit. An app installed before that cannot send it, so a request without
// one is still accepted and flagged (guarantorPhoneMissing) for staff to ask
// the customer; a phone that is sent must be valid.
export function resolveUmrahContacts(serviceCategory, { guarantorPhone, extraContactName, extraContactPhone } = {}) {
  if (!isUmrahServiceCategory(serviceCategory)) return { contacts: null };

  const rawGuarantor = typeof guarantorPhone === "string" ? guarantorPhone.trim() : "";
  const guarantor = cleanPhone(rawGuarantor);
  if (rawGuarantor && !guarantor) return { error: "GUARANTOR_PHONE_INVALID" };

  const name = typeof extraContactName === "string" ? extraContactName.trim() : "";
  const rawExtraPhone = typeof extraContactPhone === "string" ? extraContactPhone.trim() : "";
  const extraPhone = cleanPhone(rawExtraPhone);
  if (rawExtraPhone && !extraPhone) return { error: "EXTRA_CONTACT_PHONE_INVALID" };
  if (name && !extraPhone) return { error: "EXTRA_CONTACT_PHONE_INVALID" };

  return {
    contacts: {
      ...(guarantor ? { guarantorPhone: guarantor } : { guarantorPhoneMissing: true }),
      ...(extraPhone ? { extraContact: { ...(name ? { name } : {}), phone: extraPhone } } : {}),
    },
  };
}
