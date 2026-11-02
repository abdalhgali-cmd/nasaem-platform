// The "no code is coming — talk to us instead" panel shown when a WhatsApp
// verification code could not be sent (guest tracking, password reset).
import { esc } from "./ui.js";
import { icon } from "./icons.js";
import { loadAgency, whatsappLink, telLink } from "./agency.js";
import { otpFailureNotice } from "./experience-core.js";

// Renders into `slot` and returns true when `error` is a delivery problem;
// returns false (and leaves the slot empty) for anything else, e.g. a
// validation error the caller shows as usual.
export async function showOtpSupport(slot, error, { context = "" } = {}) {
  const notice = otpFailureNotice(error);
  if (!slot) return Boolean(notice);
  if (!notice) {
    slot.innerHTML = "";
    return false;
  }
  const agency = await loadAgency();
  const text = context ? `مرحبًا، لم يصلني رمز التحقق (${context}).` : "مرحبًا، لم يصلني رمز التحقق.";
  slot.innerHTML = `
    <div class="otp-support" id="otpSupport" role="alert">
      <p>${esc(notice.message)}</p>
      <div class="otp-support-actions">
        <a class="secondary" id="otpSupportWhatsApp" href="${esc(whatsappLink(agency.whatsapp, text))}" target="_blank" rel="noopener">${icon("chat", { size: 18 })}<span>راسلنا عبر واتساب</span></a>
        <a class="secondary" id="otpSupportCall" href="${esc(telLink(agency.phone))}">${icon("phone", { size: 18 })}<span>اتصل بنا</span></a>
      </div>
    </div>`;
  return true;
}
