// U-08: database guards on traveler ownership (migration
// 20261108150000_traveler_ownership_guards). The application checks the same
// rules; these prove the database refuses a write that bypasses it.
import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin } from "./helpers/api.js";
import { createTestVisa, submitRequest, testPhone } from "./helpers/workflow.js";
import prisma from "../src/config/database.js";

let a;
let b;
let adminUserId;

before(async () => {
  const admin = await loginAsSuperAdmin();
  const { visaType, requirement } = await createTestVisa(admin);
  a = await submitRequest({ phone: testPhone(), visaType, requirement, travelers: 2 });
  b = await submitRequest({ phone: testPhone(), visaType, requirement, travelers: 2 });
  adminUserId = (await prisma.user.findFirst({ select: { id: true } })).id;
});

const travelersOf = (id) => prisma.traveler.findMany({ where: { contactRequestId: id }, orderBy: { sortOrder: "asc" } });
const doc = (data) => prisma.contactRequestDocument.create({ data: { label: "TEST-GUARD", fileName: "g.pdf", storagePath: "contact-request-documents/g.pdf", mimeType: "application/pdf", sizeBytes: 1, ...data } });
const rejected = (promise) => assert.rejects(promise, (error) => /does not belong|outside its request|23514/.test(String(error.message) + String(error.code)));

describe("traveler ownership guards", () => {
  test("a document cannot name a traveler of another request (insert or update)", async () => {
    const [ownA] = await travelersOf(a);
    const [ownB] = await travelersOf(b);
    await doc({ contactRequestId: a, travelerId: ownA.id });
    await rejected(doc({ contactRequestId: a, travelerId: ownB.id }));
    await rejected(doc({ contactRequestId: null, travelerId: ownA.id }));
    const ok = await doc({ contactRequestId: a, travelerId: null });
    await rejected(prisma.contactRequestDocument.update({ where: { id: ok.id }, data: { travelerId: ownB.id } }));
    await prisma.contactRequestDocument.update({ where: { id: ok.id }, data: { travelerId: ownA.id } });
  });

  test("a deliverable can name only travelers of its own request", async () => {
    const [a1, a2] = await travelersOf(a);
    const [b1] = await travelersOf(b);
    const base = { label: "TEST-GUARD", fileName: "d.pdf", storagePath: "deliverables/d.pdf", mimeType: "application/pdf", sizeBytes: 1, uploadedByUserId: adminUserId, contactRequestId: a };
    await prisma.contactRequestDeliverable.create({ data: { ...base, travelerIds: [a1.id, a2.id] } });
    await prisma.contactRequestDeliverable.create({ data: { ...base, travelerIds: [] } });
    await rejected(prisma.contactRequestDeliverable.create({ data: { ...base, travelerIds: [a1.id, b1.id] } }));
    await rejected(prisma.contactRequestDeliverable.create({ data: { ...base, travelerIds: ["no-such-traveler"] } }));
  });

  test("the guard does not touch the normal flow (draft documents move to their request with their traveler)", async () => {
    // Exercised end to end by intakeDraftIntegrity / umrahJourneyFlow; here we
    // only confirm a draft-owned document (no request, no traveler) is allowed.
    const draft = await prisma.intakeDraft.create({ data: { tokenHash: `guard-${Date.now()}`, expiresAt: new Date(Date.now() + 60_000) } });
    await doc({ draftId: draft.id, contactRequestId: null, travelerId: null });
  });
});
