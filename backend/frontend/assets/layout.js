function renderHeader(user, activePage) {
  const header = document.getElementById("app-header");
  if (!header) return;

  const links = [
    { href: "/admin-dashboard.html", label: "لوحة التحكم", key: "dashboard" },
    { href: "/request.html", label: "طلب جديد", key: "request" },
  ];

  const navHtml = links
    .map(
      (link) =>
        `<a href="${link.href}" class="${link.key === activePage ? "active" : ""}">${link.label}</a>`
    )
    .join("");

  header.innerHTML = `
    <h1>نسائم الحرمين</h1>
    <nav>
      ${navHtml}
      <div class="notif-wrap">
        <button type="button" id="notif-btn">🔔<span class="notif-badge hidden" id="notif-badge">0</span></button>
        <div class="notif-dropdown hidden" id="notif-dropdown"></div>
      </div>
      <span class="user-chip">${user.fullName} · ${user.employeeNo}</span>
      <button type="button" id="logout-btn">تسجيل الخروج</button>
    </nav>
  `;

  document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      // Ignore — redirect regardless, the cookie clears client-side either way.
    }
    window.location.href = "/login.html";
  });

  wireNotificationBell();
}

async function wireNotificationBell() {
  const btn = document.getElementById("notif-btn");
  const dropdown = document.getElementById("notif-dropdown");
  const badge = document.getElementById("notif-badge");

  async function refreshBadge() {
    try {
      const { meta } = await api.get("/notifications?limit=1");
      const unread = meta.unreadCount || 0;
      badge.textContent = unread > 9 ? "9+" : String(unread);
      badge.classList.toggle("hidden", unread === 0);
    } catch (error) {
      // Non-critical — leave the badge as-is.
    }
  }

  async function loadDropdown() {
    dropdown.innerHTML = '<p class="muted" style="padding: 10px">جارٍ التحميل...</p>';
    try {
      const { data } = await api.get("/notifications?limit=10");
      if (data.length === 0) {
        dropdown.innerHTML = '<p class="muted" style="padding: 10px">لا توجد إشعارات</p>';
        return;
      }
      dropdown.innerHTML = data
        .map(
          (n) => `
          <div class="notif-item ${n.readAt ? "" : "unread"}" data-notif-id="${n.id}">
            <strong>${n.title}</strong>
            <p>${n.message}</p>
            <span class="muted">${formatDate(n.createdAt)}</span>
          </div>`
        )
        .join("");
    } catch (error) {
      dropdown.innerHTML = `<p class="muted" style="padding: 10px">${error.message}</p>`;
    }
  }

  btn.addEventListener("click", async () => {
    const willOpen = dropdown.classList.contains("hidden");
    dropdown.classList.toggle("hidden", !willOpen);
    if (willOpen) await loadDropdown();
  });

  dropdown.addEventListener("click", async (e) => {
    const item = e.target.closest("[data-notif-id]");
    if (!item || !item.classList.contains("unread")) return;
    try {
      await api.patch(`/notifications/${item.dataset.notifId}/read`);
      item.classList.remove("unread");
      refreshBadge();
    } catch (error) {
      // Ignore — item stays marked unread, user can retry.
    }
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.classList.add("hidden");
    }
  });

  refreshBadge();
}
