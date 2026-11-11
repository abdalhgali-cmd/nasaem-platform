// Published service routes after the owner expanded the scope on 2026-11-10.
// Catalog activity still determines which cards are shown.
// Hotels stay postponed (owner decision 2026-11-11): the /hotels page is kept
// but is not a customer entry point, so it is not listed here.
export const ACTIVE_SERVICE_ROUTES = ["/umrah", "/visas/egypt-security-approval", "/flights", "/ferries", "/visas", "/visas/saudi-family-visit"] as const;

export function isActiveServiceRoute(href: string) {
  const path = href.split(/[?#]/, 1)[0];
  return (ACTIVE_SERVICE_ROUTES as readonly string[]).includes(path) || /^\/services\/[a-z0-9-]+$/.test(path);
}
