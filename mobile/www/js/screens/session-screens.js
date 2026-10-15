// Screens shown at launch while a stored session is being checked. They are
// driven by app.js through callbacks in params; none of them signs the
// customer out on its own except the explicit "تسجيل الخروج" choice.
import { esc } from "../ui.js";
import { icon } from "../icons.js";
import { biometricFailure } from "../session-core.js";

export function renderSessionCheckScreen({ bodyEl }) {
  bodyEl.innerHTML = `
    <div class="session-screen" aria-live="polite">
      <div class="session-icon">${icon("shield-check", { size: 30 })}</div>
      <h2>جارٍ التحقق من الجلسة…</h2>
      <p>لحظات ونفتح حسابك.</p>
    </div>`;
}

// Stored session kept, but the server could not confirm it (no network,
// timeout, server error). Retry re-checks; nothing is deleted.
export function renderSessionOfflineScreen({ bodyEl, params }) {
  const { message, onRetry, onUsePassword } = params;
  bodyEl.innerHTML = `
    <div class="session-screen">
      <div class="session-icon session-icon-warn">${icon("wifi-off", { size: 30 })}</div>
      <h2>تعذر التحقق من الجلسة</h2>
      <p>${esc(message || "تعذر الاتصال بالخادم.")}</p>
      <p class="session-hint">جلستك ما زالت محفوظة على هذا الجهاز ولن تحتاج لتسجيل الدخول من جديد. تحقق من الاتصال ثم أعد المحاولة.</p>
      <button class="primary" id="sessionRetry">${icon("refresh", { size: 18 })}<span>إعادة المحاولة</span></button>
      <button class="link-btn" id="sessionUsePassword">الدخول بحساب آخر</button>
    </div>`;

  const retryBtn = bodyEl.querySelector("#sessionRetry");
  const retry = () => {
    retryBtn.disabled = true;
    onRetry();
  };
  retryBtn.addEventListener("click", retry);
  bodyEl.querySelector("#sessionUsePassword").addEventListener("click", onUsePassword);

  // Come back by itself as soon as the device is online again.
  window.addEventListener("online", retry, { once: true });
  return { cleanup: () => window.removeEventListener("online", retry) };
}

// Biometric login is on: the token is locked behind the fingerprint.
export function renderBiometricLockScreen({ bodyEl, params }) {
  const { unlock, onUnlocked, onUsePassword } = params;
  bodyEl.innerHTML = `
    <div class="session-screen">
      <div class="session-icon">${icon("lock", { size: 30 })}</div>
      <h2>الدخول بالبصمة</h2>
      <p>استخدم بصمتك لفتح حسابك.</p>
      <p class="field-error session-message" id="biometricMessage" role="status"></p>
      <button class="primary" id="biometricUnlock">${icon("shield-check", { size: 18 })}<span>استخدام البصمة</span></button>
      <button class="secondary" id="biometricPassword">الدخول بكلمة المرور</button>
    </div>`;

  const messageEl = bodyEl.querySelector("#biometricMessage");
  const unlockBtn = bodyEl.querySelector("#biometricUnlock");

  const attempt = async () => {
    unlockBtn.disabled = true;
    messageEl.textContent = "";
    try {
      await unlock();
      onUnlocked();
    } catch (error) {
      unlockBtn.disabled = false;
      const outcome = biometricFailure(error?.code);
      messageEl.textContent = outcome.message;
      // Biometrics cannot work now (enrollment changed, permanent lockout,
      // sensor gone): leave only the password route on screen.
      if (outcome.action === "password") unlockBtn.hidden = true;
    }
  };

  unlockBtn.addEventListener("click", attempt);
  bodyEl.querySelector("#biometricPassword").addEventListener("click", () => onUsePassword());
  // Prompt immediately on launch; the buttons stay for retry / fallback.
  queueMicrotask(attempt);
}
