import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { computeSdgSnapshot } from "../src/modules/finance/fx-snapshot.js";
import { listPublicCatalog } from "../src/modules/services/services.service.js";

// Zero is never an exchange rate. A currency without an active rate shows no
// SDG equivalent anywhere; an admin can activate, deactivate and audit it.
describe("exchange rates: active / inactive, never zero", () => {
  let admin;
  let adminUser;
  let employee;
  let before_;

  before(async () => {
    adminUser = await createStaffUser({ role: "ADMIN" });
    admin = staffClient(adminUser);
    employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
    before_ = (await admin.get("/api/flights/admin/rates")).body.data;
  });

  after(async () => {
    await admin.patch("/api/flights/admin/rates").send(before_);
  });

  test("a rate of zero, a negative, a blank or text is refused (400) and changes nothing", async () => {
    await admin.patch("/api/flights/admin/rates").send({ SAR: 150 });
    for (const bad of [0, -5, "", "abc", "0"]) {
      const res = await admin.patch("/api/flights/admin/rates").send({ SAR: bad });
      assert.equal(res.status, 400, `value ${JSON.stringify(bad)}`);
    }
    assert.equal((await admin.get("/api/flights/admin/rates")).body.data.SAR, 150);
  });

  test("deactivating (null) makes the rate unavailable everywhere - null, not 0", async () => {
    assert.equal((await admin.patch("/api/flights/admin/rates").send({ SAR: null })).status, 200);
    const status = (await admin.get("/api/flights/admin/rates/status")).body.data;
    assert.deepEqual([status.SAR.active, status.SAR.rate], [false, null]);
    assert.equal((await admin.get("/api/flights/admin/rates")).body.data.SAR, null);
    assert.equal((await admin.get("/api/flights/rates")).body.data.SAR, null);

    assert.deepEqual(computeSdgSnapshot("SAR", 100, { SAR: null }), { exchangeRateToSdg: null, amountSdg: null, rateFixedAt: null });
    assert.deepEqual(computeSdgSnapshot("SAR", 100, { SAR: 0 }), { exchangeRateToSdg: null, amountSdg: null, rateFixedAt: null });

    const service = await prisma.service.create({ data: { code: `FXOFF-${Date.now()}`, name: "FX off", category: "other", basePrice: 100, currency: "SAR" } });
    try {
      const catalog = await listPublicCatalog();
      const row = catalog.services.find((item) => item.id === service.id);
      assert.equal(row.priceSdg, null, "no equivalent without an active rate");
      assert.equal(row.fxRateToSdg, null);
      assert.equal(Number(row.basePrice), 100, "the original price is still shown");
    } finally {
      await prisma.service.delete({ where: { id: service.id } });
    }
  });

  test("activating sets a real rate; the change is in the audit history with who did it", async () => {
    assert.equal((await admin.patch("/api/flights/admin/rates").send({ SAR: 175.5 })).status, 200);
    const status = (await admin.get("/api/flights/admin/rates/status")).body.data;
    assert.deepEqual([status.SAR.active, status.SAR.rate], [true, 175.5]);

    let history = [];
    for (let i = 0; i < 40 && !history.some((row) => row.newValue?.SAR === 175.5); i += 1) {
      history = (await admin.get("/api/flights/admin/rates/history")).body.data;
      if (!history.some((row) => row.newValue?.SAR === 175.5)) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const entry = history.find((row) => row.newValue?.SAR === 175.5);
    assert.ok(entry, "the change is recorded");
    assert.equal(entry.user.fullName, adminUser.fullName);
    assert.equal(entry.oldValue.SAR, null, "the previous state (inactive) is recorded as null, not 0");
  });

  test("only SUPER_ADMIN and ADMIN can see or change rates", async () => {
    assert.equal((await employee.patch("/api/flights/admin/rates").send({ SAR: 1 })).status, 403);
    assert.equal((await employee.get("/api/flights/admin/rates/status")).status, 403);
    assert.equal((await employee.get("/api/flights/admin/rates/history")).status, 403);
  });
});
