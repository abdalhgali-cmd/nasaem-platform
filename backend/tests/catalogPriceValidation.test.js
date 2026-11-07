// Catalog price validation for services and visa types (Codex review,
// 2026-10-28): a sub-cent FIXED price passed "greater than zero" and was
// stored as 0.00, a huge price failed in the database (500), and the FIXED
// rule was checked before the row lock, so two concurrent edits (one to
// FIXED, one to price 0) could together leave FIXED at 0. Synthetic data.
import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";

let admin;
before(async () => {
  admin = staffClient(await createStaffUser({ role: "ADMIN" }));
});

const kinds = [
  { path: "/api/services", create: () => prisma.service.create({ data: { code: `SVC-PRICE-${uniqueSuffix()}`, name: "Price check", category: "qa-price", basePrice: 100, currency: "SAR", pricingMode: "QUOTE" } }), read: (id) => prisma.service.findUnique({ where: { id } }) },
  { path: "/api/visa-types", create: () => prisma.visaType.create({ data: { code: `VISA-PRICE-${uniqueSuffix()}`, name: "Price check", country: "SA", basePrice: 100, currency: "SAR", pricingMode: "QUOTE" } }), read: (id) => prisma.visaType.findUnique({ where: { id } }) },
];

for (const kind of kinds) {
  describe(`${kind.path} price validation`, () => {
    test("sub-cent, huge, non-finite and negative prices are refused with 400; two decimals are accepted", async () => {
      const row = await kind.create();
      for (const basePrice of [0.001, 12.345, 1e13, "Infinity", "NaN", -5]) {
        const res = await admin.patch(`${kind.path}/${row.id}`).send({ pricingMode: "FIXED", basePrice });
        assert.equal(res.status, 400, `${basePrice}: ${res.status} ${JSON.stringify(res.body)}`);
      }
      assert.equal((await kind.read(row.id)).pricingMode, "QUOTE", "nothing was stored");
      const ok = await admin.patch(`${kind.path}/${row.id}`).send({ pricingMode: "FIXED", basePrice: 2650.5 });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(Number((await kind.read(row.id)).basePrice), 2650.5);
    });

    test("FIXED at zero is refused, also when the price comes from the stored row", async () => {
      const row = await kind.create();
      assert.equal((await admin.patch(`${kind.path}/${row.id}`).send({ pricingMode: "FIXED", basePrice: 0 })).body.code, "INVALID_PRICING");
      await prisma[kind.path === "/api/services" ? "service" : "visaType"].update({ where: { id: row.id }, data: { basePrice: 0 } });
      const res = await admin.patch(`${kind.path}/${row.id}`).send({ pricingMode: "FIXED" });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, "INVALID_PRICING");
    });

    test("concurrent edits (one to FIXED, one to price 0) never leave FIXED at 0", async () => {
      for (let round = 0; round < 8; round += 1) {
        const row = await kind.create();
        await Promise.all([
          admin.patch(`${kind.path}/${row.id}`).send({ pricingMode: "FIXED" }),
          admin.patch(`${kind.path}/${row.id}`).send({ basePrice: 0 }),
        ]);
        const final = await kind.read(row.id);
        assert.ok(!(final.pricingMode === "FIXED" && Number(final.basePrice) === 0), `round ${round}: FIXED at 0`);
      }
    });
  });
}
