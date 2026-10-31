export function requestListState(request = {}) {
  const progress = request.progress || {};
  return {
    status: progress.label || request.statusLabel || request.nextAction || "بانتظار التحديث",
    nextAction: request.nextAction || progress.currentStep?.status || "لا يوجد إجراء مطلوب منك الآن.",
    updatedAt: request.latestUpdateAt || request.updatedAt || request.createdAt || null,
  };
}

export function formatRequestUpdatedAt(value, locale = "ar-SD") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
