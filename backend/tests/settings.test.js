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
    assert.ok(settings.every((setting) => ["CONTACT_PHONE", "CONTACT_EMAIL", "CONTACT_ADDRESS", "WHATSAPP_NUMBER", "INSTAGRAM_URL", "FACEBOOK_URL", "X_URL", "SEO_TITLE", "SEO_DESCRIPTION"].includes(setting.key)));
    assert.ok(!settings.some((setting) => setting.key === internalKey));
    assert.ok(!JSON.stringify(response.body).includes("must-not-be-public"));
  });

  test("public settings endpoint does not require staff authentication", async () => {
    const response = await request(app).get("/api/settings/public");
    assert.notEqual(response.status, 401);
    assert.equal(response.status, 200);
  });
});
