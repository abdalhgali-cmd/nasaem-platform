// Shared price-display contract for public catalog cards. The backend
// seeds a not-yet-priced Service/VisaType with basePrice: 0 as a
// placeholder (see backend/prisma/seed.js) rather than leaving it null,
// so every card must guard on `> 0`, not just `!= null`, to avoid
// showing "0 SAR" as a real commercial price.
export function hasPublishedPrice(basePrice: number | string | null | undefined): boolean {
  const numeric = Number(basePrice);
  return Number.isFinite(numeric) && numeric > 0;
}

export function formatPrice(
  basePrice: number | string | null | undefined,
  currency: string | null | undefined,
  fallback = "السعر بعد المراجعة"
): string {
  if (!hasPublishedPrice(basePrice)) return fallback;
  return `${Number(basePrice).toLocaleString("en-US")} ${currency ?? ""}`.trim();
}

export function formatSdgEquivalent(priceSdg: number | null | undefined): string | null {
  return priceSdg != null && Number.isFinite(priceSdg) && priceSdg > 0
    ? `≈ ${Math.round(priceSdg).toLocaleString("en-US")} جنيه سوداني`
    : null;
}
