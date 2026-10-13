// Cross-site request forgery protection for cookie-authenticated writes.
//
// Why it is needed: in production the session cookies are SameSite=None
// (the Vercel-hosted pages call this API cross-site, see auth.controller.js),
// so a browser attaches them to a POST that any other site triggers — e.g. an
// auto-submitting <form> (form-urlencoded or multipart), which needs no CORS
// preflight. CORS only stops the attacker from *reading* the response; the
// write itself would already have happened.
//
// Policy, applied to POST/PUT/PATCH/DELETE under /api:
// 1. Requests authenticated by an `Authorization: Bearer` header are not
//    cookie-authenticated (the mobile app). A cross-site page cannot attach
//    that header without a CORS preflight, which untrusted origins fail.
// 2. Requests that carry none of the session cookies have nothing to forge
//    (public forms, login) and pass; their own rate limits still apply.
// 3. Otherwise the request must prove it comes from a trusted page:
//    - Origin present: must be this server's own origin or one of the
//      configured trusted origins (CORS_ORIGIN plus CSRF_TRUSTED_ORIGINS).
//      The literal "null" origin (sandboxed iframes, file:, data:) is
//      rejected.
//    - Origin absent: Sec-Fetch-Site, when the browser sends it, must be
//      same-origin (or "none", a user-initiated navigation); same-site and
//      cross-site are rejected. Without it, a Referer must point at a
//      trusted origin. With no provenance header at all, the request must
//      carry X-Requested-With, a custom header no cross-site form or
//      simple request can set. Every back-office page sends it.
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SESSION_COOKIES = ["accessToken", "customerAccessToken", "trackingAccessToken"];

function parseOriginList(...values) {
  return new Set(
    values
      .filter(Boolean)
      .flatMap((value) => value.split(","))
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter(Boolean)
  );
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function createCsrfProtection({ trustedOrigins } = {}) {
  const configured = trustedOrigins || parseOriginList(process.env.CORS_ORIGIN, process.env.CSRF_TRUSTED_ORIGINS);

  function isTrusted(origin, req) {
    if (!origin || origin === "null") return false;
    const ownOrigin = `${req.protocol}://${req.get("host")}`;
    return origin === ownOrigin || configured.has(origin);
  }

  return function csrfProtection(req, res, next) {
    if (!UNSAFE_METHODS.has(req.method)) return next();
    if (req.headers.authorization?.startsWith("Bearer ")) return next();
    if (!SESSION_COOKIES.some((name) => req.cookies?.[name])) return next();

    const origin = req.get("origin");
    let allowed;
    if (origin !== undefined) {
      allowed = isTrusted(origin, req);
    } else {
      const fetchSite = req.get("sec-fetch-site");
      const referer = req.get("referer");
      if (fetchSite) {
        allowed = fetchSite === "same-origin" || fetchSite === "none";
      } else if (referer) {
        allowed = isTrusted(originOf(referer), req);
      } else {
        allowed = Boolean(req.get("x-requested-with"));
      }
    }

    if (allowed) return next();

    return res.status(403).json({
      success: false,
      message: "تم رفض الطلب لأنه لم يصدر من صفحة موثوقة. أعد تحميل الصفحة وحاول مرة أخرى.",
      code: "CSRF_REJECTED",
    });
  };
}
