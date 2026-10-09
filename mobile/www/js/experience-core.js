// Pure presentation rules (no DOM, no Capacitor): unit-tested by
// tests/experience-core.test.mjs.

export const ONBOARDING_KEY = "nasaem.onboarding.v1";

// What the app opens at launch. The app is usable without an account: the
// only thing that can come before the public home is the one-time
// introduction. A stored account session (token or biometric-locked) never
// blocks the home screen; it is verified in the background, and biometrics
// are asked for only when account data is opened.
export function launchRoute({ storedKind, onboardingDone }) {
  if (storedKind === "none" && !onboardingDone) return "onboarding";
  return "home";
}

export function firstName(fullName) {
  const first = String(fullName || "").trim().split(/\s+/)[0];
  return first || "";
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 4 && hour < 12) return "صباح الخير";
  return "مساء الخير";
}

function couponText(coupon) {
  if (coupon.description) return coupon.description;
  const value = Number(coupon.discountValue);
  if (!(value > 0)) return "";
  return coupon.discountType === "PERCENTAGE" ? `خصم ${value}%` : `خصم ${value} ${coupon.currency || "SAR"}`;
}

// Banner slides come only from content the agency published (homepage hero
// and sections in the back-office, coupons available to this customer).
// Nothing is invented: with no content, a single non-promotional brand slide
// is shown instead.
export function buildBannerSlides({ hero = null, sections = [], coupons = [] } = {}) {
  const slides = [];
  if (hero?.title) {
    slides.push({
      kind: "hero",
      eyebrow: "من نسائم الحرمين",
      title: hero.title,
      text: hero.subtitle || "",
      action: hero.ctaLabel || "",
      target: hero.ctaTarget || "",
    });
  }
  for (const section of sections) {
    if (!section?.title) continue;
    slides.push({ kind: "section", eyebrow: "خدمات مميزة", title: section.title, text: section.description || "", icon: section.iconKey || "star", target: section.href || "" });
  }
  for (const coupon of coupons) {
    if (!coupon?.code) continue;
    slides.push({ kind: "coupon", eyebrow: "كوبون متاح لك", title: coupon.code, text: couponText(coupon), icon: "star" });
  }
  if (!slides.length) {
    slides.push({ kind: "brand", eyebrow: "نسائم الحرمين للسفر والسياحة", title: "رحلتك تبدأ معنا بثقة", text: "عمرة، طيران، تأشيرات، فنادق ورحلات بحرية — في مكان واحد.", icon: "plane" });
  }
  return slides.slice(0, 6);
}

// Next index for an auto-advancing carousel (wraps around).
export function nextSlide(index, count) {
  if (count <= 1) return 0;
  return (index + 1) % count;
}

// The submit endpoint answers 201 with data.id when the request was stored,
// 200 with data.duplicate when a retry hit the already-stored request, and a
// 201 without any id for submissions it silently discards (spam trap). Only
// a real id counts as success.
export function submissionOutcome(body) {
  const id = body?.data?.id;
  if (!id || typeof id !== "string") return { ok: false };
  return {
    ok: true,
    id,
    duplicate: Boolean(body.data.duplicate),
    customerConfirmation: body.data.customerConfirmation === "QUEUED" ? "QUEUED" : "NOT_AVAILABLE",
  };
}

// Honest wording for the confirmation screen: a message being attempted is
// never described as delivered.
export function confirmationNotice(customerConfirmation) {
  return customerConfirmation === "QUEUED"
    ? "نحاول إرسال رسالة تأكيد عبر واتساب إلى رقمك. إن لم تصلك خلال دقائق، احتفظ بالرقم المرجعي للمتابعة."
    : "لن تصلك رسالة تأكيد تلقائية حاليًا. احتفظ بالرقم المرجعي، وتابع طلبك من «طلباتي» برقم هاتفك.";
}

// Random idempotency key for one submission (kept across retries).
export function newSubmissionKey(cryptoImpl = globalThis.crypto) {
  if (cryptoImpl?.randomUUID) return cryptoImpl.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A WhatsApp code that could not be sent (server answered 503 with
// OTP_CHANNEL_UNAVAILABLE / OTP_DELIVERY_FAILED, or the request never got an
// answer). The customer is told plainly that no code is on its way, and is
// offered a person to talk to instead of waiting for a message.
export function otpFailureNotice(error) {
  const code = error?.code;
  if (code === "OTP_CHANNEL_UNAVAILABLE") {
    return { retry: false, message: error.message || "إرسال رمز التحقق عبر واتساب غير متاح حاليًا. تواصل معنا هاتفيًا أو عبر واتساب." };
  }
  if (code === "OTP_DELIVERY_FAILED") {
    return { retry: true, message: error.message || "تعذّر إرسال رمز التحقق عبر واتساب. أعد المحاولة بعد قليل، أو تواصل معنا." };
  }
  if (error?.status === 0 || error?.status >= 500) {
    return { retry: true, message: "لم نتمكن من طلب رمز التحقق الآن، ولم يُرسل أي رمز. أعد المحاولة أو تواصل معنا." };
  }
  return null;
}

// How many files a request form will upload: only inputs that actually hold
// a file count. Optional passport inputs left empty take no slot, and a
// service document counts only while its field applies (a conditional field
// that was hidden after a file was picked is not sent).
//   travelerFiles:    one boolean per traveler — a passport file is selected
//   requirementFiles: one { applies, selected } per DOCUMENT requirement
export function countSelectedDocuments({ travelerFiles = [], requirementFiles = [] } = {}) {
  return travelerFiles.filter(Boolean).length + requirementFiles.filter((r) => r.applies && r.selected).length;
}

// Requirements response → checklist, or null when it can't be trusted. A
// failed or malformed response is never read as "this service needs nothing".
export function parseRequirementsResponse(body) {
  return Array.isArray(body?.data) ? body.data : null;
}
