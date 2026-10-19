import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveShortcuts, startingPrice, priceText, sdgText, durationOf, shortDescription, featuredServices, homeFeaturedServices, serviceDirectoryItems, groupRequirements, groupServiceDirectory, FINAL_PRICE_NOTE } from "../www/js/service-view.js";

const catalog = {
  services: [
    { id: "s1", code: "SVC-FLIGHT", name: "طيران", basePrice: "0", currency: "SAR" },
    { id: "s2", code: "SVC-FERRY", name: "عبارات", basePrice: "250", currency: "USD", priceSdg: "150000" },
    { id: "s3", code: "SVC-UMRAH", name: "عمرة", basePrice: "1200", currency: "SAR", priceSdg: null },
  ],
  visaTypes: [
    { id: "v1", code: "VISA-EGYPT-CLEARANCE", name: "موافقة أمنية", basePrice: "50000", currency: "SDG", priceSdg: "50000" },
    { id: "v2", code: "VISA-UMRAH", name: "تأشيرة العمرة", basePrice: "0", currency: "SAR" },
  ],
};

test("shortcuts: only published services, visas hub when visa types exist, VISA code wins over SVC", () => {
  const keys = resolveShortcuts(catalog).map((s) => s.key);
  assert.deepEqual(keys, ["umrah", "visas", "flights", "ferries", "egypt"], "family visit is not published -> no shortcut");
  assert.equal(resolveShortcuts(catalog).find((s) => s.key === "umrah").item.id, "v2");
  assert.deepEqual(resolveShortcuts({ services: [], visaTypes: [] }), []);
});

test("prices come from the catalog, keep the original currency and show SDG only when the server sent it", () => {
  assert.equal(startingPrice(catalog.services[0]), null, "a zero price is not announced");
  const ferry = startingPrice(catalog.services[1]);
  assert.equal(ferry.currency, "USD");
  assert.match(priceText(ferry), /USD/);
  assert.match(sdgText(ferry), /SDG/);
  assert.equal(sdgText(startingPrice(catalog.services[2])), "", "no rate -> no invented conversion");
  assert.equal(sdgText(startingPrice(catalog.visaTypes[0])), "", "already SDG -> no second line");
});

test("featured services are the priced ones only", () => {
  assert.deepEqual(featuredServices(catalog).map((i) => i.id), ["s2", "s3", "v1"]);
  assert.equal(featuredServices(catalog, 1).length, 1);
});

test("service directory shows one visas hub and never repeats VisaTypes beside their Services", () => {
  const items = serviceDirectoryItems(catalog);
  assert.deepEqual(items.map((item) => item.id), ["HUB-VISAS", "s1", "s2", "s3"]);
  assert.equal(items.filter((item) => item.id === "HUB-VISAS").length, 1);
  assert.ok(!items.some((item) => item.isVisaType), "visa types belong inside the visas hub");
  assert.deepEqual(serviceDirectoryItems({ services: catalog.services, visaTypes: [] }).map((item) => item.id), ["s1", "s2", "s3"]);
  const hotel = { id: "hotel", code: "SVC-HOTEL", name: "فنادق", basePrice: "150", currency: "USD" };
  const withHotel = { ...catalog, services: [...catalog.services, hotel] };
  assert.ok(!serviceDirectoryItems(withHotel).some((item) => item.code === "SVC-HOTEL"), "hotel discovery is postponed");
  assert.ok(!homeFeaturedServices(withHotel).some((item) => item.code === "SVC-HOTEL"), "no home hotel offers");
});

test("home featured list excludes shortcut services and individual visa types", () => {
  const withOtherPricedService = {
    ...catalog,
    services: [...catalog.services, { id: "s4", code: "SVC-OTHER", name: "خدمة أخرى", basePrice: "75", currency: "USD" }],
  };
  assert.deepEqual(homeFeaturedServices(withOtherPricedService).map((item) => item.id), ["s4"]);
});

test("duration, description and requirement grouping", () => {
  assert.equal(durationOf({ processingTime: " 3-5 أيام عمل " }), "3-5 أيام عمل");
  assert.equal(durationOf({}), null);
  assert.equal(shortDescription({ description: "ا".repeat(300) }).length, 110);
  const { documents, information } = groupRequirements([
    { name: "صورة", type: "DOCUMENT", required: false, sortOrder: 1 },
    { name: "جواز", type: "DOCUMENT", required: true, sortOrder: 2 },
    { name: "تاريخ السفر", type: "DATE", required: true, sortOrder: 0 },
    { name: "قديم", type: "DOCUMENT", active: false },
  ]);
  assert.deepEqual(documents.map((r) => r.name), ["جواز", "صورة"]);
  assert.deepEqual(information.map((r) => r.name), ["تاريخ السفر"]);
});

test("the final-price note says the final price follows the agency's review", () => {
  assert.match(FINAL_PRICE_NOTE, /بعد أن تراجع الوكالة/);
});

test("Umrah is its own section: never listed among the visas", async () => {
  const { hubVisaTypes } = await import("../www/js/service-view.js");
  const catalog = {
    services: [{ id: "s1", code: "SVC-UMRAH", category: "umrah" }],
    visaTypes: [
      { id: "v1", code: "VISA-UMRAH", category: "UMRAH" },
      { id: "v2", code: "VISA-EGYPT-CLEARANCE", category: "OTHER" },
    ],
  };
  assert.deepEqual(hubVisaTypes(catalog).map((visa) => visa.id), ["v2"]);
  assert.equal(serviceDirectoryItems({ services: [], visaTypes: [catalog.visaTypes[0]] }).length, 0, "no visas hub for Umrah alone");
  assert.equal(resolveShortcuts({ services: [], visaTypes: [catalog.visaTypes[0]] }).some((shortcut) => shortcut.key === "visas"), false);
});

test("approved mobile service directory is grouped without inventing entries or exposing hotels", () => {
  const example = {
    services: [
      { id: "um", code: "SVC-UMRAH", name: "العمرة" },
      { id: "fl", code: "SVC-FLIGHT", name: "الطيران" },
      { id: "fe", code: "SVC-FERRY", name: "البواخر" },
      { id: "ho", code: "SVC-HOTEL", name: "الفنادق" },
      { id: "ot", code: "SVC-OTHER", name: "خدمات أخرى" },
    ],
    visaTypes: [{ id: "eg", code: "VISA-EGYPT-CLEARANCE", category: "VISA" }],
  };
  const grouped = groupServiceDirectory(example);
  assert.deepEqual(grouped.map((g) => g.key), ["umrah", "travel", "visas", "other"]);
  assert.deepEqual(grouped.flatMap((g) => g.items.map((x) => x.code)), [
    "SVC-UMRAH", "SVC-FLIGHT", "SVC-FERRY", "HUB-VISAS", "SVC-OTHER",
  ]);
  assert.equal(groupServiceDirectory({ services: [], visaTypes: [] }).length, 0);
});

test("home bento: published tiles in priority order, never hotels", async () => {
  const { homeBentoTiles } = await import("../www/js/service-view.js");
  const withHotel = { ...catalog, services: [...catalog.services, { id: "h", code: "SVC-HOTEL", name: "فنادق" }] };
  assert.deepEqual(homeBentoTiles(withHotel).map((t) => t.key), ["flights", "ferries", "visas", "egypt"]);
  assert.deepEqual(homeBentoTiles({ services: [], visaTypes: [] }), []);
});

test("service count is dynamic: hotels excluded, linked visa types not double-counted", async () => {
  const { publishedServiceCount } = await import("../www/js/service-view.js");
  const cat = {
    services: [
      { id: "s1", code: "SVC-FLIGHT" }, { id: "s2", code: "SVC-HOTEL" }, { id: "s3", code: "SVC-UMRAH" },
      { id: "s4", code: "SVC-EGYPT-CLEARANCE" },
    ],
    visaTypes: [
      { id: "v1", code: "VISA-UMRAH", category: "UMRAH", serviceId: "s3" },
      { id: "v2", code: "VISA-EGYPT-CLEARANCE", category: "OTHER", serviceId: "s4" },
      { id: "v3", code: "VISA-INTERNATIONAL", category: "INTERNATIONAL", serviceId: null },
    ],
  };
  assert.equal(publishedServiceCount(cat), 4, "flight, umrah, egypt + unlinked international visa");
  assert.equal(publishedServiceCount({ services: [], visaTypes: [] }), 0);
  assert.equal(publishedServiceCount({ services: [], visaTypes: [{ id: "u", code: "VISA-UMRAH", category: "UMRAH" }] }), 1,
    "Umrah published only as a visa type is still one service");
  assert.equal(publishedServiceCount({ services: [{ id: "s3", code: "SVC-UMRAH" }], visaTypes: [{ id: "u", code: "VISA-UMRAH", category: "UMRAH" }] }), 1,
    "an unlinked Umrah visa next to the Umrah service is not counted twice");
});

test("service count text follows Arabic number agreement", async () => {
  const { serviceCountText } = await import("../www/js/service-view.js");
  assert.equal(serviceCountText(1), "خدمة واحدة");
  assert.equal(serviceCountText(2), "خدمتان");
  assert.equal(serviceCountText(4), "4 خدمات");
  assert.equal(serviceCountText(11), "11 خدمة");
  assert.equal(serviceCountText(0), "0 خدمة");
});

test("a fixed-price service never shows quote copy: its own steps and note", async () => {
  const { requestSteps, priceNote, FIXED_REQUEST_STEPS, REQUEST_STEPS, FINAL_PRICE_NOTE } = await import("../www/js/service-view.js");
  const fixed = { pricingMode: "FIXED", basePrice: "450", currency: "SAR" };
  assert.equal(requestSteps(fixed), FIXED_REQUEST_STEPS);
  assert.deepEqual(FIXED_REQUEST_STEPS.map((step) => step.title), ["اختر الخدمة", "المتطلبات", "الدفع", "المتابعة"]);
  assert.ok(!JSON.stringify(FIXED_REQUEST_STEPS).includes("موافقت"), "no price approval step");
  assert.doesNotMatch(priceNote(fixed), /بعد أن تراجع الوكالة|مبدئي/);
  // Quote (default) and a FIXED mode without a positive price keep the quote copy.
  assert.equal(requestSteps({ pricingMode: "QUOTE", basePrice: "10" }), REQUEST_STEPS);
  assert.equal(requestSteps({ pricingMode: "FIXED", basePrice: "0" }), REQUEST_STEPS);
  assert.equal(priceNote({}), FINAL_PRICE_NOTE);
});

test("home featured list never offers an Umrah package outside the Umrah chooser", async () => {
  const { homeFeaturedServices } = await import("../www/js/service-view.js");
  const cat = {
    services: [
      { id: "u1", code: "SVC-UMRAH-VISA", category: "UMRAH_PACKAGE", basePrice: "1200", currency: "SAR" },
      { id: "t1", code: "SVC-PKG-FAMILY", category: "package", basePrice: "2900", currency: "SAR" },
    ],
    visaTypes: [],
  };
  assert.deepEqual(homeFeaturedServices(cat, []).map((item) => item.id), ["t1"]);
});
