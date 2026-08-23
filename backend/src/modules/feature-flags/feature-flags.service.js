import prisma from "../../config/database.js";
import { FEATURE_FLAG_KEYS } from "./feature-flags.constants.js";

export async function listFeatureFlags() {
  return prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
}

export async function listPublicFeatureFlags() {
  const flags = await prisma.featureFlag.findMany({ select: { key: true, enabled: true } });
  return Object.fromEntries(flags.map((f) => [f.key, f.enabled]));
}

// Fail-open: a flag row that hasn't been seeded yet must never silently
// disable a feature nobody explicitly turned off. In practice every key
// in FEATURE_FLAG_KEYS is seeded (see seed.js), so this only matters for
// a key that isn't in that list at all — which setFeatureFlagEnabled
// already rejects, so it can't happen via the API.
export async function isFeatureEnabled(key) {
  const flag = await prisma.featureFlag.findUnique({ where: { key } });
  return flag ? flag.enabled : true;
}

export async function setFeatureFlagEnabled(key, enabled) {
  if (!FEATURE_FLAG_KEYS.includes(key)) return null;
  return prisma.featureFlag.upsert({
    where: { key },
    update: { enabled },
    create: { key, enabled },
  });
}
