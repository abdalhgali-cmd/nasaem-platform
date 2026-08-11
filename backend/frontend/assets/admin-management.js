const mgmtState = {
  wired: false,
  services: { page: 1, limit: 10 },
  activity: { page: 1, limit: 15 },
  contactRequests: { page: 1, limit: 10, status: "", department: "" },
};

const ACTIVITY_ACTION_LABELS_AR = {
  LOGIN: "تسجيل دخول",
  LOGOUT: "تسجيل خروج",
  ORDER_CREATED: "إنشاء طلب",
  ORDER_STATUS_CHANGED: "تغيير حالة طلب",
  ORDER_ASSIGNED: "إسناد طلب",
  PAYMENT_RECORDED: "تسجيل دفعة",
  USER_CREATED: "إنشاء مستخدم",
  USER_STATUS_CHANGED: "تغيير حالة مستخدم",
  USER_PASSWORD_RESET: "إعادة تعيين كلمة مرور",
  USER_DEPARTMENT_CHANGED: "تغيير قسم مستخدم",
  CONTACT_REQUEST_RECEIVED: "استلام طلب تواصل",
  CONTACT_REQUEST_QUOTE_CREATED: "إرسال عرض سعر لطلب تواصل",
  CONTACT_REQUEST_QUOTE_APPROVED: "موافقة العميل على عرض السعر",
  CONTACT_REQUEST_DOCUMENT_REVIEWED: "مراجعة مستند طلب تواصل",
  CONTACT_REQUEST_OFFER_CREATED: "إضافة عرض سعر لطلب تواصل",
  CONTACT_REQUEST_OFFER_UPDATED: "تعديل عرض سعر لطلب تواصل",
  CONTACT_REQUEST_OFFER_WITHDRAWN: "سحب عرض سعر لطلب تواصل",
  CONTACT_REQUEST_OFFER_APPROVED: "موافقة العميل على عرض متعدد",
};

const CONTACT_REQUEST_STATUS_LABELS_AR = {
  NEW: "جديد",
  CONTACTED: "تم التواصل",
  CLOSED: "مغلق",
};

const PAYMENT_STATUS_LABELS_AR = {
  NOT_REQUIRED: "لا يوجد",
  AWAITING_TRANSFER: "بانتظار التحويل",
  UNDER_REVIEW: "قيد المراجعة",
  CONFIRMED: "تم التأكيد",
};

const CONTACT_REQUEST_DOCUMENT_TYPE_LABELS_AR = {
  PASSPORT: "صورة جواز السفر",
  GUARANTOR_ID: "صورة إقامة الضامن",
  ADDITIONAL: "المستند الإضافي",
};

const CONTACT_REQUEST_DOCUMENT_STATUS_LABELS_AR = {
  PENDING: "قيد المراجعة",
  ACCEPTED: "مقبول",
  REJECTED: "مرفوض",
};

const CARRIER_MODE_LABELS_AR = { AIR: "طيران", SEA: "بحري" };

const DEPARTMENT_LABELS_AR = {
  VISAS: "تأشيرات",
  FLIGHTS: "طيران",
  UMRAH: "عمرة",
  HOTELS_PACKAGES: "فنادق وباقات",
  FERRY: "عبّارات",
};

const TRIP_LEG_DIRECTION_LABELS_AR = { OUTBOUND: "ذهاب", RETURN: "عودة" };

const CONTACT_REQUEST_OFFER_STATUS_LABELS_AR = {
  PENDING_APPROVAL: "بانتظار اختيار العميل",
  APPROVED: "تمت الموافقة",
  DECLINED: "مرفوض",
  WITHDRAWN: "مسحوب",
};

const CURRENCY_LABELS_AR = { SAR: "ريال سعودي", SDG: "جنيه سوداني", USD: "دولار أمريكي" };

// Populated lazily by ensureCarriersLoaded()/loadCarriers() — the full
// carrier list used to build the carrier <select> in the per-request offer
// form below.
let carriersCache = null;

// requestId -> array of blank-leg placeholders for that request's
// still-open "add offer" form; only the *count* is tracked here, real leg
// field values are read straight from the DOM at submit time (see
// handleSubmitOfferClick) to avoid a state/DOM desync.
const offerDraftLegs = {};

function mgmtCanWrite(entity) {
  // Mirrors the requireRole(...) checks on each backend POST route.
  const rules = {
    branches: ["SUPER_ADMIN"],
    suppliers: ["SUPER_ADMIN"],
    services: ["SUPER_ADMIN", "ADMIN"],
    offers: ["SUPER_ADMIN", "ADMIN"],
    carriers: ["SUPER_ADMIN", "ADMIN"],
    users: ["SUPER_ADMIN"],
    "site-assets": ["SUPER_ADMIN", "ADMIN"],
  };
  return (rules[entity] || []).includes(currentUser.role);
}

// users.routes.js allows PATCH /:id/status for SUPER_ADMIN and ADMIN, unlike
// POST / (create) which is SUPER_ADMIN-only — mgmtCanWrite("users") alone
// would incorrectly hide the toggle button from ADMIN.
function canToggleUserStatus() {
  return ["SUPER_ADMIN", "ADMIN"].includes(currentUser.role);
}

// Mirrors PATCH /users/:id/password's requireRole("SUPER_ADMIN").
function canResetUserPassword() {
  return currentUser.role === "SUPER_ADMIN";
}

// Mirrors PATCH /users/:id/department's requireRole("SUPER_ADMIN", "ADMIN")
// — same rule as canToggleUserStatus today, kept as its own function since
// the two are conceptually distinct actions that just happen to share a
// role set.
function canEditUserDepartment() {
  return ["SUPER_ADMIN", "ADMIN"].includes(currentUser.role);
}

function initManagementTab() {
  if (!mgmtState.wired) {
    wireManagementTabs();
    mgmtState.wired = true;
  }

  const createCardEntities = {
    branch: "branches",
    supplier: "suppliers",
    service: "services",
    offer: "offers",
    carrier: "carriers",
    user: "users",
  };
  Object.entries(createCardEntities).forEach(([prefix, entity]) => {
    const card = el(`${prefix}-create-card`);
    if (card) card.classList.toggle("hidden", !mgmtCanWrite(entity));
  });

  // EMPLOYEE only gets "طلبات التواصل" — every other sub-tab is
  // SUPER_ADMIN/ADMIN-only at the API level too (branches/suppliers/users/
  // settings/activity/site-assets), so hide them from the tab bar entirely
  // rather than let EMPLOYEE click into a tab that just 403s on load.
  if (currentUser.role === "EMPLOYEE") {
    document.querySelectorAll("#mgmt-tabs button").forEach((btn) => {
      if (btn.dataset.mgmt !== "contact-requests") btn.classList.add("hidden");
    });
    // Picking any department other than their own would silently return
    // zero rows (the backend ANDs an explicit department filter with the
    // automatic EMPLOYEE scoping) — lock the filter instead of leaving
    // that confusing dead end reachable.
    if (currentUser.department) {
      const filter = el("contact-request-department-filter");
      filter.value = currentUser.department;
      filter.disabled = true;
      mgmtState.contactRequests.department = currentUser.department;
    }
    activateMgmtSubTab("contact-requests");
    return;
  }

  loadActiveMgmtSubTab();
}

function wireManagementTabs() {
  document.querySelectorAll("#mgmt-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => activateMgmtSubTab(btn.dataset.mgmt));
  });

  el("branch-create-btn").addEventListener("click", createBranch);
  el("supplier-create-btn").addEventListener("click", createSupplier);
  el("service-create-btn").addEventListener("click", createService);
  el("offer-create-btn").addEventListener("click", createOffer);
  el("carrier-create-btn").addEventListener("click", createCarrier);
  el("user-create-btn").addEventListener("click", createUserAccount);
  el("setting-save-btn").addEventListener("click", saveSetting);
  el("payment-settings-save-btn").addEventListener("click", savePaymentSettings);

  el("branches-body").addEventListener("click", handleBranchRowClick);
  el("suppliers-body").addEventListener("click", handleSupplierRowClick);
  el("services-body").addEventListener("click", handleServiceRowClick);
  el("offers-body").addEventListener("change", handleOfferStatusChange);
  el("carriers-body").addEventListener("change", handleCarrierStatusChange);
  el("users-body").addEventListener("click", handleUserRowClick);
  el("users-body").addEventListener("change", handleUserDepartmentChange);
  el("contact-requests-body").addEventListener("change", handleContactRequestStatusChange);
  el("contact-requests-body").addEventListener("change", handlePaymentStatusChange);
  el("contact-requests-body").addEventListener("click", handleApprovePaymentClick);
  el("contact-requests-body").addEventListener("click", handleDocumentReviewClick);
  el("contact-requests-body").addEventListener("click", handleToggleOfferForm);
  el("contact-requests-body").addEventListener("click", handleAddLegClick);
  el("contact-requests-body").addEventListener("click", handleRemoveLegClick);
  el("contact-requests-body").addEventListener("click", handleSubmitOfferClick);
  el("contact-requests-body").addEventListener("click", handleWithdrawOfferClick);
  el("contact-request-status-filter").addEventListener("change", (e) => {
    mgmtState.contactRequests.status = e.target.value;
    mgmtState.contactRequests.page = 1;
    loadContactRequests();
  });
  el("contact-request-department-filter").addEventListener("change", (e) => {
    mgmtState.contactRequests.department = e.target.value;
    mgmtState.contactRequests.page = 1;
    loadContactRequests();
  });
  el("site-assets-grid").addEventListener("change", handleSiteAssetFileChange);
}

function activateMgmtSubTab(key) {
  document.querySelectorAll("#mgmt-tabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mgmt === key);
  });
  ["branches", "suppliers", "services", "offers", "carriers", "users", "settings", "activity", "contact-requests", "site-assets"].forEach((k) => {
    el(`mgmt-${k}`).classList.toggle("hidden", k !== key);
  });
  loadActiveMgmtSubTab();
}

function activeMgmtSubTab() {
  const active = document.querySelector("#mgmt-tabs button.active");
  return active ? active.dataset.mgmt : "branches";
}

function loadActiveMgmtSubTab() {
  const tab = activeMgmtSubTab();
  if (tab === "branches") loadBranches();
  if (tab === "suppliers") loadSuppliers();
  if (tab === "services") loadServices();
  if (tab === "offers") loadOffers();
  if (tab === "carriers") loadCarriers();
  if (tab === "users") loadUsers();
  if (tab === "settings") loadSettings();
  if (tab === "activity") loadActivityLogs();
  if (tab === "contact-requests") loadContactRequests();
  if (tab === "site-assets") loadSiteAssets();
}

const mgmtAlert = () => el("mgmt-alert");

// --- Branches ---

async function loadBranches() {
  try {
    const { data } = await api.get("/branches");
    el("branches-body").innerHTML = data
      .map(
        (b) => `
        <tr>
          <td>${b.code}</td>
          <td>${b.name}</td>
          <td>${b.phone || "-"}</td>
          <td>${b.active ? '<span class="badge status-ACTIVE">مفعّل</span>' : '<span class="badge status-INACTIVE">معطّل</span>'}</td>
          <td>${mgmtCanWrite("branches") ? `<button type="button" class="btn secondary" data-toggle-branch="${b.id}" data-active="${b.active}">${b.active ? "تعطيل" : "تفعيل"}</button>` : ""}</td>
        </tr>`
      )
      .join("");
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function createBranch() {
  showAlert(mgmtAlert(), "");
  const code = el("b-code").value.trim();
  const name = el("b-name").value.trim();
  if (!code || !name) return showAlert(mgmtAlert(), "الرمز والاسم مطلوبان.");

  try {
    await api.post("/branches", { code, name, phone: el("b-phone").value.trim() || undefined });
    el("b-code").value = "";
    el("b-name").value = "";
    el("b-phone").value = "";
    loadBranches();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

function handleBranchRowClick(e) {
  const btn = e.target.closest("[data-toggle-branch]");
  if (!btn) return;
  const active = btn.dataset.active === "true";
  api
    .patch(`/branches/${btn.dataset.toggleBranch}`, { active: !active })
    .then(loadBranches)
    .catch((error) => showAlert(mgmtAlert(), error.message));
}

// --- Suppliers ---

async function loadSuppliers() {
  try {
    const { data } = await api.get("/suppliers");
    el("suppliers-body").innerHTML = data
      .map(
        (s) => `
        <tr>
          <td>${s.code}</td>
          <td>${s.name}</td>
          <td>${s.type}</td>
          <td>${s.active ? '<span class="badge status-ACTIVE">مفعّل</span>' : '<span class="badge status-INACTIVE">معطّل</span>'}</td>
          <td>${mgmtCanWrite("suppliers") ? `<button type="button" class="btn secondary" data-toggle-supplier="${s.id}" data-active="${s.active}">${s.active ? "تعطيل" : "تفعيل"}</button>` : ""}</td>
        </tr>`
      )
      .join("");
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function createSupplier() {
  showAlert(mgmtAlert(), "");
  const code = el("s-code").value.trim();
  const name = el("s-name").value.trim();
  const type = el("s-type").value.trim();
  if (!code || !name || !type) return showAlert(mgmtAlert(), "الرمز والاسم والنوع مطلوبة.");

  try {
    await api.post("/suppliers", { code, name, type });
    el("s-code").value = "";
    el("s-name").value = "";
    el("s-type").value = "";
    loadSuppliers();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

function handleSupplierRowClick(e) {
  const btn = e.target.closest("[data-toggle-supplier]");
  if (!btn) return;
  const active = btn.dataset.active === "true";
  api
    .patch(`/suppliers/${btn.dataset.toggleSupplier}`, { active: !active })
    .then(loadSuppliers)
    .catch((error) => showAlert(mgmtAlert(), error.message));
}

// --- Services ---

async function loadServices() {
  try {
    const { page, limit } = mgmtState.services;
    const { data, meta } = await api.get(`/services?page=${page}&limit=${limit}`);
    el("services-body").innerHTML = data
      .map(
        (sv) => `
        <tr>
          <td>${sv.code}</td>
          <td>${sv.name}</td>
          <td>${sv.category}</td>
          <td>${formatMoney(sv.basePrice, sv.currency)}</td>
          <td>${sv.active ? '<span class="badge status-ACTIVE">مفعّل</span>' : '<span class="badge status-INACTIVE">معطّل</span>'}</td>
          <td>${mgmtCanWrite("services") ? `<button type="button" class="btn secondary" data-toggle-service="${sv.id}" data-active="${sv.active}">${sv.active ? "تعطيل" : "تفعيل"}</button>` : ""}</td>
        </tr>`
      )
      .join("");

    renderPagination("services-pagination", meta, (page) => {
      mgmtState.services.page = page;
      loadServices();
    });
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function createService() {
  showAlert(mgmtAlert(), "");
  const code = el("sv-code").value.trim();
  const name = el("sv-name").value.trim();
  const category = el("sv-category").value.trim();
  if (!code || !name || !category) return showAlert(mgmtAlert(), "الرمز والاسم والتصنيف مطلوبة.");

  try {
    await api.post("/services", {
      code,
      name,
      category,
      basePrice: Number(el("sv-basePrice").value) || 0,
    });
    el("sv-code").value = "";
    el("sv-name").value = "";
    el("sv-category").value = "";
    el("sv-basePrice").value = "0";
    loadServices();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

function handleServiceRowClick(e) {
  const btn = e.target.closest("[data-toggle-service]");
  if (!btn) return;
  const active = btn.dataset.active === "true";
  api
    .patch(`/services/${btn.dataset.toggleService}`, { active: !active })
    .then(loadServices)
    .catch((error) => showAlert(mgmtAlert(), error.message));
}

// --- Offers ---

async function loadOffers() {
  try {
    const { data } = await api.get("/offers");
    el("offers-body").innerHTML = data
      .map(
        (o) => `
        <tr>
          <td>${o.title}</td>
          <td>${formatMoney(o.price, o.currency)}</td>
          <td>${statusBadge(o.status)}</td>
          <td>${mgmtCanWrite("offers") ? `
            <select data-offer-status="${o.id}">
              <option value="DRAFT" ${o.status === "DRAFT" ? "selected" : ""}>مسودة</option>
              <option value="ACTIVE" ${o.status === "ACTIVE" ? "selected" : ""}>نشط</option>
              <option value="ARCHIVED" ${o.status === "ARCHIVED" ? "selected" : ""}>مؤرشف</option>
            </select>` : ""}
          </td>
        </tr>`
      )
      .join("");
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function createOffer() {
  showAlert(mgmtAlert(), "");
  const title = el("of-title").value.trim();
  const price = el("of-price").value;
  if (!title || !price) return showAlert(mgmtAlert(), "العنوان والسعر مطلوبان.");

  try {
    await api.post("/offers", { title, price: Number(price), status: el("of-status").value });
    el("of-title").value = "";
    el("of-price").value = "";
    loadOffers();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

function handleOfferStatusChange(e) {
  const select = e.target.closest("[data-offer-status]");
  if (!select) return;
  api
    .patch(`/offers/${select.dataset.offerStatus}`, { status: select.value })
    .then(loadOffers)
    .catch((error) => showAlert(mgmtAlert(), error.message));
}

// --- Carriers (airlines/ferry operators used to price ContactRequestOffer
// legs — see the "العروض" column in the contact-requests tab below) ---

async function loadCarriers() {
  try {
    const { data } = await api.get("/carriers");
    carriersCache = data;
    el("carriers-body").innerHTML = data
      .map(
        (c) => `
        <tr>
          <td>${escapeHtml(c.name)}</td>
          <td>${CARRIER_MODE_LABELS_AR[c.mode] || c.mode}</td>
          <td>${escapeHtml(c.code || "-")}</td>
          <td>${
            mgmtCanWrite("carriers")
              ? `
            <select data-carrier-status="${c.id}">
              <option value="true" ${c.active ? "selected" : ""}>نشط</option>
              <option value="false" ${!c.active ? "selected" : ""}>معطّل</option>
            </select>`
              : statusBadge(c.active ? "ACTIVE" : "INACTIVE")
          }</td>
        </tr>`
      )
      .join("");
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function createCarrier() {
  showAlert(mgmtAlert(), "");
  const name = el("c-name").value.trim();
  if (!name) return showAlert(mgmtAlert(), "الاسم مطلوب.");

  const button = el("carrier-create-btn");
  button.disabled = true;
  try {
    await api.post("/carriers", { name, mode: el("c-mode").value, code: el("c-code").value.trim() || undefined });
    el("c-name").value = "";
    el("c-code").value = "";
    loadCarriers();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  } finally {
    button.disabled = false;
  }
}

function handleCarrierStatusChange(e) {
  const select = e.target.closest("[data-carrier-status]");
  if (!select) return;
  api
    .patch(`/carriers/${select.dataset.carrierStatus}`, { active: select.value === "true" })
    .then(loadCarriers)
    .catch((error) => showAlert(mgmtAlert(), error.message));
}

// Contact-request offer forms need the full carrier list to populate their
// carrier <select>s — loaded once, on first use, and cached (loadCarriers()
// above always refreshes this same cache when the "الناقلون" tab itself is
// opened, so the two stay in sync without a second fetch mechanism).
async function ensureCarriersLoaded() {
  if (!carriersCache) {
    const { data } = await api.get("/carriers?active=true");
    carriersCache = data;
  }
  return carriersCache;
}

// --- Users ---

const ROLE_LABELS_AR = {
  SUPER_ADMIN: "مدير عام",
  ADMIN: "مدير",
  EMPLOYEE: "موظف",
  ACCOUNTANT: "محاسب",
};

async function loadUsers() {
  try {
    const { data } = await api.get("/users");
    el("users-body").innerHTML = data
      .map(
        (u) => `
        <tr>
          <td>${u.employeeNo}</td>
          <td>${u.fullName}</td>
          <td>${u.email}</td>
          <td>${ROLE_LABELS_AR[u.role] || u.role}</td>
          <td>
            ${
              canEditUserDepartment()
                ? `<select data-user-department="${u.id}">
                    <option value="">بدون قسم محدد</option>
                    ${Object.entries(DEPARTMENT_LABELS_AR)
                      .map(([value, label]) => `<option value="${value}" ${value === u.department ? "selected" : ""}>${label}</option>`)
                      .join("")}
                  </select>`
                : DEPARTMENT_LABELS_AR[u.department] || "بدون قسم محدد"
            }
          </td>
          <td>${statusBadge(u.status)}</td>
          <td>
            ${canToggleUserStatus() && u.id !== currentUser.id ? `<button type="button" class="btn secondary" data-toggle-user="${u.id}" data-status="${u.status}">${u.status === "ACTIVE" ? "تعطيل" : "تفعيل"}</button>` : ""}
            ${canResetUserPassword() ? `<button type="button" class="btn secondary" data-reset-password="${u.id}">تعيين كلمة مرور</button>` : ""}
          </td>
        </tr>`
      )
      .join("");
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function createUserAccount() {
  showAlert(mgmtAlert(), "");
  const fullName = el("u-fullName").value.trim();
  const email = el("u-email").value.trim();
  const password = el("u-password").value;
  if (!fullName || !email || !password) return showAlert(mgmtAlert(), "الاسم والبريد وكلمة المرور مطلوبة.");

  const button = el("user-create-btn");
  button.disabled = true;
  try {
    await api.post("/users", {
      fullName,
      email,
      password,
      role: el("u-role").value,
      department: el("u-department").value || null,
    });
    el("u-fullName").value = "";
    el("u-email").value = "";
    el("u-password").value = "";
    el("u-department").value = "";
    loadUsers();
  } catch (error) {
    showAlert(mgmtAlert(), error.message + (error.errors ? " — " + formatErrors(error.errors) : ""));
  } finally {
    button.disabled = false;
  }
}

function handleUserDepartmentChange(e) {
  const select = e.target.closest("[data-user-department]");
  if (!select) return;
  api
    .patch(`/users/${select.dataset.userDepartment}/department`, { department: select.value || null })
    .then(() => showAlert(mgmtAlert(), "تم تحديث القسم.", "success"))
    .catch((error) => showAlert(mgmtAlert(), error.message));
}

function handleUserRowClick(e) {
  const resetBtn = e.target.closest("[data-reset-password]");
  if (resetBtn) {
    const password = window.prompt("أدخل كلمة المرور الجديدة (٨ أحرف على الأقل):");
    if (!password) return;
    if (password.length < 8) return showAlert(mgmtAlert(), "كلمة المرور يجب أن تكون ٨ أحرف على الأقل.");

    api
      .patch(`/users/${resetBtn.dataset.resetPassword}/password`, { password })
      .then(() => showAlert(mgmtAlert(), "تم تعيين كلمة المرور بنجاح.", "success"))
      .catch((error) => showAlert(mgmtAlert(), error.message));
    return;
  }

  const btn = e.target.closest("[data-toggle-user]");
  if (!btn) return;
  const nextStatus = btn.dataset.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  api
    .patch(`/users/${btn.dataset.toggleUser}/status`, { status: nextStatus })
    .then(loadUsers)
    .catch((error) => showAlert(mgmtAlert(), error.message));
}

// --- Settings ---

const PAYMENT_SETTING_KEYS = {
  "pay-rate": "sar_to_sdg_rate",
  "pay-rate-usd": "usd_to_sdg_rate",
  "pay-account-sar": "bank_account_sar",
  "pay-account-sdg": "bank_account_sdg",
  "pay-account-usd": "bank_account_usd",
};

async function loadSettings() {
  try {
    const { data } = await api.get("/settings");
    el("settings-body").innerHTML = data
      .map(
        (s) => `<tr><td>${s.key}</td><td>${s.value}</td><td>${formatDate(s.updatedAt)}</td></tr>`
      )
      .join("");

    const byKey = Object.fromEntries(data.map((s) => [s.key, s.value]));
    for (const [inputId, key] of Object.entries(PAYMENT_SETTING_KEYS)) {
      el(inputId).value = byKey[key] || "";
    }
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function savePaymentSettings() {
  showAlert(mgmtAlert(), "");
  try {
    for (const [inputId, key] of Object.entries(PAYMENT_SETTING_KEYS)) {
      const value = el(inputId).value.trim();
      if (value) await api.post("/settings", { key, value });
    }
    loadSettings();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function saveSetting() {
  showAlert(mgmtAlert(), "");
  const key = el("set-key").value.trim();
  const value = el("set-value").value.trim();
  if (!key || !value) return showAlert(mgmtAlert(), "المفتاح والقيمة مطلوبان.");

  try {
    await api.post("/settings", { key, value });
    el("set-key").value = "";
    el("set-value").value = "";
    loadSettings();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

// --- Activity log ---

async function loadActivityLogs() {
  try {
    const { page, limit } = mgmtState.activity;
    const { data, meta } = await api.get(`/activity-logs?page=${page}&limit=${limit}`);

    el("activity-body").innerHTML = data
      .map(
        (log) => `
        <tr>
          <td>${log.user ? log.user.fullName : "-"}</td>
          <td>${ACTIVITY_ACTION_LABELS_AR[log.action] || log.action}</td>
          <td>${log.entity}${log.entityId ? " #" + log.entityId.slice(-6) : ""}</td>
          <td>${formatDate(log.createdAt)}</td>
        </tr>`
      )
      .join("");

    renderPagination("activity-pagination", meta, (page) => {
      mgmtState.activity.page = page;
      loadActivityLogs();
    });
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

// --- Contact requests (public marketing-site form submissions) ---

async function loadContactRequests() {
  try {
    const { page, limit, status, department } = mgmtState.contactRequests;
    const params = new URLSearchParams({ page, limit });
    if (status) params.set("status", status);
    if (department) params.set("department", department);

    const { data, meta } = await api.get(`/contact-requests?${params.toString()}`);

    // Any open offer-draft form is about to be torn down and rebuilt from
    // scratch below — stale entries here would desync from the fresh DOM
    // (renderOfferLegRows/handleSubmitOfferClick key off requestId) and
    // crash the next submit attempt on that row.
    Object.keys(offerDraftLegs).forEach((key) => delete offerDraftLegs[key]);

    // name/phone/service/message all come from an unauthenticated public
    // endpoint — escapeHtml() is required here, not optional, since this is
    // rendered straight into the staff dashboard via innerHTML.
    el("contact-requests-body").innerHTML = data
      .map(
        (req) => `
        <tr>
          <td dir="ltr" style="white-space: nowrap">${escapeHtml(req.referenceNumber || "-")}</td>
          <td>${escapeHtml(req.name)}</td>
          <td dir="ltr">${escapeHtml(req.phone)}</td>
          <td>${escapeHtml(req.service || "-")}</td>
          <td>${DEPARTMENT_LABELS_AR[req.department] || "غير محدد"}</td>
          <td style="max-width: 280px; white-space: normal">
            ${escapeHtml(req.message)}
            ${
              req.details && Object.keys(req.details).length > 0
                ? `<ul style="margin: 6px 0 0; padding-inline-start: 16px; font-size: 12px; color: var(--muted, #6b7280)">
                    ${Object.entries(req.details)
                      .map(([key, value]) => `<li>${escapeHtml(key)}: ${escapeHtml(String(value))}</li>`)
                      .join("")}
                  </ul>`
                : ""
            }
            ${
              req.documents && req.documents.length > 0
                ? `<div style="margin-top: 6px; display: flex; flex-direction: column; gap: 4px">
                    ${req.documents
                      .map(
                        (doc) => `
                          <div style="font-size: 12px">
                            <a href="${API_BASE}/contact-requests/${req.id}/documents/${doc.id}/file" download>${CONTACT_REQUEST_DOCUMENT_TYPE_LABELS_AR[doc.type] || doc.type}</a>
                            <span class="muted">— ${CONTACT_REQUEST_DOCUMENT_STATUS_LABELS_AR[doc.status] || doc.status}</span>
                            ${
                              doc.status === "PENDING"
                                ? `
                                  <button type="button" data-document-review="${doc.id}" data-document-review-request="${req.id}" data-document-review-status="ACCEPTED">قبول</button>
                                  <button type="button" data-document-review="${doc.id}" data-document-review-request="${req.id}" data-document-review-status="REJECTED">رفض</button>
                                `
                                : doc.status === "REJECTED" && doc.rejectionReason
                                  ? `<span class="muted">السبب: ${escapeHtml(doc.rejectionReason)}</span>`
                                  : ""
                            }
                          </div>`
                      )
                      .join("")}
                  </div>`
                : ""
            }
          </td>
          <td style="white-space: normal">${renderOfferCell(req)}</td>
          <td style="white-space: normal">
            ${
              req.paymentStatus === "NOT_REQUIRED"
                ? `
                  ${
                    req.invoice?.status === "PENDING_APPROVAL"
                      ? `<div class="muted" style="font-size: 11px">بانتظار موافقة العميل على العرض</div>`
                      : ""
                  }
                  <select data-approve-payment-currency="${req.id}" style="width: auto">
                    ${Object.entries(CURRENCY_LABELS_AR)
                      .map(
                        ([value, label]) =>
                          `<option value="${value}" ${value === req.invoice?.currency ? "selected" : ""}>${label}</option>`
                      )
                      .join("")}
                  </select>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="المبلغ"
                    value="${req.invoice?.amount ?? ""}"
                    data-approve-payment-amount="${req.id}"
                    style="width: 90px"
                  />
                  <button type="button" data-approve-payment-submit="${req.id}">
                    ${req.invoice ? "تعديل العرض المرسل" : "إرسال عرض السعر للعميل"}
                  </button>
                `
                : `
                  <div>${req.currency ? CURRENCY_LABELS_AR[req.currency] || req.currency : ""} ${req.paymentAmount ?? ""}</div>
                  <select data-payment-status="${req.id}">
                    ${Object.entries(PAYMENT_STATUS_LABELS_AR)
                      .filter(([value]) => value !== "NOT_REQUIRED")
                      .map(
                        ([value, label]) =>
                          `<option value="${value}" ${value === req.paymentStatus ? "selected" : ""}>${label}</option>`
                      )
                      .join("")}
                  </select>
                  ${
                    req.paymentReceiptPath
                      ? `<div><a href="${API_BASE}/contact-requests/${req.id}/payment-receipt" download>تحميل إشعار التحويل</a></div>`
                      : ""
                  }
                `
            }
          </td>
          <td>
            <select data-contact-request-status="${req.id}">
              ${Object.entries(CONTACT_REQUEST_STATUS_LABELS_AR)
                .map(
                  ([value, label]) =>
                    `<option value="${value}" ${value === req.status ? "selected" : ""}>${label}</option>`
                )
                .join("")}
            </select>
          </td>
          <td>${formatDate(req.createdAt)}</td>
        </tr>`
      )
      .join("");

    renderPagination("contact-requests-pagination", meta, (page) => {
      mgmtState.contactRequests.page = page;
      loadContactRequests();
    });
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

// Renders the existing offers for a request (compact per-leg summary +
// price + status, with a "سحب" button while still pending) plus the
// toggle for the inline "add an offer" form. Multiple competing offers
// (e.g. two airlines at two prices) are the entire point of this feature —
// see ContactRequestOffer's own doc comment in schema.prisma.
function renderOfferCell(req) {
  const existing = (req.offers || [])
    .map(
      (o) => `
        <div style="font-size: 12px; margin-bottom: 4px">
          ${o.legs
            .map(
              (l) =>
                `${TRIP_LEG_DIRECTION_LABELS_AR[l.direction]}: ${escapeHtml(l.carrier.name)}${
                  l.tripNumber ? ` (${escapeHtml(l.tripNumber)})` : ""
                } — ${escapeHtml(l.fromLocation)}→${escapeHtml(l.toLocation)}`
            )
            .join("<br/>")}
          — ${formatMoney(o.amount, o.currency)} —
          ${CONTACT_REQUEST_OFFER_STATUS_LABELS_AR[o.status] || o.status}
          ${
            o.status === "PENDING_APPROVAL"
              ? `<button type="button" data-withdraw-offer="${o.id}" data-withdraw-offer-request="${req.id}">سحب</button>`
              : ""
          }
        </div>`
    )
    .join("");

  return `
    ${existing}
    <button type="button" data-toggle-offer-form="${req.id}">+ إضافة عرض سعر</button>
    <div class="hidden" data-offer-form="${req.id}">
      <select data-offer-currency="${req.id}">
        ${Object.entries(CURRENCY_LABELS_AR)
          .map(([value, label]) => `<option value="${value}">${label}</option>`)
          .join("")}
      </select>
      <input type="number" min="1" step="0.01" placeholder="المبلغ" data-offer-amount="${req.id}" style="width: 90px" />
      <input type="text" placeholder="ملاحظات (اختياري)" data-offer-notes="${req.id}" />
      <div data-offer-legs="${req.id}"></div>
      <button type="button" data-add-leg="${req.id}">+ إضافة رحلة</button>
      <button type="button" data-submit-offer="${req.id}">إرسال العرض</button>
    </div>`;
}

// Rebuilds a request's leg-row inputs from offerDraftLegs[requestId]'s
// current length — each field is keyed "requestId:index:fieldName" so
// handleSubmitOfferClick can scan and group them back up at submit time
// without needing to also track field values in JS state.
function renderOfferLegRows(requestId) {
  const legs = offerDraftLegs[requestId] || [];
  const carrierOptions = (carriersCache || [])
    .map((c) => `<option value="${c.id}">${CARRIER_MODE_LABELS_AR[c.mode]} — ${escapeHtml(c.name)}</option>`)
    .join("");

  const container = document.querySelector(`[data-offer-legs="${requestId}"]`);
  if (!container) return;

  container.innerHTML = legs
    .map(
      (_, index) => `
        <div style="display: flex; gap: 4px; flex-wrap: wrap; margin: 4px 0; align-items: center">
          <select data-leg-field="${requestId}:${index}:carrierId">${carrierOptions}</select>
          <select data-leg-field="${requestId}:${index}:direction">
            <option value="OUTBOUND">ذهاب</option>
            <option value="RETURN">عودة</option>
          </select>
          <input type="text" placeholder="رقم الرحلة" data-leg-field="${requestId}:${index}:tripNumber" style="width: 90px" />
          <input type="text" placeholder="من" data-leg-field="${requestId}:${index}:fromLocation" style="width: 90px" />
          <input type="text" placeholder="إلى" data-leg-field="${requestId}:${index}:toLocation" style="width: 90px" />
          <input type="datetime-local" data-leg-field="${requestId}:${index}:departureAt" />
          <input type="datetime-local" data-leg-field="${requestId}:${index}:arrivalAt" />
          ${legs.length > 1 ? `<button type="button" data-remove-leg="${requestId}:${index}">حذف</button>` : ""}
        </div>`
    )
    .join("");
}

async function handleToggleOfferForm(e) {
  const button = e.target.closest("[data-toggle-offer-form]");
  if (!button) return;

  const requestId = button.dataset.toggleOfferForm;
  const form = document.querySelector(`[data-offer-form="${requestId}"]`);
  if (!form) return;

  await ensureCarriersLoaded();

  if (form.classList.contains("hidden") && !offerDraftLegs[requestId]) {
    offerDraftLegs[requestId] = [{}];
    renderOfferLegRows(requestId);
  }

  form.classList.toggle("hidden");
}

function handleAddLegClick(e) {
  const button = e.target.closest("[data-add-leg]");
  if (!button) return;
  const requestId = button.dataset.addLeg;
  offerDraftLegs[requestId] = [...(offerDraftLegs[requestId] || []), {}];
  renderOfferLegRows(requestId);
}

function handleRemoveLegClick(e) {
  const button = e.target.closest("[data-remove-leg]");
  if (!button) return;
  const [requestId, indexStr] = button.dataset.removeLeg.split(":");
  const index = Number(indexStr);
  offerDraftLegs[requestId] = (offerDraftLegs[requestId] || []).filter((_, i) => i !== index);
  renderOfferLegRows(requestId);
}

// datetime-local inputs give "YYYY-MM-DDTHH:mm" (no timezone/seconds) —
// the backend's z.string().datetime() needs a full ISO string, so this
// converts via the browser's local-timezone Date parsing before sending.
function datetimeLocalToIso(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function handleSubmitOfferClick(e) {
  const button = e.target.closest("[data-submit-offer]");
  if (!button) return;

  const requestId = button.dataset.submitOffer;
  const currency = document.querySelector(`[data-offer-currency="${requestId}"]`).value;
  const amount = document.querySelector(`[data-offer-amount="${requestId}"]`).value;
  const notes = document.querySelector(`[data-offer-notes="${requestId}"]`).value.trim();

  if (!amount || Number(amount) <= 0) {
    showAlert(mgmtAlert(), "أدخل مبلغًا صحيحًا قبل الإرسال");
    return;
  }

  const legCount = (offerDraftLegs[requestId] || []).length;
  const legs = [];
  for (let index = 0; index < legCount; index++) {
    legs.push({
      carrierId: document.querySelector(`[data-leg-field="${requestId}:${index}:carrierId"]`).value,
      direction: document.querySelector(`[data-leg-field="${requestId}:${index}:direction"]`).value,
      tripNumber: document.querySelector(`[data-leg-field="${requestId}:${index}:tripNumber"]`).value.trim() || undefined,
      fromLocation: document.querySelector(`[data-leg-field="${requestId}:${index}:fromLocation"]`).value.trim(),
      toLocation: document.querySelector(`[data-leg-field="${requestId}:${index}:toLocation"]`).value.trim(),
      departureAt: datetimeLocalToIso(document.querySelector(`[data-leg-field="${requestId}:${index}:departureAt"]`).value) || undefined,
      arrivalAt: datetimeLocalToIso(document.querySelector(`[data-leg-field="${requestId}:${index}:arrivalAt"]`).value) || undefined,
    });
  }

  if (legs.some((leg) => !leg.carrierId || !leg.fromLocation || !leg.toLocation)) {
    showAlert(mgmtAlert(), "أكمل بيانات كل رحلة (الناقل، من، إلى) قبل الإرسال");
    return;
  }

  button.disabled = true;
  api
    .post(`/contact-requests/${requestId}/offers`, { currency, amount: Number(amount), notes: notes || undefined, legs })
    .then(() => {
      delete offerDraftLegs[requestId];
      loadContactRequests();
    })
    .catch((error) => {
      showAlert(mgmtAlert(), error.message);
      button.disabled = false;
    });
}

function handleWithdrawOfferClick(e) {
  const button = e.target.closest("[data-withdraw-offer]");
  if (!button) return;
  if (!window.confirm("سحب هذا العرض؟")) return;

  const requestId = button.dataset.withdrawOfferRequest;
  const offerId = button.dataset.withdrawOffer;

  api
    .post(`/contact-requests/${requestId}/offers/${offerId}/withdraw`)
    .then(loadContactRequests)
    .catch((error) => showAlert(mgmtAlert(), error.message));
}

function handleContactRequestStatusChange(e) {
  const select = e.target.closest("[data-contact-request-status]");
  if (!select) return;
  api
    .patch(`/contact-requests/${select.dataset.contactRequestStatus}/status`, {
      status: select.value,
    })
    .then(loadContactRequests)
    .catch((error) => showAlert(mgmtAlert(), error.message));
}

function handlePaymentStatusChange(e) {
  const select = e.target.closest("[data-payment-status]");
  if (!select) return;
  api
    .patch(`/contact-requests/${select.dataset.paymentStatus}/payment-status`, {
      status: select.value,
    })
    .then(loadContactRequests)
    .catch((error) => showAlert(mgmtAlert(), error.message));
}

// Sends (or revises) a price quote for a request that had no catalog price
// at submission (e.g. a work visa, priced once staff has reviewed the
// contract) — the counterpart to createContactRequest's automatic pricing
// for a priced Umrah package. Does not itself start the bank-transfer flow;
// the customer approving it from /track does that (see approveInvoice).
function handleApprovePaymentClick(e) {
  const button = e.target.closest("[data-approve-payment-submit]");
  if (!button) return;

  const id = button.dataset.approvePaymentSubmit;
  const row = button.closest("tr");
  const currency = row.querySelector(`[data-approve-payment-currency="${id}"]`).value;
  const amount = row.querySelector(`[data-approve-payment-amount="${id}"]`).value;

  if (!amount || Number(amount) <= 0) {
    showAlert(mgmtAlert(), "أدخل مبلغًا صحيحًا قبل الإرسال");
    return;
  }

  button.disabled = true;
  api
    .patch(`/contact-requests/${id}/payment`, { currency, paymentAmount: Number(amount) })
    .then(loadContactRequests)
    .catch((error) => {
      showAlert(mgmtAlert(), error.message);
      button.disabled = false;
    });
}

// Rejecting prompts for a reason via window.prompt() (matching this file's
// existing lack of a modal/dialog library) and refuses to submit an empty
// reason client-side too, mirroring the backend's required-reason validation.
function handleDocumentReviewClick(e) {
  const button = e.target.closest("[data-document-review]");
  if (!button) return;

  const documentId = button.dataset.documentReview;
  const requestId = button.dataset.documentReviewRequest;
  const status = button.dataset.documentReviewStatus;

  let rejectionReason;
  if (status === "REJECTED") {
    rejectionReason = (window.prompt("سبب الرفض؟") || "").trim();
    if (!rejectionReason) return;
  }

  button.disabled = true;
  api
    .patch(`/contact-requests/${requestId}/documents/${documentId}/status`, {
      status,
      ...(status === "REJECTED" ? { rejectionReason } : {}),
    })
    .then(loadContactRequests)
    .catch((error) => {
      showAlert(mgmtAlert(), error.message);
      button.disabled = false;
    });
}

// --- Branding / icons (shown on the public marketing site) ---

const SITE_ASSET_LABELS_AR = {
  logo: "الشعار — الوضع الفاتح",
  "logo-dark": "الشعار — الوضع الداكن",
  "icon-umrah": "أيقونة باقات العمرة",
  "icon-visa": "أيقونة التأشيرات",
  "icon-flight": "أيقونة حجز الطيران",
  "icon-hotel": "أيقونة حجز الفنادق",
  "icon-international": "أيقونة التأشيرات الدولية",
  "icon-packages": "أيقونة باقات السفر الشاملة",
  "hero-background": "صورة الخلفية الرئيسية (البانر)",
};

async function loadSiteAssets() {
  try {
    const { data } = await api.get("/site-assets");
    const byKey = {};
    data.forEach((asset) => {
      byKey[asset.key] = asset;
    });

    const canWrite = mgmtCanWrite("site-assets");

    el("site-assets-grid").innerHTML = Object.entries(SITE_ASSET_LABELS_AR)
      .map(([key, label]) => {
        const asset = byKey[key];
        const previewSrc = asset
          ? `/api/site-assets/${key}/file?v=${new Date(asset.updatedAt).getTime()}`
          : "";

        return `
          <div class="card" style="text-align: center">
            <div style="font-weight: 700; margin-bottom: 10px">${label}</div>
            <div style="height: 84px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; background: #f5f7fa; border-radius: 10px; overflow: hidden">
              ${
                previewSrc
                  ? `<img src="${previewSrc}" alt="" style="max-height: 72px; max-width: 100%; object-fit: contain" />`
                  : `<span class="muted" style="font-size: 12px">لم يتم الرفع بعد</span>`
              }
            </div>
            ${
              canWrite
                ? `<input type="file" accept="image/png,image/jpeg,image/webp" data-site-asset-key="${key}" />`
                : `<span class="muted" style="font-size: 12px">لا تملك صلاحية التعديل</span>`
            }
            ${asset ? `<div class="muted" style="font-size: 11px; margin-top: 8px">آخر تحديث: ${formatDate(asset.updatedAt)}</div>` : ""}
          </div>`;
      })
      .join("");
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

function handleSiteAssetFileChange(e) {
  const input = e.target.closest("[data-site-asset-key]");
  if (!input || !input.files[0]) return;

  const key = input.dataset.siteAssetKey;
  const formData = new FormData();
  formData.append("image", input.files[0]);

  showAlert(mgmtAlert(), "");
  input.disabled = true;

  api
    .upload(`/site-assets/${key}`, formData)
    .then(loadSiteAssets)
    .catch((error) => {
      showAlert(mgmtAlert(), error.message);
      input.disabled = false;
    });
}
