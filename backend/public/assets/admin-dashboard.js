let currentUser = null;
const pageAlert = document.getElementById("page-alert");

const state = {
  orders: { page: 1, limit: 10, status: "" },
  customers: { page: 1, limit: 10, search: "" },
  payments: { page: 1, limit: 10 },
};

function el(id) {
  return document.getElementById(id);
}

const ORDER_STATUSES = [
  "NEW",
  "UNDER_REVIEW",
  "WAITING_DOCUMENTS",
  "PAYMENT_PENDING",
  "PROCESSING",
  "APPROVED",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];

async function bootstrap() {
  currentUser = await requireSession();
  if (!currentUser) return;

  renderHeader(currentUser, "dashboard");
  setupTabVisibility();
  setupTabSwitching();

  loadActiveTabData();
}

function canSeeOverview() {
  return ["SUPER_ADMIN", "ADMIN"].includes(currentUser.role);
}

function canSeePayments() {
  return ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"].includes(currentUser.role);
}

function canRecordPayment() {
  return ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"].includes(currentUser.role);
}

// Platform 3.0 Phase 15: CONTENT_MANAGER can reach Management (the
// Configuration Center panels live there) — mgmtCanWrite() and the
// backend's own requireRole checks are what actually keep this role off
// financial/operational sub-tabs, not this gate.
function canSeeManagement() {
  return ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"].includes(currentUser.role);
}

function setupTabVisibility() {
  const tabButtons = document.querySelectorAll("#tabs button");

  if (!canSeeOverview()) {
    document.querySelector('[data-tab="overview"]').classList.add("hidden");
  }
  if (!canSeePayments()) {
    document.querySelector('[data-tab="payments"]').classList.add("hidden");
  }
  if (!canSeeManagement()) {
    document.querySelector('[data-tab="management"]').classList.add("hidden");
  }

  // CONTENT_MANAGER has no access to Orders (the next tab in DOM order
  // once Overview is hidden) — land on Management, the only top-level
  // tab this role can actually use, instead of a tab that just 403s.
  const defaultTab = currentUser.role === "CONTENT_MANAGER" ? "management" : null;
  const firstVisible =
    (defaultTab && document.querySelector(`[data-tab="${defaultTab}"]`)) ||
    Array.from(tabButtons).find((btn) => !btn.classList.contains("hidden"));
  if (firstVisible) {
    activateTab(firstVisible.dataset.tab);
  }
}

function setupTabSwitching() {
  document.querySelectorAll("#tabs button").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });

  el("order-status-filter").addEventListener("change", (e) => {
    state.orders.status = e.target.value;
    state.orders.page = 1;
    loadOrders();
  });

  let searchTimer = null;
  el("customer-search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.customers.search = e.target.value.trim();
      state.customers.page = 1;
      loadCustomers();
    }, 350);
  });

  el("orders-body").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-order-id]");
    if (btn) openOrderDetail(btn.dataset.orderId);
  });
}

function activateTab(tabKey) {
  document.querySelectorAll("#tabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabKey);
  });
  ["overview", "orders", "customers", "payments", "management"].forEach((key) => {
    el(`tab-${key}`).classList.toggle("hidden", key !== tabKey);
  });
  loadActiveTabData();
}

function activeTabKey() {
  const active = document.querySelector("#tabs button.active");
  return active ? active.dataset.tab : "overview";
}

function loadActiveTabData() {
  const tab = activeTabKey();
  if (tab === "overview" && canSeeOverview()) loadOverview();
  if (tab === "orders") loadOrders();
  if (tab === "customers") loadCustomers();
  if (tab === "payments" && canSeePayments()) loadPayments();
  if (tab === "management" && canSeeManagement()) initManagementTab();
}

// --- Overview ---

async function loadOverview() {
  try {
    const { data } = await api.get("/dashboard/stats");
    el("stat-tiles").innerHTML = [
      ["orders", "الطلبات"],
      ["customers", "العملاء"],
      ["payments", "الدفعات"],
      ["documents", "المستندات"],
      ["offers", "العروض"],
      ["users", "المستخدمون"],
    ]
      .map(([key, label]) => `
        <div class="stat-tile">
          <div class="value">${data[key]}</div>
          <div class="label">${label}</div>
        </div>
      `)
      .join("");

    el("latest-orders-body").innerHTML = data.latestOrders
      .map(
        (order) => `
        <tr>
          <td>${order.orderNumber}</td>
          <td>${order.customer?.fullName || "-"}</td>
          <td>${statusBadge(order.status)}</td>
          <td>${formatMoney(order.totalAmount, order.currency)}</td>
          <td>${formatDate(order.createdAt)}</td>
        </tr>`
      )
      .join("");
  } catch (error) {
    showAlert(pageAlert, error.message);
  }
}

// --- Orders ---

async function loadOrders() {
  try {
    const { orders } = state;
    const params = new URLSearchParams({ page: orders.page, limit: orders.limit });
    if (orders.status) params.set("status", orders.status);

    const { data, meta } = await api.get(`/orders?${params.toString()}`);

    el("orders-body").innerHTML = data
      .map(
        (order) => `
        <tr>
          <td>${order.orderNumber}</td>
          <td>${order.customer?.fullName || "-"}</td>
          <td>${statusBadge(order.status)}</td>
          <td>${statusBadge(order.paymentStatus)}</td>
          <td>${formatMoney(order.totalAmount, order.currency)}</td>
          <td><button type="button" class="btn secondary" data-order-id="${order.id}">عرض</button></td>
        </tr>`
      )
      .join("");

    renderPagination("orders-pagination", meta, (page) => {
      state.orders.page = page;
      loadOrders();
    });
  } catch (error) {
    showAlert(pageAlert, error.message);
  }
}

async function openOrderDetail(orderId) {
  const card = el("order-detail-card");
  card.classList.remove("hidden");
  card.innerHTML = "<p>جارٍ التحميل...</p>";
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });

  try {
    const { data: order } = await api.get(`/orders/${orderId}`);
    renderOrderDetail(order);
  } catch (error) {
    card.innerHTML = `<div class="alert error">${error.message}</div>`;
  }
}

function renderOrderDetail(order) {
  const card = el("order-detail-card");

  const itemsRows = order.items
    .map(
      (item) => `
      <tr>
        <td>${item.service?.name || item.serviceId}</td>
        <td>${item.quantity}</td>
        <td>${formatMoney(item.unitPrice, order.currency)}</td>
        <td>${formatMoney(item.total, order.currency)}</td>
      </tr>`
    )
    .join("");

  const paymentsRows = order.payments
    .map(
      (p) => `<tr><td>${formatMoney(p.amount, p.currency)}</td><td>${p.paymentMethod}</td><td>${statusBadge(p.status)}</td><td>${formatDate(p.createdAt)}</td></tr>`
    )
    .join("");

  const historyItems = order.history
    .map((h) => `<li>${formatDate(h.changedAt)} — ${statusBadge(h.oldStatus)} → ${statusBadge(h.newStatus)} ${h.notes ? "(" + h.notes + ")" : ""}</li>`)
    .join("");

  const statusOptions = ORDER_STATUSES.map(
    (status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${STATUS_LABELS_AR[status]}</option>`
  ).join("");

  card.innerHTML = `
    <h2>الطلب ${order.orderNumber} <button type="button" class="btn secondary" id="close-detail-btn" style="float: left">إغلاق</button></h2>
    <p>العميل: <strong>${order.customer?.fullName || "-"}</strong> (${order.customer?.customerNo || "-"})</p>
    <p>الحالة الحالية: ${statusBadge(order.status)} — حالة الدفع: ${statusBadge(order.paymentStatus)} — الإجمالي: ${formatMoney(order.totalAmount, order.currency)}</p>

    <h3>عناصر الطلب</h3>
    <table>
      <thead><tr><th>الخدمة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
      <tbody>${itemsRows || '<tr><td colspan="4">لا توجد عناصر</td></tr>'}</tbody>
    </table>

    <h3>تغيير الحالة</h3>
    <div class="stack">
      <select id="new-status-select">${statusOptions}</select>
      <input type="text" id="status-notes" placeholder="ملاحظة (اختياري)" style="max-width: 240px" />
      <button type="button" class="btn" id="change-status-btn">تحديث الحالة</button>
    </div>
    <div id="status-alert"></div>

    <h3>الدفعات</h3>
    <table>
      <thead><tr><th>المبلغ</th><th>الطريقة</th><th>الحالة</th><th>التاريخ</th></tr></thead>
      <tbody>${paymentsRows || '<tr><td colspan="4">لا توجد دفعات</td></tr>'}</tbody>
    </table>

    ${canRecordPayment() ? `
    <div class="stack">
      <input type="number" id="payment-amount" placeholder="المبلغ" min="0" step="0.01" style="max-width: 140px" />
      <input type="text" id="payment-method" placeholder="طريقة الدفع (نقدي...)" style="max-width: 160px" />
      <select id="payment-status">
        <option value="PAID">مدفوع</option>
        <option value="PARTIAL">جزئي</option>
        <option value="REFUNDED">مسترجع</option>
      </select>
      <button type="button" class="btn secondary" id="add-payment-btn">تسجيل دفعة</button>
    </div>
    <div id="payment-alert"></div>
    ` : ""}

    <h3>سجل الحالات</h3>
    <ul class="doc-checklist">${historyItems || "<li>لا يوجد سجل</li>"}</ul>
  `;

  el("close-detail-btn").addEventListener("click", () => {
    card.classList.add("hidden");
    card.innerHTML = "";
  });

  el("change-status-btn").addEventListener("click", () => changeOrderStatus(order.id));

  if (canRecordPayment()) {
    el("add-payment-btn").addEventListener("click", () => recordPayment(order.id));
  }
}

async function changeOrderStatus(orderId) {
  const statusAlert = el("status-alert");
  showAlert(statusAlert, "");

  try {
    await api.patch(`/orders/${orderId}/status`, {
      status: el("new-status-select").value,
      notes: el("status-notes").value.trim() || undefined,
    });
    await openOrderDetail(orderId);
    loadOrders();
  } catch (error) {
    showAlert(statusAlert, error.message);
  }
}

async function recordPayment(orderId) {
  const paymentAlert = el("payment-alert");
  showAlert(paymentAlert, "");

  const amount = el("payment-amount").value;
  const method = el("payment-method").value.trim();

  if (!amount || !method) {
    showAlert(paymentAlert, "يرجى إدخال المبلغ وطريقة الدفع.");
    return;
  }

  try {
    await api.post("/payments", {
      orderId,
      amount: Number(amount),
      paymentMethod: method,
      status: el("payment-status").value,
    });
    await openOrderDetail(orderId);
    loadOrders();
  } catch (error) {
    showAlert(paymentAlert, error.message);
  }
}

// --- Customers ---

async function loadCustomers() {
  try {
    const { customers } = state;
    const params = new URLSearchParams({ page: customers.page, limit: customers.limit });
    if (customers.search) params.set("search", customers.search);

    const { data, meta } = await api.get(`/customers?${params.toString()}`);

    el("customers-body").innerHTML = data
      .map(
        (c) => `
        <tr>
          <td>${c.customerNo}</td>
          <td>${c.fullName}</td>
          <td>${c.passportNo}</td>
          <td>${c.nationality}</td>
          <td>${c.phone || "-"}</td>
        </tr>`
      )
      .join("");

    renderPagination("customers-pagination", meta, (page) => {
      state.customers.page = page;
      loadCustomers();
    });
  } catch (error) {
    showAlert(pageAlert, error.message);
  }
}

// --- Payments ---

async function loadPayments() {
  try {
    const { payments } = state;
    const params = new URLSearchParams({ page: payments.page, limit: payments.limit });

    const { data, meta } = await api.get(`/payments?${params.toString()}`);

    el("payments-body").innerHTML = data
      .map(
        (p) => `
        <tr>
          <td>${p.order?.orderNumber || "-"}</td>
          <td>${p.order?.customer?.fullName || "-"}</td>
          <td>${formatMoney(p.amount, p.currency)}</td>
          <td>${p.paymentMethod}</td>
          <td>${statusBadge(p.status)}</td>
          <td>${formatDate(p.createdAt)}</td>
        </tr>`
      )
      .join("");

    renderPagination("payments-pagination", meta, (page) => {
      state.payments.page = page;
      loadPayments();
    });
  } catch (error) {
    showAlert(pageAlert, error.message);
  }
}

// --- Shared pagination renderer ---

function renderPagination(containerId, meta, onPageChange) {
  const container = el(containerId);
  if (!meta || meta.totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <button type="button" id="${containerId}-prev" ${meta.page <= 1 ? "disabled" : ""}>السابق</button>
    <span>صفحة ${meta.page} من ${meta.totalPages} (${meta.total} سجل)</span>
    <button type="button" id="${containerId}-next" ${meta.page >= meta.totalPages ? "disabled" : ""}>التالي</button>
  `;

  const prevBtn = el(`${containerId}-prev`);
  const nextBtn = el(`${containerId}-next`);
  if (prevBtn) prevBtn.addEventListener("click", () => onPageChange(meta.page - 1));
  if (nextBtn) nextBtn.addEventListener("click", () => onPageChange(meta.page + 1));
}

bootstrap();
