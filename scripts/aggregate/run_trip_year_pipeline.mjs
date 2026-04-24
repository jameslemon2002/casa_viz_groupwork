import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

function runNodeScript(relativePath, nodeArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...nodeArgs, relativePath], {
      cwd: projectRoot,
      stdio: "inherit",
      env: process.env
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Script failed: ${relativePath}`));
    });

    child.on("error", reject);
  });
}

async function main() {
  await runNodeScript("scripts/fetch/fetch_trip_year_2025.mjs");
  await runNodeScript("scripts/clean/build_trip_annual_aggregates.mjs", ["--max-old-space-size=8192"]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
