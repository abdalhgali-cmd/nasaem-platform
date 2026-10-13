// The customer's session token on the website.
//
// The site and the API live on different domains in production
// (nasaem-alharamain.com → the Railway API), so the httpOnly session cookie
// the API sets is a third-party cookie that many browsers block. Without
// this, a successful registration or login looked like no session at all:
// /account read /customer-auth/me without credentials, got 401 and sent the
// customer back to the login page. The API already returns the same token in
// the response body and accepts it as `Authorization: Bearer` (the Android
// app's path), so the website keeps it here and sends it on every customer
// call. The cookie is still set and still works where browsers allow it.
const TOKEN_KEY = "nasaem.customer.token.v1";

// Seconds-since-epoch `exp` of a JWT, or null when it can't be read.
function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

export function readCustomerToken(now = Date.now()): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const exp = tokenExpiry(token);
    if (exp !== null && exp * 1000 <= now) {
      window.localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function saveCustomerToken(token: unknown) {
  if (typeof window === "undefined" || typeof token !== "string" || !token) return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage unavailable (private mode): the cookie is the only session left.
  }
}

export function clearCustomerToken() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}
