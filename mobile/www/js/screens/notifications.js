import { api } from "../api.js";
import { esc, skeletonList, emptyState, errorState } from "../ui.js";
import { icon } from "../icons.js";
import { go } from "../router.js";
import { notificationTarget, notificationTimeAgo } from "../notification-core.js";

export async function renderNotificationsScreen({ bodyEl }) {
  bodyEl.innerHTML = `<div class="list" id="notificationsList">${skeletonList(4)}</div>`;
  const listEl = bodyEl.querySelector("#notificationsList");

  async function load() {
    try {
      const res = await api("/customer/notifications?limit=50");
      const items = res.data || [];
      const byId = new Map(items.map((item) => [String(item.id), item]));
      if (!items.length) {
        listEl.innerHTML = emptyState({ icon: "bell", title: "أنت على اطلاع", hint: "لا توجد تحديثات جديدة الآن. ستظهر هنا تغييرات الطلب والدفع والتسليم." });
        return;
      }
      listEl.innerHTML = items.map((notification) => `
        <button class="list-item notification-row ${notification.readAt ? "" : "unread"}" data-id="${esc(notification.id)}" data-order-id="${esc(notification.orderId || "")}" data-request-id="${esc(notification.contactRequestId || "")}">
          <div class="list-item-icon">${icon("bell", { size: 18 })}</div>
          <div class="list-item-body">
            <strong>${esc(notification.title)}</strong>
            <p>${esc(notification.message)}</p>
            <small>${notificationTimeAgo(notification.createdAt)}</small>
          </div>
          ${notification.readAt ? "" : '<span class="unread-dot"></span>'}
        </button>`).join("");
      listEl.querySelectorAll(".notification-row").forEach((row) => {
        row.addEventListener("click", () => {
          const notification = byId.get(row.dataset.id);
          const target = notificationTarget(notification);
          // Opening the correct request is the customer's primary action.
          // Marking as read is best-effort; slow/offline acknowledgement must
          // never prevent navigation, and stays on the authenticated API.
          if (!notification?.readAt) {
            row.classList.remove("unread");
            row.querySelector(".unread-dot")?.remove();
            api(`/customer/notifications/${encodeURIComponent(row.dataset.id)}/read`, { method: "PATCH" })
              .catch(() => { /* unread state resyncs on next visit */ });
          }
          if (target) {
            go(target.screen, target.params, { title: "تفاصيل الطلب", tab: "requests" });
          } else {
            load();
          }
        });
      });
    } catch (error) {
      listEl.innerHTML = errorState(error.message, { onRetry: load, title: "تعذر تحديث الإشعارات", hint: "يمكنك متابعة طلباتك مباشرة من تبويب متابعة." });
    }
  }

  await load();
}
