const mgmtState = {
  wired: false,
  services: { page: 1, limit: 10 },
  activity: { page: 1, limit: 15 },
  contactRequests: { page: 1, limit: 10, status: "" },
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
  CONTACT_REQUEST_RECEIVED: "استلام طلب تواصل",
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

const CURRENCY_LABELS_AR = { SAR: "ريال سعودي", SDG: "جنيه سوداني" };

function mgmtCanWrite(entity) {
  // Mirrors the requireRole(...) checks on each backend POST route.
  const rules = {
    branches: ["SUPER_ADMIN"],
    suppliers: ["SUPER_ADMIN"],
    services: ["SUPER_ADMIN", "ADMIN"],
    offers: ["SUPER_ADMIN", "ADMIN"],
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
    user: "users",
  };
  Object.entries(createCardEntities).forEach(([prefix, entity]) => {
    const card = el(`${prefix}-create-card`);
    if (card) card.classList.toggle("hidden", !mgmtCanWrite(entity));
  });

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
  el("user-create-btn").addEventListener("click", createUserAccount);
  el("setting-save-btn").addEventListener("click", saveSetting);
  el("payment-settings-save-btn").addEventListener("click", savePaymentSettings);

  el("branches-body").addEventListener("click", handleBranchRowClick);
  el("suppliers-body").addEventListener("click", handleSupplierRowClick);
  el("services-body").addEventListener("click", handleServiceRowClick);
  el("offers-body").addEventListener("change", handleOfferStatusChange);
  el("users-body").addEventListener("click", handleUserRowClick);
  el("contact-requests-body").addEventListener("change", handleContactRequestStatusChange);
  el("contact-requests-body").addEventListener("change", handlePaymentStatusChange);
  el("contact-request-status-filter").addEventListener("change", (e) => {
    mgmtState.contactRequests.status = e.target.value;
    mgmtState.contactRequests.page = 1;
    loadContactRequests();
  });
  el("site-assets-grid").addEventListener("change", handleSiteAssetFileChange);
}

function activateMgmtSubTab(key) {
  document.querySelectorAll("#mgmt-tabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mgmt === key);
  });
  ["branches", "suppliers", "services", "offers", "users", "settings", "activity", "contact-requests", "site-assets"].forEach((k) => {
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

  try {
    await api.post("/users", { fullName, email, password, role: el("u-role").value });
    el("u-fullName").value = "";
    el("u-email").value = "";
    el("u-password").value = "";
    loadUsers();
  } catch (error) {
    showAlert(mgmtAlert(), error.message + (error.errors ? " — " + formatErrors(error.errors) : ""));
  }
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
    const { page, limit, status } = mgmtState.contactRequests;
    const params = new URLSearchParams({ page, limit });
    if (status) params.set("status", status);

    const { data, meta } = await api.get(`/contact-requests?${params.toString()}`);

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
              req.passportImagePaths && req.passportImagePaths.length > 0
                ? `<div>${req.passportImagePaths
                    .map(
                      (_, index) =>
                        `<a href="${API_BASE}/contact-requests/${req.id}/passport-image/${index}" download>تحميل جواز ${index + 1}</a>`
                    )
                    .join(" · ")}</div>`
                : ""
            }
            ${
              req.guarantorIdImagePaths && req.guarantorIdImagePaths.length > 0
                ? `<div>${req.guarantorIdImagePaths
                    .map(
                      (_, index) =>
                        `<a href="${API_BASE}/contact-requests/${req.id}/guarantor-id-image/${index}" download>تحميل إقامة الضامن ${index + 1}</a>`
                    )
                    .join(" · ")}</div>`
                : ""
            }
          </td>
          <td style="white-space: normal">
            ${
              req.paymentStatus === "NOT_REQUIRED"
                ? "-"
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
