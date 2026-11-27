// Pure notification display / target rules shared by UI and unit tests.
// Never derive URLs from message text: use only server-provided owned resource IDs.
export function notificationTarget(notification) {
  const requestId = String(notification?.contactRequestId || "").trim();
  if (requestId) return { screen: "requestDetail", params: { requestId } };
  const orderId = String(notification?.orderId || "").trim();
  if (orderId) return { screen: "orderDetail", params: { orderId } };
  return null;
}

export function notificationTimeAgo(value, nowMs = Date.now()) {
  const timeMs = new Date(value).getTime();
  if (!Number.isFinite(timeMs)) return "";
  const minutes = Math.max(0, Math.floor((nowMs - timeMs) / 60000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return `منذ ${Math.floor(hours / 24)} يوم`;
}
