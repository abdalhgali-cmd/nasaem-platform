// Umrah package details stored in Service.features by the admin package
// screen (see backend/src/modules/umrah/umrah-packages.js): `KIND: <type>`,
// `INCLUDED: …` and `EXCLUDED: …` lines.
export type UmrahPackageKind = "VISA_ONLY" | "AIR" | "SEA";

export const UMRAH_KIND_LABELS: Record<UmrahPackageKind, string> = {
  VISA_ONLY: "تأشيرة فقط",
  AIR: "مع خدمات الطيران",
  SEA: "مع خدمات البحر",
};

const KINDS = Object.keys(UMRAH_KIND_LABELS) as UmrahPackageKind[];

function entries(features: unknown, prefix: string): string[] {
  if (!Array.isArray(features)) return [];
  return features
    .filter((feature): feature is string => typeof feature === "string" && feature.startsWith(`${prefix}:`))
    .map((feature) => feature.slice(prefix.length + 1).trim())
    .filter(Boolean);
}

export function umrahPackageDetails(features: unknown) {
  const kind = entries(features, "KIND")[0]?.toUpperCase() as UmrahPackageKind | undefined;
  return {
    kind: kind && KINDS.includes(kind) ? kind : null,
    included: entries(features, "INCLUDED"),
    excluded: entries(features, "EXCLUDED"),
  };
}

// Same rule as the server (umrah-packages.js): digits, optional leading +,
// spaces or dashes; 6 to 20 characters.
export function isValidContactPhone(value: string) {
  return /^\+?[0-9][0-9\s-]{5,19}$/.test(value.trim());
}
