import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const rawDir = path.join(projectRoot, "data", "raw", "bikepoint");
const endpoint = "https://api.tfl.gov.uk/BikePoint";

function timestampForFile(date = new Date()) {
  return date.toISOString().replaceAll(":", "-");
}

async function main() {
  await mkdir(rawDir, { recursive: true });

  const response = await fetch(endpoint, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`BikePoint request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const capturedAt = new Date().toISOString();
  const output = {
    source: endpoint,
    capturedAt,
    count: Array.isArray(payload) ? payload.length : 0,
    data: payload
  };

  const timestamp = timestampForFile(new Date(capturedAt));
  const snapshotPath = path.join(rawDir, `bikepoint-${timestamp}.json`);
  const latestPath = path.join(rawDir, "bikepoint-latest.json");

  const formatted = `${JSON.stringify(output, null, 2)}\n`;
  await writeFile(snapshotPath, formatted, "utf8");
  await writeFile(latestPath, formatted, "utf8");

  console.log(`Saved ${output.count} BikePoint records`);
  console.log(snapshotPath);
  console.log(latestPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
