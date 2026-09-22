// Shared price-display contract for every customer-facing catalog card.
//
// The backend seeds every not-yet-priced Service/VisaType with
// basePrice: 0 as a placeholder (see backend/prisma/seed.js) rather than
// leaving it null — so a raw `basePrice != null` check treats that
// placeholder as a real "0 SAR" price. Every card must go through
// hasPublishedPrice()/formatPrice() instead of comparing basePrice to
// null directly, matching the same >0 guard web/src/app/services/[slug]/
// page.tsx already uses.
export function hasPublishedPrice(basePrice?: number | string | null): boolean {
  const numeric = Number(basePrice);
  return Number.isFinite(numeric) && numeric > 0;
}

export function formatPrice(
  basePrice: number | string | null | undefined,
  currency: string | null | undefined,
  fallback = "السعر بعد المراجعة"
): string {
  return hasPublishedPrice(basePrice) ? `${basePrice} ${currency ?? ""}`.trim() : fallback;
}

export function formatSdgEquivalent(priceSdg?: number | null): string | null {
  return priceSdg != null ? `≈ ${Math.round(priceSdg).toLocaleString()} SDG` : null;
}
