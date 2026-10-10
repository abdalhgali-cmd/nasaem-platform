const API_BASE = "/api";

// Timeouts (ms). Reads fail fast so the page can offer a retry; writes get
// longer; uploads longest (a 10 MB scan over a slow connection).
const READ_TIMEOUT_MS = 20000;
const WRITE_TIMEOUT_MS = 30000;
const UPLOAD_TIMEOUT_MS = 120000;
// Reads are retried on transient failures only. Writes are never retried
// automatically: repeating a payment or an upload must be the user's
// decision (and the server de-duplicates payments by idempotency key).
const READ_RETRY_DELAYS_MS = [400, 1200];
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

// Codes the backend uses when it knows the staff session is over
// (backend/src/middleware/auth.middleware.js). Only these send the user back
// to login; a 503 or a network failure keeps them on the page.
const SESSION_ENDED_CODES = new Set([
  "AUTH_REQUIRED",
  "SESSION_EXPIRED",
  "SESSION_INVALID",
  "SESSION_REVOKED",
  "ACCOUNT_INACTIVE",
]);

class ApiError extends Error {
  constructor(message, status, errors, code) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.code = code;
  }
}

function isSessionEnded(error) {
  return error instanceof ApiError && error.status === 401 && (!error.code || SESSION_ENDED_CODES.has(error.code));
}

function loginUrl() {
  const here = window.location.pathname + window.location.search + window.location.hash;
  if (window.location.pathname === "/login.html") return "/login.html";
  return `/login.html?next=${encodeURIComponent(here)}`;
}

function redirectToLogin() {
  window.location.href = loginUrl();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnce(path, { body, headers, timeoutMs, ...rest }) {
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let response;
  try {
    response = await fetch(API_BASE + path, {
      credentials: "include",
      ...rest,
      // X-Requested-With: proof for the backend's CSRF check that this write
      // comes from one of our pages (a cross-site form cannot set it).
      headers: isFormData
        ? { "X-Requested-With": "XMLHttpRequest", ...(headers || {}) }
        : { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", ...(headers || {}) },
      body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller ? controller.signal : undefined,
    });
  } catch (error) {
    const timedOut = error && error.name === "AbortError";
    throw new ApiError(
      timedOut ? "انتهت مهلة الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة." : "تعذر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.",
      0,
      null,
      timedOut ? "TIMEOUT" : "NETWORK_ERROR"
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const serverMessage = arabicMessage(payload?.message, response.status, payload?.errors);
    const fallback =
      response.status === 503 ? "الخدمة غير متاحة مؤقتًا. أعد المحاولة بعد قليل."
      : response.status === 429 ? "عدد كبير من الطلبات. انتظر قليلًا ثم أعد المحاولة."
      : response.status === 403 ? "ليست لديك صلاحية لهذا الإجراء."
      : `الطلب فشل (${response.status})`;
    throw new ApiError(serverMessage || fallback, response.status, payload?.errors, payload?.code);
  }

  return payload;
}

// Server messages are shown to staff as-is when they are already Arabic.
// English ones (older modules) get an Arabic equivalent: a known phrase, or
// a plain explanation of the status. Validation details are appended.
const KNOWN_MESSAGES_AR = {
  "Validation failed": "البيانات المدخلة غير مكتملة أو غير صحيحة",
  "Forbidden": "ليست لديك صلاحية لهذا الإجراء.",
  "Authentication required": "انتهت الجلسة. سجّل الدخول من جديد.",
  "Invalid or expired token": "انتهت الجلسة. سجّل الدخول من جديد.",
  "Order not found": "الطلب غير موجود.",
  "Payment not found": "الدفعة غير موجودة.",
  "User not found": "المستخدم غير موجود.",
  "Contact request not found": "طلب العميل غير موجود.",
  "Booking not found": "الحجز غير موجود.",
  "Record not found": "العنصر غير موجود.",
  "File not available": "الملف غير متاح.",
};
const STATUS_MESSAGES_AR = {
  400: "البيانات المدخلة غير صحيحة.",
  403: "ليست لديك صلاحية لهذا الإجراء.",
  404: "العنصر غير موجود أو لا يتبع لمؤسستك.",
  409: "تغيّرت البيانات أو لا يسمح الوضع الحالي بهذا الإجراء. أعد تحميل الصفحة ثم حاول مجددًا.",
  413: "الملف أكبر من الحد المسموح.",
  429: "عدد كبير من الطلبات. انتظر قليلًا ثم أعد المحاولة.",
  500: "حدث خطأ في الخادم. حاول مرة أخرى لاحقًا.",
  503: "الخدمة غير متاحة مؤقتًا. أعد المحاولة بعد قليل.",
};

function arabicMessage(message, status, errors) {
  const hasArabic = (text) => /[\u0600-\u06FF]/.test(text || "");
  let text = message;
  if (!text || !hasArabic(text)) {
    text = KNOWN_MESSAGES_AR[text] || STATUS_MESSAGES_AR[status] || (status >= 500 ? STATUS_MESSAGES_AR[500] : null);
  }
  const details = formatErrors(errors);
  return details ? `${text || ""} — ${details}` : text;
}

async function apiRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isRead = method === "GET" || method === "HEAD";
  const isUpload = typeof FormData !== "undefined" && options.body instanceof FormData;
  const timeoutMs = options.timeoutMs || (isRead ? READ_TIMEOUT_MS : isUpload ? UPLOAD_TIMEOUT_MS : WRITE_TIMEOUT_MS);
  const delays = isRead ? READ_RETRY_DELAYS_MS : [];

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchOnce(path, { ...options, method, timeoutMs });
    } catch (error) {
      const transient = error.status === 0 || TRANSIENT_STATUSES.has(error.status);
      if (transient && attempt < delays.length) {
        await sleep(delays[attempt]);
        continue;
      }
      // A session that ended mid-work (revoked, expired, account suspended)
      // goes back to login, remembering where the user was.
      if (isSessionEnded(error) && path !== "/auth/login" && path !== "/auth/me" && !options.noSessionRedirect) {
        redirectToLogin();
      }
      throw error;
    }
  }
}

const api = {
  get: (path, options = {}) => apiRequest(path, { ...options, method: "GET" }),
  post: (path, body, options = {}) => apiRequest(path, { ...options, method: "POST", body }),
  patch: (path, body, options = {}) => apiRequest(path, { ...options, method: "PATCH", body }),
  delete: (path, options = {}) => apiRequest(path, { ...options, method: "DELETE" }),
  upload: (path, formData, options = {}) => apiRequest(path, { ...options, method: "POST", body: formData }),
  // Raw form used by older scripts: body must already be FormData, a plain
  // object, or a JSON string (decoded so it is not double-encoded).
  request: (path, options = {}) => {
    let { body } = options;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (error) { /* leave as is */ }
    }
    const headers = { ...(options.headers || {}) };
    delete headers["Content-Type"];
    delete headers["content-type"];
    return apiRequest(path, { ...options, headers, body });
  },
};

// Full-page state shown when the session could not be checked (server or
// network trouble). Unlike a real logout it keeps the user on the page and
// offers a retry.
function showConnectionProblem(message, onRetry) {
  let panel = document.getElementById("connection-problem");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "connection-problem";
    panel.className = "connection-problem";
    panel.setAttribute("role", "alert");
    const box = document.createElement("div");
    box.className = "card";
    const title = document.createElement("h2");
    title.textContent = "تعذر الاتصال بالخادم";
    const text = document.createElement("p");
    text.className = "muted";
    text.id = "connection-problem-text";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn";
    button.id = "connection-retry-btn";
    button.textContent = "إعادة المحاولة";
    box.append(title, text, button);
    panel.appendChild(box);
    document.body.appendChild(panel);
  }
  document.getElementById("connection-problem-text").textContent =
    `${message} جلستك ما زالت محفوظة؛ لم يتم تسجيل خروجك.`;
  const button = document.getElementById("connection-retry-btn");
  button.disabled = false;
  button.onclick = () => {
    button.disabled = true;
    onRetry();
  };
  panel.hidden = false;
  button.focus();
}

function hideConnectionProblem() {
  const panel = document.getElementById("connection-problem");
  if (panel) panel.hidden = true;
}

// Resolves with the current user once the session is confirmed. A session
// the backend says is over goes to login; a server/network failure shows a
// retry state instead (it is not evidence that the session ended).
function requireSession() {
  return new Promise((resolve) => {
    const attempt = async () => {
      try {
        const { data } = await api.get("/auth/me");
        hideConnectionProblem();
        resolve(data);
      } catch (error) {
        if (isSessionEnded(error)) {
          redirectToLogin();
          resolve(null);
          return;
        }
        showConnectionProblem(error.message || "حدث خطأ غير متوقع.", attempt);
      }
    };
    attempt();
  });
}

function formatErrors(errors) {
  if (!errors) return "";
  const fieldErrors = errors.fieldErrors || {};
  const messages = Object.values(fieldErrors).flat();
  return messages.join("، ");
}

// Escapes text before interpolating it into an innerHTML template string.
// Required for EVERY value that did not come from this file's own constants:
// customer names (public registration and contact forms), staff-entered
// notes, payment methods, server error messages, ids.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}

function showAlert(container, message, type = "error") {
  if (!container) return;
  container.innerHTML = "";
  if (!message) return;
  const el = document.createElement("div");
  el.className = `alert ${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.textContent = message;
  container.appendChild(el);
}

const STATUS_LABELS_AR = {
  NEW: "جديد",
  UNDER_REVIEW: "قيد المراجعة",
  WAITING_DOCUMENTS: "بانتظار المستندات",
  PAYMENT_PENDING: "بانتظار الدفع",
  PROCESSING: "قيد التنفيذ",
  APPROVED: "معتمد",
  COMPLETED: "مكتمل",
  REJECTED: "مرفوض",
  CANCELLED: "ملغي",
  UNPAID: "غير مدفوع",
  PARTIAL: "مدفوع جزئيًا",
  PAID: "مدفوع بالكامل",
  REFUNDED: "مسترجع",
  PARTIALLY_REFUNDED: "مسترجع جزئيًا",
  OVERPAID: "مدفوع بالزيادة",
  ACTIVE: "نشط",
  INACTIVE: "غير نشط",
  SUSPENDED: "موقوف",
  PENDING: "قيد الانتظار",
  CONFIRMED: "مؤكد",
  NOT_REQUIRED: "-",
  AWAITING_TRANSFER: "بانتظار التحويل",
  ACCEPTED: "مقبول",
  IN_PROGRESS: "قيد المعالجة",
  CLOSED: "مغلق",
};

// Status label is always text, never only a colour: the badge's meaning is
// readable by screen readers and in high-contrast mode.
function statusBadge(status) {
  const label = STATUS_LABELS_AR[status] || status || "-";
  const safeClass = String(status || "").replace(/[^A-Z_]/g, "");
  return `<span class="badge status-${safeClass}">${escapeHtml(label)}</span>`;
}

function formatMoney(amount, currency) {
  const value = Number(amount || 0);
  return `${value.toLocaleString("ar-SA", { maximumFractionDigits: 2, minimumFractionDigits: 0 })} ${escapeHtml(currency || "")}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  // ar-SA defaults to the Hijri calendar in most browsers; force Gregorian
  // explicitly since this is a business/operations date, not a religious one.
  return date.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ar-SA-u-ca-gregory-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Random key for one financial submission. The same key is reused if the
// user re-submits the *same* form after a timeout, so the server can return
// the first result instead of recording the payment twice.
function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Small screens show each row of a `table.stack-table` as a card (see
// style.css). Each cell gets its column header as `data-label`, kept in
// sync whenever a list re-renders, so no template has to repeat headers.
function labelStackTable(table) {
  const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent.trim());
  table.querySelectorAll("tbody tr").forEach((row) => {
    Array.from(row.children).forEach((cell, index) => {
      if (!cell.hasAttribute("colspan") && headers[index]) cell.setAttribute("data-label", headers[index]);
    });
  });
}

(function watchStackTables() {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
  const start = () => {
    document.querySelectorAll("table.stack-table").forEach((table) => {
      labelStackTable(table);
      new MutationObserver(() => labelStackTable(table)).observe(table.querySelector("tbody") || table, { childList: true });
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
