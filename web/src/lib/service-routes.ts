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
//
// Design rule (see the routing spec): a service/visa type either has its
// own dedicated experience, or gets its own /services/[slug] page — never
// a shared, general "browse everything" catalog it has to be searched for
// on. The one exception is a catalog that *is itself* that service's
// deliberate, hand-built experience — e.g. /umrah?package=CODE#book is
// Umrah's own page showing Umrah's own package options, not a generic
// listing of unrelated services — so that one case stays a category route
// rather than being pulled out to /services/[slug].

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
  // Umrah's VisaType record — SVC-UMRAH (the Service record) already
  // routes to /umrah via the category bucket below; this covers the same
  // real-world service when a VisaType-shaped item (e.g. a /visas catalog
  // card) is what's being resolved.
  "VISA-UMRAH": "/umrah",
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

  // Physical/product services with their own established dedicated pages —
  // applies to both shapes (a Service record for these categories, or a
  // VisaType that happens to share one, though none currently do).
  if (category.includes("ferry")) return "/ferries";
  if (category.includes("flight")) return "/flights";
  if (category.includes("hotel")) return "/hotels";
  if (category.includes("package") || category === "umrah") {
    return `/umrah?package=${encodeURIComponent(item.code)}#book`;
  }

  // Everything else — International Visa, Work Visa, Tasheel, and any
  // future service/visa type without a dedicated experience — gets its own
  // page instead of being dropped into the shared /visas or /contact
  // catalog. Works for both Service and VisaType shapes: the generic
  // template (/services/[slug]/page.tsx) resolves either kind from the
  // same public catalog.
  return `/services/${slugifyServiceCode(item.code)}`;
}
