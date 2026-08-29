const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

const PRODUCTION_API_HOST = "nasaem-platform-production.up.railway.app";
const PRODUCTION_WEB_HOSTS = new Set([
  "nasaem-alharamain.com",
  "www.nasaem-alharamain.com",
  "nasaem-platform.vercel.app",
  "nasaem-platform-abdalhgali-cmds-projects.vercel.app",
]);

/**
 * Vercel Preview deployments inherit project environment variables unless
 * explicitly overridden. If NEXT_PUBLIC_API_URL points at the production
 * Railway API, a branch preview must never be allowed to write into the
 * production database while somebody is performing QA.
 *
 * On an approved production hostname we keep the configured URL unchanged.
 * On any other browser hostname (PR previews, branch aliases, localhost with a
 * production URL accidentally injected) we fail closed to same-origin /api.
 * Vercel has no backend mounted there, so writes fail safely instead of
 * reaching Production. Server-side rendering keeps the configured URL so
 * public read-only catalogue data can still render; user-triggered mutations
 * happen in the browser and are protected by this guard.
 */
function resolveApiUrl() {
  if (typeof window === "undefined") return configuredApiUrl;

  try {
    const configuredHost = new URL(configuredApiUrl, window.location.origin).hostname;
    if (configuredHost === PRODUCTION_API_HOST && !PRODUCTION_WEB_HOSTS.has(window.location.hostname)) {
      return "/api";
    }
  } catch {
    // Preserve the configured value when it is a relative URL or otherwise
    // intentionally non-standard. The browser/fetch layer will surface any
    // actual configuration error.
  }

  return configuredApiUrl;
}

export const API_URL = resolveApiUrl();
