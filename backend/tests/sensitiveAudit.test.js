import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";

async function waitForLog(where, { tries = 40 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    const rows = await prisma.activityLog.findMany({ where, orderBy: { createdAt: "desc" } });
    if (rows.length) return rows;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return [];
}

// Changes that can redirect customer money or alter prices are staff-admin
// only and always leave an audit entry saying who did it.
describe("sensitive administrative changes are restricted and audited", () => {
  let admin;
  let adminUser;
  let employee;

  before(async () => {
    adminUser = await createStaffUser({ role: "ADMIN" });
    admin = staffClient(adminUser);
    employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
  });

  test("payment accounts: employees are refused; swapping bank details is logged without the number", async () => {
    const body = { name: `Audit ${uniqueSuffix()}`, bankName: "Bank A", accountName: "Nasaem", accountNumber: "111122223333", currency: "SAR" };
    assert.equal((await employee.post("/api/payment-accounts").send(body)).status, 403);
    const created = await admin.post("/api/payment-accounts").send(body);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    assert.equal((await employee.patch(`/api/payment-accounts/${id}`).send({ accountNumber: "999" })).status, 403);

    const updated = await admin.patch(`/api/payment-accounts/${id}`).send({ accountNumber: "999988887777" });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));

    const logs = await waitForLog({ action: "PAYMENT_ACCOUNT_UPDATED", entityId: id });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].userId, adminUser.id);
    assert.equal(logs[0].newValue.bankDetailsChanged, true);
    assert.ok(!JSON.stringify(logs[0]).includes("999988887777"), "the account number never reaches the log");
    assert.ok((await waitForLog({ action: "PAYMENT_ACCOUNT_CREATED", entityId: id })).length === 1);
    await prisma.paymentAccount.delete({ where: { id } });
  });

  test("settings and exchange rates: employees are refused; admin changes record old and new values", async () => {
    const { PUBLIC_SETTING_KEYS } = await import("../src/modules/settings/settings.service.js");
    const key = PUBLIC_SETTING_KEYS[0];
    const originalSetting = await prisma.setting.findUnique({ where: { key } });
    assert.equal((await employee.post("/api/settings").send({ key, value: "x" })).status, 403);
    const saved = await admin.post("/api/settings").send({ key, value: "first" });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    await admin.post("/api/settings").send({ key, value: "second" });
    await waitForLog({ action: "SETTING_UPDATED", entityId: saved.body.data.id });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const all = await prisma.activityLog.findMany({ where: { action: "SETTING_UPDATED", entityId: saved.body.data.id, userId: adminUser.id }, orderBy: { createdAt: "asc" } });
    assert.equal(all.length, 2);
    assert.deepEqual(all[1].oldValue, { [key]: "first" });
    assert.deepEqual(all[1].newValue, { [key]: "second" });

    assert.equal((await employee.patch("/api/flights/admin/rates").send({ SAR: 150 })).status, 403);
    const original = await prisma.setting.findUnique({ where: { key: "FX_SAR_SDG" } });
    const rates = await admin.patch("/api/flights/admin/rates").send({ SAR: 151 });
    assert.equal(rates.status, 200, JSON.stringify(rates.body));
    const fxLogs = await waitForLog({ action: "FX_RATES_UPDATED", userId: adminUser.id });
    assert.equal(fxLogs[0].newValue.SAR, 151);
    if (original) await prisma.setting.update({ where: { key: "FX_SAR_SDG" }, data: { value: original.value } });
    else await prisma.setting.deleteMany({ where: { key: "FX_SAR_SDG" } });
    if (originalSetting) await prisma.setting.update({ where: { key }, data: { value: originalSetting.value } });
    else await prisma.setting.deleteMany({ where: { key } });
  });
});
