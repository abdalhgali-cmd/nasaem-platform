import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request } from "./helpers/api.js";

// Phase 5 (Umrah catalog correction): the seeded Umrah products
// (SVC-UMRAH-VISA/SERVICES/GROUP) must be classified as UMRAH_PACKAGE,
// distinct from unrelated general travel packages (SVC-PKG-FAMILY/
// HONEYMOON/BUSINESS) that happen to share the public packages endpoint —
// otherwise a customer-facing "Umrah packages" list would also show a
// honeymoon or business package as an Umrah product. Regression coverage
// for the 20260921000000_umrah_package_category_split migration and the
// seed.js category fix it backs.
describe("Umrah vs. general package catalog classification", () => {
  test("public packages endpoint exposes the real Umrah codes as UMRAH_PACKAGE and general packages as package", async () => {
    const res = await request(app).get("/api/services/public/packages");
    assert.equal(res.status, 200);

    const byCode = Object.fromEntries(res.body.data.map((item) => [item.code, item]));

    for (const code of ["SVC-UMRAH-VISA", "SVC-UMRAH-SERVICES", "SVC-UMRAH-GROUP"]) {
      assert.ok(byCode[code], `expected seeded package ${code} to be present`);
      assert.equal(byCode[code].category, "UMRAH_PACKAGE", `${code} must be classified as UMRAH_PACKAGE`);
    }

    for (const code of ["SVC-PKG-FAMILY", "SVC-PKG-HONEYMOON", "SVC-PKG-BUSINESS"]) {
      assert.ok(byCode[code], `expected seeded package ${code} to be present`);
      assert.notEqual(byCode[code].category, "UMRAH_PACKAGE", `${code} must not be classified as an Umrah product`);
    }
  });

  test("the general public services catalog does not list Umrah packages as standalone services", async () => {
    const res = await request(app).get("/api/services/public");
    assert.equal(res.status, 200);
    const codes = res.body.data.services.map((s) => s.code);
    assert.ok(!codes.includes("SVC-UMRAH-VISA"));
    assert.ok(!codes.includes("SVC-UMRAH-SERVICES"));
    assert.ok(!codes.includes("SVC-UMRAH-GROUP"));
  });
});
