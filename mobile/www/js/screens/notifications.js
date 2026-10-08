import { api } from "../api.js";
import { esc, skeletonList, emptyState, errorState, toast } from "../ui.js";
import { icon } from "../icons.js";
import { go } from "../router.js";

function timeAgo(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

export async function renderNotificationsScreen({ bodyEl }) {
  bodyEl.innerHTML = `<div class="list" id="notificationsList">${skeletonList(4)}</div>`;
  const listEl = bodyEl.querySelector("#notificationsList");

  async function load() {
    try {
      const res = await api("/customer/notifications?limit=50");
      const items = res.data || [];
      if (!items.length) {
        listEl.innerHTML = emptyState({ icon: "bell", title: "لا توجد إشعارات جديدة" });
        return;
      }
      listEl.innerHTML = items.map((notification) => `
        <button class="list-item notification-row ${notification.readAt ? "" : "unread"}" data-id="${esc(notification.id)}" data-order-id="${esc(notification.orderId || "")}" data-request-id="${esc(notification.contactRequestId || "")}">
          <div class="list-item-icon">${icon("bell", { size: 18 })}</div>
          <div class="list-item-body">
            <strong>${esc(notification.title)}</strong>
            <p>${esc(notification.message)}</p>
            <small>${timeAgo(notification.createdAt)}</small>
          </div>
          ${notification.readAt ? "" : '<span class="unread-dot"></span>'}
        </button>`).join("");
      listEl.querySelectorAll(".notification-row").forEach((row) => {
        row.addEventListener("click", async () => {
          try {
            await api(`/customer/notifications/${row.dataset.id}/read`, { method: "PATCH" });
          } catch (error) {
            toast(error.message, { tone: "error" });
          }
          if (row.dataset.requestId) {
            go("requestDetail", { requestId: row.dataset.requestId }, { title: "تفاصيل الطلب", tab: "notifications" });
          } else if (row.dataset.orderId) {
            go("orderDetail", { orderId: row.dataset.orderId }, { title: "تفاصيل الطلب", tab: "notifications" });
          } else {
            load();
          }
        });
      });
    } catch (error) {
      listEl.innerHTML = errorState(error.message, { onRetry: load });
    }
  }

  await load();
}
