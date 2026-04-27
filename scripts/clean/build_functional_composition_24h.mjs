import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const publicDataDir = join(rootDir, "public", "data");

const functionCategories = [
  { id: "transit-work", label: "Transit / work", shortLabel: "Work", color: "#6aa7d8" },
  { id: "park-leisure", label: "Park / leisure", shortLabel: "Park", color: "#72b98d" },
  { id: "culture-retail", label: "Culture / retail", shortLabel: "Visit", color: "#d89c68" },
  { id: "night-social", label: "Night / social", shortLabel: "Night", color: "#d7659b" },
  { id: "civic-health", label: "Civic / health", shortLabel: "Civic", color: "#75beb5" },
];

const functionIds = functionCategories.map((category) => category.id);
const profileIds = ["weekdays", "weekends"];
const londonMeanLat = 51.5072;
const earthRadiusM = 6371008.8;
const gridCellM = 260;
const poiRadiusM = 220;
const landuseRadiusM = 240;

const poiToFunction = {
  transit: "transit-work",
  "office-work": "transit-work",
  "food-night": "night-social",
  retail: "culture-retail",
  "culture-tourism": "culture-retail",
  education: "civic-health",
  health: "civic-health",
  civic: "civic-health",
  "sport-leisure": "park-leisure",
};

const landuseToFunction = {
  commercial: "transit-work",
  industrial: "transit-work",
  retail: "culture-retail",
  "education-civic": "civic-health",
  "leisure-park": "park-leisure",
};

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toLocalXY(lon, lat) {
  return [
    earthRadiusM * toRadians(lon) * Math.cos(toRadians(londonMeanLat)),
    earthRadiusM * toRadians(lat),
  ];
}

function gridKey(x, y) {
  return `${Math.floor(x / gridCellM)},${Math.floor(y / gridCellM)}`;
}

function addToGrid(grid, item) {
  const key = gridKey(item.x, item.y);
  const current = grid.get(key) ?? [];
  current.push(item);
  grid.set(key, current);
}

function nearbyGridItems(grid, x, y, radiusM) {
  const [cellX, cellY] = gridKey(x, y).split(",").map(Number);
  const cellRadius = Math.ceil(radiusM / gridCellM);
  const items = [];

  for (let dx = -cellRadius; dx <= cellRadius; dx += 1) {
    for (let dy = -cellRadius; dy <= cellRadius; dy += 1) {
      const bucket = grid.get(`${cellX + dx},${cellY + dy}`) ?? [];
      for (const item of bucket) {
        const distance = Math.hypot(item.x - x, item.y - y);
        if (distance <= radiusM) items.push({ item, distance });
      }
    }
  }

  return items;
}

function collectCoordinatePairs(value, output = []) {
  if (!Array.isArray(value)) return output;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    output.push([value[0], value[1]]);
    return output;
  }
  for (const item of value) collectCoordinatePairs(item, output);
  return output;
}

function featureCentroid(feature) {
  const points = collectCoordinatePairs(feature?.geometry?.coordinates);
  if (points.length === 0) return null;
  const total = points.reduce((acc, point) => ({ lon: acc.lon + point[0], lat: acc.lat + point[1] }), { lon: 0, lat: 0 });
  return { lon: total.lon / points.length, lat: total.lat / points.length };
}

function sampleCoordinates(coordinates, maxSamples = 5) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return [];
  if (coordinates.length <= maxSamples) return coordinates;
  return Array.from({ length: maxSamples }, (_, index) => {
    const coordIndex = Math.round((index / (maxSamples - 1)) * (coordinates.length - 1));
    return coordinates[coordIndex];
  });
}

function emptyScores() {
  return Object.fromEntries(functionIds.map((id) => [id, 0]));
}

function normaliseScores(scores, fallbackShares) {
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return { ...fallbackShares };
  return Object.fromEntries(functionIds.map((id) => [id, scores[id] / total]));
}

function roundedShares(scores) {
  const rounded = Object.fromEntries(functionIds.map((id) => [id, Number(scores[id].toFixed(4))]));
  const sum = Object.values(rounded).reduce((acc, value) => acc + value, 0);
  const delta = Number((1 - sum).toFixed(4));
  if (Math.abs(delta) > 0) {
    const dominant = functionIds.reduce((best, id) => (rounded[id] > rounded[best] ? id : best), functionIds[0]);
    rounded[dominant] = Number(Math.max(0, rounded[dominant] + delta).toFixed(4));
  }
  return rounded;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function buildContextIndex(poiCollection, landuseCollection) {
  const poiGrid = new Map();
  const landuseGrid = new Map();
  const globalCounts = emptyScores();

  for (const feature of poiCollection.features ?? []) {
    const functionId = poiToFunction[feature?.properties?.category];
    const coordinates = feature?.geometry?.coordinates;
    if (!functionId || !Array.isArray(coordinates)) continue;
    const [x, y] = toLocalXY(coordinates[0], coordinates[1]);
    addToGrid(poiGrid, { x, y, functionId, weight: 1 });
    globalCounts[functionId] += 1;
  }

  for (const feature of landuseCollection.features ?? []) {
    const functionId = landuseToFunction[feature?.properties?.category];
    const centroid = featureCentroid(feature);
    if (!functionId || !centroid) continue;
    const [x, y] = toLocalXY(centroid.lon, centroid.lat);
    const areaSqM = Number(feature.properties?.areaSqM ?? feature.properties?.area ?? 0);
    const areaWeight = Number.isFinite(areaSqM) && areaSqM > 0 ? Math.min(0.65, Math.max(0.3, Math.sqrt(areaSqM) / 640)) : 0.35;
    addToGrid(landuseGrid, { x, y, functionId, weight: areaWeight });
    globalCounts[functionId] += areaWeight;
  }

  return {
    poiGrid,
    landuseGrid,
    fallbackShares: normaliseScores(globalCounts, Object.fromEntries(functionIds.map((id) => [id, 1 / functionIds.length]))),
  };
}

function scoreRoute(route, contextIndex) {
  const scores = emptyScores();
  const coordinates = sampleCoordinates(route.coordinates);

  for (const coordinate of coordinates) {
    const [x, y] = toLocalXY(coordinate[0], coordinate[1]);

    for (const { item, distance } of nearbyGridItems(contextIndex.poiGrid, x, y, poiRadiusM)) {
      scores[item.functionId] += item.weight * 1.2 * Math.max(0.05, 1 - distance / poiRadiusM);
    }

    for (const { item, distance } of nearbyGridItems(contextIndex.landuseGrid, x, y, landuseRadiusM)) {
      scores[item.functionId] += item.weight * Math.max(0.04, 1 - distance / landuseRadiusM);
    }
  }

  return normaliseScores(scores, contextIndex.fallbackShares);
}

async function buildProfileHour(profileId, hour, contextIndex) {
  const hourKey = String(hour).padStart(2, "0");
  const slice = await readJson(join(publicDataDir, "od_route_lens", `${profileId}_${hourKey}.json`));
  const totals = emptyScores();
  let totalAverageDailyTrips = 0;
  let classifiedRouteCount = 0;

  for (const route of slice.routes ?? []) {
    const weight = Math.max(0, Number(route.averageDailyTrips ?? 0));
    if (weight <= 0) continue;
    const routeShares = scoreRoute(route, contextIndex);
    totalAverageDailyTrips += weight;
    classifiedRouteCount += 1;
    for (const id of functionIds) totals[id] += weight * routeShares[id];
  }

  return {
    profileId,
    hour,
    routeCount: slice.routes?.length ?? 0,
    classifiedRouteCount,
    totalAverageDailyTrips: Number(totalAverageDailyTrips.toFixed(2)),
    shares: roundedShares(normaliseScores(totals, contextIndex.fallbackShares)),
  };
}

async function main() {
  const [poiCollection, landuseCollection] = await Promise.all([
    readJson(join(publicDataDir, "service_context_pois.geojson")),
    readJson(join(publicDataDir, "service_landuse_context.geojson")),
  ]);

  const contextIndex = buildContextIndex(poiCollection, landuseCollection);
  const profiles = {};

  for (const profileId of profileIds) {
    profiles[profileId] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      profiles[profileId].push(await buildProfileHour(profileId, hour, contextIndex));
    }
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    basis:
      "Contextual exposure of OD route-lens corridors. Route average daily trips weight nearby OSM POI and land-use categories; shares indicate surrounding functional context, not declared trip purpose.",
    radiusMetres: { poi: poiRadiusM, landuse: landuseRadiusM },
    functions: functionCategories,
    profiles,
  };

  const outputPath = join(publicDataDir, "functional_composition_24h.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
