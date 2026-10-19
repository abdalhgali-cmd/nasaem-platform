import { api, ApiError, setSessionToken, getToken, setSessionRejectedHandler } from "./api.js";
import {
  secureGet,
  secureSet,
  secureClearAll,
  migrateLegacyPreference,
  biometricStatus as nativeBiometricStatus,
  enableBiometric as nativeEnableBiometric,
  unlockBiometric as nativeUnlockBiometric,
  disableBiometric as nativeDisableBiometric,
} from "./secure-store.js";
import { removeItem as removePreference } from "./storage.js";
import { SessionState, verifyToken, shouldRenew, isSessionEndError } from "./session-core.js";
import { forgetTrackingSession } from "./tracking.js";

export { SessionState };

const TOKEN_KEY = "customer.token";
const LEGACY_TOKEN_KEY = "nasaem.customer.token"; // Capacitor Preferences, before secure storage
const SESSION_CHECK_TIMEOUT_MS = 15000;

let currentCustomer = null;
let state = SessionState.NO_SESSION;
// Bumped by every inactivity lock: a session check that started before the
// lock can never make the account readable again.
let lockGeneration = 0;
let onSessionEnded = () => {};
const listeners = new Set();

function setState(next) {
  if (state === next) return;
  state = next;
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch {
      // a broken listener must not break authentication
    }
  });
}

// Screens that show account-dependent content (home, account, requests)
// re-render when the account state changes. Returns an unsubscribe function.
export function onAccountStateChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Whether protected account data may be shown right now.
export function isAccountUnlocked() {
  return state === SessionState.VALID && Boolean(currentCustomer);
}

export function getCustomer() {
  return currentCustomer;
}

export function isAuthenticated() {
  return state === SessionState.VALID && Boolean(currentCustomer);
}

export function getSessionState() {
  return state;
}

// app.js: where to send the customer when the server ends the session
// in the middle of using the app.
export function setOnSessionEnded(callback) {
  onSessionEnded = callback;
}

async function persistToken(token) {
  setSessionToken(token);
  const { enabled } = await nativeBiometricStatus(TOKEN_KEY);
  if (enabled) {
    // A new token from a password login replaces whatever the fingerprint
    // protected; the customer can turn biometrics back on in Security.
    await nativeDisableBiometric(TOKEN_KEY, token);
  } else {
    await secureSet(TOKEN_KEY, token);
  }
}

// Removes every trace of the customer session from this device: secure
// storage (incl. the biometric-protected copy and its Keystore key), any
// legacy Preferences copy, the separate tracking session and memory.
async function clearLocalSession() {
  setSessionToken(null);
  currentCustomer = null;
  setState(SessionState.NO_SESSION);
  forgetTrackingSession();
  await secureClearAll();
  await removePreference(LEGACY_TOKEN_KEY).catch(() => {});
  await removePreference("nasaem.tracking.token").catch(() => {});
}

/**
 * Step 1 at launch: what is stored on this device (no network).
 * Returns { kind: "none" | "token" | "biometric" }.
 */
export async function loadStoredSession() {
  await migrateLegacyPreference(LEGACY_TOKEN_KEY, TOKEN_KEY);
  const { enabled } = await nativeBiometricStatus(TOKEN_KEY);
  if (enabled) {
    setState(SessionState.LOCKED);
    return { kind: "biometric" };
  }
  const token = await secureGet(TOKEN_KEY);
  if (!token) {
    setState(SessionState.NO_SESSION);
    return { kind: "none" };
  }
  setSessionToken(token);
  setState(SessionState.PENDING);
  return { kind: "token" };
}

const PROMPT_TEXT = {
  title: "الدخول بالبصمة",
  subtitle: "استخدم بصمتك لفتح حسابك في نسائم الحرمين",
  cancel: "استخدام كلمة المرور",
};

/**
 * Inactivity lock: with biometric login on, the account goes back to LOCKED —
 * the token leaves memory (only its fingerprint-protected copy stays) and the
 * customer's data is no longer readable until the fingerprint releases it and
 * the server re-verifies it. Without biometric login there is nothing to
 * unlock with, so nothing changes. Returns whether it locked.
 */
export async function lockAfterInactivity() {
  if (state !== SessionState.VALID && state !== SessionState.PENDING) return false;
  const { enabled } = await nativeBiometricStatus(TOKEN_KEY);
  if (!enabled) return false;
  lockGeneration += 1;
  setSessionToken(null);
  currentCustomer = null;
  // The phone-verified tracking session shows requests too: it goes with the lock.
  forgetTrackingSession();
  setState(SessionState.LOCKED);
  return true;
}

/** Step 1b when biometric login is on: the fingerprint releases the token. */
export async function unlockWithBiometric() {
  const token = await nativeUnlockBiometric(TOKEN_KEY, PROMPT_TEXT);
  if (!token) throw Object.assign(new Error("empty"), { code: "KEY_INVALIDATED" });
  setSessionToken(token);
  setState(SessionState.PENDING);
}

/**
 * Step 2: the server decides. A fingerprint only unlocked the token; it is
 * never treated as proof that the session is still valid.
 */
export async function verifySession() {
  const token = getToken();
  const generation = lockGeneration;
  setState(token ? SessionState.PENDING : SessionState.NO_SESSION);
  const result = await verifyToken(token, () =>
    api("/customer-auth/me", { timeoutMs: SESSION_CHECK_TIMEOUT_MS, skipSessionCheck: true })
  );
  // Locked while the check was running: the answer no longer applies.
  if (generation !== lockGeneration) return { state: SessionState.LOCKED };
  if (result.state === SessionState.VALID) {
    currentCustomer = result.customer;
    setState(SessionState.VALID);
    renewInBackground(token);
  } else if (result.state === SessionState.OFFLINE) {
    setState(SessionState.OFFLINE);
  } else if (result.state === SessionState.EXPIRED) {
    await clearLocalSession();
    setState(SessionState.EXPIRED);
  }
  // OFFLINE: the token stays stored and in memory; the caller offers Retry.
  return result;
}

// Keeps an active customer signed in past the 30-day token lifetime.
// Failures are ignored: the current token keeps working.
async function renewInBackground(token) {
  try {
    const { enabled } = await nativeBiometricStatus(TOKEN_KEY);
    if (!shouldRenew(token, { biometric: enabled })) return;
    const res = await api("/customer-auth/refresh", { method: "POST", skipSessionCheck: true });
    const fresh = res.data?.token;
    if (!fresh || getToken() !== token) return; // logged out / replaced meanwhile
    if (enabled) {
      await nativeEnableBiometric(TOKEN_KEY, fresh, {
        title: "تجديد الدخول بالبصمة",
        subtitle: "أكّد بصمتك لتجديد جلستك المحفوظة",
        cancel: "لاحقًا",
      });
    } else {
      await secureSet(TOKEN_KEY, fresh);
    }
    setSessionToken(fresh);
  } catch {
    // Try again on a later launch.
  }
}

// A request made with the customer token came back 401. Ask /me once (single
// flight) before acting, and end the session only if the server confirms it.
let confirming = null;
async function confirmSessionAfterRejection(error) {
  if (!isSessionEndError(error) || state !== SessionState.VALID || confirming) return;
  confirming = (async () => {
    const result = await verifySession();
    if (result.state === SessionState.EXPIRED) onSessionEnded();
    else if (result.state === SessionState.OFFLINE) setState(SessionState.VALID); // keep working; checked again later
  })().finally(() => {
    confirming = null;
  });
}
setSessionRejectedHandler(confirmSessionAfterRejection);

// The server has created the account (or accepted the login) and returned
// its session: the customer is signed in from here on. Saving the token on
// the device is best effort — if secure storage fails, this run keeps the
// session in memory instead of reporting a failure for an account that
// exists (a retry would only answer «الرقم مستخدم»).
async function startSession(res) {
  const token = res?.data?.token;
  if (!token) throw new ApiError("لم نتمكن من بدء الجلسة. سجّل الدخول بكلمة المرور.", { status: 0, code: "NO_SESSION_TOKEN" });
  setSessionToken(token);
  currentCustomer = res.data.customer;
  setState(SessionState.VALID);
  try {
    await persistToken(token);
  } catch (error) {
    console.warn("Session token not saved on the device:", error?.message || error);
  }
  return currentCustomer;
}

export async function register({ fullName, phone, email, password }) {
  const res = await api("/customer-auth/register", {
    method: "POST",
    body: JSON.stringify({ fullName, phone, email: email || undefined, password }),
  });
  return startSession(res);
}

export async function login({ identifier, password }) {
  const res = await api("/customer-auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
  return startSession(res);
}

export async function requestPasswordReset(phone) {
  return api("/customer-auth/forgot-password", { method: "POST", body: JSON.stringify({ phone }) });
}

export async function resetPassword({ phone, code, newPassword }) {
  return api("/customer-auth/reset-password", { method: "POST", body: JSON.stringify({ phone, code, newPassword }) });
}

// The server ends every other session on a password change and returns a
// fresh token for this device.
export async function changePassword({ currentPassword, newPassword }) {
  const res = await api("/customer-auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const fresh = res.data?.token;
  if (fresh) {
    const { enabled } = await nativeBiometricStatus(TOKEN_KEY);
    if (enabled) {
      // Keep biometric login on: protect the new token with one more prompt;
      // if the customer declines, fall back to normal secure storage.
      try {
        await nativeEnableBiometric(TOKEN_KEY, fresh, {
          title: "تأكيد البصمة",
          subtitle: "أكّد بصمتك لمتابعة الدخول بالبصمة بعد تغيير كلمة المرور",
          cancel: "إيقاف البصمة",
        });
        setSessionToken(fresh);
      } catch {
        await persistToken(fresh);
      }
    } else {
      await persistToken(fresh);
    }
  }
  return res;
}

export async function logout() {
  if (getToken()) {
    try {
      // Revokes this token on the server (other devices stay signed in).
      await api("/customer-auth/logout", { method: "POST", timeoutMs: 8000, skipSessionCheck: true });
    } catch {
      // Offline or already expired: still sign out locally. The token is gone
      // from the device, and it expires on the server on its own.
    }
  }
  await clearLocalSession();
}

export async function refreshProfile() {
  const res = await api("/customer-auth/me");
  currentCustomer = res.data;
  return currentCustomer;
}

// ---- Biometric settings (Account → Security) ---------------------------

export async function getBiometricStatus() {
  try {
    return await nativeBiometricStatus(TOKEN_KEY);
  } catch {
    return { available: false, reason: "UNSUPPORTED", enabled: false };
  }
}

export async function enableBiometricLogin() {
  const token = getToken();
  if (!token || state !== SessionState.VALID) {
    throw new ApiError("سجّل الدخول أولًا ثم فعّل البصمة.", { status: 401 });
  }
  await nativeEnableBiometric(TOKEN_KEY, token, {
    title: "تفعيل الدخول بالبصمة",
    subtitle: "أكّد بصمتك لربطها بحسابك على هذا الجهاز",
    cancel: "إلغاء",
  });
}

export async function disableBiometricLogin() {
  await nativeDisableBiometric(TOKEN_KEY, getToken());
}
