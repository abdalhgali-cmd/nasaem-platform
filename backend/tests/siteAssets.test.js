import "./env.js";
import path from "path";
import { fileURLToPath } from "url";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_A = path.join(__dirname, "fixtures", "passport-mrz-sample.png");
const IMAGE_B = path.join(__dirname, "fixtures", "no-mrz-sample.png");

describe("site assets", () => {
  test("listing is public — the marketing site has no staff session", async () => {
    const res = await request(app).get("/api/site-assets");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
  });

  test("uploading requires authentication", async () => {
    const res = await request(app).post("/api/site-assets/logo").attach("image", IMAGE_A);
    assert.equal(res.status, 401);
  });

  test("EMPLOYEE cannot upload a site asset", async () => {
    const superAdminAgent = await loginAsSuperAdmin();
    const email = `siteasset-employee-${uniqueSuffix()}@nasaem-platform.local`;
    const createRes = await superAdminAgent.post("/api/users").send({
      fullName: "Site Asset Test Employee",
      email,
      password: "TestPass@12345",
      role: "EMPLOYEE",
    });
    assert.equal(createRes.status, 201);

    const employeeAgent = request.agent(app);
    const loginRes = await employeeAgent
      .post("/api/auth/login")
      .send({ email, password: "TestPass@12345" });
    assert.equal(loginRes.status, 200);

    const res = await employeeAgent.post("/api/site-assets/logo").attach("image", IMAGE_A);
    assert.equal(res.status, 403);
  });

  test("rejects an unknown asset key", async () => {
    const agent = await loginAsSuperAdmin();
    const res = await agent.post("/api/site-assets/not-a-real-key").attach("image", IMAGE_A);
    assert.equal(res.status, 400);
  });

  test("rejects a non-image file", async () => {
    const agent = await loginAsSuperAdmin();
    const res = await agent
      .post("/api/site-assets/logo")
      .attach("image", Buffer.from("not an image"), { filename: "notes.txt", contentType: "text/plain" });
    assert.equal(res.status, 400);
  });

  test("public file endpoint 404s for a key with nothing uploaded yet", async () => {
    const res = await request(app).get("/api/site-assets/icon-hotel/file");
    assert.equal(res.status, 404);
  });

  test("SUPER_ADMIN can upload, list, and publicly fetch a site asset — and re-uploading replaces it", async () => {
    const agent = await loginAsSuperAdmin();

    const firstUpload = await agent.post("/api/site-assets/icon-flight").attach("image", IMAGE_A);
    assert.equal(firstUpload.status, 200);
    assert.equal(firstUpload.body.data.key, "icon-flight");
    assert.equal(firstUpload.body.data.mimeType, "image/png");

    const listRes = await agent.get("/api/site-assets");
    assert.equal(listRes.status, 200);
    const listed = listRes.body.data.find((a) => a.key === "icon-flight");
    assert.ok(listed, "expected the uploaded asset to appear in the list");

    const fileRes = await request(app).get("/api/site-assets/icon-flight/file");
    assert.equal(fileRes.status, 200);
    assert.equal(fileRes.headers["content-type"], "image/png");
    const firstLength = fileRes.body.length;
    assert.ok(firstLength > 0);

    // Re-upload with a different image — same key, should replace in place
    // (list still has exactly one row for this key) and serve new content.
    const secondUpload = await agent.post("/api/site-assets/icon-flight").attach("image", IMAGE_B);
    assert.equal(secondUpload.status, 200);

    const listAfter = await agent.get("/api/site-assets");
    const matchingRows = listAfter.body.data.filter((a) => a.key === "icon-flight");
    assert.equal(matchingRows.length, 1);

    const fileAfter = await request(app).get("/api/site-assets/icon-flight/file");
    assert.equal(fileAfter.status, 200);
    assert.notEqual(fileAfter.body.length, firstLength);
  });

  test("upload logs activity", async () => {
    const agent = await loginAsSuperAdmin();
    const uploadRes = await agent.post("/api/site-assets/icon-umrah").attach("image", IMAGE_A);
    assert.equal(uploadRes.status, 200);

    const activityRes = await agent.get("/api/activity-logs?limit=50");
    assert.equal(activityRes.status, 200);
    const logged = activityRes.body.data.find(
      (entry) => entry.action === "SITE_ASSET_UPDATED" && entry.entityId === uploadRes.body.data.id
    );
    assert.ok(logged, "expected a SITE_ASSET_UPDATED activity log entry");
  });
});
