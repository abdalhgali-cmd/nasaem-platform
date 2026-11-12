import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveServiceHref } from "../src/lib/service-routes.ts";
import { isActiveServiceRoute } from "../src/lib/active-services.ts";

test("ordinary travel packages never enter the Umrah booking flow", () => {
  assert.equal(resolveServiceHref({ code: "SVC-UMRAH", category: "umrah" }), "/umrah");
  assert.equal(resolveServiceHref({ code: "SVC-PKG-FAMILY", category: "package" }), "/services/pkg-family");
  assert.match(resolveServiceHref({ code: "SVC-UMRAH-AIR", category: "UMRAH_PACKAGE" }), /^\/umrah\?package=SVC-UMRAH-AIR/);
});

test("all published service destinations are allowed, while unrelated and external paths are refused", () => {
  for (const href of ["/umrah?package=x#book", "/flights", "/ferries", "/visas", "/services/work-visa", "/services/tasheel"]) assert.equal(isActiveServiceRoute(href), true, href);
  // Hotels are postponed: the page exists but is not an offered destination.
  for (const href of ["/hotels", "/admin", "/services/../admin", "//example.com", "https://example.com", "/unknown"]) assert.equal(isActiveServiceRoute(href), false, href);
});
