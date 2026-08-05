import { API_URL } from "./api-url";

// Must match backend/src/modules/site-assets/site-assets.constants.js.
export type SiteAssetKey =
  | "logo"
  | "logo-dark"
  | "icon-umrah"
  | "icon-visa"
  | "icon-flight"
  | "icon-hotel"
  | "icon-international"
  | "icon-packages";

type SiteAssetRecord = { key: SiteAssetKey; updatedAt: string };

// Server-side only (uses fetch's Next.js `next.revalidate` option). Staff
// upload a replacement in the back-office dashboard and it appears here
// within a minute — no rebuild/redeploy of this site needed. Never throws:
// if the backend is unreachable, callers just get an empty map and fall
// back to the bundled default images, so the public site keeps working.
export async function getSiteAssetUrls(): Promise<Partial<Record<SiteAssetKey, string>>> {
  try {
    const res = await fetch(`${API_URL}/site-assets`, {
      next: { revalidate: 60 },
    });

    if (!res.ok) return {};

    const { data } = (await res.json()) as { data: SiteAssetRecord[] };
    const urls: Partial<Record<SiteAssetKey, string>> = {};

    for (const asset of data) {
      const version = new Date(asset.updatedAt).getTime();
      urls[asset.key] = `${API_URL}/site-assets/${asset.key}/file?v=${version}`;
    }

    return urls;
  } catch {
    return {};
  }
}
