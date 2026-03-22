import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const rawDir = path.join(projectRoot, "data", "raw", "trips", "2025");
const metaPath = path.join(projectRoot, "data", "raw", "trips", "trip-year-2025.json");
const sourceRoot = "https://cycling.data.tfl.gov.uk/usage-stats";

const tripFiles = [
  "411JourneyDataExtract01Jan2025-14Jan2025.csv",
  "412JourneyDataExtract15Jan2025-31Jan2025.csv",
  "413JourneyDataExtract01Feb2025-14Feb2025.csv",
  "414JourneyDataExtract15Feb2025-28Feb2025.csv",
  "415JourneyDataExtract01Mar2025-14Mar2025.csv",
  "416JourneyDataExtract15Mar2025-31Mar2025.csv",
  "417JourneyDataExtract01Apr2025-14Apr2025.csv",
  "418JourneyDataExtract15Apr2025-30Apr2025.csv",
  "419JourneyDataExtract01May2025-14May2025.csv",
  "420JourneyDataExtract14May2025-31May2025.csv",
  "421JourneyDataExtract01Jun2025-15Jun2025.csv",
  "422JourneyDataExtract15Jun2025-30Jun2025.csv",
  "423JourneyDataExtract01Jul2025-15Jul2025.csv",
  "424JourneyDataExtract16Jul2025-31Jul2025.csv",
  "425JourneyDataExtract01Aug2025-15Aug2025.csv",
  "426JourneyDataExtract16Aug2025-31Aug2025.csv",
  "427JourneyDataExtract01Sep2025-15Sep2025.csv",
  "428JourneyDataExtract16Sep2025-30Sep2025.csv",
  "429JourneyDataExtract01Oct2025-15Oct2025.csv",
  "430JourneyDataExtract16Oct2025-31Oct2025.csv",
  "431JourneyDataExtract01Nov2025-15Nov2025.csv",
  "432JourneyDataExtract16Nov2025-30Nov2025.csv",
  "433JourneyDataExtract01Dec2025-15Dec2025.csv",
  "434JourneyDataExtract16Dec2025-31Dec2025.csv"
];

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(fileName) {
  const url = `${sourceRoot}/${fileName}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Trip CSV request failed: ${response.status} ${response.statusText} for ${fileName}`);
  }

  const csvText = await response.text();
  const outputPath = path.join(rawDir, fileName);

  await writeFile(outputPath, csvText, "utf8");

  return {
    fileName,
    bytes: Buffer.byteLength(csvText),
    source: url
  };
}

async function main() {
  await mkdir(rawDir, { recursive: true });

  const downloadedFiles = [];
  const reusedFiles = [];

  for (const fileName of tripFiles) {
    const outputPath = path.join(rawDir, fileName);

    if (await fileExists(outputPath)) {
      reusedFiles.push(fileName);
      continue;
    }

    downloadedFiles.push(await downloadFile(fileName));
    console.log(`Downloaded ${fileName}`);
  }

  const capturedAt = new Date().toISOString();
  const meta = {
    source: sourceRoot,
    year: 2025,
    capturedAt,
    fileCount: tripFiles.length,
    downloadedCount: downloadedFiles.length,
    reusedCount: reusedFiles.length,
    files: tripFiles
  };

  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  console.log(`Prepared ${tripFiles.length} trip extracts for 2025`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
