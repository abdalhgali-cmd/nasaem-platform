import "./env.js";
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createOrganization, createStaffUser, staffClient } from "./helpers/staff.js";
import { getFinancialReport } from "../src/modules/finance/finance.service.js";
import {
  PAYMENT_REFUNDS_MIGRATION,
  STAFF_SESSION_MIGRATION,
  assertDatabaseCompatible,
  evaluateRollbackTarget,
  readDatabaseState,
  readLocalCapabilities,
  readLocalMigrations,
} from "../src/release/compatibility.js";
import { describeTargetDir, runRollbackCheck } from "../src/scripts/rollback-check.js";

// Rollback safety. The pre-remediation backend (4bb8a73) would run against
// the migrated schema, but it sums every PAID Payment row, including the
// REFUND rows this release writes, and it ignores revoked staff sessions.
// These tests pin that hazard down with the same queries the old code ran,
// and check the guards and the roll-forward recovery path.

// Exact replicas of the 4bb8a73 calculations (read-only here):
// - payments.service.js:34-46 recalculateOrderPaymentStatus
// - finance.service.js:63 accumulateOrder
async function legacyOrderPaid(orderId) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { totalAmount: true } });
  const payments = await prisma.payment.findMany({ where: { orderId, status: "PAID" }, select: { amount: true } });
  const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const status = total >= Number(order.totalAmount) ? "PAID" : total > 0 ? "PARTIAL" : "UNPAID";
  return { total, status };
}

// What a pre-remediation build looks like to the rollback check: none of
// this release's migrations, no capability file.
const LEGACY_TARGET = {
  targetMigrations: readLocalMigrations().filter((name) => name < STAFF_SESSION_MIGRATION),
  targetCapabilities: [],
};
const CURRENT_TARGET = { targetMigrations: readLocalMigrations(), targetCapabilities: readLocalCapabilities() };

let org;
let accountant;
const orders = {};
const sessions = {};

async function newOrder(total) {
  const suffix = uniqueSuffix();
  const customer = await prisma.customer.create({ data: { customerNo: `RB-${suffix}`, fullName: `Rollback ${suffix}`, organizationId: org.id } });
  return prisma.order.create({ data: { orderNumber: `RB-${suffix}`, customerId: customer.id, totalAmount: total, currency: "USD", organizationId: org.id } });
}

async function settlement(orderId) {
  const res = await staffClient(accountant).get(`/api/orders/${orderId}`);
  assert.equal(res.status, 200);
  return { ...res.body.data.settlement, orderPaymentStatus: res.body.data.paymentStatus };
}

async function paymentSnapshot() {
  const rows = await prisma.payment.findMany({
    where: { order: { organizationId: org.id } },
    orderBy: { id: "asc" },
    select: { id: true, kind: true, status: true, amount: true, currency: true, refundOfPaymentId: true, orderId: true },
  });
  return rows.map((r) => ({ ...r, amount: r.amount.toFixed(2) }));
}

before(async () => {
  org = await createOrganization("rollback");
  accountant = await createStaffUser({ role: "ACCOUNTANT", organizationId: org.id });
  const client = staffClient(accountant);

  // Partial refund: 1000 USD order, 400 received, 100 refunded.
  orders.partial = await newOrder("1000.00");
  const p1 = (await client.post("/api/payments").send({ orderId: orders.partial.id, amount: 400, paymentMethod: "cash" })).body.data;
  assert.equal((await client.post(`/api/payments/${p1.id}/refund`).send({ amount: 100, reason: "استرجاع جزئي" })).status, 201);

  // Full refund: 200 USD order paid in full, then refunded in full.
  orders.full = await newOrder("200.00");
  const p2 = (await client.post("/api/payments").send({ orderId: orders.full.id, amount: 200, paymentMethod: "cash" })).body.data;
  assert.equal((await client.post(`/api/payments/${p2.id}/refund`).send({ amount: 200, reason: "إلغاء الخدمة" })).status, 201);

  // Plain payment, no refund.
  orders.plain = await newOrder("300.00");
  assert.equal((await client.post("/api/payments").send({ orderId: orders.plain.id, amount: 300, paymentMethod: "cash" })).status, 201);

  // Revoked staff sessions: one signed out, one ended by deactivation.
  const loggedOut = await createStaffUser({ role: "EMPLOYEE", organizationId: org.id });
  sessions.loggedOutToken = staffClient(loggedOut).token;
  assert.equal((await staffClient(loggedOut, { token: sessions.loggedOutToken }).post("/api/auth/logout")).status, 200);
  sessions.loggedOut = loggedOut;

  const deactivated = await createStaffUser({ role: "EMPLOYEE", organizationId: org.id });
  sessions.deactivatedToken = staffClient(deactivated).token;
  const admin = await createStaffUser({ role: "SUPER_ADMIN", organizationId: org.id });
  assert.equal((await staffClient(admin).patch(`/api/users/${deactivated.id}/status`).send({ status: "SUSPENDED" })).status, 200);
  assert.equal((await staffClient(admin).patch(`/api/users/${deactivated.id}/status`).send({ status: "ACTIVE" })).status, 200);
  sessions.deactivated = deactivated;
});

describe("rollback hazard: the pre-remediation backend misreads this release's data", () => {
  test("partial refund: correct net is 300, the 4bb8a73 calculation gives 500", async () => {
    const s = await settlement(orders.partial.id);
    assert.equal(s.netPaid, "300.00");
    assert.equal(s.refunded, "100.00");
    assert.equal(s.status, "PARTIAL");
    const legacy = await legacyOrderPaid(orders.partial.id);
    assert.equal(legacy.total, 500, "old code adds the refund row to money received");
  });

  test("full refund: correct status is REFUNDED with net 0, the 4bb8a73 calculation says PAID 400", async () => {
    const s = await settlement(orders.full.id);
    assert.equal(s.netPaid, "0.00");
    assert.equal(s.status, "REFUNDED");
    assert.equal(s.orderPaymentStatus, "REFUNDED");
    assert.deepEqual(await legacyOrderPaid(orders.full.id), { total: 400, status: "PAID" });
  });

  test("an order without refunds reads the same in both versions", async () => {
    const s = await settlement(orders.plain.id);
    assert.equal(s.netPaid, "300.00");
    assert.deepEqual(await legacyOrderPaid(orders.plain.id), { total: 300, status: "PAID" });
  });
});

describe("rollback check", () => {
  test("refuses the pre-remediation backend, naming refunds and revoked sessions", async () => {
    const state = await readDatabaseState(prisma);
    assert.ok(state.refundCount >= 2);
    assert.ok(state.activeRevokedTokens >= 1);
    assert.ok(state.usersWithSessionVersion >= 1);

    const result = evaluateRollbackTarget({ state, ...LEGACY_TARGET });
    assert.equal(result.safe, false);
    const text = result.reasons.join("\n");
    assert.match(text, new RegExp(PAYMENT_REFUNDS_MIGRATION));
    assert.match(text, /payment-refund-settlement-v1/);
    assert.match(text, /refund row\(s\) exist; this target would count them as money received/);
    assert.match(text, /would be accepted again/);
  });

  test("refuses the pre-remediation backend even before any refund exists", () => {
    const state = { appliedMigrations: readLocalMigrations(), refundCount: 0, activeRevokedTokens: 0, usersWithSessionVersion: 0 };
    const result = evaluateRollbackTarget({ state, ...LEGACY_TARGET });
    assert.equal(result.safe, false, "it would also drop session revocation and the security fixes");
    assert.match(result.reasons.join("\n"), /admin-security-remediation-v1/);
  });

  test("refuses a target that has the migrations but does not declare refund handling", () => {
    const state = { appliedMigrations: readLocalMigrations(), refundCount: 3, activeRevokedTokens: 0, usersWithSessionVersion: 0 };
    const capabilities = readLocalCapabilities().filter((c) => c !== "payment-refund-settlement-v1");
    const result = evaluateRollbackTarget({ state, targetMigrations: readLocalMigrations(), targetCapabilities: capabilities });
    assert.equal(result.safe, false);
    assert.match(result.reasons.join("\n"), /3 refund row\(s\) exist/);
  });

  test("refuses a target without fixed-pricing handling once FIXED requests exist", () => {
    const state = { appliedMigrations: readLocalMigrations(), refundCount: 0, activeRevokedTokens: 0, usersWithSessionVersion: 0, fixedPriceRequests: 2 };
    const capabilities = readLocalCapabilities().filter((c) => c !== "fixed-pricing-v1");
    const result = evaluateRollbackTarget({ state, targetMigrations: readLocalMigrations(), targetCapabilities: capabilities });
    assert.equal(result.safe, false);
    const text = result.reasons.join("\n");
    assert.match(text, /fixed-pricing-v1/);
    assert.match(text, /2 fixed-price request\(s\) exist/);
  });

  test("accepts this release candidate (a checkout read from disk)", async () => {
    const result = await runRollbackCheck(describeTargetDir(path.resolve(import.meta.dirname, "..")));
    assert.deepEqual(result.reasons, []);
    assert.equal(result.safe, true);
  });

  test("reads a legacy-shaped checkout (no capability file) as declaring nothing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rollback-target-"));
    for (const name of LEGACY_TARGET.targetMigrations) mkdirSync(path.join(dir, "prisma", "migrations", name), { recursive: true });
    writeFileSync(path.join(dir, "prisma", "migrations", "migration_lock.toml"), "provider = \"postgresql\"\n");
    assert.deepEqual(describeTargetDir(dir), LEGACY_TARGET);
  });
});

describe("startup guard", () => {
  test("this build starts against its own schema", async () => {
    await assertDatabaseCompatible(prisma);
  });

  test("a build that does not know this release's migrations refuses to start", async () => {
    await assert.rejects(
      assertDatabaseCompatible(prisma, { knownMigrations: LEGACY_TARGET.targetMigrations, acknowledged: [] }),
      (error) => error.code === "INCOMPATIBLE_DATABASE" && error.unknownMigrations.includes(PAYMENT_REFUNDS_MIGRATION)
    );
  });

  test("only explicitly acknowledged migration names are tolerated", async () => {
    const known = readLocalMigrations().filter((name) => name !== PAYMENT_REFUNDS_MIGRATION);
    await assert.rejects(assertDatabaseCompatible(prisma, { knownMigrations: known, acknowledged: [] }));
    await assertDatabaseCompatible(prisma, { knownMigrations: known, acknowledged: [PAYMENT_REFUNDS_MIGRATION] });
  });
});

describe("recovery by rolling forward on the preserved database", () => {
  test("a restarted build reads every balance and session correctly without changing any payment row", async () => {
    const before = await paymentSnapshot();
    assert.equal(before.filter((p) => p.kind === "REFUND").length, 2);

    // A restart: new connection, nothing kept in memory.
    await prisma.$disconnect();
    await prisma.$connect();

    const partial = await settlement(orders.partial.id);
    assert.deepEqual([partial.netPaid, partial.outstanding, partial.status], ["300.00", "700.00", "PARTIAL"]);
    const full = await settlement(orders.full.id);
    assert.deepEqual([full.netPaid, full.status], ["0.00", "REFUNDED"]);

    const report = await getFinancialReport({ period: "month", organizationId: org.id });
    const usd = report.totalsByCurrency.find((row) => row.currency === "USD");
    assert.equal(usd.paid, 600, "300 + 0 + 300 net");
    assert.equal(usd.refunds, 300);

    const loggedOut = await staffClient(sessions.loggedOut, { token: sessions.loggedOutToken }).get("/api/auth/me");
    assert.equal(loggedOut.status, 401);
    assert.equal(loggedOut.body.code, "SESSION_REVOKED");
    const deactivated = await staffClient(sessions.deactivated, { token: sessions.deactivatedToken }).get("/api/auth/me");
    assert.equal(deactivated.status, 401);
    assert.equal(deactivated.body.code, "SESSION_REVOKED", "reactivation does not revive the old session");
    const fresh = await prisma.user.findUnique({ where: { id: sessions.deactivated.id } });
    assert.equal((await staffClient(fresh).get("/api/auth/me")).status, 200, "a new sign-in works");

    assert.deepEqual(await paymentSnapshot(), before, "recovery reads data; it never rewrites financial records");
  });
});
