// Which backend this build talks to, for testers only. The release build is
// produced by the release workflow with environment "production", and the
// customer never sees a badge there: only builds that point anywhere else
// (staging, local, e2e) show one.
export function environmentBadge(config) {
  const environment = String(config?.environment || "").trim().toLowerCase();
  if (environment === "production") return null;
  // Prices outside production are test data (owner decision 2026-11-01).
  return `بيئة اختبار: ${environment || "غير محددة"} — الأسعار تجريبية`;
}

export function showEnvironmentBadge(config, doc = globalThis.document) {
  const text = environmentBadge(config);
  if (!text || !doc?.body) return;
  const badge = doc.createElement("div");
  badge.className = "env-badge";
  badge.setAttribute("role", "status");
  badge.textContent = text;
  doc.body.appendChild(badge);
}
