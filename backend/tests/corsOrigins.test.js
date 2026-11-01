// Staging regression (2026-10-24): the website's Egypt intake never created a
// draft. Railway logged only 204 preflights on /api/intake-drafts: the
// preflight answered without Access-Control-Allow-Origin, so the browser
// dropped the POST. A CORS_ORIGIN entry written as a URL with a trailing "/"
// never matched the browser's Origin, while the CSRF check (which stripped
// the slash) trusted it. Both now read the variable through one parser.
import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import request from "supertest";

import app from "../src/app.js";
import { corsOptionsFor, parseAllowedOrigins } from "../src/utils/allowedOrigins.js";
import { createCsrfProtection } from "../src/middleware/csrf.middleware.js";

const SITE = "https://nasaem-website-staging-staging.up.railway.app";
const preflight = (target, path, origin) =>
  request(target).options(path).set("Origin", origin).set("Access-Control-Request-Method", "POST").set("Access-Control-Request-Headers", "content-type");

// The same middleware order as app.js, with a given CORS_ORIGIN value.
function appWith(corsOrigin) {
  const mini = express();
  mini.use(cors(corsOptionsFor(corsOrigin)));
  mini.use(express.json());
  mini.use(cookieParser());
  mini.use("/api", createCsrfProtection({ trustedOrigins: parseAllowedOrigins(corsOrigin).origins }));
  mini.post("/api/intake-drafts", (req, res) => res.status(201).json({ ok: true }));
  return mini;
}

describe("CORS_ORIGIN parsing", () => {
  test("exact origins are accepted with a trailing slash, spaces and any letter case", () => {
    const { origins, rejected } = parseAllowedOrigins(` ${SITE}/ , HTTPS://Example.COM, http://localhost:3000,, https://xn--bcher-kva.example`);
    assert.deepEqual([...origins], [SITE, "https://example.com", "http://localhost:3000", "https://xn--bcher-kva.example"]);
    assert.deepEqual(rejected, []);
  });

  test("anything wider than one origin is dropped and reported, never widened", () => {
    const wide = [
      "*", "https://*.railway.app", "null", "https://site.example/app", "https://site.example/?x=1", "ftp://files.example", "not a url",
      "https://user:pw@site.example",
      // Malformed text the URL parser would otherwise "repair" into a trusted origin.
      "https:evil.example", "https://trusted.example/admin/..", "https://trusted.example/..", "https://trusted.example?", "https://trusted.example#", "https://trusted.example//",
      // Hosts the URL parser would rewrite into a different literal host.
      "https://trusted.example\\.evil", "https://%65vil.example", "https://127.1", "https://0x7f000001", "https://ｅｖｉｌ.example", "https://\u212A.example",
      "https://trusted.example:443", "https://trusted.example:0443", "https://trusted.example:",
    ];
    const { origins, rejected } = parseAllowedOrigins(wide.join(","));
    assert.deepEqual([...origins], []);
    assert.equal(rejected.length, wide.length);
    assert.deepEqual(corsOptionsFor("*").origin, false, "a configuration with no valid origin denies cross-origin requests");
    assert.deepEqual(corsOptionsFor(undefined).origin, false);
  });
});

describe("the website origin can create an intake draft (staging failure)", () => {
  test("a trailing-slash entry now answers the preflight with the origin and credentials", async () => {
    const target = appWith(`http://localhost:3000, ${SITE}/`);
    const pre = await preflight(target, "/api/intake-drafts", SITE);
    assert.equal(pre.status, 204);
    assert.equal(pre.headers["access-control-allow-origin"], SITE, "without this header the browser never sends the POST");
    assert.equal(pre.headers["access-control-allow-credentials"], "true");
    assert.match(pre.headers["access-control-allow-methods"], /POST/);
    assert.match(pre.headers["access-control-allow-headers"], /content-type/i);

    const post = await request(target).post("/api/intake-drafts").set("Origin", SITE).send({});
    assert.equal(post.status, 201);
    assert.equal(post.headers["access-control-allow-origin"], SITE);
  });

  test("CORS and CSRF agree: a cookie-carrying write from the configured site passes, others are refused", async () => {
    const target = appWith(`${SITE}/`);
    const ok = await request(target).post("/api/intake-drafts").set("Origin", SITE).set("Cookie", "trackingAccessToken=x").send({});
    assert.equal(ok.status, 201);
    const evil = await request(target).post("/api/intake-drafts").set("Origin", "https://evil.example").set("Cookie", "trackingAccessToken=x").send({});
    assert.equal(evil.status, 403);
    assert.equal(evil.body.code, "CSRF_REJECTED");
  });

  test("an unlisted origin still gets no CORS grant (fail closed)", async () => {
    for (const origin of ["https://evil.example", `${SITE}.evil.example`, "null"]) {
      const pre = await preflight(appWith(`${SITE}/`), "/api/intake-drafts", origin);
      assert.equal(pre.headers["access-control-allow-origin"], undefined, origin);
    }
  });
});

describe("the real app (test CORS_ORIGIN=http://localhost:3000)", () => {
  test("the website origin gets the preflight grant and creates a draft; a foreign origin gets none", async () => {
    const pre = await preflight(app, "/api/intake-drafts", "http://localhost:3000");
    assert.equal(pre.status, 204);
    assert.equal(pre.headers["access-control-allow-origin"], "http://localhost:3000");
    assert.equal(pre.headers["access-control-allow-credentials"], "true");

    const created = await request(app).post("/api/intake-drafts").set("Origin", "http://localhost:3000").send({ serviceKind: "visa" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.ok(created.body.data?.token);
    assert.equal(created.headers["access-control-allow-origin"], "http://localhost:3000");

    const foreign = await preflight(app, "/api/intake-drafts", "https://evil.example");
    assert.equal(foreign.headers["access-control-allow-origin"], undefined);
  });
});
