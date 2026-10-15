import { API_URL } from "@/lib/api-url";
import { clearCustomerToken, readCustomerToken } from "@/lib/customer-session";

export class CustomerApiError extends Error {
  status: number;
  errors?: unknown;

  constructor(message: string, status: number, errors?: unknown) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

// Every call sends the session token as `Authorization: Bearer` when this
// browser holds one (customer-session.ts: the cookie is third-party in
// production and often blocked), and the customerAccessToken cookie
// (credentials: "include") where the browser allows it — the same cookie-session pattern as the /track phone-verification panel
// (tracking-panel.tsx), just against the Customer Account endpoints
// (backend/src/modules/customer-auth, .../customer-portal, .../coupons)
// instead of the phone-only tracking ones.
const REQUEST_TIMEOUT_MS = 15000;

export const NETWORK_ERROR_MESSAGE = "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت ثم حاول مرة أخرى.";

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    // Offline, DNS, CORS or timeout: status 0, never mistaken for a 401.
    throw new CustomerApiError(NETWORK_ERROR_MESSAGE, 0);
  } finally {
    clearTimeout(timeout);
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = readCustomerToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

// The server no longer accepts this session (expired, revoked, password
// changed): forget the stored token so the next screen asks to sign in.
function forgetRejectedSession(status: number) {
  if (status === 401) clearCustomerToken();
}

export async function customerApi<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetchWithTimeout(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: authHeaders(options.body ? { "Content-Type": "application/json" } : {}),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let payload: { success?: boolean; message?: string; data?: T; errors?: unknown; meta?: unknown } | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    forgetRejectedSession(response.status);
    throw new CustomerApiError(payload?.message || "حدث خطأ غير متوقع", response.status, payload?.errors);
  }

  return payload.data as T;
}

export async function customerUpload<T = unknown>(path: string, formData: FormData): Promise<T> {
  const response = await fetchWithTimeout(`${API_URL}${path}`, { method: "POST", credentials: "include", headers: authHeaders(), body: formData });
  let payload: { success?: boolean; message?: string; data?: T; errors?: unknown } | null = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || !payload?.success) {
    forgetRejectedSession(response.status);
    throw new CustomerApiError(payload?.message || "تعذر رفع الملف", response.status, payload?.errors);
  }
  return payload.data as T;
}
