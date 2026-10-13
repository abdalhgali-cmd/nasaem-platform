import "./env.js";
import { test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createOrganization } from "./helpers/staff.js";
import { runFinancialDiagnostics } from "../src/scripts/financial-diagnostics.js";

test("diagnostics flag legacy currency mismatches, PARTIAL rows, drift and duplicates without changing data", async () => {
  const org = await createOrganization("diag");
  const suffix = uniqueSuffix();
  const customer = await prisma.customer.create({ data: { customerNo: `DIAG-${suffix}`, fullName: "Diag", organizationId: org.id } });
  const order = await prisma.order.create({
    data: { orderNumber: `DIAG-${suffix}`, customerId: customer.id, totalAmount: "1000.00", currency: "USD", paymentStatus: "PAID", organizationId: org.id },
  });
  const now = Date.now();
  // Legacy rows exactly as the old UI recorded them.
  await prisma.payment.createMany({
    data: [
      { orderId: order.id, amount: "400.00", currency: "SAR", paymentMethod: "cash", status: "PAID", createdAt: new Date(now - 60000) },
      { orderId: order.id, amount: "200.00", currency: "USD", paymentMethod: "cash", status: "PARTIAL", createdAt: new Date(now - 50000) },
      { orderId: order.id, amount: "100.00", currency: "USD", paymentMethod: "cash", status: "PAID", createdAt: new Date(now - 40000) },
      { orderId: order.id, amount: "100.00", currency: "USD", paymentMethod: "cash", status: "PAID", createdAt: new Date(now - 30000) },
    ],
  });
  const before = await prisma.payment.findMany({ where: { orderId: order.id }, orderBy: { id: "asc" } });

  const report = await runFinancialDiagnostics({ organizationId: org.id });
  assert.equal(report.currencyMismatches.length, 1);
  assert.equal(report.currencyMismatches[0].orderCurrency, "USD");
  assert.equal(report.legacyPartialRows.length, 1);
  assert.equal(report.statusDrift.length, 1);
  assert.equal(report.statusDrift[0].computed, "PARTIAL");
  assert.equal(report.statusDrift[0].netPaid, "200.00");
  assert.equal(report.possibleDuplicates.length, 1);
  assert.doesNotMatch(JSON.stringify(report), /Diag/, "no customer names in the output");

  const after = await prisma.payment.findMany({ where: { orderId: order.id }, orderBy: { id: "asc" } });
  assert.deepEqual(after, before, "diagnostics are read-only");
  assert.equal((await prisma.order.findUnique({ where: { id: order.id } })).paymentStatus, "PAID");
});
