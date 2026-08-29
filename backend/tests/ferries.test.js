import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("ferries / maritime (Platform 3.0 Phase 9)", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("requires authentication to manage operators/schedules (not the public endpoint)", async () => {
    const operators = await request(app).get("/api/ferries/operators");
    assert.equal(operators.status, 401);
    const create = await request(app).post("/api/ferries/operators").send({ name: "x" });
    assert.equal(create.status, 401);
  });

  test("public endpoint requires no authentication", async () => {
    const res = await request(app).get("/api/ferries/public");
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.operators));
    assert.ok(Array.isArray(res.body.data.schedules));
  });

  test("creates an operator, lists it, updates it, and it's excluded from the public directory once deactivated", async () => {
    const suffix = uniqueSuffix();
    const createRes = await agent.post("/api/ferries/operators").send({ name: `Test Ferry Co ${suffix}`, nameEn: "Test Ferry Co" });
    assert.equal(createRes.status, 201);
    const operatorId = createRes.body.data.id;

    const listRes = await agent.get("/api/ferries/operators");
    assert.ok(listRes.body.data.some((o) => o.id === operatorId));

    let publicRes = await request(app).get("/api/ferries/public");
    assert.ok(publicRes.body.data.operators.some((o) => o.id === operatorId));

    const patchRes = await agent.patch(`/api/ferries/operators/${operatorId}`).send({ active: false });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.active, false);

    publicRes = await request(app).get("/api/ferries/public");
    assert.ok(!publicRes.body.data.operators.some((o) => o.id === operatorId));
  });

  test("creates a schedule under an operator with route/date/departure/arrival/duration/price/capacity", async () => {
    const suffix = uniqueSuffix();
    const operatorRes = await agent.post("/api/ferries/operators").send({ name: `Schedule Test Co ${suffix}` });
    const operatorId = operatorRes.body.data.id;

    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const scheduleRes = await agent.post(`/api/ferries/operators/${operatorId}/schedules`).send({
      origin: "سواكن",
      destination: "جدة",
      travelDate: futureDate,
      departureTime: "08:00",
      arrivalTime: "14:00",
      durationMinutes: 360,
      basePrice: 450,
      currency: "SAR",
      capacity: 200,
    });
    assert.equal(scheduleRes.status, 201, JSON.stringify(scheduleRes.body));
    assert.equal(scheduleRes.body.data.origin, "سواكن");
    assert.equal(scheduleRes.body.data.operator.id, operatorId);

    const publicRes = await request(app).get("/api/ferries/public");
    const found = publicRes.body.data.schedules.find((s) => s.id === scheduleRes.body.data.id);
    assert.ok(found, "expected the upcoming schedule on the public directory");
    assert.equal(found.destination, "جدة");
    assert.equal(found.capacity, 200);
  });

  test("a past-dated schedule doesn't appear on the public directory", async () => {
    const suffix = uniqueSuffix();
    const operatorRes = await agent.post("/api/ferries/operators").send({ name: `Past Schedule Co ${suffix}` });
    const operatorId = operatorRes.body.data.id;

    const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const scheduleRes = await agent.post(`/api/ferries/operators/${operatorId}/schedules`).send({
      origin: "سواكن",
      destination: "جدة",
      travelDate: pastDate,
      basePrice: 450,
    });
    assert.equal(scheduleRes.status, 201);

    const publicRes = await request(app).get("/api/ferries/public");
    assert.ok(!publicRes.body.data.schedules.some((s) => s.id === scheduleRes.body.data.id));
  });

  test("404s creating a schedule for an operator that doesn't exist", async () => {
    const res = await agent.post("/api/ferries/operators/does-not-exist/schedules").send({
      origin: "سواكن",
      destination: "جدة",
      travelDate: new Date().toISOString(),
      basePrice: 100,
    });
    assert.equal(res.status, 404);
  });

  test("deletes a schedule", async () => {
    const suffix = uniqueSuffix();
    const operatorRes = await agent.post("/api/ferries/operators").send({ name: `Delete Schedule Co ${suffix}` });
    const scheduleRes = await agent.post(`/api/ferries/operators/${operatorRes.body.data.id}/schedules`).send({
      origin: "سواكن",
      destination: "جدة",
      travelDate: new Date().toISOString(),
      basePrice: 100,
    });
    const deleteRes = await agent.delete(`/api/ferries/schedules/${scheduleRes.body.data.id}`);
    assert.equal(deleteRes.status, 200);

    const listRes = await agent.get("/api/ferries/schedules");
    assert.ok(!listRes.body.data.some((s) => s.id === scheduleRes.body.data.id));
  });

  test("uploads an operator logo and it becomes retrievable via the public site-assets file route", async () => {
    const suffix = uniqueSuffix();
    const operatorRes = await agent.post("/api/ferries/operators").send({ name: `Logo Co ${suffix}` });
    const operatorId = operatorRes.body.data.id;

    const uploadRes = await agent
      .post(`/api/ferries/operators/${operatorId}/logo`)
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "logo.png", contentType: "image/png" });
    assert.equal(uploadRes.status, 200, JSON.stringify(uploadRes.body));
    assert.ok(uploadRes.body.data.logoKey);

    const fileRes = await request(app).get(`/api/site-assets/${uploadRes.body.data.logoKey}/file`);
    assert.equal(fileRes.status, 200);
  });

  test("deleting an operator that still has schedules deactivates it instead of removing it", async () => {
    const suffix = uniqueSuffix();
    const operatorRes = await agent.post("/api/ferries/operators").send({ name: `Protected Co ${suffix}` });
    const operatorId = operatorRes.body.data.id;
    await agent.post(`/api/ferries/operators/${operatorId}/schedules`).send({
      origin: "سواكن",
      destination: "جدة",
      travelDate: new Date().toISOString(),
      basePrice: 100,
    });

    const deleteRes = await agent.delete(`/api/ferries/operators/${operatorId}`);
    assert.equal(deleteRes.status, 200);

    const listRes = await agent.get("/api/ferries/operators");
    const found = listRes.body.data.find((o) => o.id === operatorId);
    assert.ok(found, "operator should still exist");
    assert.equal(found.active, false);
  });

  test("EMPLOYEE cannot create operators/schedules but can read them", async () => {
    const suffix = uniqueSuffix();
    const email = `ferries-employee-${suffix}@nasaem-platform.local`;
    await agent.post("/api/users").send({ fullName: "Ferries RBAC Employee", email, password: "TestPass@12345", role: "EMPLOYEE" });
    const employeeAgent = request.agent(app);
    await employeeAgent.post("/api/auth/login").send({ email, password: "TestPass@12345" });

    const createRes = await employeeAgent.post("/api/ferries/operators").send({ name: "x" });
    assert.equal(createRes.status, 403);
    const listRes = await employeeAgent.get("/api/ferries/operators");
    assert.equal(listRes.status, 200);
  });
});
