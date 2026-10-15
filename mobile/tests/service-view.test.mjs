import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveShortcuts, startingPrice, priceText, sdgText, durationOf, shortDescription, featuredServices, homeFeaturedServices, serviceDirectoryItems, groupRequirements, FINAL_PRICE_NOTE } from "../www/js/service-view.js";

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
