const mgmtState = {
  wired: false,
  services: { page: 1, limit: 10 },
};

function mgmtCanWrite(entity) {
  // Mirrors the requireRole(...) checks on each backend POST route.
  const rules = {
    branches: ["SUPER_ADMIN"],
    suppliers: ["SUPER_ADMIN"],
    services: ["SUPER_ADMIN", "ADMIN"],
    offers: ["SUPER_ADMIN", "ADMIN"],
    users: ["SUPER_ADMIN"],
  };
  return (rules[entity] || []).includes(currentUser.role);
}

// users.routes.js allows PATCH /:id/status for SUPER_ADMIN and ADMIN, unlike
// POST / (create) which is SUPER_ADMIN-only — mgmtCanWrite("users") alone
// would incorrectly hide the toggle button from ADMIN.
function canToggleUserStatus() {
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

  el("branches-body").addEventListener("click", handleBranchRowClick);
  el("suppliers-body").addEventListener("click", handleSupplierRowClick);
  el("services-body").addEventListener("click", handleServiceRowClick);
  el("offers-body").addEventListener("change", handleOfferStatusChange);
  el("users-body").addEventListener("click", handleUserRowClick);
}

function activateMgmtSubTab(key) {
  document.querySelectorAll("#mgmt-tabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mgmt === key);
  });
  ["branches", "suppliers", "services", "offers", "users"].forEach((k) => {
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
