/* GENERATED from backend/public by scripts/sync-static-admin.mjs. Do not edit here: edit backend/public and run `node scripts/sync-static-admin.mjs`. */
// Only same-site paths are honoured as a post-login destination, never a
// full URL, so a crafted ?next= cannot send staff to another site.
function nextDestination() {
  const next = new URLSearchParams(window.location.search).get("next") || "";
  if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !next.startsWith("/login.html")) return next;
  return "/admin-dashboard.html";
}

(async function redirectIfAlreadyLoggedIn() {
  try {
    await api.get("/auth/me");
    window.location.href = nextDestination();
  } catch (error) {
    // Not logged in (or the server is unreachable) — stay on the login page.
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
    window.location.href = nextDestination();
  } catch (error) {
    const message = error.status === 401 ? "البريد الإلكتروني أو كلمة المرور غير صحيحة" : error.message || "فشل تسجيل الدخول";
    showAlert(alertBox, message);
    submitBtn.disabled = false;
    submitBtn.textContent = "دخول";
  }
});
