(async function bootstrap() {
  const user = await requireSession();
  if (!user) return;

  renderHeader(user, "change-password");
})();

const form = document.getElementById("change-password-form");
const alertBox = document.getElementById("cp-alert");
const submitBtn = document.getElementById("cp-submit-btn");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAlert(alertBox, "");

  const currentPassword = document.getElementById("cp-current").value;
  const newPassword = document.getElementById("cp-new").value;
  const confirmPassword = document.getElementById("cp-confirm").value;

  if (newPassword !== confirmPassword) {
    showAlert(alertBox, "كلمة المرور الجديدة وتأكيدها غير متطابقين");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "جارٍ الحفظ...";

  try {
    await api.post("/auth/change-password", { currentPassword, newPassword });
    form.reset();
    showAlert(alertBox, "تم تغيير كلمة المرور بنجاح", "success");
  } catch (error) {
    showAlert(alertBox, error.message || "تعذّر تغيير كلمة المرور");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "حفظ كلمة المرور الجديدة";
  }
});
