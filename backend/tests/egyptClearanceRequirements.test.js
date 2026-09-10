import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request } from "./helpers/api.js";

describe("Egypt Security Approval — public requirements", () => {
  test("publishes passport + entry mode and does not require the legacy ticket for initial approval", async () => {
    const catalogRes = await request(app).get("/api/services/public");
    assert.equal(catalogRes.status, 200);

    const egypt = catalogRes.body.data.visaTypes.find(
      (visa) => visa.code === "VISA-EGYPT-CLEARANCE"
    );
    assert.ok(egypt, "expected Egypt Security Approval visa type");

    const requirementsRes = await request(app).get(
      `/api/visa-types/${egypt.id}/requirements/public`
    );
    assert.equal(requirementsRes.status, 200);

    const requirements = requirementsRes.body.data;
    assert.ok(Array.isArray(requirements));

    const passport = requirements.find(
      (item) => item.attachmentType === "passport_copy"
    );
    assert.ok(passport, "passport requirement must be published");
    assert.equal(passport.required, true);
    assert.equal(passport.type, "DOCUMENT");
    assert.equal(passport.scope, "TRAVELER");
    assert.ok(passport.allowedMimeTypes.includes("application/pdf"));
    assert.ok(passport.allowedMimeTypes.includes("image/jpeg"));

    const entryMode = requirements.find(
      (item) => item.attachmentType === "egypt_entry_mode"
    );
    assert.ok(entryMode, "entry-mode requirement must be published");
    assert.equal(entryMode.required, true);
    assert.equal(entryMode.type, "SELECT");
    assert.equal(entryMode.scope, "TRAVELER");
    assert.deepEqual(
      entryMode.options.map((option) => option.value),
      ["AIR", "BORDER"]
    );

    assert.equal(
      requirements.some(
        (item) => /تذكرة|booking|ticket/i.test(item.name)
      ),
      false,
      "legacy booking/ticket requirement must not appear in the initial approval checklist"
    );
  });
});
