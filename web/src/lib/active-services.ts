// Approved customer-facing scope (owner decision, PR #151): only Umrah and
// Egypt security approval are offered to customers on the website. Other
// services stay in the backend, the database and their own routes (nothing
// is deleted) but are not listed in navigation, catalogs or the sitemap.
// The customer app applies the same rule (mobile/www/js/service-view.js
// serviceDirectoryItems / HOME_BENTO_KEYS).
export const ACTIVE_SERVICE_ROUTES = ["/umrah", "/visas/egypt-security-approval"] as const;

export function isActiveServiceRoute(href: string) {
  return (ACTIVE_SERVICE_ROUTES as readonly string[]).includes(href);
}
