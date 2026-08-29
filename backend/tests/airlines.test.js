import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// IATA codes are exactly 2 characters, so unlike every other fixture in
// this test suite there's no room to embed a per-run unique suffix into
// the code itself — a leftover row from a previous run of this same file
// against the persistent test database would otherwise collide on the
// unique constraint. Clean up this file's own fixed test codes first.
const TEST_IATA_CODES = ["TX", "DU"];

describe("airline directory (Platform 3.0 Phase 10)", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
    await prisma.airline.deleteMany({ where: { iataCode: { in: TEST_IATA_CODES } } });
  });

  test("requires authentication to manage airlines (not the public endpoint)", async () => {
    const listRes = await request(app).get("/api/airlines");
    assert.equal(listRes.status, 401);
    const createRes = await request(app).post("/api/airlines").send({ name: "x" });
    assert.equal(createRes.status, 401);
  });

  test("public endpoint requires no authentication", async () => {
    const res = await request(app).get("/api/airlines/public");
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
  });

  test("creates an airline with IATA/ICAO codes normalized to uppercase", async () => {
    const suffix = uniqueSuffix();
    const res = await agent.post("/api/airlines").send({
      name: `شركة طيران تجريبية ${suffix}`,
      nameEn: "Test Airways",
      iataCode: "tx",
      icaoCode: "txw",
      website: "https://example.com",
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.iataCode, "TX");
    assert.equal(res.body.data.icaoCode, "TXW");
  });

  test("rejects a malformed IATA/ICAO code", async () => {
    const badIata = await agent.post("/api/airlines").send({ name: "x", iataCode: "TOOLONG" });
    assert.equal(badIata.status, 400);
    const badIcao = await agent.post("/api/airlines").send({ name: "x", icaoCode: "1" });
    assert.equal(badIcao.status, 400);
  });

  test("prevents a duplicate IATA code", async () => {
    const suffix = uniqueSuffix();
    const first = await agent.post("/api/airlines").send({ name: `Dup Test A ${suffix}`, iataCode: "DU" });
    assert.equal(first.status, 201);
    const second = await agent.post("/api/airlines").send({ name: `Dup Test B ${suffix}`, iataCode: "du" });
    assert.equal(second.status, 409, JSON.stringify(second.body));
  });

  test("only active airlines appear on the public directory", async () => {
    const suffix = uniqueSuffix();
    const active = await agent.post("/api/airlines").send({ name: `Active Airline ${suffix}`, active: true });
    const inactive = await agent.post("/api/airlines").send({ name: `Inactive Airline ${suffix}`, active: false });

    const publicRes = await request(app).get("/api/airlines/public");
    const ids = publicRes.body.data.map((a) => a.id);
    assert.ok(ids.includes(active.body.data.id));
    assert.ok(!ids.includes(inactive.body.data.id));
  });

  test("uploads an airline logo and it becomes retrievable via the public site-assets file route", async () => {
    const suffix = uniqueSuffix();
    const airlineRes = await agent.post("/api/airlines").send({ name: `Logo Airline ${suffix}` });
    const airlineId = airlineRes.body.data.id;

    const uploadRes = await agent
      .post(`/api/airlines/${airlineId}/logo`)
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "logo.png", contentType: "image/png" });
    assert.equal(uploadRes.status, 200, JSON.stringify(uploadRes.body));
    assert.ok(uploadRes.body.data.logoKey);

    const fileRes = await request(app).get(`/api/site-assets/${uploadRes.body.data.logoKey}/file`);
    assert.equal(fileRes.status, 200);
  });

  test("404s updating/deleting an airline that doesn't exist", async () => {
    const patchRes = await agent.patch("/api/airlines/does-not-exist").send({ name: "x" });
    assert.equal(patchRes.status, 404);
    const deleteRes = await agent.delete("/api/airlines/does-not-exist");
    assert.equal(deleteRes.status, 404);
  });

  test("EMPLOYEE cannot create airlines but can read them", async () => {
    const suffix = uniqueSuffix();
    const email = `airlines-employee-${suffix}@nasaem-platform.local`;
    await agent.post("/api/users").send({ fullName: "Airlines RBAC Employee", email, password: "TestPass@12345", role: "EMPLOYEE" });
    const employeeAgent = request.agent(app);
    await employeeAgent.post("/api/auth/login").send({ email, password: "TestPass@12345" });

    const createRes = await employeeAgent.post("/api/airlines").send({ name: "x" });
    assert.equal(createRes.status, 403);
    const listRes = await employeeAgent.get("/api/airlines");
    assert.equal(listRes.status, 200);
  });
});
