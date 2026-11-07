import "./env.js";
import { test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createOrganization, createStaffUser, staffClient } from "./helpers/staff.js";

test("a customer's balances are per currency and never add USD to SAR", async () => {
  const org = await createOrganization("cust-balance");
  const accountant = await createStaffUser({ role: "ACCOUNTANT", organizationId: org.id });
  const suffix = uniqueSuffix();
  const customer = await prisma.customer.create({ data: { customerNo: `CB-${suffix}`, fullName: "Balance", organizationId: org.id } });
  const usd = await prisma.order.create({ data: { orderNumber: `CB-USD-${suffix}`, customerId: customer.id, totalAmount: "1000.00", currency: "USD", organizationId: org.id } });
  const sar = await prisma.order.create({ data: { orderNumber: `CB-SAR-${suffix}`, customerId: customer.id, totalAmount: "500.00", currency: "SAR", organizationId: org.id } });
  const client = staffClient(accountant);
  const paid = (await client.post("/api/payments").send({ orderId: usd.id, amount: 400, paymentMethod: "cash" })).body.data;
  await client.post(`/api/payments/${paid.id}/refund`).send({ amount: 100, reason: "استرجاع جزئي" });
  await client.post("/api/payments").send({ orderId: sar.id, amount: 50, paymentMethod: "cash" });

  const res = await client.get(`/api/customers/${customer.id}`);
  assert.equal(res.status, 200);
  const { summary } = res.body.data;
  assert.equal(summary.paidAmount, null, "mixed currencies: no single total");
  const byCurrency = Object.fromEntries(summary.balancesByCurrency.map((b) => [b.currency, b]));
  assert.deepEqual(byCurrency.USD, { currency: "USD", paid: 300, outstanding: 700 });
  assert.deepEqual(byCurrency.SAR, { currency: "SAR", paid: 50, outstanding: 450 });
});
