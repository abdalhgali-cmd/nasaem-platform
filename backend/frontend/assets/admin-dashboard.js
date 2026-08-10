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

const DOCUMENT_TYPE_LABELS_AR = {
  PASSPORT: "جواز سفر",
  PHOTO: "صورة شخصية",
  VISA: "تأشيرة",
  TICKET: "تذكرة",
  RECEIPT: "إيصال",
  OTHER: "أخرى",
};

async function bootstrap() {
  currentUser = await requireSession();
  if (!currentUser) return;

  renderHeader(currentUser, "dashboard");
  setupTabVisibility();
  setupTabSwitching();
  el("customer-create-card").classList.toggle("hidden", !canCreateCustomer());
  el("customer-create-btn").addEventListener("click", createCustomerAccount);

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

// Mirrors PATCH /orders/:id/assign's requireRole("SUPER_ADMIN", "ADMIN").
function canAssignOrder() {
  return ["SUPER_ADMIN", "ADMIN"].includes(currentUser.role);
}

function canSeeManagement() {
  return ["SUPER_ADMIN", "ADMIN"].includes(currentUser.role);
}

// Mirrors POST /customers's requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE")
// — ACCOUNTANT can view the customers list but not create new ones.
function canCreateCustomer() {
  return ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"].includes(currentUser.role);
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

  const firstVisible = Array.from(tabButtons).find((btn) => !btn.classList.contains("hidden"));
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
    const moneyTiles = [
      ["totalRevenue", "الإيرادات المحصّلة"],
      ["outstandingBalance", "المبالغ المتبقية"],
    ]
      .map(([key, label]) => `
        <div class="stat-tile">
          <div class="value">${formatMoney(data[key], "SAR")}</div>
          <div class="label">${label}</div>
        </div>
      `)
      .join("");

    const countTiles = [
      ["orders", "الطلبات"],
      ["customers", "العملاء"],
      ["payments", "عدد عمليات الدفع"],
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

    el("stat-tiles").innerHTML = moneyTiles + countTiles;

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
    const [{ data: order }, staff] = await Promise.all([
      api.get(`/orders/${orderId}`),
      canAssignOrder() ? api.get("/users").then((res) => res.data) : Promise.resolve([]),
    ]);
    renderOrderDetail(order, staff);
  } catch (error) {
    card.innerHTML = `<div class="alert error">${error.message}</div>`;
  }
}

function renderOrderDetail(order, staff = []) {
  const card = el("order-detail-card");

  const assignmentOptions = [`<option value="">غير معيّن</option>`]
    .concat(
      staff.map(
        (u) => `<option value="${u.id}" ${u.id === order.assignedUserId ? "selected" : ""}>${u.fullName}</option>`
      )
    )
    .join("");

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

  const documentsRows = (order.documents || [])
    .map(
      (doc) => `
      <tr>
        <td>${DOCUMENT_TYPE_LABELS_AR[doc.type] || doc.type}</td>
        <td>${doc.fileName}</td>
        <td>${formatDate(doc.createdAt)}</td>
        <td><a href="${API_BASE}/documents/${doc.id}/file" download>تحميل</a></td>
      </tr>`
    )
    .join("");

  const statusOptions = ORDER_STATUSES.map(
    (status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${STATUS_LABELS_AR[status]}</option>`
  ).join("");

  card.innerHTML = `
    <h2>الطلب ${order.orderNumber} <button type="button" class="btn secondary" id="close-detail-btn" style="float: left">إغلاق</button></h2>
    <p>العميل: <strong>${order.customer?.fullName || "-"}</strong> (${order.customer?.customerNo || "-"})</p>
    <p>الحالة الحالية: ${statusBadge(order.status)} — حالة الدفع: ${statusBadge(order.paymentStatus)} — الإجمالي: ${formatMoney(order.totalAmount, order.currency)}</p>
    <p>الموظف المسؤول: <strong>${order.assignedUser?.fullName || "غير معيّن"}</strong></p>

    ${
      canAssignOrder()
        ? `
    <h3>إسناد الطلب</h3>
    <div class="stack">
      <select id="assign-user-select">${assignmentOptions}</select>
      <button type="button" class="btn secondary" id="assign-order-btn">حفظ الإسناد</button>
    </div>
    <div id="assign-alert"></div>
    `
        : ""
    }

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

    <h3>المستندات</h3>
    <table>
      <thead><tr><th>النوع</th><th>اسم الملف</th><th>تاريخ الرفع</th><th></th></tr></thead>
      <tbody>${documentsRows || '<tr><td colspan="4">لا توجد مستندات</td></tr>'}</tbody>
    </table>

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

  if (canAssignOrder()) {
    el("assign-order-btn").addEventListener("click", () => assignOrderToUser(order.id));
  }
}

async function assignOrderToUser(orderId) {
  const assignAlert = el("assign-alert");
  showAlert(assignAlert, "");
  const assignedUserId = el("assign-user-select").value || null;

  try {
    await api.patch(`/orders/${orderId}/assign`, { assignedUserId });
    await openOrderDetail(orderId);
  } catch (error) {
    showAlert(assignAlert, error.message);
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

async function createCustomerAccount() {
  showAlert(pageAlert, "");
  const fullName = el("c-fullName").value.trim();
  const passportNo = el("c-passportNo").value.trim();
  const nationality = el("c-nationality").value.trim();
  const phone = el("c-phone").value.trim();
  const email = el("c-email").value.trim();

  if (!fullName || !passportNo || !nationality) {
    return showAlert(pageAlert, "الاسم ورقم الجواز والجنسية مطلوبة.");
  }

  try {
    await api.post("/customers", { fullName, passportNo, nationality, phone, email });
    el("c-fullName").value = "";
    el("c-passportNo").value = "";
    el("c-nationality").value = "";
    el("c-phone").value = "";
    el("c-email").value = "";
    loadCustomers();
  } catch (error) {
    showAlert(pageAlert, error.message + (error.errors ? " — " + formatErrors(error.errors) : ""));
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
