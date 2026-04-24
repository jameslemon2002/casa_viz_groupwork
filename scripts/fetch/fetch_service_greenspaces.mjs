import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const publicDataDir = path.join(projectRoot, "public", "data");
const publicOutputPath = path.join(publicDataDir, "service_greenspaces.geojson");

const userAgent = process.env.NOMINATIM_USER_AGENT ?? "viz-group-project/1.0 (Codex local build; contact local user)";
const endpoint = "https://nominatim.openstreetmap.org/search";

const greenspaces = [
  { id: "hyde-park", name: "Hyde Park", query: "Hyde Park, London, United Kingdom" },
  { id: "kensington-gardens", name: "Kensington Gardens", query: "Kensington Gardens, London, United Kingdom" },
  { id: "regents-park", name: "Regent's Park", query: "Regent's Park, London, United Kingdom" },
  { id: "green-park", name: "The Green Park", query: "The Green Park, London, United Kingdom" },
  { id: "st-jamess-park", name: "St James's Park", query: "St James's Park, London, United Kingdom" },
  { id: "battersea-park", name: "Battersea Park", query: "Battersea Park, London, United Kingdom" },
  { id: "victoria-park", name: "Victoria Park", query: "Victoria Park, London, United Kingdom" },
  { id: "queen-elizabeth-olympic-park", name: "Queen Elizabeth Olympic Park", query: "Queen Elizabeth Olympic Park, London, United Kingdom" },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normaliseGeometry(geometry) {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) return null;
  return geometry;
}

async function fetchPolygon(item) {
  const url = new URL(endpoint);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("polygon_geojson", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", item.query);

  const response = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": userAgent,
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim returned ${response.status} ${response.statusText} for ${item.name}`);
  }

  const matches = await response.json();
  const match = matches.find((candidate) => normaliseGeometry(candidate.geojson));
  if (!match) {
    throw new Error(`No polygon geometry returned for ${item.name}`);
  }

  return {
    type: "Feature",
    properties: {
      id: item.id,
      name: item.name,
      displayName: match.display_name,
      osmType: match.osm_type,
      osmId: match.osm_id,
      category: match.category,
      type: match.type,
      source: "OpenStreetMap via Nominatim",
    },
    geometry: normaliseGeometry(match.geojson),
  };
}

async function main() {
  const features = [];
  const skipped = [];
  for (const item of greenspaces) {
    try {
      const feature = await fetchPolygon(item);
      features.push(feature);
      console.log(`Fetched ${item.name}`);
    } catch (error) {
      skipped.push({ name: item.name, reason: error instanceof Error ? error.message : String(error) });
      console.warn(`Skipped ${item.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(1100);
  }

  const featureCollection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "OpenStreetMap via Nominatim search API",
      note: "Real park/greenspace polygons used as a light contextual layer for map storytelling.",
      requestedNames: greenspaces.map((item) => item.name),
      skipped,
    },
    features,
  };

  await mkdir(publicDataDir, { recursive: true });
  await writeFile(publicOutputPath, `${JSON.stringify(featureCollection)}\n`, "utf8");
  console.log(`Wrote ${path.relative(projectRoot, publicOutputPath)} with ${features.length} greenspace polygons`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
