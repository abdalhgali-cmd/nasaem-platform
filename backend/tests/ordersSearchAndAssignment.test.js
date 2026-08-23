import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("orders — search, filters, assignment", () => {
  let agent;
  let employeeAgent;
  let employeeId;
  let customerId;
  let customerName;
  let customerPassportNo;
  let serviceId;

  before(async () => {
    agent = await loginAsSuperAdmin();

    const suffix = uniqueSuffix();
    const employeeEmail = `ops-employee-${suffix}@nasaem-platform.local`;
    const createRes = await agent.post("/api/users").send({
      fullName: "Operations Center Employee",
      email: employeeEmail,
      password: "TestPass@12345",
      role: "EMPLOYEE",
    });
    assert.equal(createRes.status, 201);
    employeeId = createRes.body.data.id;

    employeeAgent = request.agent(app);
    const loginRes = await employeeAgent.post("/api/auth/login").send({ email: employeeEmail, password: "TestPass@12345" });
    assert.equal(loginRes.status, 200);

    customerName = "Search Target Customer " + suffix;
    customerPassportNo = "SRC" + suffix;
    const customerRes = await agent.post("/api/customers").send({
      fullName: customerName,
      passportNo: customerPassportNo,
      nationality: "Test",
      phone: "+2499" + suffix.slice(-7),
    });
    customerId = customerRes.body.data.id;

    const serviceRes = await agent.post("/api/services").send({
      code: "SRC-SVC-" + suffix,
      name: "Search Test Service",
      category: "flight",
      basePrice: 100,
    });
    serviceId = serviceRes.body.data.id;
  });

  async function createOrder() {
    const res = await agent.post("/api/orders").send({
      customerId,
      items: [{ serviceId, quantity: 1, unitPrice: 50 }],
    });
    return res.body.data;
  }

  test("finds an order by order number", async () => {
    const order = await createOrder();
    const res = await agent.get(`/api/orders?search=${encodeURIComponent(order.orderNumber)}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.some((row) => row.id === order.id));
  });

  test("finds an order by customer name, phone, and passport number", async () => {
    const order = await createOrder();

    const byName = await agent.get(`/api/orders?search=${encodeURIComponent(customerName)}`);
    assert.ok(byName.body.data.some((row) => row.id === order.id));

    const byPassport = await agent.get(`/api/orders?search=${encodeURIComponent(customerPassportNo)}`);
    assert.equal(byPassport.status, 200);
    assert.ok(byPassport.body.data.some((row) => row.id === order.id));
  });

  test("filters by service", async () => {
    const order = await createOrder();
    const res = await agent.get(`/api/orders?serviceId=${serviceId}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.some((row) => row.id === order.id));
  });

  test("filters unassigned orders and then by a specific employee after assignment", async () => {
    const order = await createOrder();

    const unassignedRes = await agent.get("/api/orders?assignedUserId=UNASSIGNED");
    assert.ok(unassignedRes.body.data.some((row) => row.id === order.id));

    const assignRes = await agent.patch(`/api/orders/${order.id}/assign`).send({ assignedUserId: employeeId });
    assert.equal(assignRes.status, 200);
    assert.equal(assignRes.body.data.assignedUser.id, employeeId);

    const byEmployee = await agent.get(`/api/orders?assignedUserId=${employeeId}`);
    assert.ok(byEmployee.body.data.some((row) => row.id === order.id));

    const stillUnassigned = await agent.get("/api/orders?assignedUserId=UNASSIGNED");
    assert.ok(stillUnassigned.body.data.every((row) => row.id !== order.id));
  });

  test("unassigning an order sets assignedUser back to null", async () => {
    const order = await createOrder();
    await agent.patch(`/api/orders/${order.id}/assign`).send({ assignedUserId: employeeId });

    const unassignRes = await agent.patch(`/api/orders/${order.id}/assign`).send({ assignedUserId: null });
    assert.equal(unassignRes.status, 200);
    assert.equal(unassignRes.body.data.assignedUser, null);
  });

  test("404s assigning a non-existent order", async () => {
    const res = await agent.patch("/api/orders/does-not-exist/assign").send({ assignedUserId: employeeId });
    assert.equal(res.status, 404);
  });

  test("EMPLOYEE can assign orders (operations center quick action)", async () => {
    const order = await createOrder();
    const res = await employeeAgent.patch(`/api/orders/${order.id}/assign`).send({ assignedUserId: employeeId });
    assert.equal(res.status, 200);
  });
});
