import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin } from "./helpers/api.js";

// The staff back-office (backend/public) is served by the API itself, so it
// ships in the same Railway image and talks to the same-origin /api with the
// cookie session. The pages are public shells; the data behind them is not.

describe("staff back-office pages are served by the API", () => {
  test("the staff login page loads", async () => {
    const res = await request(app).get("/login.html");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /text\/html/);
    assert.match(res.text, /<form/i);
    assert.match(res.text, /type="password"/);
    assert.match(res.text, /src="\/assets\/login\.js"/);
  });

  test("the dashboard and intake shells and their scripts load", async () => {
    for (const path of ["/admin-dashboard.html", "/request.html", "/assets/login.js", "/assets/style.css"]) {
      const res = await request(app).get(path);
      assert.equal(res.status, 200, path);
    }
  });

  test("the admin talks to the same-origin API, never a hard-coded host", async () => {
    const res = await request(app).get("/assets/api.js");
    assert.equal(res.status, 200);
    assert.match(res.text, /const API_BASE = "\/api";/);
    assert.match(res.text, /credentials: "include"/);
    assert.doesNotMatch(res.text, /https?:\/\/[a-z0-9.-]+\/api/i);
  });

  test("pages carry the security headers (helmet)", async () => {
    const res = await request(app).get("/login.html");
    assert.ok(res.headers["content-security-policy"], "CSP header present");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.ok(res.headers["x-frame-options"] || /frame-ancestors/.test(res.headers["content-security-policy"]));
  });
});

describe("nothing outside the back-office folder is reachable", () => {
  const paths = [
    "/.env",
    "/.env.example",
    "/package.json",
    "/Dockerfile",
    "/src/app.js",
    "/prisma/schema.prisma",
    "/uploads/",
    "/assets/../../package.json",
    "/%2e%2e/package.json",
    "/..%2fpackage.json",
    "/assets/",
  ];
  for (const path of paths) {
    test(`GET ${path} is refused`, async () => {
      const res = await request(app).get(path);
      assert.ok([400, 403, 404].includes(res.status), `${path} → ${res.status}`);
      assert.doesNotMatch(res.text || "", /"dependencies"|DATABASE_URL|JWT_SECRET|generator client|express\(\)/);
    });
  }
});

describe("admin data stays behind authentication", () => {
  const protectedRoutes = [
    "/api/auth/me",
    "/api/dashboard/operations",
    "/api/dashboard/stats",
    "/api/users",
    "/api/contact-requests",
    "/api/orders",
  ];
  for (const path of protectedRoutes) {
    test(`GET ${path} without a session → 401`, async () => {
      const res = await request(app).get(path);
      assert.equal(res.status, 401, `${path} → ${res.status}`);
      assert.equal(res.body.success, false);
    });
  }

  test("a forged session cookie is rejected", async () => {
    const res = await request(app).get("/api/auth/me").set("Cookie", "accessToken=forged.token.value");
    assert.equal(res.status, 401);
  });

  test("the login page's own flow works same-origin: login sets an httpOnly cookie, /me then answers", async () => {
    const agent = await loginAsSuperAdmin();
    const me = await agent.get("/api/auth/me");
    assert.equal(me.status, 200, JSON.stringify(me.body));
    assert.equal(me.body.success, true);
  });

  test("the login response sets the session cookie httpOnly", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@nasaem-platform.local", password: process.env.SEED_ADMIN_PASSWORD });
    assert.equal(res.status, 200);
    const cookie = (res.headers["set-cookie"] || []).find((c) => c.startsWith("accessToken="));
    assert.ok(cookie, "session cookie set");
    assert.match(cookie, /HttpOnly/i);
  });
});

describe("API routing is unchanged by the static pages", () => {
  test("/api/health still answers JSON", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.system, "Nasaem Platform API");
  });

  test("unknown API routes still give the JSON 404", async () => {
    const res = await request(app).get("/api/does-not-exist");
    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Route not found");
  });

  test("unknown pages give the JSON 404, not an HTML fallback", async () => {
    const res = await request(app).get("/no-such-page.html");
    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Route not found");
  });

  test("the root still answers the API status JSON", async () => {
    const res = await request(app).get("/");
    assert.equal(res.status, 200);
    assert.equal(res.body.system, "Nasaem Platform API");
  });
});
