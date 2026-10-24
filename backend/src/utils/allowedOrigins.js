// One reading of CORS_ORIGIN (and CSRF_TRUSTED_ORIGINS) for both the CORS
// response headers and the CSRF provenance check, so the two can never
// disagree about which website may call this API.
//
// Why: the `cors` package compares each entry to the browser's Origin header
// byte for byte. An entry copied from a dashboard as
// "https://site.up.railway.app/" (trailing slash) never matches the Origin
// "https://site.up.railway.app": the preflight still answers 204, but without
// Access-Control-Allow-Origin, so the browser silently drops the real
// POST/PATCH. The CSRF check already stripped the slash, so it trusted an
// origin that CORS refused. Seen on staging: /api/intake-drafts logged only
// 204 preflights and no draft was ever created.
//
// Each entry must be an exact origin (scheme://host[:port]). The URL parser
// normalizes it (lower-case host, default port dropped, trailing "/" removed).
// Anything else — a path, query, credentials, a wildcard, a non-http scheme
// or the literal "null" — is reported and dropped, never widened.
export function parseAllowedOrigins(...values) {
  const origins = new Set();
  const rejected = [];
  for (const entry of values.filter(Boolean).flatMap((value) => String(value).split(","))) {
    const raw = entry.trim();
    if (!raw) continue;
    // Accepted only when the text already IS its origin (letter case and one
    // trailing "/" aside), so the URL parser can never reinterpret it into a
    // different host: "https:evil.example", "https://site/admin/..",
    // "https://site\.evil", "https://%65vil.example", "https://127.1" and
    // fullwidth letters are all refused. Only printable ASCII: IDN hosts
    // are written in punycode, as browsers send them in Origin. A default
    // port (":443") or a long IPv6 form is refused too (reported at startup):
    // write the origin exactly as the browser sends it.
    const literal = raw.replace(/\/$/, "");
    let origin = null;
    try {
      origin = new URL(literal).origin;
    } catch {
      origin = null;
    }
    if (!origin || !/^https?:\/\//i.test(literal) || literal.includes("*") || /[^\x21-\x7e]/.test(literal) || origin.toLowerCase() !== literal.toLowerCase()) {
      rejected.push(raw);
      continue;
    }
    origins.add(origin);
  }
  return { origins, rejected };
}

// `cors` options for the configured origins: exact matches only, credentials
// allowed. An empty configuration denies every cross-origin request (same-
// origin pages send no Origin and are unaffected), as before.
export function corsOptionsFor(value) {
  const { origins } = parseAllowedOrigins(value);
  return { origin: origins.size ? [...origins] : false, credentials: true };
}
