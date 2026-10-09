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
