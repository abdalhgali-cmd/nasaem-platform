import { AsyncLocalStorage } from "node:async_hooks";

// Capture only the authenticated identity, not mutable Express request data.
// AsyncLocalStorage keeps simultaneous HTTP requests separate. The workflow
// lock reads this scope again after waiting, when assignment may have changed.
const staffScope = new AsyncLocalStorage();

export function withStaffRequestScope(requestId, user, next) {
  return staffScope.run(Object.freeze({ requestId, userId: user.id, role: user.role, organizationId: user.organizationId }), next);
}

export function staffScopeForRequest(requestId) {
  const scope = staffScope.getStore();
  return scope?.requestId === requestId ? scope : null;
}
