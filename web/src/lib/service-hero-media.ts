export type ServiceHeroMedia = {
  heroImageKey?: string | null;
  heroImageMobileKey?: string | null;
  motionEnabled?: boolean;
  motionVideoKey?: string | null;
  /** Bumped by Prisma on every field change (including these media keys) — used as the cache-busting ?v= for the URLs below. */
  updatedAt?: string | Date | null;
};

export type ResolvedHeroMedia = {
  heroImageUrl: string | null;
  heroImageMobileUrl: string | null;
  motionEnabled: boolean;
  motionVideoUrl: string | null;
};

// Turns a Service's admin-managed SiteAsset-key columns into resolved,
// cache-busted URLs — shared by every dedicated service hero (Egypt
// Security Approval, Saudi Family Visit, the generic /services/[slug]
// template, ...) so each page doesn't reimplement the same null-fallback
// logic. Builds the URL directly from the key + this same Service record's
// own updatedAt, deliberately NOT via a second fetch of the /site-assets
// list (getSiteAssetUrls): that endpoint has its own independent 60s fetch
// cache, and racing two separately-expiring caches meant a freshly
// uploaded hero image could sit invisible for up to another cache window
// after the catalog itself had already caught up.
export function resolveServiceHeroMedia(
  service: ServiceHeroMedia | null | undefined,
  apiUrl: string
): ResolvedHeroMedia {
  const version = service?.updatedAt ? new Date(service.updatedAt).getTime() : 0;
  const buildUrl = (key: string | null | undefined): string | null =>
    key ? `${apiUrl}/site-assets/${key}/file?v=${version}` : null;

  const heroImageUrl = buildUrl(service?.heroImageKey);
  const heroImageMobileUrl = service?.heroImageMobileKey ? buildUrl(service.heroImageMobileKey) : heroImageUrl;
  const motionVideoUrl = buildUrl(service?.motionVideoKey);

  return {
    heroImageUrl,
    heroImageMobileUrl,
    motionEnabled: Boolean(service?.motionEnabled),
    motionVideoUrl,
  };
}
