let currentUser = null;
const pageAlert = document.getElementById("page-alert");

const state = {
  orders: { page: 1, limit: 10, status: "", search: "", assignee: "" },
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

// Which top-level tabs each role sees (docs/staff-role-matrix.md). It only
// hides what the backend would refuse anyway; the API stays authoritative.
const ROLE_TABS = {
  SUPER_ADMIN: ["overview", "requests", "orders", "flights", "customers", "payments", "management"],
  ADMIN: ["overview", "requests", "orders", "flights", "customers", "payments", "management"],
  EMPLOYEE: ["requests", "orders", "flights", "customers"],
  ACCOUNTANT: ["requests", "orders", "flights", "customers", "payments"],
  CONTENT_MANAGER: ["management"],
};
const TAB_KEYS = ["overview", "requests", "orders", "flights", "customers", "payments", "management"];

let crView = null;
let flightView = null;
let routeSyncing = false;

function allowedTabs() {
  return ROLE_TABS[currentUser.role] || [];
}

function canSeeOverview() {
  return allowedTabs().includes("overview");
}

function canSeePayments() {
  return allowedTabs().includes("payments");
}

function canRecordPayment() {
  return ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"].includes(currentUser.role);
}

function canSeeManagement() {
  return allowedTabs().includes("management");
}

function canAssignOrders() {
  return ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"].includes(currentUser.role);
}

async function bootstrap() {
  currentUser = await requireSession();
  if (!currentUser) return;

  renderHeader(currentUser, "dashboard");
  setupTabVisibility();
  setupTabSwitching();
  mountViews();
  applyRoute();
  window.addEventListener("hashchange", applyRoute);
}

function setupTabVisibility() {
  const allowed = new Set(allowedTabs());
  document.querySelectorAll("#tabs [data-tab]").forEach((btn) => {
    btn.classList.toggle("hidden", !allowed.has(btn.dataset.tab));
  });
  if (!["SUPER_ADMIN", "ADMIN", "EMPLOYEE"].includes(currentUser.role)) el("new-order-link")?.classList.add("hidden");
  if (!["SUPER_ADMIN", "ADMIN"].includes(currentUser.role)) el("flight-management-link")?.classList.add("hidden");
}

function mountViews() {
  if (allowedTabs().includes("requests")) {
    crView = createContactRequestsView({
      user: currentUser,
      listBody: el("cr-body"),
      pagination: el("cr-pagination"),
      filters: {
        search: el("cr-search"),
        status: el("cr-filter-status"),
        payment: el("cr-filter-payment"),
        assignee: el("cr-filter-assignee"),
        category: el("cr-filter-category"),
      },
      detailCard: el("cr-detail"),
      onOpen: (id) => setRoute("requests", id),
    });
    loadServiceCategories();
  }
  if (allowedTabs().includes("flights")) {
    flightView = createFlightBookingsView({
      user: currentUser,
      listBody: el("flight-bookings-body"),
      statusFilter: el("flight-status-filter"),
      searchInput: el("flight-search"),
      detailCard: el("flight-booking-detail"),
      onOpen: (id) => setRoute("flights", id),
    });
  }
}

async function loadServiceCategories() {
  try {
    const { data } = await api.get("/services?limit=100");
    const categories = [...new Map(data.filter((s) => s.category).map((s) => [s.category, s.name])).entries()];
    el("cr-filter-category").insertAdjacentHTML(
      "beforeend",
      categories.map(([category, name]) => `<option value="${escapeHtml(category)}">${escapeHtml(SERVICE_CATEGORY_AR[category] || name || category)}</option>`).join("")
    );
  } catch (error) {
    // The filter is optional; the list still works without it.
  }
}

const SERVICE_CATEGORY_AR = {
  umrah: "عمرة",
  UMRAH: "عمرة",
  UMRAH_PACKAGE: "باقات العمرة",
  intl_visa: "تأشيرات دولية",
  work_visa: "تأشيرات عمل",
  egypt_clearance: "موافقة أمنية (مصر)",
  family_visit: "زيارة عائلية",
  FAMILY_VISIT: "زيارة عائلية",
  flight: "طيران",
  hotel: "فنادق",
  ferry: "عبارات",
  package: "باقات",
  tasheel: "تسهيل",
};

// --- Routing: #/<tab> or #/<tab>/<record id> (orders, requests, flights).
// A link copied from the address bar opens the same record for a colleague.
function parseRoute() {
  const match = window.location.hash.match(/^#\/([a-z]+)(?:\/([^/?#]+))?/);
  if (!match) return { tab: null, id: null };
  return { tab: match[1], id: match[2] ? decodeURIComponent(match[2]) : null };
}

function setRoute(tab, id) {
  const hash = id ? `#/${tab}/${encodeURIComponent(id)}` : `#/${tab}`;
  if (window.location.hash !== hash) {
    routeSyncing = true;
    window.history.replaceState(null, "", hash);
    routeSyncing = false;
  }
}

function applyRoute() {
  if (routeSyncing) return;
  const { tab, id } = parseRoute();
  const allowed = allowedTabs();
  const target = tab && allowed.includes(tab) ? tab : allowed[0];
  if (!target) {
    showAlert(pageAlert, "لا توجد أقسام متاحة لدورك في هذه اللوحة.");
    return;
  }
  if (tab && !allowed.includes(tab)) {
    showAlert(pageAlert, "هذا القسم غير متاح لدورك.");
  }
  activateTab(target, { fromRoute: true });
  if (id && target === "orders") openOrderDetail(id);
  if (id && target === "requests" && crView) crView.openDetail(id);
  if (id && target === "flights" && flightView) flightView.openDetail(id);
}

function setupTabSwitching() {
  const tabs = Array.from(document.querySelectorAll("#tabs [data-tab]"));
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
    // Arrow keys move between visible tabs (WAI-ARIA tabs pattern; RTL:
    // ArrowLeft goes to the next tab).
    btn.addEventListener("keydown", (event) => {
      const visible = tabs.filter((t) => !t.classList.contains("hidden"));
      const index = visible.indexOf(btn);
      let next = null;
      if (event.key === "ArrowLeft") next = visible[(index + 1) % visible.length];
      if (event.key === "ArrowRight") next = visible[(index - 1 + visible.length) % visible.length];
      if (event.key === "Home") next = visible[0];
      if (event.key === "End") next = visible[visible.length - 1];
      if (next) {
        event.preventDefault();
        next.focus();
        activateTab(next.dataset.tab);
      }
    });
  });

  el("order-status-filter").addEventListener("change", (e) => {
    state.orders.status = e.target.value;
    state.orders.page = 1;
    loadOrders();
  });
  el("order-assignee-filter").addEventListener("change", (e) => {
    state.orders.assignee = e.target.value;
    state.orders.page = 1;
    loadOrders();
  });
  let orderSearchTimer = null;
  el("order-search").addEventListener("input", (e) => {
    clearTimeout(orderSearchTimer);
    orderSearchTimer = setTimeout(() => {
      state.orders.search = e.target.value.trim();
      state.orders.page = 1;
      loadOrders();
    }, 350);
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

  el("order-detail-card").addEventListener("click", (event) => {
    const retry = event.target.closest("[data-order-retry]");
    if (retry) openOrderDetail(retry.dataset.orderRetry);
  });

  for (const containerId of ["orders-body", "latest-orders-body"]) {
    el(containerId).addEventListener("click", (event) => {
      if (event.target.closest("[data-orders-retry]")) return void loadOrders();
      const target = event.target.closest("[data-order-id]");
      if (!target) return;
      if (activeTabKey() !== "orders") activateTab("orders");
      openOrderDetail(target.dataset.orderId);
    });
  }
}

function activateTab(tabKey, { fromRoute = false } = {}) {
  document.querySelectorAll("#tabs [data-tab]").forEach((btn) => {
    const active = btn.dataset.tab === tabKey;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
    btn.tabIndex = active ? 0 : -1;
  });
  TAB_KEYS.forEach((key) => {
    el(`tab-${key}`).classList.toggle("hidden", key !== tabKey);
  });
  if (!fromRoute) {
    const openId = tabKey === "orders" ? openOrderId : tabKey === "requests" ? crView?.openId : tabKey === "flights" ? flightView?.openId : null;
    setRoute(tabKey, openId || null);
  }
  loadActiveTabData();
}

function activeTabKey() {
  const active = document.querySelector("#tabs button.active");
  return active ? active.dataset.tab : null;
}

function loadActiveTabData() {
  const tab = activeTabKey();
  if (tab === "overview" && canSeeOverview()) loadOverview();
  if (tab === "requests" && crView) crView.load();
  if (tab === "orders") loadOrders();
  if (tab === "flights" && flightView) flightView.load();
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
          <div class="value">${escapeHtml(data[key])}</div>
          <div class="label">${escapeHtml(label)}</div>
        </div>
      `)
      .join("");

    el("latest-orders-body").innerHTML = data.latestOrders
      .map(
        (order) => `
        <tr data-order-id="${escapeHtml(order.id)}" style="cursor: pointer">
          <td><button type="button" class="btn secondary" data-order-id="${escapeHtml(order.id)}" aria-label="فتح الطلب ${escapeHtml(order.orderNumber)}">${escapeHtml(order.orderNumber)}</button></td>
          <td>${escapeHtml(order.customer?.fullName || "-")}</td>
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

let ordersSeq = 0;

async function loadOrders() {
  const seq = ++ordersSeq;
  const body = el("orders-body");
  body.innerHTML = '<tr><td colspan="6" class="muted">جارٍ التحميل...</td></tr>';
  try {
    const { orders } = state;
    const params = new URLSearchParams({ page: orders.page, limit: orders.limit });
    if (orders.status) params.set("status", orders.status);
    if (orders.search) params.set("search", orders.search);
    if (orders.assignee === "mine") params.set("assignedUserId", currentUser.id);
    else if (orders.assignee === "unassigned") params.set("assignedUserId", "UNASSIGNED");

    const { data, meta } = await api.get(`/orders?${params.toString()}`);
    if (seq !== ordersSeq) return;

    body.innerHTML = data.length
      ? data
          .map(
            (order) => `
        <tr data-order-id="${escapeHtml(order.id)}" class="clickable-row">
          <td><button type="button" class="link-button" data-order-id="${escapeHtml(order.id)}" aria-label="فتح الطلب ${escapeHtml(order.orderNumber)}" dir="ltr">${escapeHtml(order.orderNumber)}</button></td>
          <td>${escapeHtml(order.customer?.fullName || "-")}</td>
          <td>${statusBadge(order.status)}</td>
          <td>${statusBadge(order.paymentStatus)}</td>
          <td>${formatMoney(order.totalAmount, order.currency)}</td>
          <td>${escapeHtml(order.assignedUser?.fullName || "غير مُسند")}</td>
        </tr>`
          )
          .join("")
      : '<tr><td colspan="6" class="muted">لا توجد طلبات مطابقة.</td></tr>';

    renderPagination("orders-pagination", meta, (page) => {
      state.orders.page = page;
      loadOrders();
    });
  } catch (error) {
    if (seq !== ordersSeq) return;
    body.innerHTML = `<tr><td colspan="6"><div class="alert error" role="alert">${escapeHtml(error.message)} <button type="button" class="btn secondary" data-orders-retry="1">إعادة المحاولة</button></div></td></tr>`;
  }
}

// Detail requests are numbered so that a slow response for an order the
// user has already navigated away from never overwrites the newer one.
let orderDetailSeq = 0;
let openOrderId = null;

async function openOrderDetail(orderId, { focus = true } = {}) {
  const seq = ++orderDetailSeq;
  openOrderId = orderId;
  setRoute("orders", orderId);
  const card = el("order-detail-card");
  card.classList.remove("hidden");
  card.innerHTML = '<p class="muted">جارٍ تحميل الطلب...</p>';
  if (focus) card.scrollIntoView({ behavior: "smooth", block: "nearest" });

  try {
    const { data: order } = await api.get(`/orders/${encodeURIComponent(orderId)}`);
    if (seq !== orderDetailSeq) return;
    renderOrderDetail(order);
    if (focus) el("order-detail-title")?.focus();
  } catch (error) {
    if (seq !== orderDetailSeq) return;
    card.innerHTML = `<div class="alert error" role="alert">${escapeHtml(error.message)}</div>
      <button type="button" class="btn secondary" data-order-retry="${escapeHtml(orderId)}">إعادة المحاولة</button>`;
  }
}

function closeOrderDetail() {
  orderDetailSeq += 1;
  openOrderId = null;
  setRoute("orders", null);
  const card = el("order-detail-card");
  card.classList.add("hidden");
  card.innerHTML = "";
}

function canReviewPayments() {
  return ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"].includes(currentUser.role);
}

const PAYMENT_KIND_AR = { PAYMENT: "دفعة", REFUND: "استرجاع" };
const REVIEW_STATUS_AR = { PENDING: "بانتظار المراجعة", CONFIRMED: "مؤكدة", REJECTED: "مرفوضة" };

function paymentStateLabel(p) {
  if (p.reviewStatus) return REVIEW_STATUS_AR[p.reviewStatus] || p.reviewStatus;
  if (p.kind === "REFUND") return "مسترجع للعميل";
  if (p.status === "PAID") return "مستلمة";
  return STATUS_LABELS_AR[p.status] || p.status;
}

function settlementHtml(order) {
  const s = order.settlement;
  if (!s) return "";
  const excluded = (s.excludedForeignCurrency || []).length
    ? `<p class="alert error" role="alert">توجد ${s.excludedForeignCurrency.length} دفعة قديمة بعملة مختلفة عن عملة الطلب ولم تُحتسب في الرصيد. راجعها مع المحاسبة.</p>`
    : "";
  return `
    <dl class="detail-grid money-grid" aria-label="الوضع المالي للطلب">
      <div><dt>إجمالي الطلب</dt><dd>${formatMoney(s.total, s.currency)}</dd></div>
      <div><dt>المستلم المؤكد</dt><dd>${formatMoney(s.confirmedPaid, s.currency)}</dd></div>
      <div><dt>المسترجع</dt><dd>${formatMoney(s.refunded, s.currency)}</dd></div>
      <div><dt>صافي المدفوع</dt><dd>${formatMoney(s.netPaid, s.currency)}</dd></div>
      <div><dt>المتبقي</dt><dd>${formatMoney(s.outstanding, s.currency)}</dd></div>
      <div><dt>بانتظار المراجعة (غير محتسب)</dt><dd>${formatMoney(s.pending, s.currency)}</dd></div>
      <div><dt>حالة السداد</dt><dd>${statusBadge(s.status)}</dd></div>
    </dl>${excluded}`;
}

function paymentRowHtml(p, order) {
  const actions = [];
  if (canReviewPayments() && p.reviewStatus === "PENDING") {
    actions.push(`<button type="button" class="btn secondary" data-payment-confirm="${escapeHtml(p.id)}">تأكيد الاستلام</button>`);
    actions.push(`<button type="button" class="btn secondary" data-payment-reject="${escapeHtml(p.id)}">رفض</button>`);
  }
  if (canReviewPayments() && p.kind === "PAYMENT" && p.status === "PAID") {
    actions.push(`<button type="button" class="btn secondary" data-payment-refund="${escapeHtml(p.id)}">استرجاع</button>`);
  }
  const reason = p.refundReason || p.rejectionReason;
  return `<tr>
    <td>${escapeHtml(PAYMENT_KIND_AR[p.kind] || "دفعة")}</td>
    <td>${formatMoney(p.amount, p.currency)}${p.currency !== order.currency ? ' <span class="badge status-REJECTED">عملة مختلفة</span>' : ""}</td>
    <td>${escapeHtml(p.paymentMethod)}</td>
    <td><span class="badge">${escapeHtml(paymentStateLabel(p))}</span>${reason ? `<div class="muted small">${escapeHtml(reason)}</div>` : ""}</td>
    <td>${escapeHtml(p.createdBy?.fullName || p.reviewedBy?.fullName || "-")}</td>
    <td>${formatDateTime(p.paidAt || p.createdAt)}</td>
    <td>${actions.join(" ")}</td>
  </tr>`;
}

function renderOrderDetail(order) {
  const card = el("order-detail-card");

  const itemsRows = order.items
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.service?.name || item.serviceId)}</td>
        <td>${escapeHtml(item.quantity)}</td>
        <td>${formatMoney(item.unitPrice, order.currency)}</td>
        <td>${formatMoney(item.total, order.currency)}</td>
      </tr>`
    )
    .join("");

  const paymentsRows = order.payments.map((p) => paymentRowHtml(p, order)).join("");

  const historyItems = order.history
    .map((h) => `<li>${formatDateTime(h.changedAt)} — ${statusBadge(h.oldStatus)} ← ${statusBadge(h.newStatus)} ${h.changedByUser?.fullName ? `· ${escapeHtml(h.changedByUser.fullName)}` : ""} ${h.notes ? "(" + escapeHtml(h.notes) + ")" : ""}</li>`)
    .join("");

  const statusOptions = ORDER_STATUSES.map(
    (status) => `<option value="${escapeHtml(status)}" ${status === order.status ? "selected" : ""}>${escapeHtml(STATUS_LABELS_AR[status])}</option>`
  ).join("");

  const outstanding = Number(order.settlement?.outstanding || 0);

  card.innerHTML = `
    <div class="detail-header">
      <div>
        <h2 id="order-detail-title" tabindex="-1">الطلب <span dir="ltr">${escapeHtml(order.orderNumber)}</span></h2>
        <p class="muted">العميل: <strong>${escapeHtml(order.customer?.fullName || "-")}</strong> (${escapeHtml(order.customer?.customerNo || "-")})${order.customer?.phone ? ` · <span dir="ltr">${escapeHtml(order.customer.phone)}</span>` : ""}</p>
      </div>
      <div>${statusBadge(order.status)}</div>
      <button type="button" class="btn secondary" id="close-detail-btn">إغلاق</button>
    </div>

    <dl class="detail-grid">
      <div><dt>المسؤول</dt><dd>${escapeHtml(order.assignedUser?.fullName || "غير مُسند")}${canAssignOrders() && order.assignedUserId !== currentUser.id ? ' <button type="button" class="btn secondary" id="assign-to-me-btn">إسناده لي</button>' : ""}</dd></div>
      <div><dt>تاريخ الإنشاء</dt><dd>${formatDateTime(order.createdAt)}</dd></div>
      <div><dt>الفرع</dt><dd>${escapeHtml(order.branch?.name || "-")}</dd></div>
    </dl>

    <h3>الوضع المالي</h3>
    ${settlementHtml(order)}

    <h3>عناصر الطلب</h3>
    <div class="table-scroll"><table>
      <thead><tr><th>الخدمة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
      <tbody>${itemsRows || '<tr><td colspan="4">لا توجد عناصر</td></tr>'}</tbody>
    </table></div>

    <h3>تغيير الحالة</h3>
    <div class="stack wrap">
      <label for="new-status-select" class="sr-only">الحالة الجديدة</label>
      <select id="new-status-select" style="max-width: 220px">${statusOptions}</select>
      <label for="status-notes" class="sr-only">ملاحظة</label>
      <input type="text" id="status-notes" placeholder="ملاحظة (اختياري)" style="max-width: 240px" maxlength="500" />
      <button type="button" class="btn" id="change-status-btn">تحديث الحالة</button>
    </div>
    <div id="status-alert" aria-live="polite"></div>

    <h3>الدفعات والاسترجاعات</h3>
    <div class="table-scroll"><table>
      <thead><tr><th>النوع</th><th>المبلغ</th><th>الطريقة</th><th>الحالة</th><th>بواسطة</th><th>التاريخ</th><th>إجراءات</th></tr></thead>
      <tbody id="order-payments-body">${paymentsRows || '<tr><td colspan="7">لا توجد دفعات</td></tr>'}</tbody>
    </table></div>
    <div id="payment-alert" aria-live="polite"></div>
    <div id="payment-action-form"></div>

    ${canRecordPayment() ? `
    <form id="payment-form" class="card inset" novalidate>
      <h4>تسجيل دفعة مستلمة</h4>
      <div class="grid cols-4">
        <div class="field">
          <label for="payment-amount">المبلغ (${escapeHtml(order.currency)})</label>
          <input type="number" id="payment-amount" min="0.01" step="0.01" ${outstanding > 0 ? `max="${escapeHtml(order.settlement.outstanding)}"` : ""} required />
        </div>
        <div class="field">
          <label for="payment-currency">العملة</label>
          <input id="payment-currency" value="${escapeHtml(order.currency)}" readonly aria-describedby="payment-currency-help" />
          <small id="payment-currency-help" class="muted">تُسجّل الدفعات بعملة الطلب فقط.</small>
        </div>
        <div class="field">
          <label for="payment-method">طريقة الدفع</label>
          <input type="text" id="payment-method" placeholder="نقدي، تحويل بنكي..." required maxlength="100" />
        </div>
        <div class="field">
          <label for="payment-reference">رقم المرجع (اختياري)</label>
          <input type="text" id="payment-reference" maxlength="120" dir="ltr" />
        </div>
      </div>
      <label class="checkbox"><input type="checkbox" id="payment-pending" /> تحويل لم يُتحقق منه بعد (يُسجّل بانتظار المراجعة ولا يُحتسب)</label>
      <p class="muted small">المتبقي على الطلب: ${formatMoney(order.settlement?.outstanding, order.currency)}. لا يُسمح بتجاوز المتبقي.</p>
      <button type="submit" class="btn" id="add-payment-btn" ${outstanding <= 0 ? "disabled" : ""}>تسجيل الدفعة</button>
    </form>
    ` : ""}

    <h3>سجل الحالات</h3>
    <ul class="doc-checklist">${historyItems || "<li>لا يوجد سجل</li>"}</ul>
  `;

  el("close-detail-btn").addEventListener("click", closeOrderDetail);
  const assignToMe = el("assign-to-me-btn");
  if (assignToMe) {
    assignToMe.addEventListener("click", async () => {
      assignToMe.disabled = true;
      try {
        await api.patch(`/orders/${encodeURIComponent(order.id)}/assign`, { assignedUserId: currentUser.id });
        await openOrderDetail(order.id, { focus: false });
        loadOrders();
      } catch (error) {
        showAlert(el("status-alert"), error.message);
        assignToMe.disabled = false;
      }
    });
  }
  el("change-status-btn").addEventListener("click", () => changeOrderStatus(order.id));
  el("order-payments-body").addEventListener("click", (event) => handlePaymentAction(event, order));

  const form = el("payment-form");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      recordPayment(order);
    });
  }
}

async function changeOrderStatus(orderId) {
  const statusAlert = el("status-alert");
  const button = el("change-status-btn");
  showAlert(statusAlert, "");
  button.disabled = true;

  try {
    await api.patch(`/orders/${encodeURIComponent(orderId)}/status`, {
      status: el("new-status-select").value,
      notes: el("status-notes").value.trim() || undefined,
    });
    await openOrderDetail(orderId, { focus: false });
    loadOrders();
  } catch (error) {
    showAlert(statusAlert, error.message);
    button.disabled = false;
  }
}

// One idempotency key per *submission attempt of the same values*: a retry
// after a timeout reuses it (the server returns the stored payment instead
// of recording a second one); any change to the values starts a new key.
let pendingPaymentSubmission = null;

async function recordPayment(order) {
  const paymentAlert = el("payment-alert");
  const button = el("add-payment-btn");
  showAlert(paymentAlert, "");
  if (button.disabled) return;

  const amount = el("payment-amount").value;
  const method = el("payment-method").value.trim();
  if (!amount || Number(amount) <= 0 || !method) {
    showAlert(paymentAlert, "يرجى إدخال المبلغ وطريقة الدفع.");
    return;
  }

  const body = {
    orderId: order.id,
    amount: Number(amount),
    currency: order.currency,
    paymentMethod: method,
    referenceNumber: el("payment-reference").value.trim() || undefined,
    pendingReview: el("payment-pending").checked,
  };
  const fingerprint = JSON.stringify(body);
  if (!pendingPaymentSubmission || pendingPaymentSubmission.fingerprint !== fingerprint) {
    pendingPaymentSubmission = { fingerprint, key: newIdempotencyKey() };
  }

  button.disabled = true;
  button.textContent = "جارٍ التسجيل...";
  try {
    const result = await api.post("/payments", body, { headers: { "Idempotency-Key": pendingPaymentSubmission.key } });
    pendingPaymentSubmission = null;
    await openOrderDetail(order.id, { focus: false });
    showAlert(el("payment-alert"), result.replayed ? "هذه الدفعة مسجلة مسبقًا؛ لم تُسجّل مرة ثانية." : "تم تسجيل الدفعة.", "success");
    loadOrders();
  } catch (error) {
    showAlert(paymentAlert, error.message);
    button.disabled = false;
    button.textContent = "تسجيل الدفعة";
  }
}

function handlePaymentAction(event, order) {
  const confirmBtn = event.target.closest("[data-payment-confirm]");
  const rejectBtn = event.target.closest("[data-payment-reject]");
  const refundBtn = event.target.closest("[data-payment-refund]");
  const container = el("payment-action-form");

  if (confirmBtn) {
    runPaymentAction(confirmBtn, () => api.post(`/payments/${encodeURIComponent(confirmBtn.dataset.paymentConfirm)}/confirm`, {}), order, "تم تأكيد استلام الدفعة.");
    return;
  }

  if (rejectBtn || refundBtn) {
    const isRefund = Boolean(refundBtn);
    const paymentId = isRefund ? refundBtn.dataset.paymentRefund : rejectBtn.dataset.paymentReject;
    const payment = order.payments.find((p) => p.id === paymentId);
    container.innerHTML = `
      <form class="card inset" id="payment-decision-form">
        <h4>${isRefund ? "استرجاع من الدفعة" : "رفض الدفعة"} (${formatMoney(payment.amount, payment.currency)})</h4>
        ${isRefund ? `<div class="field"><label for="refund-amount">مبلغ الاسترجاع (${escapeHtml(payment.currency)})</label><input type="number" id="refund-amount" min="0.01" step="0.01" max="${escapeHtml(payment.amount)}" required /></div>` : ""}
        <div class="field"><label for="decision-reason">${isRefund ? "سبب الاسترجاع" : "سبب الرفض"}</label><input id="decision-reason" required minlength="3" maxlength="500" /></div>
        <div class="stack"><button type="submit" class="btn">${isRefund ? "تسجيل الاسترجاع" : "تأكيد الرفض"}</button><button type="button" class="btn secondary" id="decision-cancel">إلغاء</button></div>
      </form>`;
    const form = el("payment-decision-form");
    const idempotencyKey = newIdempotencyKey();
    el("decision-cancel").addEventListener("click", () => { container.innerHTML = ""; });
    form.addEventListener("submit", (submitEvent) => {
      submitEvent.preventDefault();
      const reason = el("decision-reason").value.trim();
      if (reason.length < 3) {
        showAlert(el("payment-alert"), "اكتب السبب (3 أحرف على الأقل).");
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      if (isRefund) {
        const amount = Number(el("refund-amount").value);
        runPaymentAction(submit, () => api.post(`/payments/${encodeURIComponent(paymentId)}/refund`, { amount, reason }, { headers: { "Idempotency-Key": idempotencyKey } }), order, "تم تسجيل الاسترجاع.");
      } else {
        runPaymentAction(submit, () => api.post(`/payments/${encodeURIComponent(paymentId)}/reject`, { reason }), order, "تم رفض الدفعة.");
      }
    });
    el(isRefund ? "refund-amount" : "decision-reason").focus();
  }
}

async function runPaymentAction(button, request, order, successMessage) {
  if (button.disabled) return;
  button.disabled = true;
  showAlert(el("payment-alert"), "");
  try {
    await request();
    await openOrderDetail(order.id, { focus: false });
    showAlert(el("payment-alert"), successMessage, "success");
    loadOrders();
  } catch (error) {
    showAlert(el("payment-alert"), error.message);
    button.disabled = false;
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
          <td>${escapeHtml(c.customerNo)}</td>
          <td>${escapeHtml(c.fullName)}</td>
          <td>${escapeHtml(c.passportNo)}</td>
          <td>${escapeHtml(c.nationality)}</td>
          <td>${escapeHtml(c.phone || "-")}</td>
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
          <td>${escapeHtml(p.order?.orderNumber || "-")}</td>
          <td>${escapeHtml(p.order?.customer?.fullName || "-")}</td>
          <td>${escapeHtml(PAYMENT_KIND_AR[p.kind] || "دفعة")}: ${formatMoney(p.amount, p.currency)}</td>
          <td>${escapeHtml(p.paymentMethod)}</td>
          <td><span class="badge">${escapeHtml(paymentStateLabel(p))}</span></td>
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
