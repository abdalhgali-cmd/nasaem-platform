import "./env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { app, request } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { createAccessLogger } from "../src/middleware/accessLog.js";

for (const production of [true, false]) {
  test(`access log redacts draft credentials, query and referer (production=${production})`, async () => {
    const server = express();
    let output = "";
    server.use(createAccessLogger({ production, stream: { write: (line) => { output += line; } } }));
    server.use((req, res) => res.sendStatus(404));
    const token = "synthetic-private-draft-credential";
    for (const path of ["intake-drafts", "%69ntake-drafts", "INTAKE-DRAFTS", "intake-drafts/%0A"]) {
      await request(server).get(`/api/${path}/${token}/documents?token=${token}`)
        .set("Referer", `https://example.invalid/api/intake-drafts/${token}`);
    }
    assert.ok(output.includes("[REDACTED]"));
    assert.equal(output.includes(token), false);
    assert.equal(output.includes("?token="), false);
    assert.ok(output.includes("404"));
  });
}

test("expired draft returns 410 without personal data; valid and unknown tokens keep their contract", async () => {
  const token = randomUUID();
  const draft = await prisma.intakeDraft.create({ data: {
    token, name: "Synthetic private applicant", expiresAt: new Date(Date.now() + 60000),
    travelers: [{ fullName: "Synthetic private traveler" }],
  } });
  try {
    const valid = await request(app).get(`/api/intake-drafts/${token}`);
    assert.equal(valid.status, 200);
    assert.equal(valid.body.data.name, "Synthetic private applicant");
    assert.equal(valid.headers["cache-control"], "no-store");
    await prisma.intakeDraft.update({ where: { id: draft.id }, data: { expiresAt: new Date(0) } });
    const expired = await request(app).get(`/api/intake-drafts/${token}`);
    assert.equal(expired.status, 410);
    assert.equal(expired.body.code, "EXPIRED");
    assert.equal(expired.body.data, undefined);
    assert.equal(JSON.stringify(expired.body).includes("Synthetic private"), false);
    assert.equal(expired.headers["cache-control"], "no-store");
    const submit = await request(app).post(`/api/intake-drafts/${token}/submit`).send({});
    assert.equal(submit.status, 410);
    assert.equal(submit.body.code, "EXPIRED");
    const missing = await request(app).get(`/api/intake-drafts/${randomUUID()}`);
    assert.equal(missing.status, 404);
  } finally {
    await prisma.intakeDraft.delete({ where: { id: draft.id } });
  }
});
