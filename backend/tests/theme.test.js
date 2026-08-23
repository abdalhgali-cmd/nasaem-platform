import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("theme appearance settings", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("requires authentication to read/write theme (not the public endpoint)", async () => {
    const getRes = await request(app).get("/api/theme");
    assert.equal(getRes.status, 401);
    const patchRes = await request(app).patch("/api/theme").send({ primary: "#112233" });
    assert.equal(patchRes.status, 401);
  });

  test("public endpoint requires no authentication", async () => {
    const res = await request(app).get("/api/theme/public");
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok("primary" in res.body.data);
    assert.ok("button" in res.body.data);
  });

  test("theme colors start unset (null) and can be updated by an admin", async () => {
    const res = await agent.patch("/api/theme").send({
      primary: "#112233",
      secondary: "#445566",
      accent: "#D4AF37",
      background: "#FFFFFF",
      text: "#1F2937",
      button: "#0B3D91",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.primary, "#112233");
    assert.equal(res.body.data.button, "#0B3D91");

    const publicRes = await request(app).get("/api/theme/public");
    assert.equal(publicRes.body.data.primary, "#112233");
    assert.equal(publicRes.body.data.accent, "#D4AF37");
  });

  test("rejects a value that isn't a #RRGGBB hex color", async () => {
    const bad1 = await agent.patch("/api/theme").send({ primary: "blue" });
    assert.equal(bad1.status, 400);
    const bad2 = await agent.patch("/api/theme").send({ accent: "javascript:alert(1)" });
    assert.equal(bad2.status, 400);
    const bad3 = await agent.patch("/api/theme").send({ secondary: "#fff" });
    assert.equal(bad3.status, 400);
  });

  test("a null value clears a previously set color back to unset", async () => {
    await agent.patch("/api/theme").send({ secondary: "#123456" });
    const cleared = await agent.patch("/api/theme").send({ secondary: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.secondary, null);
  });

  test("EMPLOYEE cannot manage theme settings", async () => {
    const suffix = uniqueSuffix();
    const email = `theme-employee-${suffix}@nasaem-platform.local`;
    await agent.post("/api/users").send({ fullName: "Theme RBAC Employee", email, password: "TestPass@12345", role: "EMPLOYEE" });
    const employeeAgent = request.agent(app);
    await employeeAgent.post("/api/auth/login").send({ email, password: "TestPass@12345" });

    const res = await employeeAgent.patch("/api/theme").send({ primary: "#000000" });
    assert.equal(res.status, 403);
  });
});
