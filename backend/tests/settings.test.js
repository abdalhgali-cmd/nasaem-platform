import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("public settings allowlist", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("returns public contact/SEO settings without internal keys", async () => {
    const internalKey = `INTERNAL_TEST_SECRET_${uniqueSuffix()}`;
    const publicKey = "CONTACT_PHONE";
    const internalWrite = await agent.post("/api/settings").send({ key: internalKey, value: "must-not-be-public" });
    assert.equal(internalWrite.status, 400);
    const publicWrite = await agent.post("/api/settings").send({ key: publicKey, value: "+249 90 000 0000" });
    assert.equal(publicWrite.status, 200);

    const response = await request(app).get("/api/settings/public");
    assert.equal(response.status, 200);
    const settings = response.body.data;
    assert.ok(settings.some((setting) => setting.key === publicKey));
    assert.ok(settings.every((setting) => ["CONTACT_PHONE", "CONTACT_EMAIL", "CONTACT_ADDRESS", "WHATSAPP_NUMBER", "INSTAGRAM_URL", "FACEBOOK_URL", "X_URL", "SEO_TITLE", "SEO_DESCRIPTION", "EGYPT_CLEARANCE_FAQ"].includes(setting.key)));
    assert.ok(!settings.some((setting) => setting.key === internalKey));
    assert.ok(!JSON.stringify(response.body).includes("must-not-be-public"));
  });

  test("public settings endpoint does not require staff authentication", async () => {
    const response = await request(app).get("/api/settings/public");
    assert.notEqual(response.status, 401);
    assert.equal(response.status, 200);
  });

  // Egypt Security Approval landing page FAQ (Setting key EGYPT_CLEARANCE_FAQ)
  // reuses this same allowlisted-Setting infrastructure rather than a new
  // FAQ module — this is the evidence that an admin can actually change it
  // through the existing generic settings write endpoint, and that the
  // public read endpoint serves the update back out immediately.
  test("EGYPT_CLEARANCE_FAQ is admin-editable through the generic settings endpoint and publicly readable", async () => {
    const faq = [{ question: `Q ${uniqueSuffix()}`, answer: "A" }];
    const writeRes = await agent.post("/api/settings").send({ key: "EGYPT_CLEARANCE_FAQ", value: JSON.stringify(faq) });
    assert.equal(writeRes.status, 200, JSON.stringify(writeRes.body));

    const publicRes = await request(app).get("/api/settings/public");
    assert.equal(publicRes.status, 200);
    const entry = publicRes.body.data.find((setting) => setting.key === "EGYPT_CLEARANCE_FAQ");
    assert.ok(entry, "expected EGYPT_CLEARANCE_FAQ in the public settings response");
    assert.deepEqual(JSON.parse(entry.value), faq);
  });
});
