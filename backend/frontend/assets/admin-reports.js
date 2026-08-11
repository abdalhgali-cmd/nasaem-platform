// Kept as its own file, separate from admin-dashboard.js/admin-management.js
// (both already large) — but it still shares the same non-module global
// script scope as those two, so any new name here must be grepped across
// all three files first, same as every other addition to this dashboard.

function canSeeReports() {
  return ["SUPER_ADMIN", "ADMIN"].includes(currentUser.role);
}

async function loadReports() {
  try {
    const params = new URLSearchParams();
    const from = el("reports-from").value;
    const to = el("reports-to").value;
    const department = el("reports-department-filter").value;
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (department) params.set("department", department);

    const { data } = await api.get(`/reports/summary?${params.toString()}`);

    const statusTiles = Object.entries(CONTACT_REQUEST_STATUS_LABELS_AR)
      .map(
        ([key, label]) =>
          `<div class="stat-tile"><div class="value">${data.byStatus[key] || 0}</div><div class="label">${label}</div></div>`
      )
      .join("");
    const revenueTiles = Object.entries(data.revenueByCurrency)
      .map(
        ([currency, amount]) =>
          `<div class="stat-tile"><div class="value">${formatMoney(amount, currency)}</div><div class="label">إيرادات ${CURRENCY_LABELS_AR[currency] || currency}</div></div>`
      )
      .join("");

    el("reports-stat-tiles").innerHTML =
      `<div class="stat-tile"><div class="value">${data.total}</div><div class="label">إجمالي الطلبات</div></div>` +
      statusTiles +
      revenueTiles;

    el("reports-department-body").innerHTML = Object.entries(data.byDepartment)
      .map(([key, row]) => {
        const label = key === "UNASSIGNED" ? "غير محدد" : DEPARTMENT_LABELS_AR[key] || key;
        const revenue =
          Object.entries(row.revenue)
            .map(([currency, amount]) => formatMoney(amount, currency))
            .join(" + ") || "-";
        return `<tr><td>${label}</td><td>${row.count}</td><td>${revenue}</td></tr>`;
      })
      .join("");
  } catch (error) {
    showAlert(pageAlert, error.message);
  }
}
