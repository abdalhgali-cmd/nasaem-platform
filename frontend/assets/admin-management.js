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
  const rules = {
    branches: ["SUPER_ADMIN"],
    suppliers: ["SUPER_ADMIN"],
    services: ["SUPER_ADMIN", "ADMIN"],
    offers: ["SUPER_ADMIN", "ADMIN"],
    users: ["SUPER_ADMIN"],
    "site-assets": ["SUPER_ADMIN", "ADMIN"],
    "umrah-groups": ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"],
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
    user: "users",
    "umrah-group": "umrah-groups",
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
}

function activateMgmtSubTab(key) {
  document.querySelectorAll("#mgmt-tabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mgmt === key);
  });
  ["branches", "suppliers", "services", "offers", "users", "settings", "activity", "contact-requests", "umrah-groups", "site-assets"].forEach((k) => {
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
  if (tab === "umrah-groups") loadUmrahGroups();
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
