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

// What the package promised when the request was submitted, frozen into
// intakeData.umrahPackage so that later catalog edits (KIND, features) never
// change what an existing request owes the customer. Returns null for
// anything that is not an Umrah package.
export const UMRAH_PACKAGE_SNAPSHOT_SOURCE = "SNAPSHOT";
export const UMRAH_PACKAGE_LEGACY_SOURCE = "LEGACY_CATALOG";

export function buildUmrahPackageSnapshot(serviceCategory, serviceId, features, now = new Date()) {
  if (!isUmrahServiceCategory(serviceCategory)) return null;
  return {
    kind: umrahPackageKind(features),
    includesServices: umrahIncludesTickets(features),
    serviceId: serviceId || null,
    source: UMRAH_PACKAGE_SNAPSHOT_SOURCE,
    capturedAt: now.toISOString(),
  };
}

function validSnapshot(value) {
  return Boolean(
    value && typeof value === "object" && value.source === UMRAH_PACKAGE_SNAPSHOT_SOURCE &&
    typeof value.includesServices === "boolean" &&
    (value.kind === null || UMRAH_PACKAGE_KINDS.includes(value.kind)) &&
    value.includesServices === (value.kind === "AIR" || value.kind === "SEA")
  );
}

// The obligations of an Umrah request. A request submitted after the
// snapshot existed uses it (source SNAPSHOT). An older request has no record
// of what was promised: it falls back to the live catalog and says so
// (source LEGACY_CATALOG) so staff can review it; that value is not
// historical fact and is never written back.
export function umrahObligations(request) {
  const snapshot = request?.intakeData?.umrahPackage;
  if (validSnapshot(snapshot)) {
    return { kind: snapshot.kind, includesServices: snapshot.includesServices, source: UMRAH_PACKAGE_SNAPSHOT_SOURCE, capturedAt: snapshot.capturedAt || null };
  }
  const features = request?.serviceRef?.features;
  return { kind: umrahPackageKind(features), includesServices: umrahIncludesTickets(features), source: UMRAH_PACKAGE_LEGACY_SOURCE, capturedAt: null };
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
// Mandatory for every new submission, including older installed clients.
export function resolveUmrahContacts(serviceCategory, { guarantorPhone, extraContactName, extraContactPhone } = {}) {
  if (!isUmrahServiceCategory(serviceCategory)) return { contacts: null };

  const rawGuarantor = typeof guarantorPhone === "string" ? guarantorPhone.trim() : "";
  if (!rawGuarantor) return { error: "GUARANTOR_PHONE_REQUIRED" };
  const guarantor = cleanPhone(rawGuarantor);
  if (rawGuarantor && !guarantor) return { error: "GUARANTOR_PHONE_INVALID" };

  const name = typeof extraContactName === "string" ? extraContactName.trim() : "";
  const rawExtraPhone = typeof extraContactPhone === "string" ? extraContactPhone.trim() : "";
  const extraPhone = cleanPhone(rawExtraPhone);
  if (rawExtraPhone && !extraPhone) return { error: "EXTRA_CONTACT_PHONE_INVALID" };
  if (name && !extraPhone) return { error: "EXTRA_CONTACT_PHONE_INVALID" };

  return {
    contacts: {
      guarantorPhone: guarantor,
      ...(extraPhone ? { extraContact: { ...(name ? { name } : {}), phone: extraPhone } } : {}),
    },
  };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
// Furthest preferred date accepted (about two seasons ahead).
const MAX_DAYS_AHEAD = 730;

// The customer's preferred travel date on an Umrah request: a provisional
// wish, not a booking (staff confirm the actual date). Required for the
// packages with flight or sea services, optional for visa only.
//
// The current website and app always send the field (empty when not filled),
// so an empty value on a package that needs it is refused. An app installed
// before this cannot send it at all: that request is still accepted and
// flagged (preferredDateMissing) for staff to ask, like the guarantor phone.
// Returns { travel } to store in intakeData.umrahTravel, or { error }.
export function resolveUmrahTravel(serviceCategory, features, preferredTravelDate, now = new Date()) {
  if (!isUmrahServiceCategory(serviceCategory)) return { travel: null };
  const required = umrahIncludesTickets(features);
  if (preferredTravelDate === undefined || preferredTravelDate === null) {
    return { travel: required ? { preferredDateMissing: true } : null };
  }
  const raw = String(preferredTravelDate).trim();
  if (!raw) return required ? { error: "TRAVEL_DATE_REQUIRED" } : { travel: null };
  if (!DATE_PATTERN.test(raw)) return { error: "TRAVEL_DATE_INVALID" };
  const day = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== raw) return { error: "TRAVEL_DATE_INVALID" };
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  // One day of slack: a customer west of UTC may still be on "yesterday".
  if (day.getTime() < today - DAY_MS) return { error: "TRAVEL_DATE_PASSED" };
  if (day.getTime() > today + MAX_DAYS_AHEAD * DAY_MS) return { error: "TRAVEL_DATE_INVALID" };
  return { travel: { preferredDate: raw, provisional: true } };
}
