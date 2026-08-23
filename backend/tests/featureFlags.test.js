import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, loginAsSuperAdmin } from "./helpers/api.js";
import { FEATURE_FLAG_KEYS } from "../src/modules/feature-flags/feature-flags.constants.js";

describe("feature flags (Platform 3.0 Phase 13)", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  // Safety net: FeatureFlag rows are global, shared state read by every
  // other test file's process against the same test database — if any
  // assertion below throws mid-toggle, this guarantees every flag is
  // back to enabled before this file's process exits, rather than
  // leaving some other file's unrelated test permanently failing.
  after(async () => {
    await prisma.featureFlag.updateMany({ data: { enabled: true } });
  });

  test("all 11 planned flags are seeded and enabled by default", async () => {
    const res = await agent.get("/api/feature-flags");
    assert.equal(res.status, 200);
    const keys = res.body.data.map((f) => f.key).sort();
    assert.deepEqual(keys, [...FEATURE_FLAG_KEYS].sort());
    assert.ok(res.body.data.every((f) => f.enabled === true), "expected every flag to default to enabled");
  });

  test("public endpoint requires no authentication and exposes the same enabled map", async () => {
    const res = await request(app).get("/api/feature-flags/public");
    assert.equal(res.status, 200);
    assert.equal(res.body.data.PASSPORT_OCR, true);
  });

  test("requires authentication/RBAC to manage flags", async () => {
    const anon = await request(app).get("/api/feature-flags");
    assert.equal(anon.status, 401);

    const anonPatch = await request(app).patch("/api/feature-flags/PASSPORT_OCR").send({ enabled: false });
    assert.equal(anonPatch.status, 401);
  });

  test("404s toggling an unknown flag key", async () => {
    const res = await agent.patch("/api/feature-flags/NOT_A_REAL_FLAG").send({ enabled: false });
    assert.equal(res.status, 404);
  });

  test("disabling PASSPORT_OCR blocks the scan endpoint server-side, not just hidden in a UI", async () => {
    const off = await agent.patch("/api/feature-flags/PASSPORT_OCR").send({ enabled: false });
    assert.equal(off.status, 200);
    assert.equal(off.body.data.enabled, false);

    try {
      const scanRes = await agent
        .post("/api/passport-ocr/scan")
        .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "x.png", contentType: "image/png" });
      assert.equal(scanRes.status, 403, JSON.stringify(scanRes.body));
    } finally {
      const on = await agent.patch("/api/feature-flags/PASSPORT_OCR").send({ enabled: true });
      assert.equal(on.status, 200);
      assert.equal(on.body.data.enabled, true);
    }
  });

  test("disabling HOTEL_SEARCH blocks intake for the real seeded hotel service, without affecting other services", async () => {
    const hotelService = await prisma.service.findFirst({ where: { category: "hotel" } });
    assert.ok(hotelService, "expected the seeded SVC-HOTEL service");

    const off = await agent.patch("/api/feature-flags/HOTEL_SEARCH").send({ enabled: false });
    assert.equal(off.status, 200);

    try {
      const blockedRes = await request(app).post("/api/contact-requests").send({
        name: "Hotel Flag Test",
        phone: `0968${Date.now()}`,
        message: "طلب حجز فندق أثناء تعطيل الميزة",
        serviceId: hotelService.id,
      });
      assert.equal(blockedRes.status, 403, JSON.stringify(blockedRes.body));

      // A request for an unrelated service must still work — the flag is
      // scoped to the hotel category only, not a global kill switch.
      const unrelatedRes = await request(app).post("/api/contact-requests").send({
        name: "Unrelated Test",
        phone: `0969${Date.now()}`,
        message: "طلب غير متعلق بالفنادق أثناء تعطيل ميزة الفنادق",
      });
      assert.equal(unrelatedRes.status, 201, JSON.stringify(unrelatedRes.body));
    } finally {
      const on = await agent.patch("/api/feature-flags/HOTEL_SEARCH").send({ enabled: true });
      assert.equal(on.status, 200);
    }
  });

  test("EMPLOYEE cannot toggle a flag", async () => {
    const email = `flags-employee-${Date.now()}@nasaem-platform.local`;
    await agent.post("/api/users").send({ fullName: "Flags RBAC Employee", email, password: "TestPass@12345", role: "EMPLOYEE" });
    const employeeAgent = request.agent(app);
    await employeeAgent.post("/api/auth/login").send({ email, password: "TestPass@12345" });

    const res = await employeeAgent.patch("/api/feature-flags/PASSPORT_OCR").send({ enabled: false });
    assert.equal(res.status, 403);
  });
});
