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
