/** @param {Record<string, string | undefined>} env */
export function apiProxyTarget(env) {
  if (env.NEXT_PUBLIC_API_URL !== "/api") return null;
  let target;
  try { target = new URL(env.INTERNAL_API_URL || ""); }
  catch { throw new Error("Same-origin API requires an absolute INTERNAL_API_URL ending in /api."); }
  if (!["https:", "http:"].includes(target.protocol) || target.username || target.password ||
      target.search || target.hash || target.pathname.replace(/\/$/, "") !== "/api") {
    throw new Error("INTERNAL_API_URL must be an http(s) API URL without credentials, query or fragment.");
  }
  if (env.VERCEL_ENV === "preview" && target.hostname === "nasaem-platform-production.up.railway.app") {
    throw new Error("Unsafe Preview API proxy: production backend is forbidden.");
  }
  return `${target.origin}/api`;
}
