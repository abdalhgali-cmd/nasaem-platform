// Tracking-code (OTP) requests allowed per client per 15 minutes: 5.
// TRACKING_CODE_RATE_LIMIT can raise it only under NODE_ENV=test or
// development (see utils/test-only-limit.js).
import { resolveTestOnlyLimit } from "../../utils/test-only-limit.js";

export const PRODUCTION_TRACKING_CODE_LIMIT = 5;

export function resolveTrackingCodeLimit(env = process.env) {
  return resolveTestOnlyLimit("TRACKING_CODE_RATE_LIMIT", PRODUCTION_TRACKING_CODE_LIMIT, env);
}
