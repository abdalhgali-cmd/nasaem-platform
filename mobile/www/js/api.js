import { CONFIG } from "./config.js";

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

// The customer token lives here in memory only; auth.js loads it from (and
// saves it to) secure storage. Nothing in this module persists it.
let sessionToken = null;
let onSessionRejected = null;

export function getToken() {
  return sessionToken;
}

export function setSessionToken(token) {
  sessionToken = token || null;
}

// auth.js registers this to re-check the session when a request made with the
// customer token comes back 401 (see isSessionEndError in session-core.js).
export function setSessionRejectedHandler(handler) {
  onSessionRejected = handler;
}

const DEFAULT_TIMEOUT_MS = 20000;

// fetch has no timeout of its own; on a bad mobile connection a request can
// hang until the OS gives up. Racing a timer keeps every call bounded (works
// with CapacitorHttp's native fetch too, which ignores AbortSignal).
function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new ApiError("انتهت مهلة الاتصال بالخادم. تحقق من الشبكة وحاول مرة أخرى.", { status: 0, code: "TIMEOUT" })),
      timeoutMs
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function buildHeaders(extra, isFormData) {
  const headers = { Accept: "application/json", ...extra };
  if (!isFormData) headers["Content-Type"] = "application/json";
  // A caller that passes an Authorization key (tracking.js's phone-OTP
  // session) decides it alone: its own token, or none at all. The customer
  // account token is never sent on its behalf.
  if (extra && Object.prototype.hasOwnProperty.call(extra, "Authorization")) {
    if (!headers.Authorization) delete headers.Authorization;
  } else if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  return headers;
}

// Every call goes through here. credentials:"include" keeps the cookie path
// working too (useful if the app is ever opened in a plain browser for
// debugging), while the Authorization header is what actually survives an
// Android app restart — see customer-auth.middleware.js on the backend,
// which accepts either.
export async function api(path, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, skipSessionCheck = false, ...fetchOptions } = options;
  if (!isOnline()) {
    throw new ApiError("لا يوجد اتصال بالإنترنت. تحقق من الشبكة وحاول مرة أخرى.", { status: 0 });
  }

  const isFormData = fetchOptions.body instanceof FormData;
  const headers = buildHeaders(fetchOptions.headers, isFormData);
  const usedSessionToken = Boolean(sessionToken) && headers.Authorization === `Bearer ${sessionToken}`;

  const request = (async () => {
    let response;
    try {
      response = await fetch(CONFIG.apiBaseUrl + path, { credentials: "include", ...fetchOptions, headers });
    } catch {
      throw new ApiError("تعذر الوصول إلى الخادم. تحقق من الاتصال وحاول مرة أخرى.", { status: 0 });
    }
    let body = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    return { response, body };
  })();

  const { response, body } = await withTimeout(request, timeoutMs);

  if (!response.ok) {
    const error = new ApiError(body.message || "تعذر إكمال العملية، حاول مرة أخرى.", {
      status: response.status,
      errors: body.errors || null,
      code: body.code || null,
    });
    if (response.status === 401 && usedSessionToken && !skipSessionCheck) onSessionRejected?.(error);
    throw error;
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
    // Bounded like api(): large uploads on slow networks get two minutes.
    xhr.timeout = 120000;
    xhr.ontimeout = () => {
      reject(new ApiError("انتهت مهلة رفع الطلب. تحقق من الاتصال وحاول مرة أخرى.", { status: 0, code: "TIMEOUT" }));
    };
    xhr.setRequestHeader("Accept", "application/json");

    // authOverride given (tracking): only its token, never the account's.
    Promise.resolve(authOverride ? null : sessionToken).then((token) => {
      const authHeader = authOverride ? authOverride.Authorization || null : token ? `Bearer ${token}` : null;
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
          reject(new ApiError(body.message || "تعذر رفع الملف.", { status: xhr.status, errors: body.errors || null, code: body.code || null }));
        }
      };

      xhr.send(formData);
    });
  });
}
