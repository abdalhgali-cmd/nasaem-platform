import { api, ApiError } from "../api.js";
import { esc, toast, fieldError, setLoading, confirmDialog } from "../ui.js";
import { icon } from "../icons.js";
import { getCustomer, refreshProfile, logout, changePassword } from "../auth.js";
import { go } from "../router.js";

function applyFieldErrors(form, errors) {
  const fieldErrors = errors?.fieldErrors || {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (!messages?.length) continue;
    const input = form.querySelector(`[name="${CSS.escape(field)}"]`);
    const container = input?.closest(".field");
    if (container) container.insertAdjacentHTML("beforeend", fieldError(messages[0]));
  }
}

let onLoggedOut = () => {};
export function setOnLoggedOut(callback) {
  onLoggedOut = callback;
}

let onReplayOnboarding = () => {};
export function setOnReplayOnboarding(callback) {
  onReplayOnboarding = callback;
}

export async function renderAccountScreen({ bodyEl }) {
  let customer = getCustomer();
  try {
    customer = await refreshProfile();
  } catch {
    // Keep showing the cached profile if a refresh fails (offline, etc.).
  }

  bodyEl.innerHTML = `
    <div class="profile-card">
      <div class="avatar">${esc((customer?.fullName || "ن").trim()[0] || "ن")}</div>
      <h2>${esc(customer?.fullName || "")}</h2>
      <p>${esc(customer?.phone || "")}</p>
      ${customer?.customerNo ? `<span class="status-pill">${esc(customer.customerNo)}</span>` : ""}
    </div>

    <div class="account-menu">
      <button class="account-menu-item" id="editProfileBtn">${icon("user", { size: 18 })}<span>تعديل البيانات الشخصية</span>${icon("chevron-start", { size: 16 })}</button>
      <button class="account-menu-item" id="securityBtn">${icon("shield-check", { size: 18 })}<span>الأمان والدخول بالبصمة</span>${icon("chevron-start", { size: 16 })}</button>
      <button class="account-menu-item" id="changePasswordBtn">${icon("lock", { size: 18 })}<span>تغيير كلمة المرور</span>${icon("chevron-start", { size: 16 })}</button>
      <button class="account-menu-item" id="myDocumentsBtn">${icon("document", { size: 18 })}<span>مستنداتي</span>${icon("chevron-start", { size: 16 })}</button>
    </div>

    <div class="account-menu">
      <button class="account-menu-item" id="aboutBtn">${icon("info", { size: 18 })}<span>من نحن وتواصل معنا</span>${icon("chevron-start", { size: 16 })}</button>
      <button class="account-menu-item" id="replayOnboardingBtn">${icon("plane", { size: 18 })}<span>عرض الجولة التعريفية</span>${icon("chevron-start", { size: 16 })}</button>
    </div>

    <button class="danger-btn" id="logoutBtn">${icon("logout", { size: 18 })}<span>تسجيل الخروج</span></button>
  `;

  bodyEl.querySelector("#editProfileBtn").addEventListener("click", () => go("editProfile", { customer }, { title: "تعديل البيانات", tab: "account" }));
  bodyEl.querySelector("#securityBtn").addEventListener("click", () => go("security", {}, { title: "الأمان", tab: "account" }));
  bodyEl.querySelector("#changePasswordBtn").addEventListener("click", () => go("changePassword", {}, { title: "تغيير كلمة المرور", tab: "account" }));
  bodyEl.querySelector("#aboutBtn").addEventListener("click", () => go("about", {}, { title: "من نحن", tab: "account" }));
  bodyEl.querySelector("#replayOnboardingBtn").addEventListener("click", () => onReplayOnboarding());
  bodyEl.querySelector("#myDocumentsBtn").addEventListener("click", () => go("myDocuments", {}, { title: "مستنداتي", tab: "account" }));
  bodyEl.querySelector("#logoutBtn").addEventListener("click", async () => {
    if (!confirmDialog("هل تريد تسجيل الخروج؟")) return;
    await logout();
    onLoggedOut();
  });
}

export function renderEditProfileScreen({ bodyEl, params }) {
  const customer = params.customer || {};
  bodyEl.innerHTML = `
    <form id="profileForm" class="form" novalidate>
      <label class="field"><span>الاسم الكامل</span><input name="fullName" value="${esc(customer.fullName || "")}"></label>
      <label class="field"><span>البريد الإلكتروني</span><input name="email" type="email" value="${esc(customer.email || "")}"></label>
      <label class="field"><span>رقم الجواز</span><input name="passportNo" value="${esc(customer.passportNo || "")}"></label>
      <label class="field"><span>الجنسية</span><input name="nationality" value="${esc(customer.nationality || "")}"></label>
      <div class="field-row">
        <label class="field"><span>الدولة</span><input name="country" value="${esc(customer.country || "")}"></label>
        <label class="field"><span>المدينة</span><input name="city" value="${esc(customer.city || "")}"></label>
      </div>
      <label class="field"><span>العنوان</span><textarea name="address" rows="2">${esc(customer.address || "")}</textarea></label>
      <button type="submit" class="primary" id="saveProfileBtn">حفظ التعديلات</button>
    </form>
  `;
  const form = bodyEl.querySelector("#profileForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    form.querySelectorAll(".field-error").forEach((el) => el.remove());
    const data = Object.fromEntries(new FormData(form));
    const submitBtn = bodyEl.querySelector("#saveProfileBtn");
    setLoading(submitBtn, true, "جارٍ الحفظ…");
    try {
      await api("/customer-auth/profile", { method: "PATCH", body: JSON.stringify(data) });
      await refreshProfile();
      toast("تم حفظ التعديلات");
      go("account", {}, { title: "حسابي", tab: "account", root: true });
    } catch (error) {
      setLoading(submitBtn, false);
      if (error instanceof ApiError && error.errors) applyFieldErrors(form, error.errors);
      toast(error.message, { tone: "error" });
    }
  });
}

export function renderChangePasswordScreen({ bodyEl }) {
  bodyEl.innerHTML = `
    <form id="passwordForm" class="form" novalidate>
      <label class="field"><span>كلمة المرور الحالية *</span><input name="currentPassword" type="password" required autocomplete="current-password"></label>
      <label class="field"><span>كلمة المرور الجديدة * (8 أحرف على الأقل)</span><input name="newPassword" type="password" minlength="8" required autocomplete="new-password"></label>
      <button type="submit" class="primary" id="savePasswordBtn">تحديث كلمة المرور</button>
    </form>
  `;
  const form = bodyEl.querySelector("#passwordForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    form.querySelectorAll(".field-error").forEach((el) => el.remove());
    const data = Object.fromEntries(new FormData(form));
    const submitBtn = bodyEl.querySelector("#savePasswordBtn");
    setLoading(submitBtn, true, "جارٍ التحديث…");
    try {
      await changePassword(data);
      toast("تم تحديث كلمة المرور، وتم تسجيل الخروج من الأجهزة الأخرى");
      go("account", {}, { title: "حسابي", tab: "account", root: true });
    } catch (error) {
      setLoading(submitBtn, false);
      if (error instanceof ApiError && error.errors) applyFieldErrors(form, error.errors);
      toast(error.message, { tone: "error" });
    }
  });
}

export async function renderMyDocumentsScreen({ bodyEl }) {
  bodyEl.innerHTML = `<div class="loading-block">${icon("clock", { size: 28 })}<p>جارٍ تحميل المستندات…</p></div>`;
  try {
    const res = await api("/customer/documents");
    const documents = res.data || [];
    if (!documents.length) {
      bodyEl.innerHTML = `<p class="field-hint">لا توجد مستندات مرفوعة بعد.</p>`;
      return;
    }
    bodyEl.innerHTML = `
      <div class="list">
        ${documents.map((doc) => `
          <div class="list-item">
            <div class="list-item-icon">${icon("document", { size: 18 })}</div>
            <div class="list-item-body">
              <strong>${esc(doc.fileName)}</strong>
              <p>${esc(doc.type || "")}${doc.order?.orderNumber ? ` — ${esc(doc.order.orderNumber)}` : ""}</p>
            </div>
          </div>`).join("")}
      </div>`;
  } catch (error) {
    bodyEl.innerHTML = `<p class="field-hint">${esc(error.message)}</p>`;
  }
}
