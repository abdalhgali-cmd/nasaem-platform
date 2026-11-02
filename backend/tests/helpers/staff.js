import "../env.js";
import request from "supertest";
import app from "../../src/app.js";
import prisma from "../../src/config/database.js";
import { hashPassword } from "../../src/utils/password.js";
import { signAccessToken } from "../../src/utils/jwt.js";
import { uniqueSuffix } from "./api.js";

// Creates an organization fixture. Tests that need a second tenant use this
// instead of relying on whatever organizations previous runs left behind.
export async function createOrganization(label = "tenant") {
  const suffix = uniqueSuffix();
  return prisma.organization.create({
    data: { slug: `${label}-${suffix}`, name: `${label} ${suffix}` },
  });
}

// Creates a staff user directly in the database (so a test controls its
// organization and role without going through the SUPER_ADMIN-only create
// route) and returns it with a known password.
export async function createStaffUser({ role = "EMPLOYEE", organizationId = "org_nasaem_default", status = "ACTIVE", branchId = null } = {}) {
  const suffix = uniqueSuffix();
  const password = `Staff@${suffix}`;
  const user = await prisma.user.create({
    data: {
      employeeNo: `T-${role}-${suffix}`,
      fullName: `Test ${role} ${suffix}`,
      email: `${role.toLowerCase()}-${suffix}@test.local`,
      passwordHash: await hashPassword(password),
      role,
      status,
      organizationId,
      branchId,
    },
  });
  return { ...user, password };
}

// A same-origin browser-like client for a staff user. Mints the session the
// same way POST /auth/login does, without spending the login rate limit,
// and sends the headers the back-office's api.js sends.
export function staffClient(user, { token } = {}) {
  const sessionToken = token || signAccessToken({ sub: user.id, role: user.role, email: user.email, sv: user.sessionVersion ?? 0 });
  const withHeaders = (req) => req.set("Cookie", `accessToken=${sessionToken}`).set("X-Requested-With", "XMLHttpRequest");
  return {
    token: sessionToken,
    get: (url) => withHeaders(request(app).get(url)),
    post: (url) => withHeaders(request(app).post(url)),
    patch: (url) => withHeaders(request(app).patch(url)),
    put: (url) => withHeaders(request(app).put(url)),
    delete: (url) => withHeaders(request(app).delete(url)),
  };
}
