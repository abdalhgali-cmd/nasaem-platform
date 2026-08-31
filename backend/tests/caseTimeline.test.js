import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { normalizePhone } from "../src/utils/phone.js";

// Smart Case Operations — the per-case timeline. Read-only over the
// ActivityLog rows the platform already writes; nothing here records
// anything new.

async function createCase() {
  const suffix = uniqueSuffix();
  const phone = `0971${suffix}`;
  return prisma.contactRequest.create({
    data: {
      name: "Timeline Customer",
      phone,
      phoneNormalized: normalizePhone(phone),
      message: "حالة لاختبار السجل",
    },
  });
}

describe("case timeline", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("returns this case's events, newest first, and never another case's", async () => {
    const mine = await createCase();
    const other = await createCase();

    await prisma.activityLog.createMany({
      data: [
        { action: "CONTACT_REQUEST_RECEIVED", entity: "ContactRequest", entityId: mine.id, createdAt: new Date("2026-08-01T10:00:00Z") },
        { action: "CONTACT_REQUEST_ASSIGNED", entity: "ContactRequest", entityId: mine.id, createdAt: new Date("2026-08-02T10:00:00Z") },
        { action: "CONTACT_REQUEST_RECEIVED", entity: "ContactRequest", entityId: other.id, createdAt: new Date("2026-08-03T10:00:00Z") },
      ],
    });

    const res = await agent.get(`/api/contact-requests/${mine.id}/timeline`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(
      res.body.data.map((entry) => entry.action),
      ["CONTACT_REQUEST_ASSIGNED", "CONTACT_REQUEST_RECEIVED"],
      "newest first, and only this case's events"
    );
  });

  test("does not expose the audit record's old/new values", async () => {
    const contactRequest = await createCase();
    await prisma.activityLog.create({
      data: {
        action: "CONTACT_REQUEST_STATUS_CHANGED",
        entity: "ContactRequest",
        entityId: contactRequest.id,
        oldValue: { status: "NEW" },
        newValue: { status: "CONTACTED" },
      },
    });

    const res = await agent.get(`/api/contact-requests/${contactRequest.id}/timeline`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.ok(!("oldValue" in res.body.data[0]), "forensic detail stays on the admin-only activity endpoint");
    assert.ok(!("newValue" in res.body.data[0]));
  });

  test("a case with no recorded events returns an empty timeline, not an error", async () => {
    const contactRequest = await createCase();
    const res = await agent.get(`/api/contact-requests/${contactRequest.id}/timeline`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
  });

  test("404s for a case id that does not exist", async () => {
    const res = await agent.get("/api/contact-requests/does-not-exist/timeline");
    assert.equal(res.status, 404);
  });

  test("requires authentication", async () => {
    const contactRequest = await createCase();
    const res = await request(app).get(`/api/contact-requests/${contactRequest.id}/timeline`);
    assert.equal(res.status, 401);
  });
});
