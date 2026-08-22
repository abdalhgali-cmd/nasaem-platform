import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import prisma from "../src/config/database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, "..", "scripts", "reset-admin-password.js");

const FAKE_STRONG_PASSWORD = "Test-Only-Fake-Reset-2026";
const FAKE_SHORT_PASSWORD = "short1";

function baseEnv() {
  const env = { ...process.env };
  delete env.ADMIN_RESET_PASSWORD;
  delete env.ADMIN_RESET_EMAIL;
  return env;
}

function runResetScript(overrides = {}) {
  const env = { ...baseEnv(), ...overrides };
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT_PATH], {
      env,
      encoding: "utf8",
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: typeof error.status === "number" ? error.status : 1,
      stdout: error.stdout ? error.stdout.toString() : "",
      stderr: error.stderr ? error.stderr.toString() : "",
    };
  }
}

describe("adminResetPassword script", () => {
  let adminEmail;
  let originalPasswordHash;
  let originalStatus;

  before(async () => {
    adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@nasaem.test";
    const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (admin) {
      originalPasswordHash = admin.passwordHash;
      originalStatus = admin.status;
    }
  });

  test("fails when ADMIN_RESET_PASSWORD is not set", () => {
    const result = runResetScript({});
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /ADMIN_RESET_PASSWORD is not set/);
  });

  test("fails when password is shorter than 12 characters", () => {
    const result = runResetScript({ ADMIN_RESET_PASSWORD: FAKE_SHORT_PASSWORD });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /at least 12 characters/);
    assert.doesNotMatch(result.stdout, new RegExp(FAKE_SHORT_PASSWORD));
    assert.doesNotMatch(result.stderr, new RegExp(FAKE_SHORT_PASSWORD));
  });

  test("fails when admin user is not found", async () => {
    const missingEmail = `missing-admin-${Date.now()}@nasaem.test`;
    const result = runResetScript({
      ADMIN_RESET_PASSWORD: FAKE_STRONG_PASSWORD,
      ADMIN_RESET_EMAIL: missingEmail,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /not found/i);
    const user = await prisma.user.findUnique({ where: { email: missingEmail } });
    assert.equal(user, null);
  });

  test("successfully resets password, rehashes, reactivates account, and never leaks password", async () => {
    if (!adminEmail) {
      throw new Error("No admin email configured for test");
    }

    await prisma.user.update({
      where: { email: adminEmail },
      data: { status: "INACTIVE" },
    });

    try {
      const before = await prisma.user.count({ where: { email: adminEmail } });
      assert.equal(before, 1);

      const result = runResetScript({
        ADMIN_RESET_PASSWORD: FAKE_STRONG_PASSWORD,
        ADMIN_RESET_EMAIL: adminEmail,
      });

      assert.equal(result.status, 0);
      assert.match(result.stdout, /reset successfully/i);
      assert.doesNotMatch(result.stdout, new RegExp(FAKE_STRONG_PASSWORD));
      assert.doesNotMatch(result.stderr, new RegExp(FAKE_STRONG_PASSWORD));

      const after = await prisma.user.count({ where: { email: adminEmail } });
      assert.equal(after, 1);

      const updatedAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
      assert.equal(updatedAdmin.status, "ACTIVE");
      assert.notEqual(updatedAdmin.passwordHash, FAKE_STRONG_PASSWORD);
      assert.match(updatedAdmin.passwordHash, /^\$2[aby]\$/);

      const matches = await bcrypt.compare(FAKE_STRONG_PASSWORD, updatedAdmin.passwordHash);
      assert.equal(matches, true);
    } finally {
      if (originalPasswordHash) {
        await prisma.user.update({
          where: { email: adminEmail },
          data: {
            passwordHash: originalPasswordHash,
            status: originalStatus,
          },
        });
      }
    }
  });
});
