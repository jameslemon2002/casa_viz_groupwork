import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const stationsPath = path.join(projectRoot, "public", "data", "stations.json");
const processedDir = path.join(projectRoot, "data", "processed");
const publicDataDir = path.join(projectRoot, "public", "data");
const processedOutputPath = path.join(processedDir, "service_street_network.geojson");
const publicOutputPath = path.join(publicDataDir, "service_street_network.geojson");

const overpassEndpoints = [
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const bufferLon = Number(process.env.STREET_NETWORK_BUFFER_LON ?? 0.02);
const bufferLat = Number(process.env.STREET_NETWORK_BUFFER_LAT ?? 0.015);
const timeoutSeconds = Number(process.env.STREET_NETWORK_TIMEOUT_SEC ?? 240);
const userAgent = process.env.OVERPASS_USER_AGENT ?? "viz-group-project/1.0 (Codex local build; contact local user)";

const excludedHighways = new Set([
  "motorway",
  "motorway_link",
  "bus_guideway",
  "raceway",
  "construction",
  "proposed",
  "steps",
  "corridor",
  "elevator",
  "platform",
  "rest_area",
  "services",
]);

const conditionalHighways = new Set([
  "footway",
  "pedestrian",
  "path",
  "track",
  "bridleway",
]);

const permissiveAccessValues = new Set([
  "yes",
  "designated",
  "official",
  "permissive",
  "destination",
]);

function clampCoord(value) {
  return Number(value.toFixed(6));
}

function normaliseBBox(stations) {
  const lons = stations.map((station) => station.lon);
  const lats = stations.map((station) => station.lat);
  return {
    west: clampCoord(Math.min(...lons) - bufferLon),
    south: clampCoord(Math.min(...lats) - bufferLat),
    east: clampCoord(Math.max(...lons) + bufferLon),
    north: clampCoord(Math.max(...lats) + bufferLat),
  };
}

function hasBikeAccess(tags) {
  if (!tags) return false;
  const bicycle = tags.bicycle?.toLowerCase();
  const bicycleRoad = tags.bicycle_road?.toLowerCase();
  if (permissiveAccessValues.has(bicycle) || permissiveAccessValues.has(bicycleRoad)) return true;
  if ((tags.cycleway ?? "").length > 0) return true;
  if ((tags["cycleway:left"] ?? "").length > 0) return true;
  if ((tags["cycleway:right"] ?? "").length > 0) return true;
  if ((tags["cycleway:both"] ?? "").length > 0) return true;
  if ((tags["cycleway:lane"] ?? "").length > 0) return true;
  return false;
}

function isRideableWay(tags) {
  const highway = tags?.highway?.toLowerCase();
  if (!highway || excludedHighways.has(highway)) return false;
  if (tags.area === "yes") return false;

  const access = tags.access?.toLowerCase();
  if (access === "private" || access === "no") {
    return hasBikeAccess(tags);
  }

  if (tags.motorroad === "yes") return false;
  if (conditionalHighways.has(highway)) return hasBikeAccess(tags) || highway === "bridleway";

  return true;
}

function classifyRoad(tags) {
  const highway = tags.highway?.toLowerCase() ?? "unknown";
  if (highway === "cycleway" || hasBikeAccess(tags)) return "bike-priority";
  if (["residential", "living_street", "service", "unclassified"].includes(highway)) return "local";
  if (["tertiary", "tertiary_link"].includes(highway)) return "connector";
  if (["secondary", "secondary_link", "primary", "primary_link", "trunk", "trunk_link"].includes(highway)) return "arterial";
  if (conditionalHighways.has(highway)) return "shared-path";
  return "general";
}

function toFeature(way) {
  const tags = way.tags ?? {};
  const coordinates = (way.geometry ?? [])
    .filter((point) => Number.isFinite(point?.lon) && Number.isFinite(point?.lat))
    .map((point) => [clampCoord(point.lon), clampCoord(point.lat)]);

  if (coordinates.length < 2) return null;

  return {
    type: "Feature",
    properties: {
      osmId: `way/${way.id}`,
      highway: tags.highway ?? null,
      name: tags.name ?? null,
      oneway: tags.oneway ?? null,
      bicycle: tags.bicycle ?? null,
      access: tags.access ?? null,
      surface: tags.surface ?? null,
      routingClass: classifyRoad(tags),
      source: "osm-overpass",
    },
    geometry: {
      type: "LineString",
      coordinates,
    },
  };
}

async function fetchOverpass(query) {
  const body = new URLSearchParams({ data: query }).toString();
  let lastError = null;

  for (const endpoint of overpassEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "user-agent": userAgent,
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`${endpoint} returned ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to fetch service street network from Overpass");
}

async function main() {
  const stationsPayload = JSON.parse(await readFile(stationsPath, "utf8"));
  const stations = stationsPayload.stations ?? [];
  if (!Array.isArray(stations) || stations.length === 0) {
    throw new Error("No stations found in public/data/stations.json");
  }

  const bbox = normaliseBBox(stations);
  const query = `[out:json][timeout:${timeoutSeconds}];(way["highway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east}););out geom tags;`;
  const raw = await fetchOverpass(query);

  const rawWays = (raw.elements ?? []).filter((element) => element.type === "way");
  const retainedFeatures = rawWays
    .filter((way) => isRideableWay(way.tags ?? {}))
    .map(toFeature)
    .filter(Boolean);

  const featureCollection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "OpenStreetMap via Overpass API",
      bbox,
      stationCount: stations.length,
      rawWayCount: rawWays.length,
      retainedWayCount: retainedFeatures.length,
      overpassEndpoints,
      timeoutSeconds,
      filters: {
        excludedHighways: [...excludedHighways],
        conditionalHighways: [...conditionalHighways],
        conditionalBikeAccess: [...permissiveAccessValues],
      },
    },
    features: retainedFeatures,
  };

  await mkdir(processedDir, { recursive: true });
  await mkdir(publicDataDir, { recursive: true });
  await Promise.all([
    writeFile(processedOutputPath, `${JSON.stringify(featureCollection)}\n`, "utf8"),
    writeFile(publicOutputPath, `${JSON.stringify(featureCollection)}\n`, "utf8"),
  ]);

  console.log(`Fetched ${retainedFeatures.length} rideable OSM highway ways within bbox ${bbox.west},${bbox.south},${bbox.east},${bbox.north}`);
  console.log(`Wrote ${path.relative(projectRoot, publicOutputPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
