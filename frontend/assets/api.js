const API_BASE = "/api";

class ApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

async function apiRequest(path, options = {}) {
  const { body, headers, ...rest } = options;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const response = await fetch(API_BASE + path, {
    credentials: "include",
    headers: isFormData
      ? headers
      : { "Content-Type": "application/json", ...(headers || {}) },
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    ...rest,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.message || `الطلب فشل (${response.status})`,
      response.status,
      payload?.errors
    );
  }

  return payload;
}

const api = {
  get: (path) => apiRequest(path, { method: "GET" }),
  post: (path, body) => apiRequest(path, { method: "POST", body }),
  patch: (path, body) => apiRequest(path, { method: "PATCH", body }),
  delete: (path) => apiRequest(path, { method: "DELETE" }),
  upload: (path, formData) => apiRequest(path, { method: "POST", body: formData }),
};

// Redirects to the login page unless there is an active session, and
// returns the current user otherwise. Every authenticated page calls this
// first so an expired/missing session lands back on login.html instead of
// silently failing every subsequent API call.
async function requireSession() {
  try {
    const { data } = await api.get("/auth/me");
    return data;
  } catch (error) {
    window.location.href = "/login.html";
    return null;
  }
}

function formatErrors(errors) {
  if (!errors) return "";
  const fieldErrors = errors.fieldErrors || {};
  const messages = Object.values(fieldErrors).flat();
  return messages.join("، ");
}

function showAlert(container, message, type = "error") {
  container.innerHTML = "";
  if (!message) return;
  const el = document.createElement("div");
  el.className = `alert ${type}`;
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
};

function statusBadge(status) {
  const label = STATUS_LABELS_AR[status] || status;
  return `<span class="badge status-${status}">${label}</span>`;
}

function formatMoney(amount, currency) {
  const value = Number(amount || 0);
  return `${value.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ${currency || ""}`;
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
