import { icon } from "./icons.js";

let toastTimer = null;

export function toast(message, { tone = "default" } = {}) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.dataset.tone = tone;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (match) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[match]));
}

export function money(amount, currency = "SAR") {
  const n = Number(amount);
  if (!(n > 0)) return "";
  return `${new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n)} ${currency}`;
}

export function skeletonGrid(count = 4) {
  return Array.from({ length: count }, () => '<div class="skeleton-card"></div>').join("");
}

export function skeletonList(count = 3) {
  return Array.from({ length: count }, () => '<div class="skeleton-row"></div>').join("");
}

export function emptyState({ icon: iconName = "inbox", title, hint = "", action = "" } = {}) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon(iconName, { size: 26 })}</div>
      <strong>${esc(title)}</strong>
      ${hint ? `<p>${esc(hint)}</p>` : ""}
      ${action}
    </div>
  `;
}

export function errorState(message, { onRetry } = {}) {
  const id = `retry-${Math.random().toString(36).slice(2, 8)}`;
  if (onRetry) {
    queueMicrotask(() => {
      document.getElementById(id)?.addEventListener("click", onRetry);
    });
  }
  return `
    <div class="empty-state empty-state-error">
      <div class="empty-state-icon">${icon("alert", { size: 26 })}</div>
      <strong>تعذر تحميل البيانات</strong>
      <p>${esc(message)}</p>
      ${onRetry ? `<button id="${id}" class="secondary">إعادة المحاولة</button>` : ""}
    </div>
  `;
}

export function fieldError(message) {
  return message ? `<span class="field-error">${esc(message)}</span>` : "";
}

export function setLoading(button, loading, label) {
  if (!button) return;
  button.disabled = loading;
  button.dataset.loading = loading ? "1" : "0";
  if (loading) {
    button.dataset.originalText = button.dataset.originalText || button.textContent;
    button.textContent = label || "جارٍ المعالجة…";
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
  }
}

export function confirmDialog(message) {
  return window.confirm(message);
}

export function offlineBanner(show) {
  const el = document.getElementById("offlineBanner");
  if (!el) return;
  el.classList.toggle("show", Boolean(show));
}
