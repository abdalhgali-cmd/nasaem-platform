import { API_URL } from "./api-url";

// Must match backend/src/modules/site-assets/site-assets.constants.js's
// fixed slots. Dynamic keys also exist outside this list (homepage section
// images — "homepage-section-<id>", see homepage.ts) — getSiteAssetUrls
// resolves every key the backend returns, not just these, so its return
// type is intentionally a plain string-keyed record rather than restricted
// to this union.
export type SiteAssetKey =
  | "logo"
  | "logo-dark"
  | "icon-umrah"
  | "icon-visa"
  | "icon-flight"
  | "icon-hotel"
  | "icon-international"
  | "icon-packages"
  | "favicon"
  | "hero-image";

type SiteAssetRecord = { key: string; updatedAt: string };

// Server-side only (uses fetch's Next.js `next.revalidate` option). Staff
// upload a replacement in the back-office dashboard and it appears here
// within a minute — no rebuild/redeploy of this site needed. Never throws:
// if the backend is unreachable, callers just get an empty map and fall
// back to the bundled default images, so the public site keeps working.
export async function getSiteAssetUrls(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_URL}/site-assets`, {
      next: { revalidate: 60 },
    });

    if (!res.ok) return {};

    const { data } = (await res.json()) as { data: SiteAssetRecord[] };
    const urls: Record<string, string> = {};

    for (const asset of data) {
      const version = new Date(asset.updatedAt).getTime();
      urls[asset.key] = `${API_URL}/site-assets/${asset.key}/file?v=${version}`;
    }

    return urls;
  } catch {
    return {};
  }
}
