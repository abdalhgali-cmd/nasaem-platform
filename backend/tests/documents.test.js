import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("documents", () => {
  let agent;
  let customerId;
  let orderId;

  before(async () => {
    agent = await loginAsSuperAdmin();

    const customerRes = await agent.post("/api/customers").send({
      fullName: "Document Test Customer",
      passportNo: "DOC" + uniqueSuffix(),
      nationality: "Test",
    });
    customerId = customerRes.body.data.id;

    const serviceRes = await agent.post("/api/services").send({
      code: "DOC-SVC-" + uniqueSuffix(),
      name: "Document Test Service",
      category: "test",
      basePrice: 100,
    });

    const orderRes = await agent.post("/api/orders").send({
      customerId,
      items: [{ serviceId: serviceRes.body.data.id, quantity: 1, unitPrice: 50 }],
    });
    orderId = orderRes.body.data.id;
  });

  test("rejects unsupported file types", async () => {
    const res = await agent
      .post("/api/documents")
      .field("orderId", orderId)
      .field("customerId", customerId)
      .field("type", "PASSPORT")
      .attach("file", Buffer.from("not a real executable, just bytes"), {
        filename: "malware.exe",
        contentType: "application/x-msdownload",
      });

    assert.equal(res.status, 400);
  });

  test("uploads a valid file and never exposes passwordHash on uploadedBy", async () => {
    const res = await agent
      .post("/api/documents")
      .field("orderId", orderId)
      .field("customerId", customerId)
      .field("type", "PASSPORT")
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: "passport.png",
        contentType: "image/png",
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.data.uploadedBy);
    // Regression: Document.uploadedBy (and Order.assignedUser, Branch.users)
    // used to be fetched via `include: { uploadedBy: true }`, which returns
    // every scalar field of User — including passwordHash.
    assert.equal("passwordHash" in res.body.data.uploadedBy, false);
  });

  test("requires a file", async () => {
    const res = await agent
      .post("/api/documents")
      .field("orderId", orderId)
      .field("customerId", customerId)
      .field("type", "PASSPORT");

    assert.equal(res.status, 400);
  });
});
