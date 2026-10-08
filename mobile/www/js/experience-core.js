// Pure presentation rules (no DOM, no Capacitor): unit-tested by
// tests/experience-core.test.mjs.

export const ONBOARDING_KEY = "nasaem.onboarding.v1";

// What the app opens at launch. Onboarding never stands in front of a stored
// session: a returning customer goes straight to the existing session /
// biometric flow (auth.js decides validity, not this function).
export function launchRoute({ storedKind, onboardingDone }) {
  if (storedKind === "biometric") return "biometric";
  if (storedKind === "token") return "verify";
  return onboardingDone ? "auth" : "onboarding";
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
