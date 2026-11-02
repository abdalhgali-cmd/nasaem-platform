// One staff back-office (owner decision 2026-11-01): the unified admin runs
// on the website (/admin). When ADMIN_APP_URL names that website, the old
// back-office pages this API host still serves (backend/public) redirect there,
// to the same path: the website's copy of each page forwards to the matching
// /admin page, including #/... routes (a browser keeps the fragment across a
// redirect). Unset (local, CI, until set on Railway): served as before.
export const LEGACY_ADMIN_PAGES = new Set([
  "/login.html",
  "/admin-dashboard.html",
  "/flight-bookings.html",
  "/flight-management.html",
  "/request.html",
]);

// Origin only, https (http only for a local website); anything else is
// ignored, so a typo can never send staff to an unexpected place.
export function parseAdminAppUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
  // The URL parser accepts a wildcard such as https://*.railway.app.
  if (!/^[a-z0-9.-]+$/i.test(url.hostname)) return null;
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return null;
  return url.origin;
}

export function legacyAdminRedirect(adminAppOrigin) {
  return (req, res, next) => {
    if (!adminAppOrigin || (req.method !== "GET" && req.method !== "HEAD") || !LEGACY_ADMIN_PAGES.has(req.path)) return next();
    return res.redirect(302, `${adminAppOrigin}${req.originalUrl}`);
  };
}
