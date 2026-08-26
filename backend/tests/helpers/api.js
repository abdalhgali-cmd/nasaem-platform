import "../env.js";
import request from "supertest";
import app from "../../src/app.js";

export { app, request };

export async function loginAsSuperAdmin() {
  const agent = request.agent(app);
  const email = "admin@nasaem-platform.local";
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!password) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is not set. Tests expect the DB to already be migrated + seeded " +
        "with this password (see README's Testing section)."
    );
  }

  const res = await agent.post("/api/auth/login").send({ email, password });

  if (res.status !== 200) {
    throw new Error(
      `Failed to log in as the seeded super admin (status ${res.status}): ${JSON.stringify(res.body)}`
    );
  }

  return agent;
}

// Keeps unique-field test fixtures (passport numbers, service codes, emails)
// from colliding across test runs against the same database.
export function uniqueSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

// Registers a brand-new Customer Account and returns both the logged-in
// agent (its cookie jar carries the customerAccessToken) and the created
// customer record, so tests can assert on customer.id without a second
// round trip.
export async function registerCustomer(overrides = {}) {
  const suffix = uniqueSuffix();
  const agent = request.agent(app);
  const res = await agent.post("/api/customer-auth/register").send({
    fullName: `Test Customer ${suffix}`,
    phone: `249${suffix}`,
    password: "Test@12345",
    ...overrides,
  });

  if (res.status !== 201) {
    throw new Error(`Failed to register test customer (status ${res.status}): ${JSON.stringify(res.body)}`);
  }

  return { agent, customer: res.body.data.customer };
}
