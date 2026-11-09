// T01 stage 2: draft credentials. New drafts store only a hash; the token can
// travel in the X-Draft-Token header (never in a URL); legacy URL tokens and
// legacy plaintext rows keep working so installed clients are unaffected.
import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { app, request } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { hashDraftToken } from "../src/modules/intake-drafts/intake-drafts.service.js";

async function create() {
  const res = await request(app).post("/api/intake-drafts").send({ serviceKind: "package" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.token;
}

describe("draft token: hash at rest, header transport, legacy compatible", () => {
  test("a new draft stores only the hash, never the token", async () => {
    const token = await create();
    const row = await prisma.intakeDraft.findUnique({ where: { tokenHash: hashDraftToken(token) } });
    assert.ok(row, "found by hash");
    assert.equal(row.token, null, "no plaintext at rest");
    assert.equal(row.tokenHash.length, 64);
    assert.equal(await prisma.intakeDraft.count({ where: { token } }), 0);
  });

  test("header mode reads and saves; the legacy URL form still works for the same draft", async () => {
    const token = await create();
    const read = await request(app).get("/api/intake-drafts/current").set("X-Draft-Token", token);
    assert.equal(read.status, 200, JSON.stringify(read.body));
    assert.match(read.headers["cache-control"] || "", /no-store/);
    const saved = await request(app).patch("/api/intake-drafts/current").set("X-Draft-Token", token).send({ name: "Header Customer" });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const legacy = await request(app).get(`/api/intake-drafts/${token}`);
    assert.equal(legacy.status, 200);
    assert.equal(legacy.body.data.name, "Header Customer");
  });

  test("missing, wrong or truncated header token is a 404 with no data", async () => {
    const token = await create();
    for (const headers of [{}, { "X-Draft-Token": "x".repeat(43) }, { "X-Draft-Token": token.slice(0, -1) }, { "X-Draft-Token": "" }]) {
      const res = await request(app).get("/api/intake-drafts/current").set(headers);
      assert.equal(res.status, 404, JSON.stringify(headers));
      assert.equal(res.body.data, undefined);
    }
    // the hash itself is not a credential
    const stolen = hashDraftToken(token);
    assert.equal((await request(app).get("/api/intake-drafts/current").set("X-Draft-Token", stolen)).status, 404);
    assert.equal((await request(app).get(`/api/intake-drafts/${stolen}`)).status, 404);
  });

  test("a legacy plaintext draft is still served and gets its hash recorded", async () => {
    const token = crypto.randomBytes(32).toString("base64url");
    const row = await prisma.intakeDraft.create({ data: { token, expiresAt: new Date(Date.now() + 86_400_000) } });
    assert.equal((await request(app).get(`/api/intake-drafts/${token}`)).status, 200);
    assert.equal((await request(app).get("/api/intake-drafts/current").set("X-Draft-Token", token)).status, 200);
    let hashed = null;
    for (let i = 0; i < 20 && !hashed; i++) {
      hashed = (await prisma.intakeDraft.findUnique({ where: { id: row.id } })).tokenHash;
      if (!hashed) await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(hashed, hashDraftToken(token));
  });

  test("header mode works for documents and expiry like the URL form", async () => {
    const token = await create();
    const doc = await request(app)
      .post("/api/intake-drafts/current/documents")
      .set("X-Draft-Token", token)
      .field("label", "جواز السفر")
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "a.png", contentType: "image/png" });
    assert.equal(doc.status, 201, JSON.stringify(doc.body));
    await prisma.intakeDraft.update({ where: { tokenHash: hashDraftToken(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(app).get("/api/intake-drafts/current").set("X-Draft-Token", token);
    assert.equal(expired.status, 410);
    assert.equal(expired.body.data, undefined);
  });
});
