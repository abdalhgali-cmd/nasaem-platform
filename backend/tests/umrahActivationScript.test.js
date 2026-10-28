// Umrah price activation on staging only (owner decision 2026-10-28, option
// C): the server proves it is staging (modules/staging-ops/staging-guard.js)
// and the write goes to a staging-only route that checks a signature on every
// request. The real script (src/scripts/activate-umrah-pricing.js) is run
// against this app on 127.0.0.1, configured as staging or as production per
// test (the guard reads its configuration on each request). Synthetic data;
// the three Umrah rows are restored afterwards.
import "./env.js";
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import request from "supertest";

import app from "../src/app.js";
import prisma from "../src/config/database.js";
import { ensureUmrahPackageTypes } from "../prisma/setup-umrah-packages.js";
import { ANSWER_CONTEXT, REQUEST_CONTEXT, resetSeenNonces } from "../src/modules/staging-ops/staging-guard.js";
import { signAccessToken } from "../src/utils/jwt.js";
import { createStaffUser } from "./helpers/staff.js";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "scripts", "activate-umrah-pricing.js");
const CODES = ["SVC-UMRAH-VISA", "SVC-UMRAH-AIR", "SVC-UMRAH-SEA"];
const APPROVED = { "SVC-UMRAH-VISA": 795, "SVC-UMRAH-AIR": 3500, "SVC-UMRAH-SEA": 2650 };
const KEY = crypto.randomBytes(32).toString("hex");

let server;
let port;
let admin;
let adminToken;
let original;

function asStaging() {
  process.env.DEPLOYMENT_ENVIRONMENT = "staging";
  process.env.ENVIRONMENT_ATTESTATION_KEY = KEY;
}
function asProduction() {
  process.env.DEPLOYMENT_ENVIRONMENT = "production";
  delete process.env.ENVIRONMENT_ATTESTATION_KEY;
}

function run(args = [], env = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [SCRIPT, ...args],
      { env: { ...process.env, NASAEM_ADMIN_EMAIL: admin.email, NASAEM_ADMIN_PASSWORD: admin.password, NASAEM_API_BASE: `http://127.0.0.1:${port}/api`, NASAEM_STAGING_ATTESTATION_KEY: KEY, ...env }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? error.code ?? 1 : 0, out: `${stdout}${stderr}` })
    );
  });
}

// A local port forwarding everything to this app, as an SSH/railway tunnel
// would; onRequest can change the app's configuration per path (split routing).
async function forwarder(onRequest = () => {}) {
  const proxy = http.createServer((req, res) => {
    onRequest(req.url);
    const upstream = http.request({ host: "127.0.0.1", port, path: req.url, method: req.method, headers: req.headers }, (answer) => {
      res.writeHead(answer.statusCode, answer.headers);
      answer.pipe(res);
    });
    req.pipe(upstream);
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  return { proxy, base: `http://localhost:${proxy.address().port}/api` };
}

const umrahRows = async () => Object.fromEntries((await prisma.service.findMany({ where: { code: { in: CODES } } })).map((row) => [row.code, row]));
async function restore() {
  for (const [code, row] of Object.entries(original)) {
    await prisma.service.update({ where: { code }, data: { pricingMode: row.pricingMode, basePrice: row.basePrice, currency: row.currency, priceUnit: row.priceUnit, active: row.active } });
  }
}
async function assertUnchanged(label) {
  const rows = await umrahRows();
  for (const code of CODES) assert.equal(rows[code].updatedAt.getTime(), original[code].updatedAt.getTime(), `${label}: ${code} untouched`);
}

function signedHeaders({ method = "POST", urlPath, body = "{}", key = KEY, timestamp = String(Date.now()), nonce = crypto.randomBytes(32).toString("hex") }) {
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const signature = crypto.createHmac("sha256", key).update([REQUEST_CONTEXT, method, urlPath, timestamp, nonce, bodyHash].join("|")).digest("hex");
  return { nonce, headers: { "Content-Type": "application/json", "X-Nasaem-Env-Timestamp": timestamp, "X-Nasaem-Env-Nonce": nonce, "X-Nasaem-Env-Signature": signature } };
}

before(async () => {
  await ensureUmrahPackageTypes();
  original = await umrahRows();
  admin = await createStaffUser({ role: "ADMIN" });
  adminToken = signAccessToken({ sub: admin.id, role: admin.role, email: admin.email, sv: 0 });
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});

afterEach(async () => {
  delete process.env.DEPLOYMENT_ENVIRONMENT;
  delete process.env.ENVIRONMENT_ATTESTATION_KEY;
  resetSeenNonces();
  await restore();
  original = await umrahRows();
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("staging-only routes on the server", () => {
  test("a server not configured as staging answers 404, even to a correctly signed admin request", async () => {
    for (const configure of [asProduction, () => { process.env.DEPLOYMENT_ENVIRONMENT = "production"; process.env.ENVIRONMENT_ATTESTATION_KEY = KEY; }, () => { process.env.DEPLOYMENT_ENVIRONMENT = "staging"; process.env.ENVIRONMENT_ATTESTATION_KEY = "short"; }]) {
      configure();
      const { headers } = signedHeaders({ urlPath: "/api/admin/staging/umrah-pricing" });
      const res = await request(app).post("/api/admin/staging/umrah-pricing").set(headers).set("Authorization", `Bearer ${adminToken}`).send("{}");
      assert.equal(res.status, 404);
    }
    await assertUnchanged("not staging");
  });

  test("on staging: no proof, a wrong key, a stale timestamp, a replayed nonce, a changed body or a cookie session are refused", async () => {
    asStaging();
    const urlPath = "/api/admin/staging/attest";
    const bearer = { Authorization: `Bearer ${adminToken}` };
    assert.equal((await request(app).post(urlPath).set(bearer).send({})).status, 404, "no proof");
    assert.equal((await request(app).post(urlPath).set(signedHeaders({ urlPath, key: crypto.randomBytes(32).toString("hex") }).headers).set(bearer).send("{}")).status, 404, "wrong key");
    assert.equal((await request(app).post(urlPath).set(signedHeaders({ urlPath, timestamp: String(Date.now() - 10 * 60_000) }).headers).set(bearer).send("{}")).status, 404, "stale");
    assert.equal((await request(app).post(urlPath).set(signedHeaders({ urlPath, body: "{}" }).headers).set(bearer).send('{"x":1}')).status, 404, "changed body");
    assert.equal((await request(app).post(urlPath).set(signedHeaders({ urlPath }).headers).set("Cookie", `accessToken=${adminToken}`).send("{}")).status, 404, "cookie session");
    assert.equal((await request(app).post(`${urlPath}?x=1`).set(signedHeaders({ urlPath }).headers).set(bearer).send("{}")).status, 404, "unsigned query string");
    const once = signedHeaders({ urlPath });
    assert.equal((await request(app).post(urlPath).set(once.headers).set(bearer).send("{}")).status, 200, "first use");
    assert.equal((await request(app).post(urlPath).set(once.headers).set(bearer).send("{}")).status, 404, "replay");
  });

  test("on staging: only ADMIN / SUPER_ADMIN (every other role 403 with a valid proof); the signed answer verifies and carries no secret", async () => {
    asStaging();
    const urlPath = "/api/admin/staging/attest";
    for (const role of ["EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"]) {
      const staff = await createStaffUser({ role });
      const staffToken = signAccessToken({ sub: staff.id, role: staff.role, email: staff.email, sv: 0 });
      for (const route of ["/api/admin/staging/attest", "/api/admin/staging/umrah-pricing"]) {
        const res = await request(app).post(route).set(signedHeaders({ urlPath: route }).headers).set("Authorization", `Bearer ${staffToken}`).send("{}");
        assert.equal(res.status, 403, `${role} ${route}`);
      }
    }
    await assertUnchanged("refused roles");
    assert.equal((await request(app).post(urlPath).set(signedHeaders({ urlPath }).headers).send("{}")).status, 404, "no Bearer session: nothing revealed");

    const { nonce, headers } = signedHeaders({ urlPath });
    const res = await request(app).post(urlPath).set(headers).set("Authorization", `Bearer ${adminToken}`).send("{}");
    assert.equal(res.status, 200);
    const { environment, issuedAt, signature } = res.body.data;
    assert.equal(environment, "staging");
    assert.equal(res.body.data.nonce, nonce);
    assert.equal(signature, crypto.createHmac("sha256", KEY).update([ANSWER_CONTEXT, environment, nonce, issuedAt].join("|")).digest("hex"));
    assert.ok(!JSON.stringify(res.body).includes(KEY), "the key is never returned");
  });
});

describe("the activation script", () => {
  test("refuses production, look-alike, unlisted and plain-http remote hosts before logging in", async () => {
    for (const target of [
      "https://nasaem-platform-production.up.railway.app/api",
      "https://nasaem-staging.evil.example/api",
      "https://staging.nasaem-platform-production.up.railway.app/api",
      "http://adaptable-quietude-staging.up.railway.app/api",
      "http://10.0.0.5/api",
      "not a url",
    ]) {
      const res = await run(["--apply"], { NASAEM_API_BASE: target });
      assert.notEqual(res.code, 0, target);
      assert.match(res.out, /refused:/, target);
    }
  });

  test("without the staging key, or with a wrong one, nothing is applied", async () => {
    asStaging();
    const missing = await run(["--apply"], { NASAEM_STAGING_ATTESTATION_KEY: "" });
    assert.match(missing.out, /refused: NASAEM_STAGING_ATTESTATION_KEY/);
    const wrong = await run(["--apply"], { NASAEM_STAGING_ATTESTATION_KEY: crypto.randomBytes(32).toString("hex") });
    assert.notEqual(wrong.code, 0);
    assert.match(wrong.out, /NOT VERIFIED/);
    assert.match(wrong.out, /not applying/);
    await assertUnchanged("wrong key");
  });

  test("a production server is refused, also behind localhost (a tunnel to production)", async () => {
    asProduction();
    const direct = await run(["--apply"]);
    assert.notEqual(direct.code, 0);
    assert.match(direct.out, /not applying: the target did not prove it is staging/);

    const { proxy, base } = await forwarder();
    try {
      const tunnelled = await run(["--apply"], { NASAEM_API_BASE: base });
      assert.notEqual(tunnelled.code, 0);
      assert.match(tunnelled.out, /cannot prove it is staging/);
    } finally {
      await new Promise((resolve) => proxy.close(resolve));
    }
    await assertUnchanged("production");
  });

  test("split routing (proof from staging, write sent to production) changes nothing", async () => {
    asStaging();
    const { proxy, base } = await forwarder((url) => {
      if (url.includes("/admin/staging/umrah-pricing")) asProduction();
    });
    try {
      const res = await run(["--apply"], { NASAEM_API_BASE: base });
      assert.notEqual(res.code, 0);
      assert.match(res.out, /environment: staging \(verified/);
      assert.match(res.out, /apply: outcome unknown \(POST \/admin\/staging\/umrah-pricing → 404\)/);
    } finally {
      await new Promise((resolve) => proxy.close(resolve));
    }
    await assertUnchanged("split routing");
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

  test("verified staging: dry run changes nothing; --apply sets exactly the approved prices; a rerun changes nothing; no secret printed", async () => {
    asStaging();
    const other = await prisma.service.findFirst({ where: { code: { notIn: CODES } }, orderBy: { code: "asc" } });

    const dry = await run();
    assert.equal(dry.code, 0, dry.out);
    assert.match(dry.out, /environment: staging \(verified/);
    await assertUnchanged("dry run");

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
    const audits = await prisma.activityLog.findMany({ where: { action: "UMRAH_PRICING_ACTIVATED", entityId: { in: CODES.map((code) => rows[code].id) }, createdAt: { gte: original[CODES[0]].updatedAt } } });
    assert.ok(audits.length >= 1, "each price change is audited in the same transaction");
    assert.ok(!JSON.stringify(audits).includes(KEY), "no key in the audit");
    const otherAfter = await prisma.service.findUnique({ where: { id: other.id } });
    assert.equal(otherAfter.updatedAt.getTime(), other.updatedAt.getTime(), "another service untouched");

    const again = await run(["--apply"]);
    assert.equal(again.code, 0, again.out);
    const rerun = await umrahRows();
    for (const code of CODES) assert.equal(rerun[code].updatedAt.getTime(), rows[code].updatedAt.getTime(), `${code} not written again`);

    for (const out of [dry.out, applied.out, again.out]) {
      assert.ok(!out.includes(admin.password), "no password");
      assert.ok(!out.includes(KEY), "no key");
      assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\./.test(out), "no JWT");
    }
  });
});
