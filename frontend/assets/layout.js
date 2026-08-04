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
}
