import "./env.js";
import "./helpers/relaxLoginLimits.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { signAccessToken, signCustomerToken, signTrackingToken } from "../src/utils/jwt.js";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Staff authentication hardening:
//  * a staff member can change their own password (current password required);
//  * an admin can reset a colleague's password;
//  * a password change/reset invalidates every older session (JWTs were
//    previously valid for 7 days with no revocation);
//  * customer/tracking tokens are never accepted as staff sessions;
//  * login attempts are throttled per ACCOUNT, not only per IP;
//  * the users module is organisation-scoped.

const STRONG = "Str0ng-Passw0rd!";

async function createStaff(admin, overrides = {}) {
  const suffix = uniqueSuffix();
  const body = {
    fullName: `Staff ${suffix}`,
    email: `staff-${suffix}@example.com`,
    password: "Initial-Passw0rd!",
    role: "EMPLOYEE",
    ...overrides,
  };
  const res = await admin.post("/api/users").send(body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { ...res.body.data, email: body.email, password: body.password };
}

async function login(email, password) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password });
  return { agent, res, token: res.body?.data?.token };
}

describe("staff password change", () => {
  let admin;
  before(async () => {
    admin = await loginAsSuperAdmin();
  });

  test("changes the password with the current one; old password stops working", async () => {
    const staff = await createStaff(admin);
    const { agent, res } = await login(staff.email, staff.password);
    assert.equal(res.status, 200);

    const changed = await agent.post("/api/auth/change-password").send({ currentPassword: staff.password, newPassword: STRONG });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));

    assert.equal((await login(staff.email, staff.password)).res.status, 401, "old password rejected");
    assert.equal((await login(staff.email, STRONG)).res.status, 200, "new password accepted");
    assert.equal((await agent.get("/api/auth/me")).status, 200, "the session that changed it keeps working (fresh cookie)");
  });

  test("requires the correct current password and a strong, different new password", async () => {
    const staff = await createStaff(admin);
    const { agent } = await login(staff.email, staff.password);
    const attempt = (body) => agent.post("/api/auth/change-password").send(body);

    assert.equal((await attempt({ currentPassword: "wrong-password", newPassword: STRONG })).status, 400);
    assert.equal((await attempt({ currentPassword: staff.password, newPassword: "short1" })).status, 400);
    assert.equal((await attempt({ currentPassword: staff.password, newPassword: "alllettersnodigits" })).status, 400);
    assert.equal((await attempt({ currentPassword: staff.password, newPassword: staff.password })).status, 400, "must differ");
    assert.equal((await request(app).post("/api/auth/change-password").send({ currentPassword: "x", newPassword: STRONG })).status, 401, "needs a session");
  });

  test("EXPLOIT: a stolen session token stops working once the password changes", async () => {
    const staff = await createStaff(admin);
    const stolen = await login(staff.email, staff.password);
    await new Promise((resolve) => setTimeout(resolve, 1100)); // JWT iat has 1 s resolution
    const owner = await login(staff.email, staff.password);
    assert.equal((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${stolen.token}`)).status, 200);

    const changed = await owner.agent.post("/api/auth/change-password").send({ currentPassword: staff.password, newPassword: STRONG });
    assert.equal(changed.status, 200);

    assert.equal((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${stolen.token}`)).status, 401, "old token revoked");
    assert.equal((await owner.agent.get("/api/auth/me")).status, 200, "the owner's refreshed session works");
  });
});

describe("admin password reset", () => {
  let admin;
  before(async () => {
    admin = await loginAsSuperAdmin();
  });

  test("an admin resets a colleague's password with a chosen or generated one-time password", async () => {
    const staff = await createStaff(admin);
    const before = await login(staff.email, staff.password);
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const chosen = await admin.post(`/api/users/${staff.id}/reset-password`).send({ newPassword: STRONG });
    assert.equal(chosen.status, 200, JSON.stringify(chosen.body));
    assert.equal(JSON.stringify(chosen.body).includes(STRONG), false, "a chosen password is never echoed back");
    assert.equal((await login(staff.email, staff.password)).res.status, 401);
    assert.equal((await login(staff.email, STRONG)).res.status, 200);
    assert.equal((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${before.token}`)).status, 401, "their old sessions are revoked");

    const generated = await admin.post(`/api/users/${staff.id}/reset-password`).send({});
    assert.equal(generated.status, 200);
    assert.ok(generated.body.data.temporaryPassword.length >= 14);
    assert.equal((await login(staff.email, generated.body.data.temporaryPassword)).res.status, 200);
  });

  test("an EMPLOYEE cannot reset passwords; an ADMIN cannot reset a SUPER_ADMIN/ADMIN; nobody resets their own here", async () => {
    const employee = await createStaff(admin);
    const other = await createStaff(admin);
    const plainAdmin = await createStaff(admin, { role: "ADMIN" });

    const asEmployee = (await login(employee.email, employee.password)).agent;
    assert.equal((await asEmployee.post(`/api/users/${other.id}/reset-password`).send({ newPassword: STRONG })).status, 403);

    const asAdmin = (await login(plainAdmin.email, plainAdmin.password)).agent;
    const superAdmin = await prisma.user.findUnique({ where: { email: "admin@nasaem-platform.local" } });
    assert.equal((await asAdmin.post(`/api/users/${superAdmin.id}/reset-password`).send({ newPassword: STRONG })).status, 403);
    assert.equal((await asAdmin.post(`/api/users/${plainAdmin.id}/reset-password`).send({ newPassword: STRONG })).status, 400, "use change-password for yourself");
    assert.equal((await asAdmin.post(`/api/users/${other.id}/reset-password`).send({ newPassword: STRONG })).status, 200, "an ADMIN may reset non-admin staff");
  });

  test("a weak chosen password is rejected and an unknown user is 404", async () => {
    const staff = await createStaff(admin);
    assert.equal((await admin.post(`/api/users/${staff.id}/reset-password`).send({ newPassword: "weak" })).status, 400);
    assert.equal((await admin.post("/api/users/does-not-exist/reset-password").send({ newPassword: STRONG })).status, 404);
  });
});

describe("session token hygiene", () => {
  test("EXPLOIT: customer and tracking tokens are not staff sessions", async () => {
    const admin = await loginAsSuperAdmin();
    const me = (await admin.get("/api/auth/me")).body.data;
    // Same secret, same `sub` — only the scope claim differs.
    const customerToken = signCustomerToken(me.id);
    const trackingToken = signTrackingToken(me.id);
    assert.equal((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${customerToken}`)).status, 401);
    assert.equal((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${trackingToken}`)).status, 401);
    const staffToken = signAccessToken({ sub: me.id, role: me.role, email: me.email });
    assert.equal((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${staffToken}`)).status, 200);
  });
});

describe("login throttling per account", () => {
  test("repeated failures lock out ONE account for a while; other accounts from the same IP are unaffected", async () => {
    const admin = await loginAsSuperAdmin();
    const victim = await createStaff(admin);
    const bystander = await createStaff(admin);
    const statuses = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await request(app).post("/api/auth/login").send({ email: victim.email, password: `wrong-password-${i}` });
      statuses.push(res.status);
    }
    assert.ok(statuses.includes(429), `expected a 429 within 12 failures, got ${[...new Set(statuses)].join(",")}`);
    // Even the right password is refused while the account is throttled...
    assert.equal((await login(victim.email, victim.password)).res.status, 429);
    // ...but the throttle is per account, not per IP.
    assert.equal((await login(bystander.email, bystander.password)).res.status, 200);
  });

  test("successful logins do not count against the account", async () => {
    const admin = await loginAsSuperAdmin();
    const staff = await createStaff(admin);
    for (let i = 0; i < 12; i += 1) assert.equal((await login(staff.email, staff.password)).res.status, 200);
  });
});

describe("users module is organisation-scoped", () => {
  test("EXPLOIT: staff of one organisation cannot list or change another organisation's staff", async () => {
    const admin = await loginAsSuperAdmin();
    const suffix = uniqueSuffix();
    const other = await prisma.organization.create({ data: { slug: `users-scope-${suffix}`, name: `Users Scope ${suffix}` } });
    const stranger = await prisma.user.create({
      data: { organizationId: other.id, employeeNo: `SCOPE-${suffix}`, fullName: `Other Org Staff ${suffix}`, email: `other-org-${suffix}@example.com`, passwordHash: "not-a-real-hash", role: "EMPLOYEE" },
    });

    const list = await admin.get("/api/users");
    assert.equal(list.status, 200);
    assert.equal(list.body.data.some((user) => user.id === stranger.id), false, "foreign staff must not be listed");
    assert.equal((await admin.get(`/api/users/${stranger.id}`)).status, 404);
    assert.equal((await admin.patch(`/api/users/${stranger.id}/status`).send({ status: "SUSPENDED" })).status, 404);
    assert.equal((await admin.patch(`/api/users/${stranger.id}/role`).send({ role: "ADMIN" })).status, 404);
    assert.equal((await admin.post(`/api/users/${stranger.id}/reset-password`).send({ newPassword: STRONG })).status, 404);
    const unchanged = await prisma.user.findUnique({ where: { id: stranger.id } });
    assert.equal(unchanged.status, "ACTIVE");
    assert.equal(unchanged.role, "EMPLOYEE");
  });
});

describe("admin hierarchy", () => {
  test("EXPLOIT: an ADMIN cannot suspend a SUPER_ADMIN or another ADMIN, nor change their own status", async () => {
    const admin = await loginAsSuperAdmin();
    const plainAdmin = await createStaff(admin, { role: "ADMIN" });
    const otherAdmin = await createStaff(admin, { role: "ADMIN" });
    const employee = await createStaff(admin);
    const asAdmin = (await login(plainAdmin.email, plainAdmin.password)).agent;
    const superAdmin = await prisma.user.findUnique({ where: { email: "admin@nasaem-platform.local" } });

    assert.equal((await asAdmin.patch(`/api/users/${superAdmin.id}/status`).send({ status: "SUSPENDED" })).status, 403);
    assert.equal((await asAdmin.patch(`/api/users/${otherAdmin.id}/status`).send({ status: "SUSPENDED" })).status, 403);
    assert.equal((await asAdmin.patch(`/api/users/${plainAdmin.id}/status`).send({ status: "SUSPENDED" })).status, 400);
    assert.equal((await prisma.user.findUnique({ where: { id: superAdmin.id } })).status, "ACTIVE");

    assert.equal((await asAdmin.patch(`/api/users/${employee.id}/status`).send({ status: "INACTIVE" })).status, 200, "ordinary staff can still be managed by an ADMIN");
  });
});

