import { isFeatureEnabled } from "./feature-flags.service.js";

// Platform 3.0 Phase 13 — "feature flags must be enforced server-side,
// not only hidden in UI". Drop this in front of any route whose
// capability a flag should gate; a disabled flag short-circuits with a
// clean 403 before the route's own handler (and whatever RBAC check
// comes after it) ever runs.
export function requireFeatureEnabled(key) {
  return async function featureFlagGate(req, res, next) {
    try {
      const enabled = await isFeatureEnabled(key);
      if (!enabled) {
        return res.status(403).json({ success: false, message: "This feature is currently disabled by the administrator." });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
