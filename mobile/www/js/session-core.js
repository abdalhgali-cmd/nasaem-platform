// Pure session rules (no DOM, no Capacitor) so they can be unit-tested with
// `node --test` and reused by auth.js. The one rule that matters most: only
// the backend saying "this session is over" (HTTP 401) may sign a customer
// out. A network failure, a timeout, a 5xx or a rate limit says nothing
// about the session and must never cost the customer their login.

export const SessionState = Object.freeze({
  NO_SESSION: "NO_SESSION", // nothing stored on this device
  PENDING: "PENDING", // stored session, server check in progress
  VALID: "VALID", // server confirmed the session
  OFFLINE: "OFFLINE", // server could not be reached / could not check: keep the session, offer retry
  EXPIRED: "EXPIRED", // server says expired or revoked: clear it, sign in again
});

// 401 is the backend's "this session is over" (customer-auth.middleware.js
// answers SESSION_EXPIRED / SESSION_INVALID / SESSION_REVOKED / AUTH_REQUIRED).
// Everything else, including status 0 (offline/timeout), 408, 429 and every
// 5xx (the middleware returns 503 when it cannot check), is temporary.
export function classifySessionFailure(error) {
  return error && error.status === 401 ? SessionState.EXPIRED : SessionState.OFFLINE;
}

export const SESSION_END_CODES = Object.freeze(["AUTH_REQUIRED", "SESSION_EXPIRED", "SESSION_INVALID", "SESSION_REVOKED"]);

// A 401 from some other endpoint (e.g. change-password's "wrong current
// password") is not a session verdict; only these codes are.
export function isSessionEndError(error) {
  return Boolean(error && error.status === 401 && SESSION_END_CODES.includes(error.code));
}

// Reads `exp` (seconds) from a JWT without verifying it: only used to decide
// when to ask the server for a renewed token, never to trust the session.
export function tokenExpiry(token) {
  try {
    const part = String(token).split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    const exp = JSON.parse(json).exp;
    return Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Customer tokens live 30 days. Renew once a week of it is used up (so an
// active customer never meets the expiry). With biometric login on, storing
// the renewed token needs another fingerprint, so only do it in the last week.
export function shouldRenew(token, { nowMs = Date.now(), biometric = false } = {}) {
  const exp = tokenExpiry(token);
  if (!exp) return false;
  const remainingMs = exp * 1000 - nowMs;
  if (remainingMs <= 0) return false; // already expired: the server check decides
  return remainingMs < (biometric ? 7 : 23) * DAY_MS;
}

// Server verification of a token already in memory. `fetchMe` must reject
// with an error carrying `.status` (0 for network/timeout).
export async function verifyToken(token, fetchMe) {
  if (!token) return { state: SessionState.NO_SESSION };
  try {
    const res = await fetchMe();
    return { state: SessionState.VALID, customer: res?.data ?? null };
  } catch (error) {
    return { state: classifySessionFailure(error), error };
  }
}

// What the biometric lock screen should do with a SecureSession error code.
export function biometricFailure(code) {
  switch (code) {
    case "CANCELLED":
      return { action: "stay", message: "" };
    case "TIMEOUT":
    case "FAILED":
    case "BUSY":
      return { action: "stay", message: "لم يتم التحقق من البصمة. حاول مرة أخرى." };
    case "LOCKOUT":
      return { action: "stay", message: "تم إيقاف البصمة مؤقتًا بسبب كثرة المحاولات. انتظر قليلًا أو ادخل بكلمة المرور." };
    case "LOCKOUT_PERMANENT":
      return { action: "password", message: "البصمة مقفلة. افتح قفل الهاتف بالرمز أولًا، أو ادخل بكلمة المرور." };
    case "KEY_INVALIDATED":
      return { action: "password", message: "تغيّرت البصمات المسجلة في الجهاز، لذلك أُوقف الدخول بالبصمة. سجّل الدخول بكلمة المرور ثم فعّله من جديد." };
    case "NONE_ENROLLED":
    case "NO_HARDWARE":
    case "HW_UNAVAILABLE":
    case "UNSUPPORTED":
    case "SECURITY_UPDATE_REQUIRED":
    case "NOT_ENABLED":
      return { action: "password", message: "الدخول بالبصمة غير متاح الآن على هذا الجهاز. ادخل بكلمة المرور." };
    default:
      return { action: "stay", message: "تعذر استخدام البصمة. حاول مرة أخرى أو ادخل بكلمة المرور." };
  }
}

export const BIOMETRIC_SUPPORT_LABELS = Object.freeze({
  AVAILABLE: "البصمة متاحة على هذا الجهاز",
  NONE_ENROLLED: "لا توجد بصمة مسجلة في إعدادات الهاتف. أضف بصمة من إعدادات الجهاز أولًا",
  NO_HARDWARE: "هذا الجهاز لا يدعم البصمة",
  HW_UNAVAILABLE: "مستشعر البصمة غير متاح حاليًا",
  SECURITY_UPDATE_REQUIRED: "يحتاج الجهاز إلى تحديث أمني قبل استخدام البصمة",
  UNSUPPORTED: "الدخول بالبصمة غير مدعوم على هذا الجهاز",
  NOT_NATIVE: "الدخول بالبصمة متاح في تطبيق أندرويد فقط",
});
