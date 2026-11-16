import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

function checkDirectory(directory) {
  let count = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) count += checkDirectory(file);
    else if (entry.name.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status ?? 1);
      count += 1;
    }
  }
  return count;
}

console.log(`Syntax checked ${checkDirectory(fileURLToPath(new URL("../www/js/", import.meta.url)))} mobile JavaScript files.`);
