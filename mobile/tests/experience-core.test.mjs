// Unit tests for www/js/experience-core.js and the pure parts of agency.js.
import { test } from "node:test";
import assert from "node:assert/strict";

import { launchRoute, firstName, greeting, buildBannerSlides, nextSlide, ONBOARDING_KEY, submissionOutcome, confirmationNotice, newSubmissionKey } from "../www/js/experience-core.js";
import { AGENCY, mergeAgencySettings, whatsappLink, telLink } from "../www/js/agency.js";

test("launch: intro only on a first launch with nothing stored; otherwise the public home", () => {
  assert.equal(launchRoute({ storedKind: "none", onboardingDone: false }), "onboarding");
  assert.equal(launchRoute({ storedKind: "none", onboardingDone: true }), "home");
});

test("launch: a stored account (token or biometric-locked) never blocks the home screen", () => {
  for (const onboardingDone of [true, false]) {
    assert.equal(launchRoute({ storedKind: "token", onboardingDone }), "home");
    assert.equal(launchRoute({ storedKind: "biometric", onboardingDone }), "home");
  }
});

test("onboarding flag is separate from authentication keys", () => {
  assert.equal(ONBOARDING_KEY, "nasaem.onboarding.v1");
  assert.ok(!/token|session|auth/i.test(ONBOARDING_KEY));
});

test("firstName / greeting", () => {
  assert.equal(firstName("أحمد محمد علي"), "أحمد");
  assert.equal(firstName("  سارة  "), "سارة");
  assert.equal(firstName(""), "");
  assert.equal(firstName(null), "");
  assert.equal(greeting(new Date(2026, 0, 1, 9)), "صباح الخير");
  assert.equal(greeting(new Date(2026, 0, 1, 20)), "مساء الخير");
  assert.equal(greeting(new Date(2026, 0, 1, 2)), "مساء الخير");
});

test("banner: only published content, in order hero → sections → coupons", () => {
  const slides = buildBannerSlides({
    hero: { title: "عمرة رمضان", subtitle: "المقاعد محدودة", ctaLabel: "اطلب الآن", ctaTarget: "/umrah" },
    sections: [{ title: "تأشيرات الزيارة", description: "", iconKey: "visa" }, { title: "" }],
    coupons: [{ code: "WELCOME10", discountType: "PERCENTAGE", discountValue: 10 }, { code: "" }],
  });
  assert.deepEqual(slides.map((s) => s.kind), ["hero", "section", "coupon"]);
  assert.equal(slides[0].title, "عمرة رمضان");
  assert.equal(slides[0].action, "اطلب الآن");
  assert.equal(slides[1].title, "تأشيرات الزيارة");
  assert.equal(slides[2].title, "WELCOME10");
  assert.equal(slides[2].text, "خصم 10%");
});

test("banner: no invented offers — empty content gives one non-promotional brand slide", () => {
  for (const input of [undefined, {}, { hero: null, sections: [], coupons: [] }, { hero: { title: "" } }]) {
    const slides = buildBannerSlides(input);
    assert.equal(slides.length, 1);
    assert.equal(slides[0].kind, "brand");
    assert.doesNotMatch(slides[0].text + slides[0].title, /\d/, "the fallback never contains prices or numbers");
  }
});

test("banner: coupon text uses the coupon's own description or its real discount", () => {
  assert.equal(buildBannerSlides({ coupons: [{ code: "A", description: "خصم للعائلات" }] })[0].text, "خصم للعائلات");
  assert.equal(buildBannerSlides({ coupons: [{ code: "B", discountType: "FIXED", discountValue: 50, currency: "SDG" }] })[0].text, "خصم 50 SDG");
  assert.equal(buildBannerSlides({ coupons: [{ code: "C", discountType: "FIXED", discountValue: 0 }] })[0].text, "");
});

test("banner: capped at 6 slides; carousel index wraps", () => {
  const sections = Array.from({ length: 10 }, (_, i) => ({ title: `S${i}` }));
  assert.equal(buildBannerSlides({ sections }).length, 6);
  assert.equal(nextSlide(0, 3), 1);
  assert.equal(nextSlide(2, 3), 0);
  assert.equal(nextSlide(0, 1), 0);
  assert.equal(nextSlide(0, 0), 0);
});

test("agency: published defaults, back-office overrides for contact fields only", () => {
  assert.equal(AGENCY.name, "نسائم الحرمين للسفر والسياحة");
  assert.equal(AGENCY.tagline, "رحلتك تبدأ معنا بثقة");
  const merged = mergeAgencySettings({ CONTACT_PHONE: " +249 12 345 6789 ", WHATSAPP_NUMBER: "+249 12-345-6789", CONTACT_EMAIL: "", SEO_TITLE: "x" });
  assert.equal(merged.phone, "+249 12 345 6789");
  assert.equal(merged.whatsapp, "249123456789");
  assert.equal(merged.email, AGENCY.email, "blank setting keeps the published value");
  assert.equal(merged.name, AGENCY.name, "identity is not overridable from contact settings");
  assert.equal(mergeAgencySettings().whatsapp, AGENCY.whatsapp);
});

test("agency links", () => {
  assert.equal(whatsappLink("+249 91 103 4372"), "https://wa.me/249911034372");
  assert.match(whatsappLink("249911034372", "مرحبا"), /^https:\/\/wa\.me\/249911034372\?text=%D9%85/);
  assert.equal(telLink("+249 91 103 4372"), "tel:+249911034372");
});

test("submission: success only with a real stored id", () => {
  assert.deepEqual(submissionOutcome({ success: true, data: { id: "cm123", customerConfirmation: "QUEUED" } }), { ok: true, id: "cm123", duplicate: false, customerConfirmation: "QUEUED" });
  assert.equal(submissionOutcome({ success: true, data: { id: "cm123", duplicate: true } }).duplicate, true);
  // spam-trap answer: 201 without an id is NOT a success
  assert.deepEqual(submissionOutcome({ success: true, message: "Request received" }), { ok: false });
  assert.deepEqual(submissionOutcome({}), { ok: false });
  assert.deepEqual(submissionOutcome(null), { ok: false });
  assert.deepEqual(submissionOutcome({ data: { id: 42 } }), { ok: false });
  assert.equal(submissionOutcome({ data: { id: "x", customerConfirmation: "DELIVERED" } }).customerConfirmation, "NOT_AVAILABLE", "unknown statuses never read as sent");
});

test("confirmation wording never claims delivery", () => {
  for (const status of ["QUEUED", "NOT_AVAILABLE", undefined]) {
    const text = confirmationNotice(status);
    assert.ok(text.length > 20);
    assert.doesNotMatch(text, /تم إرسال|وصلت|تم التسليم/);
  }
  assert.match(confirmationNotice("QUEUED"), /نحاول/);
});

test("submission keys are random, server-valid and stable per call", () => {
  const a = newSubmissionKey();
  const b = newSubmissionKey();
  assert.notEqual(a, b);
  for (const key of [a, newSubmissionKey({ getRandomValues: (arr) => arr.fill(7) })]) {
    assert.match(key, /^[A-Za-z0-9-]{16,64}$/);
  }
});
