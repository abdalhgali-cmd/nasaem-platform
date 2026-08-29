import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("homepage admin content", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("requires authentication to read/write hero and sections (not the public endpoint)", async () => {
    const hero = await request(app).get("/api/homepage/hero");
    assert.equal(hero.status, 401);
    const sections = await request(app).get("/api/homepage/sections");
    assert.equal(sections.status, 401);
    const create = await request(app).post("/api/homepage/sections").send({ key: "x", title: "x" });
    assert.equal(create.status, 401);
  });

  test("public endpoint requires no authentication", async () => {
    const res = await request(app).get("/api/homepage/public");
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.hero);
    assert.ok(Array.isArray(res.body.data.sections));
  });

  test("hero content starts unset (null) and can be updated by an admin", async () => {
    const before1 = await agent.get("/api/homepage/hero");
    assert.equal(before1.status, 200);

    const suffix = uniqueSuffix();
    const res = await agent.patch("/api/homepage/hero").send({
      title: `Hero Title ${suffix}`,
      description: "Hero description",
      ctaLabel: "استكشف",
      ctaTarget: "/packages",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.title, `Hero Title ${suffix}`);
    assert.equal(res.body.data.ctaTarget, "/packages");

    const publicRes = await request(app).get("/api/homepage/public");
    assert.equal(publicRes.body.data.hero.title, `Hero Title ${suffix}`);
  });

  test("rejects a hero CTA target that isn't an internal path", async () => {
    const res = await agent.patch("/api/homepage/hero").send({ ctaTarget: "https://evil.example.com" });
    assert.equal(res.status, 400);
  });

  test("creates, lists, updates and deletes a section", async () => {
    const key = "test-section-" + uniqueSuffix();
    const createRes = await agent.post("/api/homepage/sections").send({
      key,
      title: "Test Section",
      description: "A section for testing",
      href: "/umrah",
      iconKey: "landmark",
      sortOrder: 99,
    });
    assert.equal(createRes.status, 201);
    const sectionId = createRes.body.data.id;

    const listRes = await agent.get("/api/homepage/sections");
    assert.ok(listRes.body.data.some((s) => s.id === sectionId));

    const patchRes = await agent.patch(`/api/homepage/sections/${sectionId}`).send({ visible: false, title: "Updated Title" });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.visible, false);
    assert.equal(patchRes.body.data.title, "Updated Title");

    // Hidden sections must not appear on the public endpoint.
    const publicRes = await request(app).get("/api/homepage/public");
    assert.ok(!publicRes.body.data.sections.some((s) => s.id === sectionId));

    const deleteRes = await agent.delete(`/api/homepage/sections/${sectionId}`);
    assert.equal(deleteRes.status, 200);

    const listAfter = await agent.get("/api/homepage/sections");
    assert.ok(!listAfter.body.data.some((s) => s.id === sectionId));
  });

  test("a visible section appears on the public endpoint, ordered by sortOrder", async () => {
    const suffix = uniqueSuffix();
    const low = await agent.post("/api/homepage/sections").send({ key: "order-low-" + suffix, title: "Low", sortOrder: 1 });
    const high = await agent.post("/api/homepage/sections").send({ key: "order-high-" + suffix, title: "High", sortOrder: 2 });

    const publicRes = await request(app).get("/api/homepage/public");
    const lowIndex = publicRes.body.data.sections.findIndex((s) => s.id === low.body.data.id);
    const highIndex = publicRes.body.data.sections.findIndex((s) => s.id === high.body.data.id);
    assert.ok(lowIndex !== -1 && highIndex !== -1);
    assert.ok(lowIndex < highIndex);
  });

  test("rejects a duplicate section key", async () => {
    const key = "dup-section-" + uniqueSuffix();
    const first = await agent.post("/api/homepage/sections").send({ key, title: "First" });
    assert.equal(first.status, 201);
    const second = await agent.post("/api/homepage/sections").send({ key, title: "Second" });
    assert.equal(second.status, 409);
  });

  test("rejects an invalid icon key", async () => {
    const res = await agent.post("/api/homepage/sections").send({ key: "bad-icon-" + uniqueSuffix(), title: "Bad Icon", iconKey: "not-a-real-icon" });
    assert.equal(res.status, 400);
  });

  test("404s updating/deleting a section that doesn't exist", async () => {
    const patchRes = await agent.patch("/api/homepage/sections/does-not-exist").send({ title: "x" });
    assert.equal(patchRes.status, 404);
    const deleteRes = await agent.delete("/api/homepage/sections/does-not-exist");
    assert.equal(deleteRes.status, 404);
  });

  test("EMPLOYEE cannot manage homepage content", async () => {
    const suffix = uniqueSuffix();
    const email = `homepage-employee-${suffix}@nasaem-platform.local`;
    await agent.post("/api/users").send({ fullName: "Homepage RBAC Employee", email, password: "TestPass@12345", role: "EMPLOYEE" });
    const employeeAgent = request.agent(app);
    await employeeAgent.post("/api/auth/login").send({ email, password: "TestPass@12345" });

    const res = await employeeAgent.post("/api/homepage/sections").send({ key: "x-" + suffix, title: "x" });
    assert.equal(res.status, 403);
  });

  test("uploads a section image and it becomes retrievable via the public site-assets file route", async () => {
    const createRes = await agent.post("/api/homepage/sections").send({ key: "img-section-" + uniqueSuffix(), title: "With Image" });
    const sectionId = createRes.body.data.id;

    const uploadRes = await agent
      .post(`/api/homepage/sections/${sectionId}/image`)
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "section.png", contentType: "image/png" });
    assert.equal(uploadRes.status, 200);
    assert.ok(uploadRes.body.data.imageKey);

    const fileRes = await request(app).get(`/api/site-assets/${uploadRes.body.data.imageKey}/file`);
    assert.equal(fileRes.status, 200);
  });

  test("404s uploading an image for a section that doesn't exist", async () => {
    const res = await agent
      .post("/api/homepage/sections/does-not-exist/image")
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "section.png", contentType: "image/png" });
    assert.equal(res.status, 404);
  });
});
