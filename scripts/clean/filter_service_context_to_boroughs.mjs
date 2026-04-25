import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { filterFeaturesToBoroughs } from "../lib/geo_filter_utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const publicDataDir = path.join(projectRoot, "public", "data");
const processedDataDir = path.join(projectRoot, "data", "processed");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const [storyData, boroughs, poiCollection, landuseCollection] = await Promise.all([
    readJson(path.join(publicDataDir, "typical_week_story.json")),
    readJson(path.join(publicDataDir, "london-boroughs.geojson")),
    readJson(path.join(publicDataDir, "service_context_pois.geojson")),
    readJson(path.join(publicDataDir, "service_landuse_context.geojson")),
  ]);

  const serviceBoroughCodes = new Set(
    (storyData.stationMetrics ?? [])
      .map((station) => station.boroughCode)
      .filter(Boolean),
  );

  const pois = filterFeaturesToBoroughs(poiCollection.features ?? [], boroughs.features ?? [], serviceBoroughCodes);
  const landuse = filterFeaturesToBoroughs(landuseCollection.features ?? [], boroughs.features ?? [], serviceBoroughCodes);
  const filterMetadata = {
    serviceBoroughCodes: [...serviceBoroughCodes].sort(),
    filterBasis: "Representative point inside a borough containing Santander Cycles docking stations.",
    filteredAt: new Date().toISOString(),
  };

  const nextPoiCollection = {
    ...poiCollection,
    metadata: {
      ...(poiCollection.metadata ?? {}),
      ...filterMetadata,
      preFilterPoiCount: poiCollection.features?.length ?? 0,
      poiCount: pois.length,
    },
    features: pois,
  };
  const nextLanduseCollection = {
    ...landuseCollection,
    metadata: {
      ...(landuseCollection.metadata ?? {}),
      ...filterMetadata,
      preFilterLanduseCount: landuseCollection.features?.length ?? 0,
      landuseCount: landuse.length,
    },
    features: landuse,
  };

  await Promise.all([
    writeFile(path.join(publicDataDir, "service_context_pois.geojson"), `${JSON.stringify(nextPoiCollection)}\n`, "utf8"),
    writeFile(path.join(processedDataDir, "service_context_pois.geojson"), `${JSON.stringify(nextPoiCollection)}\n`, "utf8"),
    writeFile(path.join(publicDataDir, "service_landuse_context.geojson"), `${JSON.stringify(nextLanduseCollection)}\n`, "utf8"),
    writeFile(path.join(processedDataDir, "service_landuse_context.geojson"), `${JSON.stringify(nextLanduseCollection)}\n`, "utf8"),
  ]);

  console.log(`Filtered POI context: ${poiCollection.features?.length ?? 0} -> ${pois.length}`);
  console.log(`Filtered land-use context: ${landuseCollection.features?.length ?? 0} -> ${landuse.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
