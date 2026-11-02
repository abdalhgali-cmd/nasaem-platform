// Read-only rollback pre-flight. Answers: may this target revision serve the
// database at DATABASE_URL? Never writes; prints counts and migration names
// only.
//
//   DATABASE_URL=... node src/scripts/rollback-check.js --ref <git-ref>
//   DATABASE_URL=... node src/scripts/rollback-check.js --target-dir <checkout>/backend
//
// Exit code 0: safe. 2: unsafe (do not deploy that target; roll forward).
// 1: the check itself failed (treat as unsafe).
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prisma from "../config/database.js";
import { evaluateRollbackTarget, parseCapabilities, readDatabaseState, readLocalMigrations } from "../release/compatibility.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// A checked-out backend directory of the target revision.
export function describeTargetDir(backendDir) {
  const capabilitiesFile = path.join(backendDir, "release-compatibility.json");
  return {
    targetMigrations: readLocalMigrations(path.join(backendDir, "prisma", "migrations")),
    targetCapabilities: existsSync(capabilitiesFile) ? parseCapabilities(readFileSync(capabilitiesFile, "utf8")) : [],
  };
}

// A git revision of this repository, read without checking it out.
export function describeTargetRef(ref, { cwd = repoRoot } = {}) {
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const commit = git("rev-parse", "--verify", `${ref}^{commit}`).trim();
  const targetMigrations = git("ls-tree", "--name-only", `${commit}:backend/prisma/migrations`)
    .split("\n")
    .filter((name) => name && name !== "migration_lock.toml")
    .sort();
  let capabilitiesJson = null;
  try {
    capabilitiesJson = git("show", `${commit}:backend/release-compatibility.json`);
  } catch {
    capabilitiesJson = null; // revisions before this file declare nothing
  }
  return { commit, targetMigrations, targetCapabilities: parseCapabilities(capabilitiesJson) };
}

export async function runRollbackCheck(target, db = prisma) {
  const state = await readDatabaseState(db);
  return { ...evaluateRollbackTarget({ state, ...target }), state: { ...state, appliedMigrations: state.appliedMigrations.length } };
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (invokedDirectly) {
  const arg = (name) => {
    const index = process.argv.indexOf(name);
    return index > -1 ? process.argv[index + 1] : undefined;
  };
  (async () => {
    const ref = arg("--ref");
    const dir = arg("--target-dir");
    if (!ref === !dir) throw new Error("Pass exactly one of --ref <git-ref> or --target-dir <backend dir>.");
    const target = ref ? describeTargetRef(ref) : describeTargetDir(path.resolve(dir));
    const result = await runRollbackCheck(target);
    console.log(JSON.stringify({ target: ref ? { ref, commit: target.commit } : { dir }, ...result }, null, 2));
    process.exitCode = result.safe ? 0 : 2;
  })()
    .catch((error) => {
      console.error("Rollback check failed (treat the target as unsafe):", error.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
