// Startup sequence: verify database compatibility, then accept traffic.
//
// Fail closed. Neither the HTTP listener nor any background worker starts
// until assertDatabaseCompatible() has *passed*. An unreachable database is
// retried a bounded number of times (the platform also restarts the process),
// but it never counts as compatible: when the retries run out, or the check
// fails for any other reason, startServer() rejects and server.js exits
// non-zero.
//
// After a successful start nothing here runs again; a later database outage
// is handled per request (503, staff sessions kept), as before.
import prismaPackage from "@prisma/client";
import { assertDatabaseCompatible } from "./release/compatibility.js";

const { Prisma } = prismaPackage;

// Prisma connection-level codes: server unreachable, timed out, closed,
// too many connections, database does not exist yet.
const CONNECTION_ERROR_CODES = new Set(["P1001", "P1002", "P1003", "P1008", "P1011", "P1017", "P2024"]);

export function isDatabaseConnectionError(error) {
  if (!error) return false;
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  return CONNECTION_ERROR_CODES.has(error.code) || CONNECTION_ERROR_CODES.has(error.errorCode);
}

export class StartupRefusedError extends Error {
  constructor(reason, cause) {
    super(`Startup refused: ${reason}`);
    this.code = "STARTUP_REFUSED";
    this.reason = reason;
    this.cause = cause;
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Resolves once the database is verified compatible. Rejects with
// StartupRefusedError otherwise; never resolves on a failed check.
export async function verifyDatabaseBeforeStart({
  db,
  checkCompatibility = assertDatabaseCompatible,
  attempts = 5,
  retryDelayMs = 3000,
  log = console,
  sleep = wait,
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await checkCompatibility(db);
      return { attempts: attempt };
    } catch (error) {
      if (error?.code === "INCOMPATIBLE_DATABASE") throw new StartupRefusedError(error.message, error);
      if (!isDatabaseConnectionError(error)) {
        throw new StartupRefusedError(`database compatibility check failed unexpectedly (${error?.message || error})`, error);
      }
      if (attempt === attempts) {
        throw new StartupRefusedError(`database unreachable after ${attempts} attempt(s) (${error.message})`, error);
      }
      log.warn?.(`[startup] Database unreachable (attempt ${attempt}/${attempts}); retrying in ${retryDelayMs} ms`);
      await sleep(retryDelayMs);
    }
  }
  throw new StartupRefusedError("no compatibility check was attempted");
}

// The whole start decision. `listen` and `startWorkers` are called only after
// verification passes, in that order.
export async function startServer({ app, db, port, host = "0.0.0.0", startWorkers = () => {}, log = console, ...verifyOptions }) {
  await verifyDatabaseBeforeStart({ db, log, ...verifyOptions });
  const server = await new Promise((resolve, reject) => {
    // Express 5 calls back with the error when listening fails.
    const listener = app.listen(port, host, (error) => (error ? reject(error) : resolve(listener)));
  });
  startWorkers();
  return server;
}
