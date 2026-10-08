import { api, ApiError, getToken, setToken } from "./api.js";

let currentCustomer = null;
let resolvedOnce = false;

export function getCustomer() {
  return currentCustomer;
}

export function isAuthenticated() {
  return Boolean(currentCustomer);
}

// Called once at boot (after the splash screen) to decide whether a stored
// token still represents a live session — a password change or a deleted
// account on the backend invalidates it immediately (requireCustomerAuth
// re-fetches the Customer row on every request), so this is a real check,
// not just "does a token exist locally".
export async function resolveSession() {
  const token = await getToken();
  if (!token) {
    currentCustomer = null;
    resolvedOnce = true;
    return null;
  }
  try {
    const res = await api("/customer-auth/me");
    currentCustomer = res.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await setToken(null);
    }
    currentCustomer = null;
  }
  resolvedOnce = true;
  return currentCustomer;
}

export function sessionResolved() {
  return resolvedOnce;
}

export async function register({ fullName, phone, email, password }) {
  const res = await api("/customer-auth/register", {
    method: "POST",
    body: JSON.stringify({ fullName, phone, email: email || undefined, password }),
  });
  await setToken(res.data.token);
  currentCustomer = res.data.customer;
  return currentCustomer;
}

export async function login({ identifier, password }) {
  const res = await api("/customer-auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
  await setToken(res.data.token);
  currentCustomer = res.data.customer;
  return currentCustomer;
}

export async function requestPasswordReset(phone) {
  return api("/customer-auth/forgot-password", { method: "POST", body: JSON.stringify({ phone }) });
}

export async function resetPassword({ phone, code, newPassword }) {
  return api("/customer-auth/reset-password", { method: "POST", body: JSON.stringify({ phone, code, newPassword }) });
}

export async function logout() {
  try {
    await api("/customer-auth/logout", { method: "POST" });
  } catch {
    // Still clear the local session even if the network call failed —
    // the user asked to log out, and the stale token must stop being sent.
  }
  await setToken(null);
  currentCustomer = null;
}

export async function refreshProfile() {
  const res = await api("/customer-auth/me");
  currentCustomer = res.data;
  return currentCustomer;
}
