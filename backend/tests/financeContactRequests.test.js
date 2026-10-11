import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { getContactRequestPaymentReport } from "../src/modules/finance/finance.service.js";

// Money from customer requests is reported per original currency. Currencies
// are never added together; the SDG figure is only the sum of rates frozen when
// each price was issued.
describe("finance: confirmed customer-request payments by currency", () => {
  const ids = [];
  let organizationId;
  let accountant;
  let employee;

  async function createPaidRequest({ amount, currency, amountSdg = null, status = "CONFIRMED" }) {
    const request = await prisma.contactRequest.create({
      data: {
        organizationId,
        name: "Finance CR",
        phone: `0912${uniqueSuffix()}`.slice(0, 14),
        phoneNormalized: `249${uniqueSuffix()}`.slice(0, 14),
        message: "طلب لاختبار التقارير",
        paymentStatus: status,
        paymentConfirmedAt: status === "CONFIRMED" ? new Date() : null,
        invoice: { create: { amount, currency, amountSdg, exchangeRateToSdg: amountSdg ? amountSdg / amount : null, status: "APPROVED", createdByUserId: accountant.userId } },
      },
    });
    ids.push(request.id);
    return request;
  }

  before(async () => {
    organizationId = `org_fin_${uniqueSuffix()}`;
    await prisma.organization.create({ data: { id: organizationId, slug: organizationId, name: "Finance Org" } });
    const acc = await createStaffUser({ role: "ACCOUNTANT", organizationId });
    accountant = { ...staffClient(acc), userId: acc.id };
    employee = staffClient(await createStaffUser({ role: "EMPLOYEE", organizationId }));
  });

  after(async () => {
    await prisma.contactRequest.deleteMany({ where: { id: { in: ids } } });
  });

  test("totals stay separate per currency and the SDG sum only uses frozen equivalents", async () => {
    await createPaidRequest({ amount: 1000, currency: "SAR", amountSdg: 160000 });
    await createPaidRequest({ amount: 500, currency: "SAR", amountSdg: 80000 });
    await createPaidRequest({ amount: 300, currency: "USD" });
    await createPaidRequest({ amount: 700, currency: "SAR", status: "UNDER_REVIEW" });

    const rows = await getContactRequestPaymentReport({ organizationId });
    const sar = rows.find((r) => r.currency === "SAR");
    const usd = rows.find((r) => r.currency === "USD");
    assert.equal(rows.length, 2, "SAR and USD are never merged");
    assert.deepEqual([sar.confirmedCount, sar.confirmed, sar.confirmedSdg, sar.confirmedWithoutSdgCount], [2, 1500, 240000, 0]);
    assert.deepEqual([sar.underReviewCount, sar.underReview], [1, 700]);
    assert.deepEqual([usd.confirmedCount, usd.confirmed, usd.confirmedSdg, usd.confirmedWithoutSdgCount], [1, 300, 0, 1], "no rate was frozen -> not converted now, flagged instead");
  });

  test("the report endpoint exposes it to finance roles only", async () => {
    const ok = await accountant.get("/api/finance/reports?period=month");
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.ok(Array.isArray(ok.body.data.contactRequestPayments));
    assert.ok(ok.body.data.contactRequestPayments.some((r) => r.currency === "SAR"));
    assert.equal((await employee.get("/api/finance/reports?period=month")).status, 403);
  });
});
