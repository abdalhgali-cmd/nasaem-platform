// CSRF defence for cookie-authenticated requests.
//
// Why this is needed: browser sessions use cookies, and in production those are
// SameSite=None (the Vercel-hosted site calls the Railway API cross-site), so
// the browser attaches them to requests initiated by ANY website. CORS does not
// help: a cross-site <form> POST is a "simple" request that is sent (and
// processed) without a preflight.
//
// Rule: a state-changing request (anything but GET/HEAD/OPTIONS) that carries an
// ambient session cookie must come from a trusted origin:
//   * the API's own origin (the back-office pages the API itself serves), or
//   * an origin listed in CORS_ORIGIN (the web app).
// It is judged by the browser-supplied `Origin` header (unforgeable by a web
// page) and, when that is absent, by `Sec-Fetch-Site`.
//
// Deliberately NOT affected:
//   * requests with no session cookie (anonymous public submissions — CORS and
//     rate limits govern those);
//   * requests carrying `Authorization: Bearer …` (the Expo app and API clients:
//     the credential is explicit, not ambient, so a third-party page cannot make
//     the browser attach it);
//   * non-browser clients that send neither Origin nor Fetch-Metadata.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SESSION_COOKIES = ["accessToken", "customerAccessToken", "trackingAccessToken"];

export function getAllowedOrigins(env = process.env) {
  return String(env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, "").toLowerCase())
    .filter(Boolean);
}

function hostOf(origin) {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

export function isTrustedOrigin(origin, req) {
  const normalized = String(origin).trim().replace(/\/+$/, "").toLowerCase();
  if (getAllowedOrigins().includes(normalized)) return true;
  const originHost = hostOf(normalized);
  const ownHost = String(req.get("host") ?? "").toLowerCase();
  return Boolean(originHost && ownHost && originHost === ownHost);
}

function reject(req, res, why) {
  console.warn(`[csrf] blocked ${req.method} ${req.path}: ${why}`);
  return res.status(403).json({ success: false, message: "Cross-site request blocked" });
}

export function csrfGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookies = req.cookies ?? {};
  if (!SESSION_COOKIES.some((name) => cookies[name])) return next();

  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && /^Bearer\s+\S+/i.test(authorization)) return next();

  const origin = req.get("origin");
  if (origin) {
    return isTrustedOrigin(origin, req) ? next() : reject(req, res, `untrusted origin ${origin}`);
  }

  const fetchSite = req.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return reject(req, res, `sec-fetch-site=${fetchSite}`);
  }

  return next();
}
