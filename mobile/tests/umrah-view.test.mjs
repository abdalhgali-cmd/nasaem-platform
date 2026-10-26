import test from "node:test";
import assert from "node:assert/strict";
import { isContactPhone, umrahNeedsGuarantor, umrahPackageDetails, umrahPriceText, validateUmrahContacts } from "../www/js/umrah-view.js";

const air = { id: "a", code: "SVC-UMRAH-AIR", name: "عمرة مع خدمات الطيران", category: "UMRAH_PACKAGE", pricingMode: "FIXED", basePrice: "1500", currency: "SAR", priceUnit: "PER_TRAVELER", features: ["KIND: AIR", "INCLUDED: إصدار تأشيرة العمرة", "INCLUDED: تذاكر الطيران", "EXCLUDED: السكن"] };

test("package type, inclusions and exclusions come from the package's features", () => {
  assert.deepEqual(umrahPackageDetails(air), { kind: "AIR", kindLabel: "مع خدمات الطيران", included: ["إصدار تأشيرة العمرة", "تذاكر الطيران"], excluded: ["السكن"] });
  assert.equal(umrahPackageDetails({ features: ["KIND: other"] }).kind, null);
  assert.equal(umrahPackageDetails({}).kind, null);
});

test("a fixed package shows its exact price per pilgrim or per request; a quoted one shows none", () => {
  assert.match(umrahPriceText(air), /SAR للمعتمر$/);
  assert.match(umrahPriceText({ ...air, priceUnit: "PER_REQUEST" }), /SAR للطلب$/);
  assert.equal(umrahPriceText({ ...air, pricingMode: "QUOTE" }), null);
  assert.equal(umrahPriceText({ ...air, basePrice: "0" }), null);
});

test("guarantor phone required for Umrah services and packages only; extra contact optional", () => {
  assert.ok(umrahNeedsGuarantor(air));
  assert.ok(umrahNeedsGuarantor({ category: "umrah" }));
  assert.ok(!umrahNeedsGuarantor({ category: "UMRAH", isVisaType: true }), "an Umrah visa type is not affected");
  assert.ok(!umrahNeedsGuarantor({ category: "flight" }));
  assert.deepEqual(validateUmrahContacts({}), ["أدخل رقم هاتف الضامن."]);
  assert.deepEqual(validateUmrahContacts({ guarantorPhone: "+966 50 123 4567" }), []);
  assert.equal(validateUmrahContacts({ guarantorPhone: "+966501234567", extraContactName: "أحمد" }).length, 1);
  assert.deepEqual(validateUmrahContacts({ guarantorPhone: "+966501234567", extraContactName: "أحمد", extraContactPhone: "0912345678" }), []);
  assert.ok(isContactPhone("0912345678") && !isContactPhone("abc"));
});

test("home Umrah kinds: published kinds in order with their real lowest price; none invented", async () => {
  const { umrahKindOffers, isUmrahPackage } = await import("../www/js/umrah-view.js");
  const visa = { ...air, id: "v", code: "SVC-UMRAH-VISA", features: ["KIND: VISA_ONLY"], basePrice: "400", priceSdg: "720000" };
  const air2 = { ...air, id: "a2", basePrice: "1300" };
  const sea = { ...air, id: "s", code: "SVC-UMRAH-SEA", features: ["KIND: SEA"], pricingMode: "QUOTE", basePrice: null };
  const flight = { id: "f", code: "SVC-FLIGHT", category: "flight", features: ["KIND: AIR"], basePrice: "10" };

  assert.ok(isUmrahPackage(air) && !isUmrahPackage(flight));
  const offers = umrahKindOffers([sea, air, flight, visa, air2]);
  assert.deepEqual(offers.map((o) => o.kind), ["VISA_ONLY", "AIR", "SEA"]);
  assert.match(offers[0].priceText, /^\S+ SAR للمعتمر$/, "single package: its exact price, no «من»");
  assert.match(offers[0].sdgText, /SDG/, "the server's SDG conversion is shown");
  assert.ok(offers[1].priceText.startsWith("من "), "two AIR packages: lowest, marked «من»");
  assert.match(offers[1].priceText, /١٬٣٠٠|1,300|1300/);
  assert.equal(offers[1].packageCount, 2);
  assert.equal(offers[2].priceText, null, "a quoted package has no price on home");

  // A fixed price without an agency exchange rate: the notice, not an estimate.
  const [noRate] = umrahKindOffers([{ ...visa, priceSdg: null }]);
  assert.equal(noRate.sdgText, "المقابل بالجنيه السوداني غير متاح حاليًا");
  assert.deepEqual(umrahKindOffers([air]).map((o) => o.kind), ["AIR"], "unpublished kinds are omitted");
  assert.deepEqual(umrahKindOffers([]), []);
  assert.deepEqual(umrahKindOffers(null), []);
});

test("home Umrah kinds never compare prices across currencies", async () => {
  const { umrahKindOffers } = await import("../www/js/umrah-view.js");
  const sar = { ...air, id: "x", basePrice: "1500", currency: "SAR" };
  const usd = { ...air, id: "y", basePrice: "400", currency: "USD" };
  const [offer] = umrahKindOffers([sar, usd]);
  assert.match(offer.priceText, /SAR/);
});

test("home Umrah kinds never compare a per-pilgrim price with a per-request one", async () => {
  const { umrahKindOffers } = await import("../www/js/umrah-view.js");
  const perPilgrim = { ...air, id: "p", basePrice: "500", priceUnit: "PER_TRAVELER" };
  const perRequest = { ...air, id: "r", basePrice: "300", priceUnit: "PER_REQUEST" };
  const [offer] = umrahKindOffers([perPilgrim, perRequest]);
  assert.match(offer.priceText, /SAR للمعتمر$/, "the first package's unit is kept");
  assert.ok(!offer.priceText.startsWith("من"), "only one comparable package: exact price");
  assert.equal(offer.packageCount, 2);
});

test("home Umrah kinds link to the cheapest fixed package; a quoted one is not bookable", async () => {
  const { umrahKindOffers } = await import("../www/js/umrah-view.js");
  const cheap = { ...air, id: "cheap", basePrice: "900" };
  const quoted = { ...air, id: "q", code: "SVC-UMRAH-SEA", features: ["KIND: SEA"], pricingMode: "QUOTE", basePrice: "100" };
  const offers = umrahKindOffers([air, cheap, quoted]);
  assert.equal(offers[0].packageId, "cheap");
  assert.equal(offers[1].kind, "SEA");
  assert.equal(offers[1].packageId, null, "a quoted package with a base price is still not bookable");
  assert.equal(offers[1].priceText, null);
});

test("preferred travel date: required for flight/sea packages, optional for visa only, never a past day", async () => {
  const { umrahTravelDateRequired, validateUmrahTravelDate, UMRAH_TRAVEL_DATE_NOTE } = await import("../www/js/umrah-view.js");
  const pkg = (kind) => ({ category: "UMRAH_PACKAGE", features: [`KIND: ${kind}`] });
  assert.equal(umrahTravelDateRequired(pkg("AIR")), true);
  assert.equal(umrahTravelDateRequired(pkg("SEA")), true);
  assert.equal(umrahTravelDateRequired(pkg("VISA_ONLY")), false);
  assert.equal(umrahTravelDateRequired({ category: "flight", features: ["KIND: AIR"] }), false);
  assert.deepEqual(validateUmrahTravelDate("", true), ["حدّد تاريخ السفر المفضل لهذه الباقة."]);
  assert.deepEqual(validateUmrahTravelDate("", false), []);
  assert.deepEqual(validateUmrahTravelDate("2026-10-01", true, "2026-10-26"), ["تاريخ السفر المفضل في الماضي. اختر تاريخًا قادمًا."]);
  assert.deepEqual(validateUmrahTravelDate("2026-12-01", true, "2026-10-26"), []);
  assert.match(UMRAH_TRAVEL_DATE_NOTE, /ليس حجزًا مؤكدًا/);
});

test("Umrah load state: network and server failures are never reported as «not bookable»", async () => {
  const { umrahLoadState } = await import("../www/js/umrah-view.js");
  const offline = umrahLoadState({ error: { status: 0, offline: true, message: "لا يوجد اتصال بالإنترنت." } });
  assert.equal(offline.kind, "NETWORK");
  assert.equal(offline.retry, true);
  assert.doesNotMatch(offline.message, /غير متاحة للحجز/);
  const server = umrahLoadState({ error: { status: 502, message: "x" } });
  assert.equal(server.kind, "API_ERROR");
  assert.match(server.message, /502/);
  assert.equal(server.retry, true);
  assert.equal(umrahLoadState({ packages: [] }).kind, "NONE");
  const quote = { category: "UMRAH_PACKAGE", pricingMode: "QUOTE", basePrice: "1200", currency: "SAR" };
  const unpriced = umrahLoadState({ packages: [quote, { ...quote, pricingMode: "FIXED", basePrice: "0" }] });
  assert.equal(unpriced.kind, "UNPRICED");
  assert.match(unpriced.message, /لم تُحدِّد أسعارها الثابتة/);
  assert.equal(umrahLoadState({ packages: [quote, { ...quote, pricingMode: "FIXED", basePrice: "1500" }] }).kind, "READY");
});
