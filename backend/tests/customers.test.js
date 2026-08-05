import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("customers", () => {
  test("rejects a duplicate passport number with a clean 409, not a raw Prisma error", async () => {
    const agent = await loginAsSuperAdmin();
    const passportNo = "TESTPASS" + uniqueSuffix();

    const first = await agent.post("/api/customers").send({
      fullName: "Customer One",
      passportNo,
      nationality: "Test",
    });
    assert.equal(first.status, 201);

    const dup = await agent.post("/api/customers").send({
      fullName: "Customer Two",
      passportNo,
      nationality: "Test",
    });

    assert.equal(dup.status, 409);
    assert.ok(
      !dup.body.message.includes("PrismaClientKnownRequestError"),
      "error message must not leak raw Prisma internals"
    );
  });

  test("search filters by passport number", async () => {
    const agent = await loginAsSuperAdmin();
    const passportNo = "SEARCHME" + uniqueSuffix();

    await agent.post("/api/customers").send({
      fullName: "Findable Customer",
      passportNo,
      nationality: "Test",
    });

    const res = await agent.get(`/api/customers?search=${passportNo}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].passportNo, passportNo);
  });
});
