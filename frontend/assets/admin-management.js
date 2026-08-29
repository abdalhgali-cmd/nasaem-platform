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
  PAYMENT_RECORDED: "تسجيل دفعة",
  USER_CREATED: "إنشاء مستخدم",
  USER_STATUS_CHANGED: "تغيير حالة مستخدم",
  CONTACT_REQUEST_RECEIVED: "استلام طلب تواصل",
  CONTACT_REQUEST_INVOICE_SET: "تحديد سعر لطلب تواصل",
  CONTACT_REQUEST_OFFER_ADDED: "إضافة عرض لطلب تواصل",
  CONTACT_REQUEST_PAYMENT_CONFIRMED: "تأكيد دفع طلب تواصل",
  CONTACT_REQUEST_STATUS_CHANGED: "تغيير حالة طلب تواصل",
  CONTACT_REQUEST_DOCUMENT_REVIEWED: "مراجعة مستند طلب تواصل",
  CONTACT_REQUEST_DELIVERABLE_UPLOADED: "رفع ملف نهائي لطلب تواصل",
  CONTACT_REQUEST_INVOICE_APPROVED: "موافقة العميل على السعر",
  CONTACT_REQUEST_INVOICE_REJECTED: "رفض العميل للسعر",
  CONTACT_REQUEST_OFFER_SELECTED: "اختيار العميل لعرض",
  CONTACT_REQUEST_TRANSFER_MARKED_SENT: "إعلان العميل عن التحويل",
  CONTACT_REQUEST_DOCUMENT_UPLOADED: "رفع العميل مستندًا",
};

const CONTACT_REQUEST_STATUS_LABELS_AR = {
  NEW: "جديد",
  CONTACTED: "تم التواصل",
  CLOSED: "مغلق",
};

// Only meaningful once a request is CLOSED (see contact-requests.validators.js).
// Reuses STATUS_LABELS_AR's existing COMPLETED/REJECTED/CANCELLED entries
// (api.js) rather than a duplicate label map — same words OrderStatus
// already uses for the same meanings.
const CONTACT_REQUEST_OUTCOMES = ["COMPLETED", "REJECTED", "CANCELLED"];

function mgmtCanWrite(entity) {
  // Mirrors the requireRole(...) checks on each backend POST route.
  // Platform 3.0 Phase 15: CONTENT_MANAGER is added only to the
  // content-configuration entities (homepage/appearance/site-assets/
  // services/visas/airlines/airports/ferries) — never to branches,
  // suppliers, offers, users, umrah-groups or feature-flags, which are
  // financial/operational/system permissions this role must not gain.
  const rules = {
    branches: ["SUPER_ADMIN"],
    suppliers: ["SUPER_ADMIN"],
    services: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"],
    offers: ["SUPER_ADMIN", "ADMIN"],
    coupons: ["SUPER_ADMIN", "ADMIN"],
    users: ["SUPER_ADMIN"],
    "site-assets": ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"],
    "umrah-groups": ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"],
    homepage: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"],
    appearance: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"],
    visas: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"],
    airlines: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"],
    airports: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"],
    ferries: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"],
    "feature-flags": ["SUPER_ADMIN", "ADMIN"],
  };
  return (rules[entity] || []).includes(currentUser.role);
}

// users.routes.js allows PATCH /:id/status for SUPER_ADMIN and ADMIN, unlike
// POST / (create) which is SUPER_ADMIN-only — mgmtCanWrite("users") alone
// would incorrectly hide the toggle button from ADMIN.
function canToggleUserStatus() {
  return ["SUPER_ADMIN", "ADMIN"].includes(currentUser.role);
}

// Mirrors contact-requests.routes.js: POST /:id/invoice is SUPER_ADMIN,
// ADMIN, or EMPLOYEE (same roles that can already work a contact request).
function canManageInvoice() {
  return ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"].includes(currentUser.role);
}

// Mirrors contact-requests.routes.js: POST /:id/confirm-payment is
// SUPER_ADMIN, ADMIN, or ACCOUNTANT — same split as payments.routes.js for
// financial actions specifically (narrower than general request handling).
function canConfirmPayment() {
  return ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"].includes(currentUser.role);
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
    coupon: "coupons",
    user: "users",
    "umrah-group": "umrah-groups",
    visa: "visas",
    airline: "airlines",
    airport: "airports",
    "ferry-operator": "ferries",
  };
  Object.entries(createCardEntities).forEach(([prefix, entity]) => {
    const card = el(`${prefix}-create-card`);
    if (card) card.classList.toggle("hidden", !mgmtCanWrite(entity));
  });

  applyMgmtTabVisibilityForRole();

  loadActiveMgmtSubTab();
}

// Platform 3.0 Phase 15: a CONTENT_MANAGER only sees the content-
// configuration sub-tabs — the backend already refuses everything else
// server-side (see each module's routes.js), this just avoids showing a
// tab that would only ever answer 403. If the currently-active tab is one
// being hidden, falls back to "homepage" (the first content tab) instead
// of leaving an empty panel selected.
function applyMgmtTabVisibilityForRole() {
  if (currentUser.role !== "CONTENT_MANAGER") return;

  const contentTabs = new Set(["homepage", "appearance", "site-assets", "services", "visas", "airlines", "airports", "ferries"]);
  let activeWasHidden = false;

  document.querySelectorAll("#mgmt-tabs button").forEach((btn) => {
    const visible = contentTabs.has(btn.dataset.mgmt);
    btn.classList.toggle("hidden", !visible);
    if (!visible && btn.classList.contains("active")) activeWasHidden = true;
  });

  if (activeWasHidden) activateMgmtSubTab("homepage");
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

  el("branches-body").addEventListener("click", handleBranchRowClick);
  el("suppliers-body").addEventListener("click", handleSupplierRowClick);
  el("services-body").addEventListener("click", handleServiceRowClick);
  el("offers-body").addEventListener("change", handleOfferStatusChange);
  el("users-body").addEventListener("click", handleUserRowClick);
  el("contact-requests-body").addEventListener("change", handleContactRequestStatusChange);
  el("contact-requests-body").addEventListener("click", handleContactRequestActionClick);
  el("contact-request-status-filter").addEventListener("change", (e) => {
    mgmtState.contactRequests.status = e.target.value;
    mgmtState.contactRequests.page = 1;
    loadContactRequests();
  });
  el("site-assets-grid").addEventListener("change", handleSiteAssetFileChange);
  el("umrah-group-create-btn").addEventListener("click", createUmrahGroup);
  el("umrah-groups-body").addEventListener("click", handleUmrahGroupsClick);

  // Platform 3.0 Phase 14
  el("hp-hero-save-btn").addEventListener("click", saveHomepageHero);
  el("homepage-sections-body").addEventListener("click", handleHomepageSectionToggle);
  el("theme-save-btn").addEventListener("click", saveTheme);
  el("visa-create-btn").addEventListener("click", createVisaType);
  el("visas-body").addEventListener("click", handleVisaTypeRowClick);
  el("visa-requirement-create-btn").addEventListener("click", createVisaRequirement);
  el("visa-requirements-body").addEventListener("click", handleVisaRequirementRowClick);
  el("visa-requirements-close-btn").addEventListener("click", closeVisaRequirements);
  el("airline-create-btn").addEventListener("click", createAirline);
  el("airlines-body").addEventListener("click", handleAirlineRowClick);
  el("airport-create-btn").addEventListener("click", createAirport);
  el("ferry-operator-create-btn").addEventListener("click", createFerryOperator);
  el("ferry-operators-body").addEventListener("click", handleFerryOperatorRowClick);
  el("feature-flags-body").addEventListener("click", handleFeatureFlagToggle);
  el("coupon-create-btn").addEventListener("click", createCoupon);
  el("coupons-body").addEventListener("click", handleCouponRowClick);
}

function activateMgmtSubTab(key) {
  document.querySelectorAll("#mgmt-tabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mgmt === key);
  });
  [
    "branches",
    "suppliers",
    "services",
    "offers",
    "coupons",
    "users",
    "settings",
    "activity",
    "contact-requests",
    "umrah-groups",
    "site-assets",
    "homepage",
    "appearance",
    "visas",
    "airlines",
    "airports",
    "ferries",
    "feature-flags",
  ].forEach((k) => {
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
  if (tab === "coupons") loadCoupons();
  if (tab === "users") loadUsers();
  if (tab === "settings") loadSettings();
  if (tab === "activity") loadActivityLogs();
  if (tab === "contact-requests") loadContactRequests();
  if (tab === "umrah-groups") loadUmrahGroups();
  if (tab === "site-assets") loadSiteAssets();
  if (tab === "homepage") {
    loadHomepageHero();
    loadHomepageSections();
  }
  if (tab === "appearance") loadTheme();
  if (tab === "visas") loadVisaTypes();
  if (tab === "airlines") loadAirlines();
  if (tab === "airports") loadAirports();
  if (tab === "ferries") loadFerryOperators();
  if (tab === "feature-flags") loadFeatureFlags();
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

// --- Coupons (customer accounts + coupons feature) ---

const COUPON_DISCOUNT_LABELS = { PERCENTAGE: "%", FIXED: "" };

// Populates the service/visa-type restriction dropdowns each time the tab
// loads — a plain, low-traffic admin form, so re-fetching both lists on
// every load is simpler than caching them and keeping that cache fresh
// across the Services/Visas tabs' own CRUD actions.
async function populateCouponScopeDropdowns() {
  try {
    const [{ data: services }, { data: visaTypes }] = await Promise.all([
      api.get("/services?limit=100"),
      api.get("/visa-types?limit=100"),
    ]);
    el("cp-serviceId").innerHTML =
      '<option value="">كل الخدمات</option>' + services.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
    el("cp-visaTypeId").innerHTML =
      '<option value="">كل الفئات</option>' + visaTypes.map((v) => `<option value="${v.id}">${escapeHtml(v.name)} — ${escapeHtml(v.country)}</option>`).join("");
  } catch (error) {
    // Non-fatal: the create form still works with "all services/types".
  }
}

function couponDiscountLabel(coupon) {
  return `${Number(coupon.discountValue)}${COUPON_DISCOUNT_LABELS[coupon.discountType]}`;
}

async function loadCoupons() {
  try {
    await populateCouponScopeDropdowns();
    const { data } = await api.get("/coupons?limit=100");
    const canWrite = mgmtCanWrite("coupons");
    el("coupons-body").innerHTML = data
      .map((cp) => {
        const usageLimitLabel = cp.usageLimit ? `${cp._count.usages}/${cp.usageLimit}` : `${cp._count.usages}/∞`;
        const statusBadgeHtml = cp.archived
          ? '<span class="badge status-CANCELLED">مؤرشف</span>'
          : cp.active
            ? '<span class="badge status-ACTIVE">مفعّل</span>'
            : '<span class="badge status-INACTIVE">معطّل</span>';
        return `
        <tr>
          <td dir="ltr">${escapeHtml(cp.code)}</td>
          <td>${couponDiscountLabel(cp)}</td>
          <td>${formatDate(cp.expiryDate)}</td>
          <td>${usageLimitLabel}</td>
          <td>${cp.service ? escapeHtml(cp.service.name) : "الكل"}</td>
          <td>${statusBadgeHtml}</td>
          <td>
            <button type="button" class="btn secondary" data-coupon-usages="${cp.id}">سجل الاستخدام</button>
            ${
              canWrite && !cp.archived
                ? `<button type="button" class="btn secondary" data-toggle-coupon="${cp.id}" data-active="${cp.active}">${cp.active ? "تعطيل" : "تفعيل"}</button>
                   <button type="button" class="btn secondary" data-archive-coupon="${cp.id}">أرشفة</button>`
                : ""
            }
          </td>
        </tr>`;
      })
      .join("");
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function createCoupon() {
  showAlert(mgmtAlert(), "");
  const code = el("cp-code").value.trim();
  const discountValue = el("cp-discountValue").value;
  if (!code || !discountValue) return showAlert(mgmtAlert(), "الرمز وقيمة الخصم مطلوبان.");

  try {
    await api.post("/coupons", {
      code,
      discountType: el("cp-discountType").value,
      discountValue: Number(discountValue),
      startDate: el("cp-startDate").value || null,
      expiryDate: el("cp-expiryDate").value || null,
      minOrderAmount: el("cp-minOrderAmount").value ? Number(el("cp-minOrderAmount").value) : null,
      usageLimit: el("cp-usageLimit").value ? Number(el("cp-usageLimit").value) : null,
      usageLimitPerCustomer: el("cp-usageLimitPerCustomer").value ? Number(el("cp-usageLimitPerCustomer").value) : null,
      serviceId: el("cp-serviceId").value || null,
      visaTypeId: el("cp-visaTypeId").value || null,
      newCustomersOnly: el("cp-newCustomersOnly").value === "true",
    });
    el("cp-code").value = "";
    el("cp-discountValue").value = "";
    el("cp-startDate").value = "";
    el("cp-expiryDate").value = "";
    el("cp-minOrderAmount").value = "";
    el("cp-usageLimit").value = "";
    el("cp-usageLimitPerCustomer").value = "1";
    el("cp-newCustomersOnly").value = "false";
    loadCoupons();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function showCouponUsageHistory(couponId) {
  const card = el("coupon-usage-card");
  try {
    const { data } = await api.get(`/coupons/${couponId}/usages?limit=50`);
    card.classList.remove("hidden");
    card.innerHTML = `
      <h2>سجل استخدام الكوبون</h2>
      <table>
        <thead><tr><th>العميل</th><th>الطلب</th><th>قيمة الخصم</th><th>التاريخ</th></tr></thead>
        <tbody>
          ${
            data.length
              ? data
                  .map(
                    (u) => `<tr>
                <td>${escapeHtml(u.customer.fullName)} (${escapeHtml(u.customer.customerNo)})</td>
                <td>${escapeHtml(u.order.orderNumber)}</td>
                <td>${formatMoney(u.discountAmount, u.order.currency)}</td>
                <td>${formatDate(u.createdAt)}</td>
              </tr>`
                  )
                  .join("")
              : '<tr><td colspan="4">لا يوجد استخدام لهذا الكوبون بعد</td></tr>'
          }
        </tbody>
      </table>`;
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

function handleCouponRowClick(e) {
  const usagesBtn = e.target.closest("[data-coupon-usages]");
  if (usagesBtn) return showCouponUsageHistory(usagesBtn.dataset.couponUsages);

  const toggleBtn = e.target.closest("[data-toggle-coupon]");
  if (toggleBtn) {
    const active = toggleBtn.dataset.active === "true";
    return api
      .patch(`/coupons/${toggleBtn.dataset.toggleCoupon}/${active ? "deactivate" : "activate"}`)
      .then(loadCoupons)
      .catch((error) => showAlert(mgmtAlert(), error.message));
  }

  const archiveBtn = e.target.closest("[data-archive-coupon]");
  if (archiveBtn) {
    if (!confirm("هل أنت متأكد من أرشفة هذا الكوبون؟ لن يكون بإمكان العملاء استخدامه بعد الآن.")) return;
    return api
      .patch(`/coupons/${archiveBtn.dataset.archiveCoupon}/archive`)
      .then(loadCoupons)
      .catch((error) => showAlert(mgmtAlert(), error.message));
  }
}

// --- Users ---

const ROLE_LABELS_AR = {
  SUPER_ADMIN: "مدير عام",
  ADMIN: "مدير",
  EMPLOYEE: "موظف",
  ACCOUNTANT: "محاسب",
  CONTENT_MANAGER: "مدير محتوى",
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
          <td>${canToggleUserStatus() && u.id !== currentUser.id ? `<button type="button" class="btn secondary" data-toggle-user="${u.id}" data-status="${u.status}">${u.status === "ACTIVE" ? "تعطيل" : "تفعيل"}</button>` : ""}</td>
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
  const btn = e.target.closest("[data-toggle-user]");
  if (!btn) return;
  const nextStatus = btn.dataset.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  api
    .patch(`/users/${btn.dataset.toggleUser}/status`, { status: nextStatus })
    .then(loadUsers)
    .catch((error) => showAlert(mgmtAlert(), error.message));
}

// --- Settings ---

async function loadSettings() {
  try {
    const { data } = await api.get("/settings");
    el("settings-body").innerHTML = data
      .map(
        (s) => `<tr><td>${s.key}</td><td>${s.value}</td><td>${formatDate(s.updatedAt)}</td></tr>`
      )
      .join("");
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

// Invoices/offers are quoted in SAR only for now, matching every other
// price field in this frontend (services/offers-catalog forms have no
// currency picker either — the backend's per-model `currency` default is
// always "SAR").
function invoiceCellHtml(req) {
  const info = req.invoice
    ? `<div>${formatMoney(req.invoice.amount, req.invoice.currency)}</div><div>${statusBadge(req.invoice.status)}</div>`
    : `<div class="muted">لم يُحدد بعد</div>`;

  const canSet = canManageInvoice() && req.invoice?.status !== "APPROVED";
  if (!canSet) return info;

  return `
    ${info}
    <div class="stack" style="margin-top: 6px; gap: 6px">
      <input
        type="number" min="0" step="0.01" placeholder="المبلغ (ر.س)" style="width: 100px"
        data-invoice-amount-input="${req.id}"
        value="${req.invoice ? req.invoice.amount : ""}"
      />
      <button type="button" class="btn secondary" data-set-invoice="${req.id}">
        ${req.invoice ? "تحديث السعر" : "تحديد السعر"}
      </button>
    </div>`;
}

function offerAddFormHtml(req) {
  return `
    <div class="stack" style="margin-top: 6px; gap: 4px">
      <input type="text" placeholder="الناقل" style="width: 80px" data-offer-carrier-input="${req.id}" />
      <input
        type="number" min="0" step="0.01" placeholder="المبلغ" style="width: 80px"
        data-offer-amount-input="${req.id}"
      />
      <button type="button" class="btn secondary" data-add-offer="${req.id}">إضافة عرض</button>
    </div>`;
}

function offersCellHtml(req) {
  const offersList = req.offers
    .map((offer) => {
      const isSelected = offer.id === req.selectedOfferId;
      return `
        <div style="margin-bottom: 6px${isSelected ? "; font-weight: bold" : ""}">
          ${escapeHtml(offer.carrier)}: ${formatMoney(offer.amount, offer.currency)}
          ${isSelected ? statusBadge("APPROVED") : ""}
        </div>`;
    })
    .join("");

  const canAdd = canManageInvoice() && !req.selectedOfferId;

  return `${offersList}${canAdd ? offerAddFormHtml(req) : ""}`;
}

// A request is priced via a single Invoice OR a set of multi-carrier
// ContactRequestOffer options — never both (enforced server-side too, see
// contact-requests.service.js). Nothing priced yet offers staff a choice
// between the two mechanisms.
function pricingCellHtml(req) {
  if (req.offers && req.offers.length > 0) {
    return offersCellHtml(req);
  }

  const invoiceHtml = invoiceCellHtml(req);

  if (!req.invoice && canManageInvoice()) {
    return `${invoiceHtml}<div class="muted" style="margin-top: 6px; font-size: 0.75rem">— أو —</div>${offerAddFormHtml(req)}`;
  }

  return invoiceHtml;
}

function paymentCellHtml(req) {
  const badge = statusBadge(req.paymentStatus);
  if (req.paymentStatus !== "UNDER_REVIEW" || !canConfirmPayment()) {
    return badge;
  }

  return `${badge}<div style="margin-top: 6px"><button type="button" class="btn secondary" data-confirm-payment="${req.id}">تأكيد الدفع</button></div>`;
}

// label/reviewNote both come from free text (customer-entered label, staff-
// entered rejection reason) rendered via innerHTML — escapeHtml() required.
function customerDocumentsHtml(req) {
  if (!req.documents || req.documents.length === 0) {
    return `<div class="muted">لا توجد مستندات</div>`;
  }

  const canReview = canManageInvoice();

  return req.documents
    .map((doc) => {
      const fileUrl = `/api/contact-requests/${req.id}/documents/${doc.id}/file`;
      const reviewControls =
        canReview && doc.status === "PENDING"
          ? `
        <div class="stack" style="margin-top: 4px; gap: 4px">
          <button type="button" class="btn secondary" data-accept-document="${doc.id}" data-request-id="${req.id}">قبول</button>
          <input type="text" placeholder="سبب الرفض" style="width: 110px" data-reject-note-input="${doc.id}" />
          <button type="button" class="btn secondary" data-reject-document="${doc.id}" data-request-id="${req.id}">رفض</button>
        </div>`
          : "";

      return `
        <div style="margin-bottom: 8px">
          <a href="${fileUrl}" target="_blank" rel="noopener">${escapeHtml(doc.label)}</a>
          ${statusBadge(doc.status)}
          ${doc.reviewNote ? `<div class="muted" style="font-size: 0.75rem">${escapeHtml(doc.reviewNote)}</div>` : ""}
          ${reviewControls}
        </div>`;
    })
    .join("");
}

// Staff-delivered final files (issued visa, ticket, voucher) — the other
// direction from customerDocumentsHtml's customer-uploaded, staff-reviewed
// files. No review status here: the file itself is the deliverable.
function deliverablesHtml(req) {
  const items = (req.deliverables || [])
    .map((d) => {
      const fileUrl = `/api/contact-requests/${req.id}/deliverables/${d.id}/file`;
      return `<div style="margin-bottom: 4px"><a href="${fileUrl}" target="_blank" rel="noopener">${escapeHtml(d.label)}</a></div>`;
    })
    .join("");

  const addForm = canManageInvoice()
    ? `
    <div class="stack" style="margin-top: 4px; gap: 4px">
      <input type="text" placeholder="اسم الملف" style="width: 90px" data-deliverable-label-input="${req.id}" />
      <input type="file" style="width: 120px" data-deliverable-file-input="${req.id}" />
      <button type="button" class="btn secondary" data-upload-deliverable="${req.id}">رفع</button>
    </div>`
    : "";

  return `${items}${addForm}`;
}

// Service Intake submissions (Umrah/Visas/Packages) carry a real
// Service/VisaType catalog reference plus optional traveler count and
// free-form intakeData (see contact-requests.service.js's listContactRequests
// include). Plain contact-form submissions have none of these, so this
// gracefully falls back to just the free-text service label as before.
function serviceCellHtml(req) {
  const parts = [escapeHtml(req.service || "-")];

  if (req.serviceRef) {
    parts.push(`<div class="muted" style="font-size: 0.75rem">${escapeHtml(req.serviceRef.name)}</div>`);
  }

  if (req.visaType) {
    parts.push(
      `<div class="muted" style="font-size: 0.75rem">تأشيرة: ${escapeHtml(req.visaType.name)}</div>`
    );
  }

  if (req.travelerCount) {
    parts.push(`<div class="muted" style="font-size: 0.75rem">عدد المسافرين: ${req.travelerCount}</div>`);
  }

  if (req.intakeData && Object.keys(req.intakeData).length > 0) {
    parts.push(
      `<details style="margin-top: 4px"><summary class="muted" style="font-size: 0.75rem; cursor: pointer">بيانات الطلب</summary>` +
        `<pre style="white-space: pre-wrap; font-size: 0.7rem; margin: 4px 0 0">${escapeHtml(JSON.stringify(req.intakeData, null, 2))}</pre></details>`
    );
  }

  return parts.join("");
}

function documentsCellHtml(req) {
  return `
    <div><strong>مستندات العميل</strong></div>
    ${customerDocumentsHtml(req)}
    <div style="margin-top: 10px"><strong>الملفات النهائية</strong></div>
    ${deliverablesHtml(req)}`;
}

function statusCellHtml(req) {
  const selectHtml = `
    <select data-contact-request-status="${req.id}">
      ${Object.entries(CONTACT_REQUEST_STATUS_LABELS_AR)
        .map(
          ([value, label]) =>
            `<option value="${value}" ${value === req.status ? "selected" : ""}>${label}</option>`
        )
        .join("")}
    </select>`;

  if (req.status !== "CLOSED" || !req.outcome) {
    return selectHtml;
  }

  return `
    ${selectHtml}
    <div style="margin-top: 4px">
      ${statusBadge(req.outcome)}
      ${req.outcomeNote ? `<div class="muted" style="font-size: 0.75rem">${escapeHtml(req.outcomeNote)}</div>` : ""}
      <button type="button" class="btn secondary" data-edit-close-outcome="${req.id}" style="margin-top: 4px">تعديل النتيجة</button>
    </div>`;
}

// Rendered below the status <select> when closing needs an outcome — either
// because the staff member just picked "مغلق" (the PATCH below came back
// 400) or because they clicked "تعديل النتيجة" on an already-closed row.
function showCloseOutcomeForm(select) {
  const id = select.dataset.contactRequestStatus;
  const existing = select.parentElement.querySelector(`[data-close-outcome-form="${id}"]`);
  if (existing) return;

  const wrapper = document.createElement("div");
  wrapper.dataset.closeOutcomeForm = id;
  wrapper.className = "stack";
  wrapper.style.marginTop = "6px";
  wrapper.style.gap = "6px";
  wrapper.innerHTML = `
    <select data-close-outcome-select="${id}">
      ${CONTACT_REQUEST_OUTCOMES.map(
        (value) => `<option value="${value}">${STATUS_LABELS_AR[value] || value}</option>`
      ).join("")}
    </select>
    <input type="text" placeholder="ملاحظة (اختياري)" style="width: 120px" data-close-outcome-note="${id}" />
    <button type="button" class="btn secondary" data-confirm-close="${id}">تأكيد الإغلاق</button>
  `;
  select.insertAdjacentElement("afterend", wrapper);
}

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
          <td>${escapeHtml(req.name)}</td>
          <td dir="ltr">${escapeHtml(req.phone)}</td>
          <td>${serviceCellHtml(req)}</td>
          <td style="max-width: 280px; white-space: normal">${escapeHtml(req.message)}</td>
          <td>${statusCellHtml(req)}</td>
          <td>${pricingCellHtml(req)}</td>
          <td>${paymentCellHtml(req)}</td>
          <td>${documentsCellHtml(req)}</td>
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
    .catch((error) => {
      // CLOSED requires an outcome (see contact-requests.validators.js) —
      // reveal the outcome mini-form right here instead of just alerting,
      // so completing the close is a two-click fix, not a dead end.
      if (select.value === "CLOSED" && error.status === 400) {
        showCloseOutcomeForm(select);
        return;
      }
      showAlert(mgmtAlert(), error.message);
    });
}

function handleContactRequestActionClick(e) {
  const editCloseOutcomeBtn = e.target.closest("[data-edit-close-outcome]");
  if (editCloseOutcomeBtn) {
    const id = editCloseOutcomeBtn.dataset.editCloseOutcome;
    const select = document.querySelector(`[data-contact-request-status="${id}"]`);
    if (select) showCloseOutcomeForm(select);
    return;
  }

  const confirmCloseBtn = e.target.closest("[data-confirm-close]");
  if (confirmCloseBtn) {
    const id = confirmCloseBtn.dataset.confirmClose;
    const outcome = document.querySelector(`[data-close-outcome-select="${id}"]`)?.value;
    const outcomeNote = document
      .querySelector(`[data-close-outcome-note="${id}"]`)
      ?.value.trim();

    api
      .patch(`/contact-requests/${id}/status`, {
        status: "CLOSED",
        outcome,
        ...(outcomeNote ? { outcomeNote } : {}),
      })
      .then(loadContactRequests)
      .catch((error) => showAlert(mgmtAlert(), error.message));
    return;
  }

  const setInvoiceBtn = e.target.closest("[data-set-invoice]");
  if (setInvoiceBtn) {
    const id = setInvoiceBtn.dataset.setInvoice;
    const input = document.querySelector(`[data-invoice-amount-input="${id}"]`);
    const amount = Number(input?.value);

    if (!amount || amount <= 0) {
      showAlert(mgmtAlert(), "أدخل مبلغًا صحيحًا أكبر من صفر");
      return;
    }

    api
      .post(`/contact-requests/${id}/invoice`, { amount, currency: "SAR" })
      .then(loadContactRequests)
      .catch((error) => showAlert(mgmtAlert(), error.message));
    return;
  }

  const addOfferBtn = e.target.closest("[data-add-offer]");
  if (addOfferBtn) {
    const id = addOfferBtn.dataset.addOffer;
    const carrier = document.querySelector(`[data-offer-carrier-input="${id}"]`)?.value.trim();
    const amount = Number(document.querySelector(`[data-offer-amount-input="${id}"]`)?.value);

    if (!carrier) {
      showAlert(mgmtAlert(), "أدخل اسم الناقل/الجهة");
      return;
    }
    if (!amount || amount <= 0) {
      showAlert(mgmtAlert(), "أدخل مبلغًا صحيحًا أكبر من صفر");
      return;
    }

    api
      .post(`/contact-requests/${id}/offers`, { carrier, amount, currency: "SAR" })
      .then(loadContactRequests)
      .catch((error) => showAlert(mgmtAlert(), error.message));
    return;
  }

  const confirmPaymentBtn = e.target.closest("[data-confirm-payment]");
  if (confirmPaymentBtn) {
    api
      .post(`/contact-requests/${confirmPaymentBtn.dataset.confirmPayment}/confirm-payment`, {})
      .then(loadContactRequests)
      .catch((error) => showAlert(mgmtAlert(), error.message));
    return;
  }

  const acceptDocBtn = e.target.closest("[data-accept-document]");
  if (acceptDocBtn) {
    api
      .patch(
        `/contact-requests/${acceptDocBtn.dataset.requestId}/documents/${acceptDocBtn.dataset.acceptDocument}/status`,
        { status: "ACCEPTED" }
      )
      .then(loadContactRequests)
      .catch((error) => showAlert(mgmtAlert(), error.message));
    return;
  }

  const rejectDocBtn = e.target.closest("[data-reject-document]");
  if (rejectDocBtn) {
    const documentId = rejectDocBtn.dataset.rejectDocument;
    const note = document.querySelector(`[data-reject-note-input="${documentId}"]`)?.value.trim();

    if (!note) {
      showAlert(mgmtAlert(), "يرجى كتابة سبب الرفض");
      return;
    }

    api
      .patch(`/contact-requests/${rejectDocBtn.dataset.requestId}/documents/${documentId}/status`, {
        status: "REJECTED",
        reviewNote: note,
      })
      .then(loadContactRequests)
      .catch((error) => showAlert(mgmtAlert(), error.message));
    return;
  }

  const uploadDeliverableBtn = e.target.closest("[data-upload-deliverable]");
  if (uploadDeliverableBtn) {
    const id = uploadDeliverableBtn.dataset.uploadDeliverable;
    const label = document.querySelector(`[data-deliverable-label-input="${id}"]`)?.value.trim();
    const file = document.querySelector(`[data-deliverable-file-input="${id}"]`)?.files[0];

    if (!label) {
      showAlert(mgmtAlert(), "أدخل اسم الملف");
      return;
    }
    if (!file) {
      showAlert(mgmtAlert(), "اختر ملفًا لرفعه");
      return;
    }

    const formData = new FormData();
    formData.append("label", label);
    formData.append("file", file);

    api
      .upload(`/contact-requests/${id}/deliverables`, formData)
      .then(loadContactRequests)
      .catch((error) => showAlert(mgmtAlert(), error.message));
  }
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

// --- Umrah Groups ---
//
// A group is a thin wrapper around existing Customers/Orders: readiness
// (visa/ticket/payment/documents) is computed server-side from each
// member's linked Order and is never stored here, so it can't drift from
// the order's real state. See umrah-groups.service.js.

const umrahGroupsState = { groups: [], details: {}, expanded: new Set(), lookup: {} };

async function loadUmrahGroups() {
  try {
    const { data } = await api.get("/umrah-groups");
    umrahGroupsState.groups = data;
    renderUmrahGroups();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function createUmrahGroup() {
  showAlert(mgmtAlert(), "");
  const name = el("ug-name").value.trim();
  if (!name) return showAlert(mgmtAlert(), "اسم الفوج مطلوب.");

  try {
    await api.post("/umrah-groups", {
      name,
      travelDate: el("ug-travelDate").value || undefined,
      airline: el("ug-airline").value.trim() || undefined,
      hotel: el("ug-hotel").value.trim() || undefined,
      transport: el("ug-transport").value.trim() || undefined,
    });
    el("ug-name").value = "";
    el("ug-travelDate").value = "";
    el("ug-airline").value = "";
    el("ug-hotel").value = "";
    el("ug-transport").value = "";
    loadUmrahGroups();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

function readinessBadge(ok, label) {
  return `<span class="badge ${ok ? "status-ACTIVE" : "status-INACTIVE"}">${label}: ${ok ? "جاهز" : "غير جاهز"}</span>`;
}

function renderUmrahGroups() {
  const groups = umrahGroupsState.groups || [];
  if (!groups.length) {
    el("umrah-groups-body").innerHTML = '<p class="muted">لا توجد أفواج عمرة بعد.</p>';
    return;
  }
  el("umrah-groups-body").innerHTML = groups.map(renderUmrahGroupCard).join("");
}

function renderUmrahGroupCard(group) {
  const s = group.summary;
  const expanded = umrahGroupsState.expanded.has(group.id);
  return `
    <div class="card" style="margin-bottom: 14px">
      <div class="stack" style="justify-content: space-between; flex-wrap: wrap">
        <div>
          <div style="font-weight: 700">${group.name} <span class="muted">(${group.code})</span></div>
          <div class="muted" style="font-size: 12px">
            ${group.travelDate ? `السفر: ${formatDate(group.travelDate)}` : "بلا تاريخ سفر محدد"}
            ${group.airline ? ` · ${group.airline}` : ""}${group.hotel ? ` · ${group.hotel}` : ""}${group.transport ? ` · ${group.transport}` : ""}
          </div>
        </div>
        <button type="button" class="btn secondary" data-toggle-group="${group.id}">${expanded ? "إخفاء الأعضاء" : "عرض الأعضاء"}</button>
      </div>
      <div class="grid cols-3" style="margin-top: 12px">
        <div class="muted" style="font-size: 12px">إجمالي الأعضاء: <b>${s.totalMembers}</b></div>
        <div class="muted" style="font-size: 12px">تأشيرة جاهزة: <b>${s.visaReady}</b></div>
        <div class="muted" style="font-size: 12px">تذكرة جاهزة: <b>${s.ticketReady}</b></div>
        <div class="muted" style="font-size: 12px">دفع مكتمل: <b>${s.paymentComplete}</b></div>
        <div class="muted" style="font-size: 12px">مستندات مكتملة: <b>${s.documentsComplete}</b></div>
        <div class="muted" style="font-size: 12px">جاهز بالكامل: <b>${s.fullyReady}</b></div>
      </div>
      ${expanded ? renderUmrahGroupDetail(group.id) : ""}
    </div>`;
}

function renderUmrahGroupDetail(groupId) {
  const detail = umrahGroupsState.details[groupId];
  if (!detail) return '<p class="muted" style="margin-top:12px">جاري التحميل...</p>';

  const lookup = umrahGroupsState.lookup[groupId];

  return `
    <div style="margin-top: 14px; border-top: 1px solid var(--border, #e5e7eb); padding-top: 14px">
      <table>
        <thead><tr><th>العميل</th><th>الجواز</th><th>الطلب</th><th>التأشيرة</th><th>التذكرة</th><th>الدفع</th><th>المستندات</th><th></th></tr></thead>
        <tbody>
          ${
            detail.members.length
              ? detail.members
                  .map(
                    (m) => `
              <tr>
                <td>${m.customer.fullName}</td>
                <td dir="ltr">${m.customer.passportNo}</td>
                <td>${m.order ? m.order.orderNumber : '<span class="muted">بلا طلب مرتبط</span>'}</td>
                <td>${readinessBadge(m.readiness.visaReady, "")}</td>
                <td>${readinessBadge(m.readiness.ticketReady, "")}</td>
                <td>${readinessBadge(m.readiness.paymentReady, "")}</td>
                <td>${readinessBadge(m.readiness.documentsReady, "")}</td>
                <td>${mgmtCanWrite("umrah-groups") ? `<button type="button" class="btn secondary" data-remove-member="${groupId}:${m.id}">إزالة</button>` : ""}</td>
              </tr>`
                  )
                  .join("")
              : `<tr><td colspan="8" class="muted">لا يوجد أعضاء في هذا الفوج بعد.</td></tr>`
          }
        </tbody>
      </table>
      ${
        mgmtCanWrite("umrah-groups")
          ? `
      <div class="stack" style="margin-top: 14px; flex-wrap: wrap">
        <input placeholder="رقم جواز العميل" data-lookup-passport="${groupId}" style="max-width: 200px" />
        <button type="button" class="btn secondary" data-lookup-btn="${groupId}">بحث عن عميل</button>
      </div>
      ${lookup ? renderUmrahLookupResult(groupId, lookup) : ""}
      `
          : ""
      }
    </div>`;
}

function renderUmrahLookupResult(groupId, lookup) {
  if (lookup === "NOT_FOUND") return '<p class="muted" style="margin-top: 10px">لم يتم العثور على عميل بهذا الجواز.</p>';

  const orderOptions = (lookup.orders || [])
    .map((o) => `<option value="${o.id}">${o.orderNumber} — ${o.items?.[0]?.service?.name || "طلب"}</option>`)
    .join("");

  return `
    <div class="card" style="margin-top: 10px; background: #f9fafb">
      <div style="font-weight: 700">${lookup.fullName}</div>
      <div class="muted" style="font-size: 12px">رقم الجواز: ${lookup.passportNo}</div>
      <div class="grid cols-2" style="margin-top: 10px">
        <div class="field">
          <label>ربط بطلب (اختياري)</label>
          <select data-member-order="${groupId}">
            <option value="">بدون ربط بطلب</option>
            ${orderOptions}
          </select>
        </div>
      </div>
      <button type="button" class="btn" style="margin-top: 10px" data-add-member="${groupId}:${lookup.id}">إضافة للفوج</button>
    </div>`;
}

async function toggleUmrahGroup(groupId) {
  if (umrahGroupsState.expanded.has(groupId)) {
    umrahGroupsState.expanded.delete(groupId);
    renderUmrahGroups();
    return;
  }
  umrahGroupsState.expanded.add(groupId);
  renderUmrahGroups();

  try {
    const { data } = await api.get(`/umrah-groups/${groupId}`);
    umrahGroupsState.details[groupId] = data;
    renderUmrahGroups();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function lookupUmrahCustomer(groupId) {
  const input = document.querySelector(`[data-lookup-passport="${groupId}"]`);
  const passportNo = input ? input.value.trim() : "";
  if (!passportNo) return;

  try {
    const { data } = await api.get(`/customers/lookup?passportNo=${encodeURIComponent(passportNo)}`);
    umrahGroupsState.lookup[groupId] = data || "NOT_FOUND";
    renderUmrahGroups();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function addUmrahGroupMember(groupId, customerId) {
  const select = document.querySelector(`[data-member-order="${groupId}"]`);
  const orderId = select ? select.value : "";

  try {
    await api.post(`/umrah-groups/${groupId}/members`, { customerId, orderId: orderId || undefined });
    delete umrahGroupsState.lookup[groupId];
    const { data } = await api.get(`/umrah-groups/${groupId}`);
    umrahGroupsState.details[groupId] = data;
    await loadUmrahGroups();
    umrahGroupsState.expanded.add(groupId);
    renderUmrahGroups();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function removeUmrahGroupMember(groupId, memberId) {
  try {
    await api.delete(`/umrah-groups/${groupId}/members/${memberId}`);
    const { data } = await api.get(`/umrah-groups/${groupId}`);
    umrahGroupsState.details[groupId] = data;
    await loadUmrahGroups();
    umrahGroupsState.expanded.add(groupId);
    renderUmrahGroups();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

function handleUmrahGroupsClick(e) {
  const toggleBtn = e.target.closest("[data-toggle-group]");
  if (toggleBtn) return toggleUmrahGroup(toggleBtn.dataset.toggleGroup);

  const lookupBtn = e.target.closest("[data-lookup-btn]");
  if (lookupBtn) return lookupUmrahCustomer(lookupBtn.dataset.lookupBtn);

  const addBtn = e.target.closest("[data-add-member]");
  if (addBtn) {
    const [groupId, customerId] = addBtn.dataset.addMember.split(":");
    return addUmrahGroupMember(groupId, customerId);
  }

  const removeBtn = e.target.closest("[data-remove-member]");
  if (removeBtn) {
    const [groupId, memberId] = removeBtn.dataset.removeMember.split(":");
    return removeUmrahGroupMember(groupId, memberId);
  }
}

// --- Platform 3.0 Phase 14: Configuration Center ---
// Homepage / Appearance / Visas / Airlines / Airports / Ferries /
// Feature Flags admin panels for the modules built in Phases 2-13, which
// previously had no admin UI at all (API-only). Sections still lacking a
// dedicated control here (homepage section create/reorder/image, ferry
// schedules, visa requirement checklists) are disclosed directly in the
// panel's help text in admin-dashboard.html rather than silently missing.

// --- Homepage ---

async function loadHomepageHero() {
  try {
    const { data } = await api.get("/homepage/hero");
    el("hp-title").value = data.title || "";
    el("hp-ctaLabel").value = data.ctaLabel || "";
    el("hp-description").value = data.description || "";
    el("hp-ctaTarget").value = data.ctaTarget || "";
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function saveHomepageHero() {
  showAlert(mgmtAlert(), "");
  try {
    await api.patch("/homepage/hero", {
      title: el("hp-title").value.trim() || null,
      ctaLabel: el("hp-ctaLabel").value.trim() || null,
      description: el("hp-description").value.trim() || null,
      ctaTarget: el("hp-ctaTarget").value.trim() || null,
    });
    loadHomepageHero();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function loadHomepageSections() {
  try {
    const { data } = await api.get("/homepage/sections");
    const canWrite = mgmtCanWrite("homepage");
    el("homepage-sections-body").innerHTML = data
      .map(
        (s) => `
        <tr>
          <td>${s.key}</td>
          <td>${s.title}</td>
          <td>${s.sortOrder}</td>
          <td>${s.visible ? '<span class="badge status-ACTIVE">ظاهر</span>' : '<span class="badge status-INACTIVE">مخفي</span>'}</td>
          <td>${canWrite ? `<button type="button" class="btn secondary" data-toggle-section="${s.id}" data-visible="${s.visible}">${s.visible ? "إخفاء" : "إظهار"}</button>` : ""}</td>
        </tr>`
      )
      .join("");
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

function handleHomepageSectionToggle(e) {
  const btn = e.target.closest("[data-toggle-section]");
  if (!btn) return;
  const visible = btn.dataset.visible === "true";
  api
    .patch(`/homepage/sections/${btn.dataset.toggleSection}`, { visible: !visible })
    .then(loadHomepageSections)
    .catch((error) => showAlert(mgmtAlert(), error.message));
}

// --- Appearance / Theme ---

async function loadTheme() {
  try {
    const { data } = await api.get("/theme");
    el("th-primary").value = data.primary || "";
    el("th-secondary").value = data.secondary || "";
    el("th-accent").value = data.accent || "";
    el("th-background").value = data.background || "";
    el("th-text").value = data.text || "";
    el("th-button").value = data.button || "";
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function saveTheme() {
  showAlert(mgmtAlert(), "");
  try {
    await api.patch("/theme", {
      primary: el("th-primary").value.trim() || null,
      secondary: el("th-secondary").value.trim() || null,
      accent: el("th-accent").value.trim() || null,
      background: el("th-background").value.trim() || null,
      text: el("th-text").value.trim() || null,
      button: el("th-button").value.trim() || null,
    });
    loadTheme();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

// --- Visas (VisaType directory) ---

// Labels for VisaType.category (VISA_TYPE_CATEGORIES, backend/src/utils/enums.js)
// — the field that determines which public section (International Visas /
// Umrah / Family Visit) a visa type appears under.
const VISA_TYPE_CATEGORY_LABELS = {
  INTERNATIONAL: "التأشيرات الدولية",
  UMRAH: "العمرة",
  FAMILY_VISIT: "الزيارة العائلية",
  OTHER: "أخرى",
};

async function loadVisaTypes() {
  try {
    const { data } = await api.get("/visa-types?limit=100");
    const canWrite = mgmtCanWrite("visas");
    el("visas-body").innerHTML = data
      .map(
        (vt) => `
        <tr>
          <td>${vt.code}</td>
          <td>${vt.name}</td>
          <td>${vt.country}</td>
          <td>${VISA_TYPE_CATEGORY_LABELS[vt.category] || vt.category || "—"}</td>
          <td>${formatMoney(vt.basePrice, vt.currency)}</td>
          <td>${vt.active ? '<span class="badge status-ACTIVE">مفعّل</span>' : '<span class="badge status-INACTIVE">معطّل</span>'}</td>
          <td>
            <button type="button" class="btn secondary" data-manage-requirements="${vt.id}" data-name="${escapeHtml(vt.name)}">المتطلبات</button>
            ${canWrite ? `<button type="button" class="btn secondary" data-toggle-visa="${vt.id}" data-active="${vt.active}">${vt.active ? "تعطيل" : "تفعيل"}</button>` : ""}
          </td>
        </tr>`
      )
      .join("");
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function createVisaType() {
  showAlert(mgmtAlert(), "");
  const code = el("vt-code").value.trim();
  const name = el("vt-name").value.trim();
  const country = el("vt-country").value.trim();
  const category = el("vt-category").value;
  if (!code || !name || !country) return showAlert(mgmtAlert(), "الرمز والاسم والدولة مطلوبة.");

  try {
    await api.post("/visa-types", {
      code,
      name,
      country,
      category,
      basePrice: Number(el("vt-basePrice").value) || 0,
    });
    el("vt-code").value = "";
    el("vt-name").value = "";
    el("vt-country").value = "";
    el("vt-basePrice").value = "0";
    el("vt-category").value = "OTHER";
    loadVisaTypes();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

function handleVisaTypeRowClick(e) {
  const manageBtn = e.target.closest("[data-manage-requirements]");
  if (manageBtn) {
    openVisaRequirements(manageBtn.dataset.manageRequirements, manageBtn.dataset.name);
    return;
  }
  const btn = e.target.closest("[data-toggle-visa]");
  if (!btn) return;
  const active = btn.dataset.active === "true";
  api
    .patch(`/visa-types/${btn.dataset.toggleVisa}`, { active: !active })
    .then(loadVisaTypes)
    .catch((error) => showAlert(mgmtAlert(), error.message));
}

// --- Visa requirements checklist editor (Phase 5 API; previously API-only) ---

let currentVisaRequirementsTypeId = null;

function openVisaRequirements(visaTypeId, visaName) {
  currentVisaRequirementsTypeId = visaTypeId;
  el("visa-requirements-title").textContent = visaName || "";
  el("visa-requirements-card").classList.remove("hidden");
  const canWrite = mgmtCanWrite("visas");
  el("visa-requirement-create-card").classList.toggle("hidden", !canWrite);
  el("visa-requirement-create-btn").classList.toggle("hidden", !canWrite);
  loadVisaRequirements();
  el("visa-requirements-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeVisaRequirements() {
  currentVisaRequirementsTypeId = null;
  el("visa-requirements-card").classList.add("hidden");
}

async function loadVisaRequirements() {
  if (!currentVisaRequirementsTypeId) return;
  try {
    const { data } = await api.get(`/visa-types/${currentVisaRequirementsTypeId}/requirements`);
    const canWrite = mgmtCanWrite("visas");
    el("visa-requirements-body").innerHTML = data
      .map(
        (r) => `
        <tr>
          <td>${escapeHtml(r.name)}${r.nameEn ? `<div class="muted" style="font-size: 11px">${escapeHtml(r.nameEn)}</div>` : ""}</td>
          <td>${r.attachmentType ? escapeHtml(r.attachmentType) : "—"}</td>
          <td>${r.maxFiles ?? "—"}</td>
          <td>${r.required ? "نعم" : "لا"}</td>
          <td>${r.active ? '<span class="badge status-ACTIVE">مفعّل</span>' : '<span class="badge status-INACTIVE">معطّل</span>'}</td>
          <td>${
            canWrite
              ? `<button type="button" class="btn secondary" data-toggle-requirement="${r.id}" data-active="${r.active}">${r.active ? "تعطيل" : "تفعيل"}</button>
                 <button type="button" class="btn secondary" data-delete-requirement="${r.id}">حذف</button>`
              : ""
          }</td>
        </tr>`
      )
      .join("");
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function createVisaRequirement() {
  if (!currentVisaRequirementsTypeId) return;
  showAlert(mgmtAlert(), "");
  const name = el("vr-name").value.trim();
  if (!name) return showAlert(mgmtAlert(), "اسم المتطلب مطلوب.");

  try {
    await api.post(`/visa-types/${currentVisaRequirementsTypeId}/requirements`, {
      name,
      nameEn: el("vr-nameEn").value.trim() || undefined,
      attachmentType: el("vr-attachmentType").value.trim() || undefined,
      maxFiles: Number(el("vr-maxFiles").value) || 1,
      sortOrder: Number(el("vr-sortOrder").value) || 0,
      required: el("vr-required").checked,
    });
    el("vr-name").value = "";
    el("vr-nameEn").value = "";
    el("vr-attachmentType").value = "";
    el("vr-maxFiles").value = "1";
    el("vr-sortOrder").value = "0";
    el("vr-required").checked = true;
    loadVisaRequirements();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

function handleVisaRequirementRowClick(e) {
  const toggleBtn = e.target.closest("[data-toggle-requirement]");
  if (toggleBtn) {
    const active = toggleBtn.dataset.active === "true";
    api
      .patch(`/visa-types/requirements/${toggleBtn.dataset.toggleRequirement}`, { active: !active })
      .then(loadVisaRequirements)
      .catch((error) => showAlert(mgmtAlert(), error.message));
    return;
  }
  const deleteBtn = e.target.closest("[data-delete-requirement]");
  if (deleteBtn) {
    if (!confirm("حذف هذا المتطلب؟")) return;
    api
      .delete(`/visa-types/requirements/${deleteBtn.dataset.deleteRequirement}`)
      .then(loadVisaRequirements)
      .catch((error) => showAlert(mgmtAlert(), error.message));
  }
}

// --- Airlines (Airline directory) ---

async function loadAirlines() {
  try {
    const { data } = await api.get("/airlines");
    const canWrite = mgmtCanWrite("airlines");
    el("airlines-body").innerHTML = data
      .map(
        (a) => `
        <tr>
          <td>${a.name}</td>
          <td dir="ltr">${a.iataCode || "-"}</td>
          <td dir="ltr">${a.icaoCode || "-"}</td>
          <td>${a.active ? '<span class="badge status-ACTIVE">مفعّل</span>' : '<span class="badge status-INACTIVE">معطّل</span>'}</td>
          <td>${canWrite ? `<button type="button" class="btn secondary" data-toggle-airline="${a.id}" data-active="${a.active}">${a.active ? "تعطيل" : "تفعيل"}</button>` : ""}</td>
        </tr>`
      )
      .join("");
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function createAirline() {
  showAlert(mgmtAlert(), "");
  const name = el("al-name").value.trim();
  if (!name) return showAlert(mgmtAlert(), "الاسم مطلوب.");

  try {
    await api.post("/airlines", {
      name,
      iataCode: el("al-iata").value.trim() || undefined,
      icaoCode: el("al-icao").value.trim() || undefined,
    });
    el("al-name").value = "";
    el("al-iata").value = "";
    el("al-icao").value = "";
    loadAirlines();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

function handleAirlineRowClick(e) {
  const btn = e.target.closest("[data-toggle-airline]");
  if (!btn) return;
  const active = btn.dataset.active === "true";
  api
    .patch(`/airlines/${btn.dataset.toggleAirline}`, { active: !active })
    .then(loadAirlines)
    .catch((error) => showAlert(mgmtAlert(), error.message));
}

// --- Airports (Airport directory) ---
// A large, searched dataset (see admin-dashboard.html's disclosure) — this
// lists only the most recent page rather than offering full pagination
// here; use GET /api/airports/search for finding a specific one.

async function loadAirports() {
  try {
    const { data } = await api.get("/airports?limit=50");
    el("airports-body").innerHTML = data
      .map(
        (ap) => `
        <tr>
          <td>${ap.nameAr}${ap.nameEn ? `<div class="muted" style="font-size: 11px">${ap.nameEn}</div>` : ""}</td>
          <td>${ap.cityAr}${ap.cityEn ? `<div class="muted" style="font-size: 11px">${ap.cityEn}</div>` : ""}</td>
          <td>${ap.countryAr}</td>
          <td dir="ltr">${ap.iataCode || "-"}</td>
          <td dir="ltr">${ap.icaoCode || "-"}</td>
        </tr>`
      )
      .join("");
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function createAirport() {
  showAlert(mgmtAlert(), "");
  const nameAr = el("ap-nameAr").value.trim();
  const cityAr = el("ap-cityAr").value.trim();
  const countryAr = el("ap-countryAr").value.trim();
  if (!nameAr || !cityAr || !countryAr) return showAlert(mgmtAlert(), "اسم المطار والمدينة والدولة (عربي) مطلوبة.");

  try {
    await api.post("/airports", {
      nameAr,
      cityAr,
      countryAr,
      nameEn: el("ap-nameEn").value.trim() || undefined,
      cityEn: el("ap-cityEn").value.trim() || undefined,
      iataCode: el("ap-iata").value.trim() || undefined,
    });
    el("ap-nameAr").value = "";
    el("ap-cityAr").value = "";
    el("ap-countryAr").value = "";
    el("ap-nameEn").value = "";
    el("ap-cityEn").value = "";
    el("ap-iata").value = "";
    loadAirports();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

// --- Ferries (FerryOperator directory) ---

async function loadFerryOperators() {
  try {
    const { data } = await api.get("/ferries/operators");
    const canWrite = mgmtCanWrite("ferries");
    el("ferry-operators-body").innerHTML = data
      .map(
        (fo) => `
        <tr>
          <td>${fo.name}</td>
          <td>${fo.active ? '<span class="badge status-ACTIVE">مفعّل</span>' : '<span class="badge status-INACTIVE">معطّل</span>'}</td>
          <td>${canWrite ? `<button type="button" class="btn secondary" data-toggle-ferry-operator="${fo.id}" data-active="${fo.active}">${fo.active ? "تعطيل" : "تفعيل"}</button>` : ""}</td>
        </tr>`
      )
      .join("");
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

async function createFerryOperator() {
  showAlert(mgmtAlert(), "");
  const name = el("fo-name").value.trim();
  if (!name) return showAlert(mgmtAlert(), "الاسم مطلوب.");

  try {
    await api.post("/ferries/operators", { name });
    el("fo-name").value = "";
    loadFerryOperators();
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

function handleFerryOperatorRowClick(e) {
  const btn = e.target.closest("[data-toggle-ferry-operator]");
  if (!btn) return;
  const active = btn.dataset.active === "true";
  api
    .patch(`/ferries/operators/${btn.dataset.toggleFerryOperator}`, { active: !active })
    .then(loadFerryOperators)
    .catch((error) => showAlert(mgmtAlert(), error.message));
}

// --- Feature Flags ---
// Fixed key set (FEATURE_FLAG_KEYS, backend/src/modules/feature-flags) —
// toggle-only, never admin-creatable, since each key corresponds to a
// specific server-side enforcement point wired into real routes.

async function loadFeatureFlags() {
  try {
    const { data } = await api.get("/feature-flags");
    const canWrite = mgmtCanWrite("feature-flags");
    el("feature-flags-body").innerHTML = data
      .map(
        (f) => `
        <tr>
          <td>${f.key}</td>
          <td class="muted" style="font-size: 12px">${f.description || "-"}</td>
          <td>${f.enabled ? '<span class="badge status-ACTIVE">مفعّلة</span>' : '<span class="badge status-INACTIVE">معطّلة</span>'}</td>
          <td>${canWrite ? `<button type="button" class="btn secondary" data-toggle-flag="${f.key}" data-enabled="${f.enabled}">${f.enabled ? "تعطيل" : "تفعيل"}</button>` : ""}</td>
        </tr>`
      )
      .join("");
  } catch (error) {
    showAlert(mgmtAlert(), error.message);
  }
}

function handleFeatureFlagToggle(e) {
  const btn = e.target.closest("[data-toggle-flag]");
  if (!btn) return;
  const enabled = btn.dataset.enabled === "true";
  api
    .patch(`/feature-flags/${btn.dataset.toggleFlag}`, { enabled: !enabled })
    .then(loadFeatureFlags)
    .catch((error) => showAlert(mgmtAlert(), error.message));
}
