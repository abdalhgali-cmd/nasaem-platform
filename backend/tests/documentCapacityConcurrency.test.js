// U-05 (docs/umrah-audit): the maxFiles check of an upload to a submitted
// request is made again under the request's row lock, so parallel uploads
// cannot exceed it.
import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin } from "./helpers/api.js";
import { createTestVisa, submitRequest, testPhone } from "./helpers/workflow.js";
import prisma from "../src/config/database.js";
import { createContactRequestDocument } from "../src/modules/contact-request-documents/contact-request-documents.service.js";

let requestId;
let requirementId;

before(async () => {
  const admin = await loginAsSuperAdmin();
  const { visaType, requirement } = await createTestVisa(admin, { requirementScope: "CASE" });
  requirementId = requirement.id;
  await prisma.visaRequirement.update({ where: { id: requirementId }, data: { maxFiles: 1 } });
  requestId = await submitRequest({ phone: testPhone(), visaType, requirement, travelers: 1, withDocsFor: [] });
});

const upload = (n) =>
  createContactRequestDocument(requestId, {
    label: `TEST-CAP ${n}`,
    requirementId,
    silent: true,
    file: { originalname: `cap-${n}.pdf`, filename: `cap-${n}-${Date.now()}.pdf`, mimetype: "application/pdf", size: 10 },
  });

describe("upload capacity under concurrency", () => {
  test("six parallel uploads for a maxFiles=1 requirement store exactly one", async () => {
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(upload));
    const stored = results.filter((r) => r.document);
    const refused = results.filter((r) => r.error === "MAX_FILES_REACHED");
    assert.equal(stored.length, 1, JSON.stringify(results.map((r) => r.error ?? "ok")));
    assert.equal(refused.length, 5);
    const rows = await prisma.contactRequestDocument.count({ where: { contactRequestId: requestId, requirementId, supersededAt: null } });
    assert.equal(rows, 1);
  });

  test("a rejected document is still replaceable at capacity", async () => {
    const current = await prisma.contactRequestDocument.findFirst({ where: { contactRequestId: requestId, requirementId, supersededAt: null } });
    await prisma.contactRequestDocument.update({ where: { id: current.id }, data: { status: "REJECTED" } });
    const replacement = await upload(7);
    assert.ok(replacement.document, JSON.stringify(replacement));
    const live = await prisma.contactRequestDocument.findMany({ where: { contactRequestId: requestId, requirementId, supersededAt: null } });
    assert.equal(live.length, 1);
    assert.equal(live[0].id, replacement.document.id);
  });
});
