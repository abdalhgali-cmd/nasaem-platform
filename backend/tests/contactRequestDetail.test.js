import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createOrganization, createStaffUser, staffClient } from "./helpers/staff.js";

async function newRequest(overrides = {}) {
  const suffix = uniqueSuffix();
  const digits = `2499${suffix.slice(-8)}`;
  return prisma.contactRequest.create({
    data: { name: `Detail Synthetic ${suffix}`, phone: `+${digits}`, phoneNormalized: digits, email: `d${suffix}@test.local`, message: "synthetic", ...overrides },
  });
}

describe("contact request detail and search", () => {
  test("detail is available to operational and finance roles, scoped to the organization", async () => {
    const request = await newRequest();
    for (const role of ["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"]) {
      const res = await staffClient(await createStaffUser({ role })).get(`/api/contact-requests/${request.id}`);
      assert.equal(res.status, 200, role);
      assert.equal(res.body.data.id, request.id);
      assert.ok(Array.isArray(res.body.data.documents));
      assert.ok(res.body.data.readiness);
    }
    assert.equal((await staffClient(await createStaffUser({ role: "CONTENT_MANAGER" })).get(`/api/contact-requests/${request.id}`)).status, 403);

    const other = await createOrganization("cr-detail-other");
    const otherAdmin = await createStaffUser({ role: "ADMIN", organizationId: other.id });
    assert.equal((await staffClient(otherAdmin).get(`/api/contact-requests/${request.id}`)).status, 404);
  });

  test("search finds a request by reference, name, phone digits and e-mail", async () => {
    const request = await newRequest();
    const client = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
    for (const term of [request.id, request.name.split(" ").pop(), request.phoneNormalized.slice(-7), request.email.toUpperCase()]) {
      const res = await client.get(`/api/contact-requests?search=${encodeURIComponent(term)}&limit=100`);
      assert.equal(res.status, 200);
      assert.ok(res.body.data.some((r) => r.id === request.id), `search by ${term}`);
    }
    const miss = await client.get(`/api/contact-requests?search=${encodeURIComponent("no-such-request-zzz")}`);
    assert.equal(miss.body.data.length, 0);
  });

  test("filters by payment status and assignment", async () => {
    const assignee = await createStaffUser({ role: "EMPLOYEE" });
    const request = await newRequest({ paymentStatus: "UNDER_REVIEW", assignedUserId: assignee.id });
    const client = staffClient(assignee);
    const mine = await client.get(`/api/contact-requests?assignedUserId=mine&paymentStatus=UNDER_REVIEW&limit=100`);
    assert.ok(mine.body.data.some((r) => r.id === request.id));
    assert.ok(mine.body.data.every((r) => r.assignedUserId === assignee.id && r.paymentStatus === "UNDER_REVIEW"));
  });
});
