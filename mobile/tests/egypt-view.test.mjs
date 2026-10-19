import test from "node:test";
import assert from "node:assert/strict";
import { EGYPT_UNAVAILABLE, egyptVariantOptions, egyptVariants, isEgyptClearanceItem, selectOptions, variantPriceText } from "../www/js/egypt-view.js";
import { resolveServiceScreen } from "../www/js/catalog.js";

const air = { id: "a", code: "VISA-EGYPT-CLEARANCE-AIR", name: "موافقة حربي — دخول بالطيران", pricingMode: "FIXED", basePrice: "120", currency: "USD", priceUnit: "PER_TRAVELER" };
const border = { id: "b", code: "VISA-EGYPT-CLEARANCE-BORDER", name: "موافقة حربي — دخول عبر المعبر", pricingMode: "FIXED", basePrice: "45000", currency: "SDG", priceUnit: "PER_REQUEST" };
const base = { id: "e", code: "VISA-EGYPT-CLEARANCE", name: "الموافقة الأمنية لمصر", basePrice: "50", currency: "USD" };

test("variants come from the catalog, air first; none means the original item", () => {
  assert.deepEqual(egyptVariants({ visaTypes: [base, border, air] }).map((v) => v.id), ["a", "b"]);
  assert.deepEqual(egyptVariants({ visaTypes: [base] }), []);
  assert.ok(isEgyptClearanceItem(air) && isEgyptClearanceItem(border) && isEgyptClearanceItem(base));
  assert.equal(resolveServiceScreen(air), "egyptClearance");
  assert.equal(resolveServiceScreen(border), "egyptClearance");
});

test("each variant shows its own configured price; unpriced shows 'after review', never another item's price", () => {
  assert.match(variantPriceText(air).text, /USD للمسافر$/);
  assert.match(variantPriceText(border).text, /SDG للطلب$/);
  const quote = variantPriceText({ ...air, pricingMode: "QUOTE" });
  assert.equal(quote.fixed, false);
  assert.equal(quote.text, "يُحدَّد السعر بعد مراجعة الطلب");
  assert.ok(!/50/.test(variantPriceText({ ...border, basePrice: "0" }).text), "the original item's 50 is not reused");
});

test("SELECT options render their Arabic label and submit their stable value ([object Object] regression)", () => {
  const options = selectOptions([{ value: "AIR", label: "منفذ جوي" }, { value: "BORDER", label: "منفذ بري" }]);
  assert.deepEqual(options, [{ value: "AIR", label: "منفذ جوي" }, { value: "BORDER", label: "منفذ بري" }]);
  assert.ok(!options.some((o) => o.value.includes("[object") || o.label.includes("[object")));
  assert.deepEqual(selectOptions(["نعم", "لا"]), [{ value: "نعم", label: "نعم" }, { value: "لا", label: "لا" }]);
});

test("unconfigured catalog: both variants listed as unavailable, nothing bookable, no fallback", () => {
  for (const catalog of [null, { visaTypes: [base] }, { visaTypes: [base, { ...air, pricingMode: "QUOTE" }, { ...border, basePrice: "0" }] }]) {
    const options = egyptVariantOptions(catalog);
    assert.deepEqual(options.map((o) => o.code), ["VISA-EGYPT-CLEARANCE-AIR", "VISA-EGYPT-CLEARANCE-BORDER"]);
    assert.ok(options.every((o) => !o.bookable && o.item === null && o.priceText === EGYPT_UNAVAILABLE));
  }
  const configured = egyptVariantOptions({ visaTypes: [base, air, border] });
  assert.ok(configured.every((o) => o.bookable));
  assert.equal(configured[0].item.id, "a");
});

test("#100: short type labels; route fields by entry method with editable air defaults", async () => {
  const { EGYPT_VARIANTS, EGYPT_AIR_ROUTE_DEFAULTS, egyptVariantEntryMode, validateEgyptRoute } = await import("../www/js/egypt-view.js");
  assert.deepEqual(EGYPT_VARIANTS.map((v) => v.name), ["جوي — مطار القاهرة", "بري — المعبر"]);
  assert.equal(egyptVariantOptions({ visaTypes: [air] })[0].name, "جوي — مطار القاهرة", "the card shows the type label, not the catalog name");
  assert.equal(egyptVariantEntryMode(air), "AIR");
  assert.equal(egyptVariantEntryMode(border), "BORDER");
  assert.equal(egyptVariantEntryMode(base), null);
  assert.deepEqual(EGYPT_AIR_ROUTE_DEFAULTS, { departureCity: "بورتسودان", arrivalAirport: "القاهرة" });
  assert.deepEqual(validateEgyptRoute("AIR", EGYPT_AIR_ROUTE_DEFAULTS), []);
  assert.equal(validateEgyptRoute("AIR", { departureCity: "", arrivalAirport: "القاهرة" }).length, 1);
  assert.deepEqual(validateEgyptRoute("BORDER", { entryPort: "أرقين" }), []);
  assert.equal(validateEgyptRoute("BORDER", {}).length, 1);
  assert.deepEqual(validateEgyptRoute(null, {}), []);
});

test("Egypt variant cards: the server's SDG equivalent or the notice, never a computed one", async () => {
  const { egyptVariantOptions } = await import("../www/js/egypt-view.js");
  const air = { id: "a", code: "VISA-EGYPT-CLEARANCE-AIR", name: "جوي", pricingMode: "FIXED", basePrice: "95", currency: "USD", priceUnit: "PER_TRAVELER", priceSdg: "247000", fxRateToSdg: "2600" };
  const border = { id: "b", code: "VISA-EGYPT-CLEARANCE-BORDER", name: "بري", pricingMode: "FIXED", basePrice: "80", currency: "USD", priceUnit: "PER_TRAVELER" };
  const [airOption, borderOption] = egyptVariantOptions({ services: [], visaTypes: [air, border] });
  assert.match(airOption.sdgText, /^≈ \S+ SDG$/, "the server's priceSdg, formatted");
  assert.equal(borderOption.sdgText, "المقابل بالجنيه السوداني غير متاح حاليًا");
  const [unpublished] = egyptVariantOptions({ services: [], visaTypes: [] });
  assert.equal(unpublished.sdgText, "");
});
