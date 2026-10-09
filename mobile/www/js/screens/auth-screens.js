import { esc, toast, fieldError, setLoading } from "../ui.js";
import { icon } from "../icons.js";
import * as auth from "../auth.js";
import { ApiError } from "../api.js";
import { go } from "../router.js";
import { showOtpSupport } from "../otp-support.js";

function applyFieldErrors(form, errors) {
  const fieldErrors = errors?.fieldErrors || {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (!messages?.length) continue;
    const input = form.querySelector(`[name="${CSS.escape(field)}"]`);
    const container = input?.closest(".field");
    if (container) container.insertAdjacentHTML("beforeend", fieldError(messages[0]));
  }
}

let onAuthenticated = () => {};
export function setOnAuthenticated(callback) {
  onAuthenticated = callback;
}

export function renderWelcomeScreen({ bodyEl, params = {} }) {
  bodyEl.innerHTML = `
    <div class="welcome-screen">
      <div class="welcome-top">
        <button type="button" class="welcome-about chip-btn" id="welcomeAbout">${icon("info", { size: 16 })}<span>من نحن</span></button>
      </div>
      ${params.notice ? `<p class="session-notice" role="status">${esc(params.notice)}</p>` : ""}
      <div class="welcome-hero">
        <div class="welcome-mark pop-in"><img src="assets/brand/logo-mark.png" alt="شعار نسائم الحرمين" width="96" height="96"></div>
        <h1 class="reveal" style="--i:1">نسائم الحرمين</h1>
        <p class="welcome-sub reveal" style="--i:2">للسفر والسياحة</p>
        <p class="welcome-tagline reveal" style="--i:3">رحلتك تبدأ معنا بثقة</p>
        <p class="welcome-intro reveal" style="--i:4">عمرة، تذاكر طيران، تأشيرات، فنادق ورحلات بحرية — قدّم طلبك وتابعه من هاتفك.</p>
      </div>
      <div class="welcome-actions">
        <div class="welcome-points" role="list">
          <span role="listitem" class="reveal" style="--i:5">${icon("shield-check", { size: 20 })}<b>نحافظ على خصوصية بياناتك</b></span>
          <span role="listitem" class="reveal" style="--i:6">${icon("clock", { size: 20 })}<b>تابع طلبك خطوة بخطوة</b></span>
          <span role="listitem" class="reveal" style="--i:7">${icon("umrah", { size: 20 })}<b>خدمات سفرك في مكان واحد</b></span>
        </div>
        <button class="primary welcome-login" id="goLogin">تسجيل الدخول</button>
        <button class="secondary" id="goRegister">إنشاء حساب جديد</button>
      </div>
    </div>
  `;
  bodyEl.querySelector("#goLogin").addEventListener("click", () => go("login", {}, { title: "تسجيل الدخول" }));
  bodyEl.querySelector("#goRegister").addEventListener("click", () => go("register", {}, { title: "إنشاء حساب" }));
  bodyEl.querySelector("#welcomeAbout").addEventListener("click", () => go("about", {}, { title: "من نحن" }));
}

export function renderLoginScreen({ bodyEl }) {
  bodyEl.innerHTML = `
    <form id="loginForm" class="form auth-form" novalidate>
      <p class="auth-intro">سجّل الدخول لمتابعة طلباتك وإرسال طلبات جديدة.</p>
      <label class="field">
        <span>رقم الهاتف أو البريد الإلكتروني *</span>
        <input name="identifier" required autocomplete="username">
      </label>
      <label class="field">
        <span>كلمة المرور *</span>
        <div class="password-field">
          <input name="password" type="password" required autocomplete="current-password" id="loginPassword">
          <button type="button" class="icon-btn toggle-password" data-target="loginPassword">${icon("eye", { size: 18 })}</button>
        </div>
      </label>
      <button type="button" class="link-btn" id="forgotPasswordLink">نسيت كلمة المرور؟</button>
      <button type="submit" class="primary" id="loginSubmit">تسجيل الدخول</button>
      <p class="auth-switch">ليس لديك حساب؟ <button type="button" class="link-btn" id="toRegister">أنشئ حسابًا جديدًا</button></p>
    </form>
  `;

  wirePasswordToggle(bodyEl);

  bodyEl.querySelector("#forgotPasswordLink").addEventListener("click", () => go("forgotPassword", {}, { title: "استعادة كلمة المرور" }));
  bodyEl.querySelector("#toRegister").addEventListener("click", () => go("register", {}, { title: "إنشاء حساب" }));

  const form = bodyEl.querySelector("#loginForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    form.querySelectorAll(".field-error").forEach((el) => el.remove());
    const data = Object.fromEntries(new FormData(form));
    const submitBtn = bodyEl.querySelector("#loginSubmit");
    setLoading(submitBtn, true, "جارٍ الدخول…");
    try {
      await auth.login(data);
      toast("تم تسجيل الدخول بنجاح");
      onAuthenticated();
    } catch (error) {
      setLoading(submitBtn, false);
      if (error instanceof ApiError && error.errors) applyFieldErrors(form, error.errors);
      toast(error.message, { tone: "error" });
    }
  });
}

export function renderRegisterScreen({ bodyEl }) {
  bodyEl.innerHTML = `
    <form id="registerForm" class="form auth-form" novalidate>
      <p class="auth-intro">إنشاء حساب يتيح لك إرسال الطلبات ومتابعتها بأمان.</p>
      <label class="field">
        <span>الاسم الكامل *</span>
        <input name="fullName" required autocomplete="name">
      </label>
      <label class="field">
        <span>رقم الهاتف *</span>
        <input name="phone" required inputmode="tel" autocomplete="tel">
      </label>
      <label class="field">
        <span>البريد الإلكتروني (اختياري)</span>
        <input name="email" type="email" autocomplete="email">
      </label>
      <label class="field">
        <span>كلمة المرور * (8 أحرف على الأقل)</span>
        <div class="password-field">
          <input name="password" type="password" minlength="8" required autocomplete="new-password" id="registerPassword">
          <button type="button" class="icon-btn toggle-password" data-target="registerPassword">${icon("eye", { size: 18 })}</button>
        </div>
      </label>
      <button type="submit" class="primary" id="registerSubmit">إنشاء الحساب</button>
      <p class="auth-switch">لديك حساب بالفعل؟ <button type="button" class="link-btn" id="toLogin">تسجيل الدخول</button></p>
    </form>
  `;

  wirePasswordToggle(bodyEl);
  bodyEl.querySelector("#toLogin").addEventListener("click", () => go("login", {}, { title: "تسجيل الدخول" }));

  const form = bodyEl.querySelector("#registerForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    form.querySelectorAll(".field-error").forEach((el) => el.remove());
    const data = Object.fromEntries(new FormData(form));
    const submitBtn = bodyEl.querySelector("#registerSubmit");
    setLoading(submitBtn, true, "جارٍ الإنشاء…");
    try {
      await auth.register(data);
      toast("تم إنشاء الحساب بنجاح");
      onAuthenticated();
    } catch (error) {
      setLoading(submitBtn, false);
      if (error instanceof ApiError && error.errors) applyFieldErrors(form, error.errors);
      toast(error.message, { tone: "error" });
    }
  });
}

export function renderForgotPasswordScreen({ bodyEl }) {
  bodyEl.innerHTML = `
    <form id="forgotForm" class="form auth-form" novalidate>
      <p class="auth-intro">أدخل رقم هاتفك المسجل، وسنرسل لك رمز تحقق عبر واتساب لإعادة تعيين كلمة المرور.</p>
      <label class="field">
        <span>رقم الهاتف *</span>
        <input name="phone" required inputmode="tel" autocomplete="tel">
      </label>
      <button type="submit" class="primary" id="forgotSubmit">إرسال رمز التحقق</button>
      <div id="otpSupportSlot"></div>
    </form>
  `;
  const form = bodyEl.querySelector("#forgotForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = new FormData(form).get("phone");
    const submitBtn = bodyEl.querySelector("#forgotSubmit");
    setLoading(submitBtn, true, "جارٍ الإرسال…");
    try {
      await auth.requestPasswordReset(phone);
      toast("إذا كان الرقم مسجلاً، طلبنا إرسال رمز التحقق إليه عبر واتساب");
      go("resetPassword", { phone }, { title: "تعيين كلمة مرور جديدة" });
    } catch (error) {
      setLoading(submitBtn, false);
      if (!(await showOtpSupport(bodyEl.querySelector("#otpSupportSlot"), error, { context: "استعادة كلمة المرور" }))) {
        toast(error.message, { tone: "error" });
      }
    }
  });
}

export function renderResetPasswordScreen({ bodyEl, params }) {
  bodyEl.innerHTML = `
    <form id="resetForm" class="form auth-form" novalidate>
      <p class="auth-intro">أدخل رمز التحقق المرسل عبر واتساب إلى ${esc(params.phone || "")} وكلمة المرور الجديدة.</p>
      <label class="field">
        <span>رمز التحقق (6 أرقام) *</span>
        <input name="code" required inputmode="numeric" maxlength="6" pattern="\\d{6}">
      </label>
      <label class="field">
        <span>كلمة المرور الجديدة * (8 أحرف على الأقل)</span>
        <input name="newPassword" type="password" minlength="8" required autocomplete="new-password">
      </label>
      <button type="submit" class="primary" id="resetSubmit">تعيين كلمة المرور</button>
      <button type="button" class="link-btn" id="resendCode">إعادة إرسال الرمز</button>
    </form>
  `;

  bodyEl.querySelector("#resendCode").addEventListener("click", async () => {
    try {
      await auth.requestPasswordReset(params.phone);
      toast("تم إرسال رمز جديد عبر واتساب");
    } catch (error) {
      toast(error.message, { tone: "error" });
    }
  });

  const form = bodyEl.querySelector("#resetForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const submitBtn = bodyEl.querySelector("#resetSubmit");
    setLoading(submitBtn, true, "جارٍ الحفظ…");
    try {
      await auth.resetPassword({ phone: params.phone, code: data.code, newPassword: data.newPassword });
      toast("تم تعيين كلمة المرور، سجّل الدخول الآن");
      go("login", {}, { title: "تسجيل الدخول", root: true });
    } catch (error) {
      setLoading(submitBtn, false);
      toast(error.message, { tone: "error" });
    }
  });
}

function wirePasswordToggle(bodyEl) {
  bodyEl.querySelectorAll(".toggle-password").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = bodyEl.querySelector(`#${btn.dataset.target}`);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = icon(show ? "eye-off" : "eye", { size: 18 });
    });
  });
}
