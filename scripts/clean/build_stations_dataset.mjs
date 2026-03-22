import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const rawPath = path.join(projectRoot, "data", "raw", "bikepoint", "bikepoint-latest.json");
const processedDir = path.join(projectRoot, "data", "processed");
const publicDataDir = path.join(projectRoot, "public", "data");

function toPropertyMap(additionalProperties) {
  const propertyMap = {};

  if (!Array.isArray(additionalProperties)) {
    return propertyMap;
  }

  for (const item of additionalProperties) {
    if (!item || typeof item.key !== "string") {
      continue;
    }

    propertyMap[item.key] = item.value;
  }

  return propertyMap;
}

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeStations(records) {
  const coordinates = records
    .map((item) => ({ lon: item.lon, lat: item.lat }))
    .filter((item) => Number.isFinite(item.lon) && Number.isFinite(item.lat));

  const minLon = Math.min(...coordinates.map((item) => item.lon));
  const maxLon = Math.max(...coordinates.map((item) => item.lon));
  const minLat = Math.min(...coordinates.map((item) => item.lat));
  const maxLat = Math.max(...coordinates.map((item) => item.lat));
  const lonSpan = maxLon - minLon || 1;
  const latSpan = maxLat - minLat || 1;

  return records.map((station) => {
    const propertyMap = toPropertyMap(station.additionalProperties);
    const nbBikes = toNumber(propertyMap.NbBikes);
    const nbEmptyDocks = toNumber(propertyMap.NbEmptyDocks);
    const nbDocks = toNumber(propertyMap.NbDocks);
    const capacity =
      nbDocks ?? ((nbBikes ?? 0) + (nbEmptyDocks ?? 0) > 0 ? (nbBikes ?? 0) + (nbEmptyDocks ?? 0) : null);
    const occupancy = capacity && nbBikes !== null ? clamp(nbBikes / capacity, 0, 1) : null;
    const x = 8 + ((station.lon - minLon) / lonSpan) * 84;
    const y = 10 + (1 - (station.lat - minLat) / latSpan) * 80;

    return {
      id: station.id,
      name: station.commonName,
      placeType: station.placeType ?? null,
      lat: station.lat,
      lon: station.lon,
      terminalName: propertyMap.TerminalName ?? null,
      installDate: propertyMap.InstallDate ?? null,
      locked: propertyMap.Locked ?? null,
      nbBikes,
      nbEmptyDocks,
      nbDocks,
      capacity,
      occupancy,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2))
    };
  });
}

function buildGeoJson(stations) {
  return {
    type: "FeatureCollection",
    features: stations.map((station) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [station.lon, station.lat]
      },
      properties: {
        id: station.id,
        name: station.name,
        terminalName: station.terminalName,
        installDate: station.installDate,
        locked: station.locked,
        nbBikes: station.nbBikes,
        nbEmptyDocks: station.nbEmptyDocks,
        nbDocks: station.nbDocks,
        capacity: station.capacity,
        occupancy: station.occupancy
      }
    }))
  };
}

function buildSummary(stations, capturedAt) {
  const capacities = stations.map((station) => station.capacity).filter((value) => value !== null);
  const occupancies = stations.map((station) => station.occupancy).filter((value) => value !== null);

  const totalCapacity = capacities.reduce((sum, value) => sum + value, 0);
  const totalBikes = stations.reduce((sum, station) => sum + (station.nbBikes ?? 0), 0);
  const averageOccupancy =
    occupancies.length > 0
      ? occupancies.reduce((sum, value) => sum + value, 0) / occupancies.length
      : null;

  return {
    capturedAt,
    stationCount: stations.length,
    totalCapacity,
    totalBikes,
    averageOccupancy
  };
}

async function main() {
  const rawText = await readFile(rawPath, "utf8");
  const rawPayload = JSON.parse(rawText);
  const records = Array.isArray(rawPayload.data) ? rawPayload.data : [];
  const stations = normalizeStations(records);
  const geoJson = buildGeoJson(stations);
  const summary = buildSummary(stations, rawPayload.capturedAt ?? null);

  await mkdir(processedDir, { recursive: true });
  await mkdir(publicDataDir, { recursive: true });

  await writeFile(
    path.join(processedDir, "stations.geojson"),
    `${JSON.stringify(geoJson, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(processedDir, "stations.json"),
    `${JSON.stringify({ summary, stations }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(publicDataDir, "stations.geojson"),
    `${JSON.stringify(geoJson, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(publicDataDir, "stations.json"),
    `${JSON.stringify({ summary, stations }, null, 2)}\n`,
    "utf8"
  );

  console.log(`Built processed station dataset for ${stations.length} stations`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
