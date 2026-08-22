import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("customer quick lookup", () => {
  test("finds a customer by passport without exposing password fields", async () => {
    const agent = await loginAsSuperAdmin();
    const passportNo = `LOOKUP${uniqueSuffix()}`;

    const created = await agent.post("/api/customers").send({
      fullName: "Lookup Customer",
      passportNo,
      nationality: "Sudanese",
      phone: `24991${uniqueSuffix()}`,
    });
    assert.equal(created.status, 201);

    const res = await agent.get(`/api/customers/lookup?passportNo=${passportNo}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.fullName, "Lookup Customer");
    assert.equal(res.body.data.passportNo, passportNo);
  });
});
