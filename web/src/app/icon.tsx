import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSiteAssetUrls } from "@/lib/site-assets";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";
export const revalidate = 60;

// Admin-uploaded favicon (Theme settings, Platform 3.0 Phase 2) replaces
// the bundled default once set — same never-throws/fallback posture as
// logo.tsx and the other SiteAsset-backed images.
export default async function Icon() {
  const assetUrls = await getSiteAssetUrls();
  const faviconUrl = assetUrls.favicon;

  if (faviconUrl) {
    try {
      const res = await fetch(faviconUrl, { next: { revalidate: 60 } });
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        return new Response(buffer, { headers: { "Content-Type": res.headers.get("content-type") || "image/png" } });
      }
    } catch {
      // fall through to the bundled default below
    }
  }

  const defaultIcon = await readFile(path.join(process.cwd(), "public", "default-favicon.png"));
  return new Response(new Uint8Array(defaultIcon), { headers: { "Content-Type": "image/png" } });
}
