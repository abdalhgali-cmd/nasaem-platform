import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { createDocument, deleteDocument, getDocumentById, listDocuments } from "../src/modules/documents/documents.service.js";

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

  // Regression: documents.service.js used to spread the organization filter
  // in conditionally (`organizationId ? { order: { organizationId } } : {}`),
  // which Prisma treats identically to `organizationId ? {...} : { organizationId: undefined }`
  // for its own `where` handling in one specific way that matters here - a
  // falsy organizationId made the filter disappear entirely rather than
  // matching nothing, turning every one of these into an unscoped,
  // cross-tenant-capable query the moment a caller (existing or future)
  // ever passed a falsy value. Every path must now fail closed instead.
  test("every document service function fails closed (finds/returns nothing) given a falsy organizationId, never unscoped", async () => {
    const uploadRes = await agent
      .post("/api/documents")
      .field("orderId", orderId)
      .field("customerId", customerId)
      .field("type", "PASSPORT")
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "p.png", contentType: "image/png" });
    const documentId = uploadRes.body.data.id;

    const listResult = await listDocuments({ page: 1, limit: 50, skip: 0, organizationId: undefined });
    assert.equal(listResult.data.length, 0, "listDocuments must return nothing without an organizationId, not everything");
    assert.equal(listResult.meta.total, 0);

    assert.equal(await getDocumentById(documentId, undefined), null);
    assert.equal(await getDocumentById(documentId, ""), null);

    await assert.rejects(
      () => createDocument({ orderId, customerId, uploadedById: null, fileName: "x.png", storagePath: "documents/x.png" }, undefined),
      /Order not found/
    );

    assert.equal(await deleteDocument(documentId, undefined), null);
    // And the document is still there - the missing organizationId did not
    // silently authorize the delete either. Verified through the real,
    // properly-scoped authenticated API, not just the same helper.
    const stillThereRes = await agent.get(`/api/documents/${documentId}`);
    assert.equal(stillThereRes.status, 200, "deleteDocument(id, undefined) must not have deleted the document");
  });
});
