import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

import { legacyAdminRedirect, parseAdminAppUrl } from "../src/utils/adminAppUrl.js";

test("ADMIN_APP_URL: an https origin (or a local http one) only", () => {
  assert.equal(parseAdminAppUrl("https://nasaem-website-staging-staging.up.railway.app"), "https://nasaem-website-staging-staging.up.railway.app");
  assert.equal(parseAdminAppUrl("https://example.org/"), "https://example.org");
  assert.equal(parseAdminAppUrl("http://localhost:3000"), "http://localhost:3000");
  for (const bad of ["", "  ", "not a url", "http://example.org", "https://example.org/admin", "https://user:pw@example.org", "https://example.org/?x=1", "javascript:alert(1)", "https://*.railway.app"]) {
    assert.equal(parseAdminAppUrl(bad), null, bad);
  }
});

function appWith(origin) {
  const app = express();
  app.use(legacyAdminRedirect(origin));
  app.use((req, res) => res.status(200).send("served here"));
  return app;
}

test("old back-office pages redirect to the same path on the unified admin's website", async () => {
  const app = appWith("https://admin.example.org");
  for (const path of ["/login.html", "/admin-dashboard.html?order=abc", "/flight-bookings.html", "/flight-management.html", "/request.html"]) {
    const res = await request(app).get(path);
    assert.equal(res.status, 302, path);
    assert.equal(res.headers.location, `https://admin.example.org${path}`);
  }
});

test("everything else, writes, and an unset ADMIN_APP_URL are untouched", async () => {
  const app = appWith("https://admin.example.org");
  for (const path of ["/api/health", "/assets/api.js", "/", "/admin-dashboard.html.bak"]) {
    assert.equal((await request(app).get(path)).status, 200, path);
  }
  assert.equal((await request(app).post("/login.html")).status, 200);
  assert.equal((await request(appWith(null)).get("/admin-dashboard.html")).status, 200);
});
