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
