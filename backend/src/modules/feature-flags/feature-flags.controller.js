import { updateFeatureFlagSchema } from "./feature-flags.validators.js";
import { listFeatureFlags, listPublicFeatureFlags, setFeatureFlagEnabled } from "./feature-flags.service.js";
import { FEATURE_FLAG_KEYS } from "./feature-flags.constants.js";
import { logActivity } from "../../utils/activityLog.js";
import prisma from "../../config/database.js";

export async function getPublic(req, res, next) {
  try {
    const data = await listPublicFeatureFlags();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getFlags(req, res, next) {
  try {
    const data = await listFeatureFlags();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function patchFlag(req, res, next) {
  try {
    if (!FEATURE_FLAG_KEYS.includes(req.params.key)) {
      return res.status(404).json({ success: false, message: "Unknown feature flag" });
    }

    const parsed = updateFeatureFlagSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const before = await prisma.featureFlag.findUnique({ where: { key: req.params.key } });
    const flag = await setFeatureFlagEnabled(req.params.key, parsed.data.enabled);
    logActivity({ userId: req.user?.id, action: "FEATURE_FLAG_UPDATED", entity: "FeatureFlag", entityId: flag.key, req, oldValue: before, newValue: flag });
    return res.status(200).json({ success: true, data: flag });
  } catch (error) {
    next(error);
  }
}
