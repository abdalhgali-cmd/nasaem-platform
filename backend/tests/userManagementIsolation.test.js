import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createOrganization, createStaffUser, staffClient } from "./helpers/staff.js";

// Staff user management (list/read/create/status/role) must be scoped to the
// actor's own organization, and the role hierarchy must keep at least one
// usable SUPER_ADMIN in every organization.
describe("user management: organization isolation", () => {
  test("another organization's ADMIN cannot read, suspend or list this organization's users", async () => {
    const other = await createOrganization("users-other");
    const otherAdmin = await createStaffUser({ role: "ADMIN", organizationId: other.id });
    const victim = await createStaffUser({ role: "EMPLOYEE" });
    const client = staffClient(otherAdmin);

    assert.equal((await client.get(`/api/users/${victim.id}`)).status, 404);
    assert.equal((await client.patch(`/api/users/${victim.id}/status`).send({ status: "SUSPENDED" })).status, 404);

    const stored = await prisma.user.findUnique({ where: { id: victim.id }, select: { status: true } });
    assert.equal(stored.status, "ACTIVE", "a cross-organization write must not change the user");

    const list = await client.get("/api/users");
    assert.equal(list.status, 200);
    assert.ok(list.body.data.every((u) => u.id !== victim.id), "list must not include another organization's users");
    assert.ok(list.body.data.some((u) => u.id === otherAdmin.id));
  });

  test("another organization's SUPER_ADMIN cannot change this organization's user role", async () => {
    const other = await createOrganization("users-other-sa");
    const otherSuper = await createStaffUser({ role: "SUPER_ADMIN", organizationId: other.id });
    const victim = await createStaffUser({ role: "EMPLOYEE" });
    const res = await staffClient(otherSuper).patch(`/api/users/${victim.id}/role`).send({ role: "ADMIN" });
    assert.equal(res.status, 404);
    const stored = await prisma.user.findUnique({ where: { id: victim.id }, select: { role: true } });
    assert.equal(stored.role, "EMPLOYEE");
  });

  test("a created user always belongs to the creator's organization, and a foreign branch is rejected", async () => {
    const tenant = await createOrganization("users-create");
    const creator = await createStaffUser({ role: "SUPER_ADMIN", organizationId: tenant.id });
    const suffix = uniqueSuffix();
    const foreignBranch = await prisma.branch.create({ data: { code: `FB-${suffix}`, name: `Foreign branch ${suffix}` } });

    const ok = await staffClient(creator).post("/api/users").send({
      fullName: "New Tenant Employee",
      email: `new-${suffix}@test.local`,
      password: "Password@123",
      role: "EMPLOYEE",
      organizationId: "org_nasaem_default",
    });
    assert.equal(ok.status, 201);
    const created = await prisma.user.findUnique({ where: { id: ok.body.data.id }, select: { organizationId: true } });
    assert.equal(created.organizationId, tenant.id, "client-supplied organizationId must be ignored");

    const badBranch = await staffClient(creator).post("/api/users").send({
      fullName: "Branch Mismatch",
      email: `branch-${suffix}@test.local`,
      password: "Password@123",
      role: "EMPLOYEE",
      branchId: foreignBranch.id,
    });
    assert.equal(badBranch.status, 400);
  });
});

describe("user management: role hierarchy and administrative recovery", () => {
  test("ADMIN cannot suspend a SUPER_ADMIN; users cannot suspend themselves", async () => {
    const tenant = await createOrganization("users-hier");
    const superAdmin = await createStaffUser({ role: "SUPER_ADMIN", organizationId: tenant.id });
    await createStaffUser({ role: "SUPER_ADMIN", organizationId: tenant.id });
    const admin = await createStaffUser({ role: "ADMIN", organizationId: tenant.id });

    assert.equal((await staffClient(admin).patch(`/api/users/${superAdmin.id}/status`).send({ status: "SUSPENDED" })).status, 403);
    assert.equal((await staffClient(admin).patch(`/api/users/${admin.id}/status`).send({ status: "SUSPENDED" })).status, 400);
    assert.equal((await staffClient(superAdmin).patch(`/api/users/${superAdmin.id}/status`).send({ status: "INACTIVE" })).status, 400);

    const stored = await prisma.user.findMany({ where: { id: { in: [superAdmin.id, admin.id] } }, select: { status: true } });
    assert.ok(stored.every((u) => u.status === "ACTIVE"));
  });

  test("the last active SUPER_ADMIN cannot be suspended or demoted", async () => {
    const tenant = await createOrganization("users-last");
    const lastSuper = await createStaffUser({ role: "SUPER_ADMIN", organizationId: tenant.id });
    const secondSuper = await createStaffUser({ role: "SUPER_ADMIN", organizationId: tenant.id, status: "SUSPENDED" });

    // A suspended SUPER_ADMIN does not count as a usable administrator.
    const reactivate = await staffClient(lastSuper).patch(`/api/users/${secondSuper.id}/role`).send({ role: "EMPLOYEE" });
    assert.equal(reactivate.status, 200, "demoting an inactive SUPER_ADMIN is allowed");

    const helper = await createStaffUser({ role: "SUPER_ADMIN", organizationId: tenant.id });
    // helper demotes lastSuper -> allowed (helper remains)
    assert.equal((await staffClient(helper).patch(`/api/users/${lastSuper.id}/role`).send({ role: "ADMIN" })).status, 200);
    // now helper is the last one; a demoted ADMIN can't touch it, and nobody can suspend it
    assert.equal((await staffClient(lastSuper).patch(`/api/users/${helper.id}/status`).send({ status: "SUSPENDED" })).status, 403);
    assert.equal((await staffClient(helper).patch(`/api/users/${helper.id}/role`).send({ role: "ADMIN" })).status, 400);

    const remaining = await prisma.user.count({ where: { organizationId: tenant.id, role: "SUPER_ADMIN", status: "ACTIVE" } });
    assert.equal(remaining, 1);
  });

  test("concurrent suspensions of the only two SUPER_ADMINs leave one usable", async () => {
    const tenant = await createOrganization("users-race");
    const a = await createStaffUser({ role: "SUPER_ADMIN", organizationId: tenant.id });
    const b = await createStaffUser({ role: "SUPER_ADMIN", organizationId: tenant.id });

    const results = await Promise.all([
      staffClient(a).patch(`/api/users/${b.id}/status`).send({ status: "SUSPENDED" }),
      staffClient(b).patch(`/api/users/${a.id}/status`).send({ status: "SUSPENDED" }),
      staffClient(a).patch(`/api/users/${b.id}/role`).send({ role: "ADMIN" }),
      staffClient(b).patch(`/api/users/${a.id}/role`).send({ role: "ADMIN" }),
    ]);
    const statuses = results.map((r) => r.status);
    assert.ok(statuses.every((s) => [200, 403, 404, 409, 401].includes(s)), `unexpected statuses ${statuses}`);

    const remaining = await prisma.user.count({ where: { organizationId: tenant.id, role: "SUPER_ADMIN", status: "ACTIVE" } });
    assert.equal(remaining, 1, `exactly one usable SUPER_ADMIN must remain (statuses: ${statuses})`);
  });

  test("status and role changes are recorded with before/after values", async () => {
    const tenant = await createOrganization("users-audit");
    const superAdmin = await createStaffUser({ role: "SUPER_ADMIN", organizationId: tenant.id });
    const employee = await createStaffUser({ role: "EMPLOYEE", organizationId: tenant.id });
    assert.equal((await staffClient(superAdmin).patch(`/api/users/${employee.id}/status`).send({ status: "SUSPENDED" })).status, 200);

    let log = null;
    for (let i = 0; i < 20 && !log; i += 1) {
      log = await prisma.activityLog.findFirst({ where: { entityId: employee.id, action: "USER_STATUS_CHANGED" } });
      if (!log) await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(log, "status change must be audited");
    assert.equal(log.userId, superAdmin.id);
    assert.equal(log.oldValue?.status, "ACTIVE");
    assert.equal(log.newValue?.status, "SUSPENDED");
  });
});
