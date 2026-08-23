import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("finance reports", () => {
  let agent;
  let customerId;
  let serviceId;
  let supplierId;

  before(async () => {
    agent = await loginAsSuperAdmin();

    const customerRes = await agent.post("/api/customers").send({
      fullName: "Finance Test Customer",
      passportNo: "FIN" + uniqueSuffix(),
      nationality: "Test",
    });
    customerId = customerRes.body.data.id;

    const serviceRes = await agent.post("/api/services").send({
      code: "FIN-SVC-" + uniqueSuffix(),
      name: "Finance Test Service",
      category: "umrah",
      basePrice: 100,
    });
    serviceId = serviceRes.body.data.id;

    const supplierRes = await agent.post("/api/suppliers").send({
      code: "FIN-SUP-" + uniqueSuffix(),
      name: "Finance Test Supplier",
      type: "umrah_operator",
    });
    supplierId = supplierRes.body.data.id;
  });

  async function createOrder(unitPrice = 100) {
    const res = await agent.post("/api/orders").send({
      customerId,
      items: [{ serviceId, quantity: 1, unitPrice }],
    });
    return res.body.data;
  }

  test("sets and reads back an order item's supplier cost", async () => {
    const order = await createOrder(200);
    const itemId = order.items[0].id;

    const res = await agent.patch(`/api/orders/${order.id}/items/${itemId}/cost`).send({ supplierId, supplierCost: 120 });
    assert.equal(res.status, 200);
    assert.equal(Number(res.body.data.supplierCost), 120);
    assert.equal(res.body.data.supplier.id, supplierId);
  });

  test("404s setting cost on an item that doesn't belong to the order", async () => {
    const orderA = await createOrder(100);
    const orderB = await createOrder(100);
    const res = await agent.patch(`/api/orders/${orderA.id}/items/${orderB.items[0].id}/cost`).send({ supplierCost: 50 });
    assert.equal(res.status, 404);
  });

  test("EMPLOYEE cannot set order item cost", async () => {
    const suffix = uniqueSuffix();
    const employeeEmail = `finance-employee-${suffix}@nasaem-platform.local`;
    await agent.post("/api/users").send({ fullName: "Finance RBAC Employee", email: employeeEmail, password: "TestPass@12345", role: "EMPLOYEE" });
    const employeeAgent = request.agent(app);
    await employeeAgent.post("/api/auth/login").send({ email: employeeEmail, password: "TestPass@12345" });

    const order = await createOrder(100);
    const res = await employeeAgent.patch(`/api/orders/${order.id}/items/${order.items[0].id}/cost`).send({ supplierCost: 50 });
    assert.equal(res.status, 403);
  });

  test("EMPLOYEE cannot view finance reports, ACCOUNTANT can", async () => {
    const suffix = uniqueSuffix();
    const employeeEmail = `finance-employee2-${suffix}@nasaem-platform.local`;
    await agent.post("/api/users").send({ fullName: "Finance RBAC Employee 2", email: employeeEmail, password: "TestPass@12345", role: "EMPLOYEE" });
    const employeeAgent = request.agent(app);
    await employeeAgent.post("/api/auth/login").send({ email: employeeEmail, password: "TestPass@12345" });
    const employeeRes = await employeeAgent.get("/api/finance/reports");
    assert.equal(employeeRes.status, 403);

    const accountantEmail = `finance-accountant-${suffix}@nasaem-platform.local`;
    await agent.post("/api/users").send({ fullName: "Finance RBAC Accountant", email: accountantEmail, password: "TestPass@12345", role: "ACCOUNTANT" });
    const accountantAgent = request.agent(app);
    await accountantAgent.post("/api/auth/login").send({ email: accountantEmail, password: "TestPass@12345" });
    const accountantRes = await accountantAgent.get("/api/finance/reports");
    assert.equal(accountantRes.status, 200);
  });

  test("requires authentication", async () => {
    const res = await request(app).get("/api/finance/reports");
    assert.equal(res.status, 401);
  });

  test("reports revenue only (no gross profit) for a service whose items never got a supplier cost", async () => {
    // Scoped via a brand-new, never-cost-touched service category so this
    // holds regardless of what other tests in this file/DB have set costs
    // on — the shared "totals" (whole-day) metrics aren't a safe thing to
    // assert "no cost at all" on, since other tests in this same file do
    // set costs on other orders created the same day.
    const suffix = uniqueSuffix();
    const svc = await agent.post("/api/services").send({ code: "FIN-NOCOST-" + suffix, name: "No cost svc", category: `no_cost_${suffix}`, basePrice: 50 });
    await agent.post("/api/orders").send({ customerId, items: [{ serviceId: svc.body.data.id, quantity: 1, unitPrice: 250 }] });

    const res = await agent.get("/api/finance/reports?period=day&groupBy=service");
    assert.equal(res.status, 200);
    const row = res.body.data.breakdown.rows.find((r) => r.key === `no_cost_${suffix}`);
    assert.ok(row, "expected a breakdown row for the new service category");
    assert.equal(row.revenue, 250);
    assert.equal(row.supplierCost, null);
    assert.equal(row.grossProfit, null);
  });

  test("computes gross profit only once every order item in scope has a cost", async () => {
    // Scoped via a brand-new service category (like the no-cost test above)
    // so "every item in scope" is deterministic regardless of other tests'
    // data sharing the same day.
    const suffix = uniqueSuffix();
    const category = `full_cost_${suffix}`;
    const svc = await agent.post("/api/services").send({ code: "FIN-FULLCOST-" + suffix, name: "Full cost svc", category, basePrice: 100 });
    const customerRes = await agent.post("/api/customers").send({ fullName: "Finance Isolated Customer " + suffix, passportNo: "FINISO" + suffix, nationality: "Test" });
    const isolatedCustomerId = customerRes.body.data.id;

    const orderRes = await agent.post("/api/orders").send({ customerId: isolatedCustomerId, items: [{ serviceId: svc.body.data.id, quantity: 1, unitPrice: 500 }] });
    const order = orderRes.body.data;
    await agent.patch(`/api/orders/${order.id}/items/${order.items[0].id}/cost`).send({ supplierId, supplierCost: 300 });

    const res = await agent.get("/api/finance/reports?period=day&groupBy=service");
    assert.equal(res.status, 200);
    const row = res.body.data.breakdown.rows.find((r) => r.key === category);
    assert.ok(row, "expected a breakdown row for the new service category");
    assert.equal(row.revenue, 500);
    assert.equal(row.supplierCost, 300);
    assert.equal(row.grossProfit, 200);
  });

  test("groupBy=employee groups order-level metrics by assigned staff", async () => {
    const order = await createOrder(100);
    await agent.patch(`/api/orders/${order.id}/assign`).send({ assignedUserId: null });

    const res = await agent.get("/api/finance/reports?period=day&groupBy=employee");
    assert.equal(res.status, 200);
    assert.equal(res.body.data.breakdown.groupBy, "employee");
    const unassignedRow = res.body.data.breakdown.rows.find((r) => r.key === "UNASSIGNED");
    assert.ok(unassignedRow);
    assert.ok(unassignedRow.ordersCount >= 1);
  });

  test("rejects an invalid period or groupBy value", async () => {
    const badPeriod = await agent.get("/api/finance/reports?period=year");
    assert.equal(badPeriod.status, 400);

    const badGroup = await agent.get("/api/finance/reports?groupBy=nonsense");
    assert.equal(badGroup.status, 400);
  });
});
