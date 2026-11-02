import "./env.js";
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import prismaPackage from "@prisma/client";

import app from "../src/app.js";
import prisma from "../src/config/database.js";
import { assertDatabaseCompatible, readLocalMigrations, PAYMENT_REFUNDS_MIGRATION } from "../src/release/compatibility.js";
import { startServer } from "../src/startup.js";
import { uniqueSuffix } from "./helpers/api.js";

const { PrismaClient } = prismaPackage;

// Startup must fail closed: no HTTP listener and no background worker until
// the database has been verified compatible. These tests drive the real
// start decision (startup.js, and server.js as a process) against the test
// database, an unreachable database, and synthetic databases, with failures
// injected through a TCP proxy that can drop every connection.

const backendDir = path.resolve(import.meta.dirname, "..");
const baseUrl = new URL(process.env.DATABASE_URL);
const urlFor = ({ database = baseUrl.pathname.slice(1), port = baseUrl.port || "5432", host = baseUrl.hostname } = {}) => {
  const url = new URL(baseUrl);
  url.hostname = host;
  url.port = String(port);
  url.pathname = `/${database}`;
  return url.toString();
};

// A TCP proxy in front of PostgreSQL. While `up` is false every connection is
// dropped at once, which Prisma reports as an unreachable database.
async function createDbProxy() {
  const sockets = new Set();
  const proxy = { up: false };
  const server = net.createServer((client) => {
    sockets.add(client);
    client.on("close", () => sockets.delete(client));
    client.on("error", () => {});
    if (!proxy.up) return client.destroy();
    const upstream = net.connect(Number(baseUrl.port || 5432), baseUrl.hostname);
    sockets.add(upstream);
    upstream.on("close", () => sockets.delete(upstream));
    upstream.on("error", () => client.destroy());
    client.pipe(upstream).pipe(client);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  proxy.port = server.address().port;
  proxy.close = async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  };
  return proxy;
}

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

const isListening = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });

// A fake app that records whether the server ever listened.
function recordingApp(events) {
  return {
    listen(port, host, callback) {
      events.push("listen");
      const server = net.createServer();
      server.listen(0, "127.0.0.1", () => callback());
      return server;
    },
  };
}

const quiet = { warn() {}, log() {}, error() {} };

// Synthetic databases (no customer data): one whose migration history names
// a migration this build does not know, one with no migration history.
const suffix = uniqueSuffix().replace(/[^a-z0-9]/gi, "").toLowerCase();
const FUTURE_DB = `startup_future_${suffix}`;
const EMPTY_DB = `startup_empty_${suffix}`;
const clients = [];
const client = (url) => {
  const c = new PrismaClient({ datasourceUrl: url });
  clients.push(c);
  return c;
};

before(async () => {
  await prisma.$executeRawUnsafe(`CREATE DATABASE "${FUTURE_DB}"`);
  await prisma.$executeRawUnsafe(`CREATE DATABASE "${EMPTY_DB}"`);
  const future = new PrismaClient({ datasourceUrl: urlFor({ database: FUTURE_DB }) });
  await future.$executeRawUnsafe(
    `CREATE TABLE "_prisma_migrations" (id text PRIMARY KEY, migration_name text NOT NULL, finished_at timestamptz, rolled_back_at timestamptz)`
  );
  const rows = [...readLocalMigrations(), "20991231000000_future_change"];
  for (const name of rows) {
    await future.$executeRawUnsafe(`INSERT INTO "_prisma_migrations" VALUES ($1, $1, now(), NULL)`, name);
  }
  await future.$disconnect();
});

after(async () => {
  for (const c of clients) await c.$disconnect().catch(() => {});
  await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${FUTURE_DB}" WITH (FORCE)`);
  await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${EMPTY_DB}" WITH (FORCE)`);
});

describe("startup decision (startServer)", () => {
  test("compatible database: verifies, then listens, then starts workers, and serves requests", async () => {
    const events = [];
    const server = await startServer({
      app: { listen: (...args) => { events.push("listen"); return app.listen(...args); } },
      db: prisma,
      port: 0,
      host: "127.0.0.1",
      log: quiet,
      checkCompatibility: async (db) => { events.push("check"); return assertDatabaseCompatible(db); },
      startWorkers: () => events.push("workers"),
    });
    try {
      assert.deepEqual(events, ["check", "listen", "workers"]);
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
      assert.equal(res.status, 200);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("unknown migration: startup refused, nothing listens, no workers", async () => {
    const events = [];
    const olderBuild = readLocalMigrations().filter((name) => name !== PAYMENT_REFUNDS_MIGRATION);
    await assert.rejects(
      startServer({
        app: recordingApp(events),
        db: prisma,
        port: 0,
        log: quiet,
        checkCompatibility: (db) => assertDatabaseCompatible(db, { knownMigrations: olderBuild, acknowledged: [] }),
        startWorkers: () => events.push("workers"),
      }),
      (error) => error.code === "STARTUP_REFUSED" && /does not know/.test(error.message)
    );
    assert.deepEqual(events, []);
  });

  test("database unavailable for every attempt: refused after bounded retries, nothing served", async () => {
    const proxy = await createDbProxy();
    const events = [];
    let checks = 0;
    try {
      await assert.rejects(
        startServer({
          app: recordingApp(events),
          db: client(urlFor({ host: "127.0.0.1", port: proxy.port })),
          port: 0,
          log: quiet,
          attempts: 3,
          retryDelayMs: 10,
          checkCompatibility: (db) => { checks += 1; return assertDatabaseCompatible(db); },
          startWorkers: () => events.push("workers"),
        }),
        (error) => error.code === "STARTUP_REFUSED" && /unreachable after 3 attempt/.test(error.message)
      );
      assert.equal(checks, 3);
      assert.deepEqual(events, [], "an unreachable database is never treated as compatible");
    } finally {
      await proxy.close();
    }
  });

  test("unexpected verification errors refuse startup at once, without retrying", async () => {
    for (const failure of [new Error("unexpected"), Object.assign(new Error("raw query failed"), { code: "P2010" })]) {
      const events = [];
      let checks = 0;
      await assert.rejects(
        startServer({
          app: recordingApp(events),
          db: prisma,
          port: 0,
          log: quiet,
          attempts: 5,
          retryDelayMs: 10,
          checkCompatibility: async () => { checks += 1; throw failure; },
          startWorkers: () => events.push("workers"),
        }),
        (error) => error.code === "STARTUP_REFUSED" && /failed unexpectedly/.test(error.message)
      );
      assert.equal(checks, 1);
      assert.deepEqual(events, []);
    }
  });

  test("a database without migration history is refused", async () => {
    const events = [];
    await assert.rejects(
      startServer({ app: recordingApp(events), db: client(urlFor({ database: EMPTY_DB })), port: 0, log: quiet, attempts: 2, retryDelayMs: 10, startWorkers: () => events.push("workers") }),
      (error) => error.code === "STARTUP_REFUSED" && /_prisma_migrations/.test(error.message)
    );
    assert.deepEqual(events, []);
  });

  test("recovery after an initial connection failure: the check passes before traffic is accepted", async () => {
    const proxy = await createDbProxy();
    const events = [];
    try {
      const server = await startServer({
        app: recordingApp(events),
        db: client(urlFor({ host: "127.0.0.1", port: proxy.port })),
        port: 0,
        log: quiet,
        attempts: 5,
        retryDelayMs: 10,
        sleep: async () => { events.push("database back"); proxy.up = true; },
        checkCompatibility: async (db) => {
          try {
            await assertDatabaseCompatible(db);
            events.push("check passed");
          } catch (error) {
            events.push("check failed");
            throw error;
          }
        },
        startWorkers: () => events.push("workers"),
      });
      server.close();
      assert.deepEqual(events, ["check failed", "database back", "check passed", "listen", "workers"]);
    } finally {
      await proxy.close();
    }
  });

  test("recovery to an incompatible database: traffic stays blocked", async () => {
    const proxy = await createDbProxy();
    const events = [];
    try {
      await assert.rejects(
        startServer({
          app: recordingApp(events),
          db: client(urlFor({ host: "127.0.0.1", port: proxy.port, database: FUTURE_DB })),
          port: 0,
          log: quiet,
          attempts: 5,
          retryDelayMs: 10,
          sleep: async () => { events.push("database back"); proxy.up = true; },
          startWorkers: () => events.push("workers"),
        }),
        (error) => error.code === "STARTUP_REFUSED" && /20991231000000_future_change/.test(error.message)
      );
      assert.deepEqual(events, ["database back"]);
    } finally {
      await proxy.close();
    }
  });
});

// The real entry point, as the container runs it.
function runServer(databaseUrl, { port, attempts = 3, delayMs = 100 }) {
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: databaseUrl, PORT: String(port), STARTUP_DB_ATTEMPTS: String(attempts), STARTUP_DB_RETRY_DELAY_MS: String(delayMs) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  return { child, exited, output: () => output };
}

// The exit code, or "still running" (after killing it) when the process
// does not exit in time, as a server that skipped the check would.
async function exitCodeWithin(run, ms = 30000) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve("still running"), ms); });
  const result = await Promise.race([run.exited, timeout]);
  clearTimeout(timer);
  if (result === "still running") {
    run.child.kill();
    await run.exited;
  }
  return result;
}

async function waitFor(predicate, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

describe("server.js process", { timeout: 120000 }, () => {
  test("compatible database: the process starts and serves", async () => {
    const port = await freePort();
    const run = runServer(urlFor(), { port });
    try {
      assert.ok(await waitFor(() => run.output().includes("running on port")), run.output());
      assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
    } finally {
      run.child.kill();
      await run.exited;
    }
  });

  test("unreachable database: exits non-zero and never opens its port", async () => {
    const proxy = await createDbProxy();
    const port = await freePort();
    try {
      const run = runServer(urlFor({ host: "127.0.0.1", port: proxy.port }), { port, attempts: 3, delayMs: 200 });
      let everListened = false;
      const watcher = setInterval(async () => { if (await isListening(port)) everListened = true; }, 50);
      const code = await exitCodeWithin(run);
      clearInterval(watcher);
      assert.equal(code, 1, run.output());
      assert.match(run.output(), /Startup refused: database unreachable after 3 attempt/);
      assert.doesNotMatch(run.output(), /running on port/);
      assert.equal(everListened, false);
    } finally {
      await proxy.close();
    }
  });

  test("database with an unknown migration: exits non-zero", async () => {
    const port = await freePort();
    const run = runServer(urlFor({ database: FUTURE_DB }), { port });
    assert.equal(await exitCodeWithin(run), 1, run.output());
    assert.match(run.output(), /Startup refused: Database has 1 migration\(s\) this build does not know: 20991231000000_future_change/);
    assert.equal(await isListening(port), false);
  });

  test("database comes back during startup: the port opens only after the check passes", async () => {
    const proxy = await createDbProxy();
    const port = await freePort();
    const run = runServer(urlFor({ host: "127.0.0.1", port: proxy.port }), { port, attempts: 20, delayMs: 200 });
    try {
      assert.ok(await waitFor(() => run.output().includes("Database unreachable (attempt 2/20)")), run.output());
      assert.equal(await isListening(port), false, "no traffic while the database is unreachable");
      proxy.up = true;
      assert.ok(await waitFor(() => run.output().includes("running on port")), run.output());
      assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
    } finally {
      run.child.kill();
      await run.exited;
      await proxy.close();
    }
  });
});
