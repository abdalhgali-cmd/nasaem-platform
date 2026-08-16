(async function redirectIfAlreadyLoggedIn() {
  try {
    await api.get("/auth/me");
    window.location.href = "/admin-dashboard.html";
  } catch (error) {
    // Not logged in — stay on the login page.
  }
})();

const form = document.getElementById("login-form");
const alertBox = document.getElementById("alert-box");
const submitBtn = document.getElementById("submit-btn");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAlert(alertBox, "");
  submitBtn.disabled = true;
  submitBtn.textContent = "جارٍ الدخول...";

  try {
    await api.post("/auth/login", {
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value,
    });
    window.location.href = "/admin-dashboard.html";
  } catch (error) {
    showAlert(alertBox, error.message || "فشل تسجيل الدخول");
    submitBtn.disabled = false;
    submitBtn.textContent = "دخول";
  }
});

// --- Forgot password (WhatsApp OTP) ---

const forgotLink = document.getElementById("forgot-password-link");
const backLink = document.getElementById("back-to-login-link");
const resetForm = document.getElementById("reset-form");
const resetAlert = document.getElementById("reset-alert");
const resetEmailField = document.getElementById("reset-email-field");
const resetCodeField = document.getElementById("reset-code-field");
const resetPasswordField = document.getElementById("reset-password-field");
const resetSubmitBtn = document.getElementById("reset-submit-btn");

let resetStep = "email";
let resetCodeId = null;

function showResetForm() {
  form.classList.add("hidden");
  resetForm.classList.remove("hidden");
}

function showLoginForm() {
  resetForm.classList.add("hidden");
  form.classList.remove("hidden");
  resetStep = "email";
  resetCodeId = null;
  resetCodeField.classList.add("hidden");
  resetPasswordField.classList.add("hidden");
  resetEmailField.classList.remove("hidden");
  resetSubmitBtn.textContent = "إرسال الرمز";
  showAlert(resetAlert, "");
  resetForm.reset();
}

forgotLink.addEventListener("click", (event) => {
  event.preventDefault();
  showResetForm();
});

backLink.addEventListener("click", (event) => {
  event.preventDefault();
  showLoginForm();
});

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAlert(resetAlert, "");
  resetSubmitBtn.disabled = true;

  try {
    if (resetStep === "email") {
      const email = document.getElementById("reset-email").value.trim();
      const result = await api.post("/auth/password-reset/request", { email });
      resetCodeId = result.data.resetCodeId;
      resetStep = "code";
      resetEmailField.classList.add("hidden");
      resetCodeField.classList.remove("hidden");
      resetPasswordField.classList.remove("hidden");
      resetSubmitBtn.textContent = "تأكيد";
      showAlert(resetAlert, "إذا كان البريد مسجّلًا لدى موظف لديه رقم هاتف، سيصلك رمز عبر واتساب.", "success");
      if (result.data.debugCode) {
        document.getElementById("reset-code").value = result.data.debugCode;
      }
    } else {
      await api.post("/auth/password-reset/confirm", {
        resetCodeId,
        code: document.getElementById("reset-code").value.trim(),
        password: document.getElementById("reset-password").value,
      });
      showLoginForm();
      showAlert(alertBox, "تم تحديث كلمة المرور بنجاح، يمكنك تسجيل الدخول الآن.", "success");
    }
  } catch (error) {
    showAlert(resetAlert, error.message || "حدث خطأ، حاول مرة أخرى");
  } finally {
    resetSubmitBtn.disabled = false;
  }
});
