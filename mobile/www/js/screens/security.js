// Account → Security → Biometric Login.
import { esc, toast, setLoading, confirmDialog } from "../ui.js";
import { icon } from "../icons.js";
import { getBiometricStatus, enableBiometricLogin, disableBiometricLogin } from "../auth.js";
import { BIOMETRIC_SUPPORT_LABELS, biometricFailure } from "../session-core.js";

export async function renderSecurityScreen({ bodyEl }) {
  bodyEl.innerHTML = `<div class="loading-block">${icon("clock", { size: 28 })}<p>جارٍ التحقق من دعم البصمة…</p></div>`;
  const status = await getBiometricStatus();
  const supportLabel = BIOMETRIC_SUPPORT_LABELS[status.reason] || BIOMETRIC_SUPPORT_LABELS.UNSUPPORTED;

  bodyEl.innerHTML = `
    <section class="security-card">
      <div class="security-card-head">
        ${icon("shield-check", { size: 22 })}
        <div>
          <h2>الدخول بالبصمة</h2>
          <p class="status-pill ${status.enabled ? "status-on" : ""}" id="biometricState">${status.enabled ? "مفعّل" : "غير مفعّل"}</p>
        </div>
      </div>
      <p class="field-hint" id="biometricSupport">${esc(supportLabel)}</p>
      ${status.enabled
        ? `<button class="danger-btn" id="disableBiometric">إيقاف الدخول بالبصمة</button>`
        : `<button class="primary" id="enableBiometric" ${status.available ? "" : "disabled"}>تفعيل الدخول بالبصمة</button>`}
      <button class="secondary" id="checkBiometric">${icon("refresh", { size: 16 })}<span>التحقق من دعم البصمة</span></button>
      <p class="field-hint">
        البصمة تفتح جلستك المحفوظة على هذا الجهاز فقط، ولا يتم حفظ بصمتك أو إرسالها إلى أي مكان.
        إذا تعذرت البصمة يمكنك دائمًا الدخول بكلمة المرور، أو استعادة كلمة المرور برمز التحقق عبر واتساب.
        عند تغيير البصمات في إعدادات الهاتف يتوقف الدخول بالبصمة تلقائيًا حفاظًا على أمان حسابك.
      </p>
    </section>`;

  bodyEl.querySelector("#checkBiometric").addEventListener("click", () => renderSecurityScreen({ bodyEl }));

  bodyEl.querySelector("#enableBiometric")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setLoading(button, true, "بانتظار البصمة…");
    try {
      await enableBiometricLogin();
      toast("تم تفعيل الدخول بالبصمة");
      renderSecurityScreen({ bodyEl });
    } catch (error) {
      setLoading(button, false);
      const message = error?.code ? biometricFailure(error.code).message : error?.message;
      if (message) toast(message, { tone: "error" });
    }
  });

  bodyEl.querySelector("#disableBiometric")?.addEventListener("click", async (event) => {
    if (!confirmDialog("هل تريد إيقاف الدخول بالبصمة؟ ستبقى مسجّل الدخول على هذا الجهاز.")) return;
    const button = event.currentTarget;
    setLoading(button, true, "جارٍ الإيقاف…");
    try {
      await disableBiometricLogin();
      toast("تم إيقاف الدخول بالبصمة");
      renderSecurityScreen({ bodyEl });
    } catch (error) {
      setLoading(button, false);
      toast(error?.message || "تعذر إيقاف الدخول بالبصمة", { tone: "error" });
    }
  });
}
