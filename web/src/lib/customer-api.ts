import { API_URL } from "@/lib/api-url";

export class CustomerApiError extends Error {
  status: number;
  errors?: unknown;

  constructor(message: string, status: number, errors?: unknown) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

// Every call sends the customerAccessToken cookie (credentials: "include")
// — the same cookie-session pattern as the /track phone-verification panel
// (tracking-panel.tsx), just against the Customer Account endpoints
// (backend/src/modules/customer-auth, .../customer-portal, .../coupons)
// instead of the phone-only tracking ones.
const REQUEST_TIMEOUT_MS = 15000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function customerApi<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetchWithTimeout(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let payload: { success?: boolean; message?: string; data?: T; errors?: unknown; meta?: unknown } | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    throw new CustomerApiError(payload?.message || "حدث خطأ غير متوقع", response.status, payload?.errors);
  }

  return payload.data as T;
}

export async function customerUpload<T = unknown>(path: string, formData: FormData): Promise<T> {
  const response = await fetchWithTimeout(`${API_URL}${path}`, { method: "POST", credentials: "include", body: formData });
  let payload: { success?: boolean; message?: string; data?: T; errors?: unknown } | null = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || !payload?.success) throw new CustomerApiError(payload?.message || "تعذر رفع الملف", response.status, payload?.errors);
  return payload.data as T;
}
