// The Umrah staging activation script (src/scripts/activate-umrah-pricing.js)
// run for real against this app on 127.0.0.1, as an operator would run it
// against staging. Codex review (2026-10-28): a host merely containing
// "staging" passed the guard, redirects were followed, and a failed PATCH
// stopped the script before it reported what had been applied.
// Synthetic data; the three Umrah rows are restored afterwards.
import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import app from "../src/app.js";
import prisma from "../src/config/database.js";
import { ensureUmrahPackageTypes } from "../prisma/setup-umrah-packages.js";
import { createStaffUser } from "./helpers/staff.js";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "scripts", "activate-umrah-pricing.js");
const CODES = ["SVC-UMRAH-VISA", "SVC-UMRAH-AIR", "SVC-UMRAH-SEA"];
const APPROVED = { "SVC-UMRAH-VISA": 795, "SVC-UMRAH-AIR": 3500, "SVC-UMRAH-SEA": 2650 };

let server;
let base;
let admin;
let original;

function run(args = [], env = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [SCRIPT, ...args], { env: { ...process.env, NASAEM_ADMIN_EMAIL: admin.email, NASAEM_ADMIN_PASSWORD: admin.password, NASAEM_API_BASE: base, ...env }, timeout: 30_000 }, (error, stdout, stderr) =>
      resolve({ code: error ? error.code ?? 1 : 0, out: `${stdout}${stderr}` })
    );
  });
}

const umrahRows = async () => Object.fromEntries((await prisma.service.findMany({ where: { code: { in: CODES } } })).map((row) => [row.code, row]));

before(async () => {
  await ensureUmrahPackageTypes();
  original = await umrahRows();
  admin = await createStaffUser({ role: "ADMIN" });
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  for (const [code, row] of Object.entries(original)) {
    await prisma.service.update({ where: { code }, data: { pricingMode: row.pricingMode, basePrice: row.basePrice, currency: row.currency, priceUnit: row.priceUnit, active: row.active } });
  }
  await new Promise((resolve) => server.close(resolve));
});

describe("Umrah activation script", () => {
  test("refuses production, look-alike and unlisted hosts before logging in", async () => {
    for (const target of [
      "https://nasaem-platform-production.up.railway.app/api",
      "https://nasaem-staging.evil.example/api",
      "https://staging.nasaem-platform-production.up.railway.app/api",
      "http://10.0.0.5/api",
      "not a url",
    ]) {
      const res = await run(["--apply"], { NASAEM_API_BASE: target });
      assert.notEqual(res.code, 0, target);
      assert.match(res.out, /refused:/, target);
    }
    const listed = await run([], { NASAEM_API_BASE: "https://nasaem-platform-production.up.railway.app/api", NASAEM_STAGING_HOSTS: "nasaem-platform-production.up.railway.app" });
    assert.match(listed.out, /refused:/, "no environment variable can add a host");
  });

  test("a redirect is refused, so credentials and changes never reach another host", async () => {
    let followed = false;
    const target = http.createServer((req, res) => { followed = true; res.end("{}"); });
    const redirector = http.createServer((req, res) => { res.writeHead(307, { Location: `http://127.0.0.1:${target.address().port}${req.url}` }); res.end(); });
    await new Promise((resolve) => target.listen(0, "127.0.0.1", resolve));
    await new Promise((resolve) => redirector.listen(0, "127.0.0.1", resolve));
    try {
      const res = await run(["--apply"], { NASAEM_API_BASE: `http://127.0.0.1:${redirector.address().port}/api` });
      assert.notEqual(res.code, 0);
      assert.equal(followed, false, "the redirect target received nothing");
    } finally {
      await new Promise((resolve) => redirector.close(resolve));
      await new Promise((resolve) => target.close(resolve));
    }
  });

  test("dry run changes nothing; --apply sets only the three approved prices; a rerun changes nothing", async () => {
    const other = await prisma.service.findFirst({ where: { code: { notIn: CODES } }, orderBy: { code: "asc" } });

    const dry = await run();
    assert.equal(dry.code, 0, dry.out);
    assert.match(dry.out, /dry run/);
    const afterDry = await umrahRows();
    for (const code of CODES) assert.equal(afterDry[code].updatedAt.getTime(), original[code].updatedAt.getTime(), `${code} untouched by the dry run`);

    const applied = await run(["--apply"]);
    assert.equal(applied.code, 0, applied.out);
    const rows = await umrahRows();
    for (const code of CODES) {
      assert.equal(rows[code].pricingMode, "FIXED", code);
      assert.equal(Number(rows[code].basePrice), APPROVED[code], code);
      assert.equal(rows[code].currency, "SAR", code);
      assert.equal(rows[code].priceUnit, "PER_TRAVELER", code);
      assert.equal(rows[code].active, true, code);
      assert.deepEqual(rows[code].features, original[code].features, `${code} description unchanged`);
      assert.match(applied.out, new RegExp(`${code}: saved yes · public yes`));
    }
    const otherAfter = await prisma.service.findUnique({ where: { id: other.id } });
    assert.equal(otherAfter.updatedAt.getTime(), other.updatedAt.getTime(), "another service untouched");

    const again = await run(["--apply"]);
    assert.equal(again.code, 0, again.out);
    const rerun = await umrahRows();
    for (const code of CODES) assert.equal(rerun[code].updatedAt.getTime(), rows[code].updatedAt.getTime(), `${code} not written again`);
  });

  test("the output carries no password or token", async () => {
    const res = await run();
    assert.ok(!res.out.includes(admin.password));
    assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\./.test(res.out), "no JWT in the output");
  });
});
