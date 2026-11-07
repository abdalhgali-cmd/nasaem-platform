// Runs before `prisma migrate deploy` (backend/Dockerfile). It stops the
// container, with a message that names the fix, when DATABASE_URL cannot be
// the database this service is meant to use, instead of letting Prisma fail
// with P1012 or, worse, migrate a database nobody intended.
//
// Seen on Railway 2026-10-15..11-02 (project reasonable-connection): a
// DATABASE_URL reference such as ${{Postgres.DATABASE_URL}} to a service that
// does not exist in that project resolves to an EMPTY string.
//
// Optional pinning (recommended on every Railway service): when set, the
// target must match exactly, or nothing is migrated.
//   EXPECTED_DATABASE_HOST  e.g. postgres.railway.internal
//   EXPECTED_DATABASE_NAME  e.g. railway
// Only the host, port and database name are ever printed: never the user
// name, password or query string.
import { pathToFileURL } from "node:url";

export function databaseTarget(env = process.env) {
  const raw = String(env.DATABASE_URL || "").trim();
  if (!raw) {
    return {
      ok: false,
      reason:
        "DATABASE_URL is empty. On Railway, set it on this service as a reference to the PostgreSQL service of the SAME project and environment (Variables → Add reference → <your Postgres service> → DATABASE_URL). A reference to a service name that does not exist resolves to an empty string.",
    };
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "DATABASE_URL is not a valid URL (check for a missing scheme, spaces or unescaped characters in the password)." };
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    return { ok: false, reason: `DATABASE_URL must be a postgresql:// URL, not ${url.protocol}//.` };
  }
  const host = url.hostname;
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!host) return { ok: false, reason: "DATABASE_URL has no host." };
  if (!name) return { ok: false, reason: "DATABASE_URL has no database name." };
  const target = { host, port: url.port || "5432", name };
  const expectedHost = String(env.EXPECTED_DATABASE_HOST || "").trim();
  const expectedName = String(env.EXPECTED_DATABASE_NAME || "").trim();
  if (expectedHost && expectedHost !== host) {
    return { ok: false, target, reason: `DATABASE_URL points at host ${host}, but EXPECTED_DATABASE_HOST is ${expectedHost}: refusing to migrate an unintended database.` };
  }
  if (expectedName && expectedName !== name) {
    return { ok: false, target, reason: `DATABASE_URL points at database ${name}, but EXPECTED_DATABASE_NAME is ${expectedName}: refusing to migrate an unintended database.` };
  }
  return { ok: true, target, pinned: Boolean(expectedHost || expectedName) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = databaseTarget();
  if (!result.ok) {
    console.error(`[database] refused: ${result.reason}`);
    process.exit(1);
  }
  const { host, port, name } = result.target;
  console.log(`[database] target ${host}:${port}/${name}${result.pinned ? " (matches EXPECTED_DATABASE_*)" : " (not pinned: set EXPECTED_DATABASE_HOST/NAME to pin it)"}`);
}
