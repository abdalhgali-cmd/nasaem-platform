// Maps a ContactRequest's free-text `service` string to one of the 5 staff
// departments — the exhaustive list of every web/src form that ever sets
// `service`: web/src/app/{flights,hotels,packages,ferry}/page.tsx (via
// service-request-form.tsx), umrah-request-form.tsx, visa-request-form.tsx,
// and contact-form.tsx's dropdown. Anything not in this table (e.g.
// "استفسار آخر", a blank/omitted service, or any string from a caller other
// than this codebase's own forms) maps to null — see
// ContactRequest.department's schema.prisma comment for why that's
// intentional, not a bug.
const SERVICE_TO_DEPARTMENT = {
  "طيران": "FLIGHTS",
  "حجز طيران": "FLIGHTS",
  "عمرة": "UMRAH",
  "باقة عمرة": "UMRAH",
  "تأشيرة": "VISAS",
  "فندق": "HOTELS_PACKAGES",
  "حجز فندق": "HOTELS_PACKAGES",
  "باقة سفر شاملة": "HOTELS_PACKAGES",
  "حجز العبارات": "FERRY",
};

export function deriveContactRequestDepartment(service) {
  return SERVICE_TO_DEPARTMENT[service?.trim()] ?? null;
}
