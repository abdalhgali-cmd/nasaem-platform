// Single source of truth for "where does clicking this service/visa type
// actually take the customer" — every component that renders a Service or
// VisaType link (homepage cards, the /visas catalog, admin previews, …)
// must resolve through resolveServiceHref() instead of re-deriving a
// destination locally. Adding, moving, or retiring a dedicated page is then
// a one-line change here, not a hunt across components.
//
// No schema change was needed for this: Service/VisaType already carry a
// stable, unique `code` (the natural key used everywhere else in this
// codebase — contact requests, requirements, pricing), so the map below
// keys directly off that instead of adding a new `landingPagePath` column.

export type RoutableItem = {
  code: string;
  category: string;
  /** Present on VisaType records, absent on Service records — the cheapest reliable way to tell the two shapes apart without a second parameter every caller has to remember to pass. */
  country?: string;
};

// A service/visa type appears here once it has a hand-built, dedicated
// experience beyond the generic catalog+wizard flow. Both the Service code
// and the VisaType code for the same real-world service are listed, since
// different call sites resolve one or the other for what is conceptually
// the same destination.
const DEDICATED_ROUTES: Record<string, string> = {
  "SVC-EGYPT-CLEARANCE": "/visas/egypt-security-approval",
  "VISA-EGYPT-CLEARANCE": "/visas/egypt-security-approval",
  "SVC-FAMILY-VISIT": "/visas/saudi-family-visit",
  "VISA-FAMILY-VISIT": "/visas/saudi-family-visit",
};

// Strips the "SVC-"/"VISA-" prefix and lowercases — shared by the resolver's
// generic-service fallback and the /services/[slug] page itself, so a slug
// only ever needs to be produced (or parsed back to a code) in one place.
export function slugifyServiceCode(code: string): string {
  return code.replace(/^(SVC|VISA)-/i, "").toLowerCase();
}

export function resolveServiceHref(item: RoutableItem): string {
  const dedicated = DEDICATED_ROUTES[item.code];
  if (dedicated) return dedicated;

  const category = item.category.toLowerCase();

  // VisaType categories (INTERNATIONAL/UMRAH/FAMILY_VISIT/OTHER) don't map
  // onto the Service-style buckets below — every VisaType without a
  // dedicated page keeps going to the existing wizard-anchored visa page,
  // exactly as before.
  if (typeof item.country === "string") {
    return `/visas?visaType=${encodeURIComponent(item.code)}&visaCategory=${encodeURIComponent(item.category)}#book`;
  }

  if (category.includes("ferry")) return "/ferries";
  if (category.includes("flight")) return "/flights";
  if (category.includes("hotel")) return "/hotels";
  if (category.includes("package") || category === "umrah") {
    return `/umrah?package=${encodeURIComponent(item.code)}#book`;
  }
  if (
    category.includes("visa") ||
    category.includes("visit") ||
    category.includes("tasheel") ||
    category.includes("clearance")
  ) {
    return `/visas?visaType=${encodeURIComponent(item.code)}#book`;
  }

  // No recognized category bucket and no dedicated page — the generic
  // dynamic service page, rather than the previous dead-end "/contact"
  // link every unrecognized service used to fall back to.
  return `/services/${slugifyServiceCode(item.code)}`;
}
