import { CONFIG } from "./config.js";
import { getItem, setItem, removeItem } from "./storage.js";

const TOKEN_KEY = "nasaem.customer.token";

export class ApiError extends Error {
  constructor(message, { status, errors, code } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status ?? 0;
    this.errors = errors || null;
    this.code = code || null;
    this.offline = status === 0;
  }
}

let cachedToken = null;

export async function getToken() {
  if (cachedToken !== null) return cachedToken;
  cachedToken = await getItem(TOKEN_KEY);
  return cachedToken;
}

export async function setToken(token) {
  cachedToken = token;
  if (token) await setItem(TOKEN_KEY, token);
  else await removeItem(TOKEN_KEY);
}

export function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

async function buildHeaders(extra, isFormData) {
  const headers = { Accept: "application/json", ...extra };
  if (!isFormData) headers["Content-Type"] = "application/json";
  // A caller-supplied Authorization (tracking.js's phone-OTP session) wins
  // over the signed-in customer's own token — never silently overwritten.
  if (!headers.Authorization) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

// Every call goes through here. credentials:"include" keeps the cookie path
// working too (useful if the app is ever opened in a plain browser for
// debugging), while the Authorization header is what actually survives an
// Android app restart — see customer-auth.middleware.js on the backend,
// which accepts either.
export async function api(path, options = {}) {
  if (!isOnline()) {
    throw new ApiError("لا يوجد اتصال بالإنترنت. تحقق من الشبكة وحاول مرة أخرى.", { status: 0 });
  }

  const isFormData = options.body instanceof FormData;
  let response;
  try {
    response = await fetch(CONFIG.apiBaseUrl + path, {
      credentials: "include",
      ...options,
      headers: await buildHeaders(options.headers, isFormData),
    });
  } catch {
    throw new ApiError("تعذر الوصول إلى الخادم. تحقق من الاتصال وحاول مرة أخرى.", { status: 0 });
  }

  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    throw new ApiError(body.message || "تعذر إكمال العملية، حاول مرة أخرى.", {
      status: response.status,
      errors: body.errors || null,
    });
  }

  return body;
}

export async function apiHealth() {
  try {
    const res = await fetch(CONFIG.apiBaseUrl + "/health", { credentials: "include" });
    return res.ok;
  } catch {
    return false;
  }
}

// XHR instead of fetch specifically for the `upload.onprogress` event —
// fetch's streaming request body has no portable progress callback in the
// Android WebView runtime this app ships on.
// `authOverride` lets a caller (tracking.js) send a different bearer token
// than the signed-in customer's own — the /api/tracking actions authenticate
// with a separate phone-OTP session token, not the customer-account one.
export function apiUpload(path, formData, onProgress, authOverride) {
  return new Promise((resolve, reject) => {
    if (!isOnline()) {
      reject(new ApiError("لا يوجد اتصال بالإنترنت. تحقق من الشبكة وحاول مرة أخرى.", { status: 0 }));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", CONFIG.apiBaseUrl + path, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");

    const tokenPromise = authOverride?.Authorization
      ? Promise.resolve(null)
      : getToken();

    tokenPromise.then((token) => {
      const authHeader = authOverride?.Authorization || (token ? `Bearer ${token}` : null);
      if (authHeader) xhr.setRequestHeader("Authorization", authHeader);

      xhr.upload.onprogress = (event) => {
        if (onProgress && event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onerror = () => {
        reject(new ApiError("تعذر رفع الملف. تحقق من الاتصال وحاول مرة أخرى.", { status: 0 }));
      };

      xhr.onload = () => {
        let body = {};
        try {
          body = JSON.parse(xhr.responseText || "{}");
        } catch {
          body = {};
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body);
        } else {
          reject(new ApiError(body.message || "تعذر رفع الملف.", { status: xhr.status, errors: body.errors || null }));
        }
      };

      xhr.send(formData);
    });
  });
}
