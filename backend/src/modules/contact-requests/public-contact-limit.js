// Anonymous request submissions allowed per client per 15 minutes: 5.
// PUBLIC_CONTACT_RATE_LIMIT can raise it only under NODE_ENV=test or
// development (the browser E2E backend submits many requests from one IP);
// in production it is ignored (see utils/test-only-limit.js).
import { resolveTestOnlyLimit } from "../../utils/test-only-limit.js";

export const PRODUCTION_PUBLIC_CONTACT_LIMIT = 5;

export function resolvePublicContactLimit(env = process.env) {
  return resolveTestOnlyLimit("PUBLIC_CONTACT_RATE_LIMIT", PRODUCTION_PUBLIC_CONTACT_LIMIT, env);
}
