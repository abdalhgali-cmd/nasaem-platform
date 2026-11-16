import "./env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServiceSchema, updateServiceSchema } from "../src/modules/services/services.validators.js";
import { createVisaTypeSchema, updateVisaTypeSchema } from "../src/modules/visa-types/visa-types.validators.js";
import { createPaymentAccountSchema, updatePaymentAccountSchema } from "../src/modules/payment-accounts/payment-accounts.validators.js";
import { updateOfferSchema } from "../src/modules/offers/offers.validators.js";
import { updateScheduleSchema } from "../src/modules/ferries/ferries.validators.js";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

for (const [label, schema] of [["service", updateServiceSchema], ["visa", updateVisaTypeSchema], ["payment account", updatePaymentAccountSchema], ["offer", updateOfferSchema], ["ferry", updateScheduleSchema]]) {
  test(`${label}: an empty PATCH injects no defaults`, () => {
    assert.deepEqual(schema.parse({}), {});
  });
}

test("creation defaults remain explicit and unchanged", () => {
  assert.equal(createServiceSchema.parse({ code: "TEST", name: "TEST", category: "test", basePrice: 50 }).currency, "SAR");
  const visa = createVisaTypeSchema.parse({ code: "TEST", name: "TEST", country: "TEST", basePrice: 50 });
  assert.equal(visa.currency, "SAR"); assert.equal(visa.category, "OTHER");
  const account = createPaymentAccountSchema.parse({ name: "TEST", bankName: "TEST", accountName: "TEST", currency: "SDG" });
  assert.equal(account.active, true); assert.equal(account.sortOrder, 0); assert.equal(account.acceptsForeignInvoices, false);
});

test("explicit PATCH values retain validation and do not inject other fields", () => {
  assert.deepEqual(updateVisaTypeSchema.parse({ currency: "USD", category: "INTERNATIONAL" }), { currency: "USD", category: "INTERNATIONAL" });
  assert.deepEqual(updatePaymentAccountSchema.parse({ active: false, sortOrder: 7, acceptsForeignInvoices: true }), { active: false, sortOrder: 7, acceptsForeignInvoices: true });
  assert.equal(updateServiceSchema.safeParse({ currency: "INVALID" }).success, false);
  assert.equal(updatePaymentAccountSchema.safeParse({ sortOrder: -1 }).success, false);
});

test("HTTP name-only updates preserve a service's price and currency and a disabled account's settlement settings", async () => {
  const admin = await loginAsSuperAdmin();
  const service = await admin.post("/api/services").send({ code: `TEST-PATCH-${uniqueSuffix()}`, name: "TEST patch service", category: "TEST-PATCH", basePrice: 123.45, currency: "USD", pricingMode: "FIXED", active: false });
  assert.equal(service.status, 201);
  const renamed = await admin.patch(`/api/services/${service.body.data.id}`).send({ name: "TEST renamed service" });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.data.currency, "USD"); assert.equal(Number(renamed.body.data.basePrice), 123.45); assert.equal(renamed.body.data.active, false);
  const account = await admin.post("/api/payment-accounts").send({ name: "TEST disabled account", bankName: "TEST bank", accountName: "TEST holder", currency: "SDG", active: false, sortOrder: 7, acceptsForeignInvoices: true });
  assert.equal(account.status, 201);
  const edited = await admin.patch(`/api/payment-accounts/${account.body.data.id}`).send({ name: "TEST renamed account" });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.data.active, false); assert.equal(edited.body.data.sortOrder, 7); assert.equal(edited.body.data.acceptsForeignInvoices, true); assert.equal(edited.body.data.currency, "SDG");
});
