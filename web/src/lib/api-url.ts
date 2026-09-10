const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

const PRODUCTION_API_HOST = "nasaem-platform-production.up.railway.app";
const PRODUCTION_WEB_HOSTS = new Set([
  "nasaem-alharamain.com",
  "www.nasaem-alharamain.com",
  "nasaem-platform.vercel.app",
  "nasaem-platform-abdalhgali-cmds-projects.vercel.app",
]);

function pointsAtProductionApi(value: string, base = "http://localhost") {
  try {
    return new URL(value, base).hostname === PRODUCTION_API_HOST;
  } catch {
    return false;
  }
}

/**
 * Vercel Preview deployments must never read from or write to Production.
 *
 * Browser-side protection keeps branch/PR previews from sending requests to
 * the production Railway API. Server-side protection is stricter: when Vercel
 * reports a Preview environment and NEXT_PUBLIC_API_URL still points at the
 * production API, we fail the render/build loudly instead of allowing SSR to
 * become a read-only window onto Production data.
 *
 * Once a dedicated Staging backend exists, set NEXT_PUBLIC_API_URL for the
 * Vercel Preview environment to that Staging /api URL. Production keeps its
 * existing Railway URL.
 */
function resolveApiUrl() {
  if (typeof window === "undefined") {
    if (process.env.VERCEL_ENV === "preview" && pointsAtProductionApi(configuredApiUrl)) {
      throw new Error(
        "Unsafe Vercel Preview configuration: NEXT_PUBLIC_API_URL points at the Production API. Configure Preview to use the Staging API before rendering.",
      );
    }

    return configuredApiUrl;
  }

  if (
    pointsAtProductionApi(configuredApiUrl, window.location.origin) &&
    !PRODUCTION_WEB_HOSTS.has(window.location.hostname)
  ) {
    return "/api";
  }

  return configuredApiUrl;
}

export const API_URL = resolveApiUrl();
