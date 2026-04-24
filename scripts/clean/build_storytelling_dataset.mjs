import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

const annualDatasetPath = path.join(projectRoot, "public", "data", "trip_aggregates_annual.json");
const stationsPath = path.join(projectRoot, "data", "processed", "stations.json");
const boroughsPath = path.join(projectRoot, "public", "data", "london-boroughs.geojson");
const cycleRoutesPath = path.join(projectRoot, "data", "raw", "infrastructure", "CycleRoutes.json");
const cycleLaneTrackPath = path.join(projectRoot, "data", "raw", "infrastructure", "cycle_lane_track.json");
const trafficCalmingPath = path.join(projectRoot, "data", "raw", "infrastructure", "traffic_calming.json");
const restrictedRoutePath = path.join(projectRoot, "data", "raw", "infrastructure", "restricted_route.json");
const tripYearDir = path.join(projectRoot, "data", "raw", "trips", "2025");
const processedDir = path.join(projectRoot, "data", "processed");
const publicDataDir = path.join(projectRoot, "public", "data");

const EARTH_RADIUS_M = 6371008.8;
const LONDON_MEAN_LAT = 51.5072;
const CELL_SIZE = 0.01;
const STATION_RADIUS_M = 500;
const NEARBY_LON_PAD = 0.012;
const NEARBY_LAT_PAD = 0.008;
const MAX_DURATION_MS = 4 * 60 * 60 * 1000;

const dayparts = [
  { id: "am", label: "AM Peak", hours: [7, 8, 9, 10] },
  { id: "midday", label: "Midday", hours: [11, 12, 13, 14, 15] },
  { id: "pm", label: "PM Peak", hours: [16, 17, 18, 19] },
  { id: "night", label: "Night", hours: [20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6] }
];

const sceneDefaults = [
  {
    id: "hero",
    title: "How London Borrows Its Bikes",
    profileId: "weekdays",
    timeMode: "hour",
    hour: 8,
    viewMode: "flows",
    stationMetric: "annualTrips",
    cameraPreset: "hero"
  },
  {
    id: "network",
    title: "Where is the network?",
    profileId: "all",
    timeMode: "daypart",
    daypart: "midday",
    viewMode: "stations",
    stationMetric: "capacity",
    cameraPreset: "network"
  },
  {
    id: "rhythm",
    title: "When does London move?",
    profileId: "weekdays",
    timeMode: "hour",
    hour: 8,
    viewMode: "hotspots",
    stationMetric: "annualTrips",
    cameraPreset: "rhythm"
  },
  {
    id: "commute",
    title: "Morning compresses the city",
    profileId: "weekdays",
    timeMode: "hour",
    hour: 8,
    viewMode: "flows",
    stationMetric: "weekdayAMTrips",
    cameraPreset: "commute"
  },
  {
    id: "weekend",
    title: "Weekends rewrite the map",
    profileId: "weekends",
    timeMode: "hour",
    hour: 14,
    viewMode: "flows",
    stationMetric: "weekendMiddayTrips",
    cameraPreset: "weekend"
  },
  {
    id: "infrastructure",
    title: "Why here, why not there?",
    profileId: "weekdays",
    timeMode: "hour",
    hour: 8,
    viewMode: "infrastructure",
    stationMetric: "deficitClass",
    cameraPreset: "infrastructure"
  },
  {
    id: "conclusion",
    title: "Rhythm, infrastructure, and unequal access",
    profileId: "all",
    timeMode: "daypart",
    daypart: "midday",
    viewMode: "infrastructure",
    stationMetric: "lowStressScore",
    cameraPreset: "conclusion"
  }
];

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toLocalXY(lon, lat) {
  return {
    x: EARTH_RADIUS_M * toRadians(lon) * Math.cos(toRadians(LONDON_MEAN_LAT)),
    y: EARTH_RADIUS_M * toRadians(lat)
  };
}

function distanceMeters(lonA, latA, lonB, latB) {
  const pointA = toLocalXY(lonA, latA);
  const pointB = toLocalXY(lonB, latB);
  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;

  return Math.sqrt(dx * dx + dy * dy);
}

function pointToSegmentDistanceMeters(pointLon, pointLat, startLon, startLat, endLon, endLat) {
  const point = toLocalXY(pointLon, pointLat);
  const start = toLocalXY(startLon, startLat);
  const end = toLocalXY(endLon, endLat);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.sqrt((point.x - start.x) ** 2 + (point.y - start.y) ** 2);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projectionX = start.x + t * dx;
  const projectionY = start.y + t * dy;
  const deltaX = point.x - projectionX;
  const deltaY = point.y - projectionY;

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

function segmentLengthMeters(startLon, startLat, endLon, endLat) {
  return distanceMeters(startLon, startLat, endLon, endLat);
}

function getGridKey(lon, lat) {
  return `${Math.floor(lon / CELL_SIZE)}:${Math.floor(lat / CELL_SIZE)}`;
}

function getGridKeysForBounds(minLon, maxLon, minLat, maxLat) {
  const keys = [];
  const startX = Math.floor(minLon / CELL_SIZE);
  const endX = Math.floor(maxLon / CELL_SIZE);
  const startY = Math.floor(minLat / CELL_SIZE);
  const endY = Math.floor(maxLat / CELL_SIZE);

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      keys.push(`${x}:${y}`);
    }
  }

  return keys;
}

function toBooleanFlag(value) {
  return String(value).toUpperCase() === "TRUE";
}

function flattenLineCoordinates(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return [];
  }

  if (geometry.type === "LineString") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates;
  }

  return [];
}

function flattenPointCoordinates(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return [];
  }

  if (geometry.type === "Point") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiPoint") {
    return geometry.coordinates;
  }

  return [];
}

function bboxOfCoordinates(coordinates) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const [lon, lat] of coordinates) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      continue;
    }

    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  return { minLon, maxLon, minLat, maxLat };
}

function intersectsBounds(a, b) {
  return !(a.maxLon < b.minLon || a.minLon > b.maxLon || a.maxLat < b.minLat || a.minLat > b.maxLat);
}

function pointInRing(point, ring) {
  let inside = false;
  const [pointLon, pointLat] = point;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [lonI, latI] = ring[i];
    const [lonJ, latJ] = ring[j];
    const intersects =
      latI > pointLat !== latJ > pointLat &&
      pointLon < ((lonJ - lonI) * (pointLat - latI)) / ((latJ - latI) || 1e-12) + lonI;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygonFeature(point, feature) {
  const geometry = feature?.geometry;

  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return false;
  }

  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];

  for (const polygon of polygons) {
    const [outerRing, ...holes] = polygon;

    if (!outerRing || !pointInRing(point, outerRing)) {
      continue;
    }

    if (holes.some((ring) => pointInRing(point, ring))) {
      continue;
    }

    return true;
  }

  return false;
}

function quantile(sortedValues, percentile) {
  if (sortedValues.length === 0) {
    return 0;
  }

  const position = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) {
    return sortedValues[lower];
  }

  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function createStationIndex(stations) {
  const byTerminal = new Map();
  const grid = new Map();

  for (const station of stations) {
    if (!station.terminalName) {
      continue;
    }

    byTerminal.set(String(station.terminalName).trim(), station);
    const key = getGridKey(station.lon, station.lat);

    if (!grid.has(key)) {
      grid.set(key, []);
    }

    grid.get(key).push(station);
  }

  return { byTerminal, grid };
}

function getNearbyStations(grid, bounds) {
  const keys = getGridKeysForBounds(bounds.minLon, bounds.maxLon, bounds.minLat, bounds.maxLat);
  const stations = new Map();

  for (const key of keys) {
    for (const station of grid.get(key) ?? []) {
      stations.set(station.terminalName, station);
    }
  }

  return [...stations.values()];
}

function getLaneCategory(properties) {
  if (
    toBooleanFlag(properties.CLT_SEGREG) ||
    toBooleanFlag(properties.CLT_STEPP) ||
    toBooleanFlag(properties.CLT_PARSEG) ||
    toBooleanFlag(properties.CLT_CBYPAS) ||
    toBooleanFlag(properties.CLT_BBYPAS)
  ) {
    return { category: "protected", supportScore: 3 };
  }

  if (toBooleanFlag(properties.CLT_MANDAT) || toBooleanFlag(properties.CLT_ADVIS) || toBooleanFlag(properties.CLT_PRIORI)) {
    return { category: "painted", supportScore: 2 };
  }

  if (toBooleanFlag(properties.CLT_SHARED)) {
    return { category: "mixed", supportScore: 1 };
  }

  return { category: "mixed", supportScore: 1 };
}

function getRouteCategory(properties) {
  const programme = String(properties.Programme ?? "");

  if (/quiet/i.test(programme)) {
    return { category: "quiet", supportScore: 3 };
  }

  if (/cycleways?/i.test(programme)) {
    return { category: "mixed", supportScore: 2 };
  }

  return { category: "unknown", supportScore: 1 };
}

function buildDaypartMap() {
  const map = new Map();

  for (const daypart of dayparts) {
    for (const hour of daypart.hours) {
      map.set(hour, daypart.id);
    }
  }

  return map;
}

function hourPeak(profile) {
  const sorted = [...profile.hourSlices].sort((left, right) => right.tripCount - left.tripCount);
  return sorted[0] ?? null;
}

function topItems(records, accessor, count = 5) {
  return [...records].sort((left, right) => accessor(right) - accessor(left)).slice(0, count);
}

function normalizeTerminalName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toUtcDate(value) {
  return new Date(`${String(value).replace(" ", "T")}:00Z`);
}

async function resolveTripFiles() {
  const entries = await readdir(tripYearDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".csv"))
    .map((entry) => path.join(tripYearDir, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}

function classifyDeficit(annualTrips, supportScore, demandThreshold, lowSupportThreshold, highSupportThreshold) {
  const isHighDemand = annualTrips >= demandThreshold;
  const isLowSupport = supportScore <= lowSupportThreshold;
  const isHighSupport = supportScore >= highSupportThreshold;

  if (isHighDemand && isLowSupport) {
    return "demand-infrastructure-mismatch";
  }

  if (isHighDemand && isHighSupport) {
    return "high-flow-high-support";
  }

  if (!isHighDemand && isHighSupport) {
    return "low-flow-high-support";
  }

  return "low-flow-low-support";
}

async function main() {
  const annualDataset = JSON.parse(await readFile(annualDatasetPath, "utf8"));
  const stationsPayload = JSON.parse(await readFile(stationsPath, "utf8"));
  const boroughsGeoJson = JSON.parse(await readFile(boroughsPath, "utf8"));
  const cycleRoutes = JSON.parse(await readFile(cycleRoutesPath, "utf8"));
  const cycleLaneTrack = JSON.parse(await readFile(cycleLaneTrackPath, "utf8"));
  const trafficCalming = JSON.parse(await readFile(trafficCalmingPath, "utf8"));
  const restrictedRoutes = JSON.parse(await readFile(restrictedRoutePath, "utf8"));
  const tripFiles = await resolveTripFiles();

  const stations = stationsPayload.stations ?? [];
  const { byTerminal, grid: stationGrid } = createStationIndex(stations);
  const networkBounds = stations.reduce(
    (accumulator, station) => ({
      minLon: Math.min(accumulator.minLon, station.lon),
      maxLon: Math.max(accumulator.maxLon, station.lon),
      minLat: Math.min(accumulator.minLat, station.lat),
      maxLat: Math.max(accumulator.maxLat, station.lat)
    }),
    { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity }
  );

  const contextBounds = {
    minLon: networkBounds.minLon - 0.18,
    maxLon: networkBounds.maxLon + 0.18,
    minLat: networkBounds.minLat - 0.12,
    maxLat: networkBounds.maxLat + 0.12
  };

  const stationMetricsMap = new Map(
    stations.map((station) => [
      String(station.terminalName),
      {
        terminalName: String(station.terminalName),
        stationId: station.id,
        name: station.name,
        lat: station.lat,
        lon: station.lon,
        capacity: station.capacity ?? 0,
        boroughCode: null,
        boroughName: null,
        annualTrips: 0,
        weekdayAMTrips: 0,
        weekendMiddayTrips: 0,
        departures: 0,
        arrivals: 0,
        nearestProtectedLaneM: null,
        protectedLaneLength500m: 0,
        cycleLaneLength500m: 0,
        protectedShare500m: 0,
        lowStressScore: 0,
        trafficCalmingCount500m: 0,
        deficitClass: "low-flow-low-support"
      }
    ])
  );

  for (const station of stations) {
    const match = boroughsGeoJson.features.find((feature) => pointInPolygonFeature([station.lon, station.lat], feature));

    if (!match) {
      continue;
    }

    const metric = stationMetricsMap.get(String(station.terminalName));
    metric.boroughCode = match.properties?.gss_code ?? null;
    metric.boroughName = match.properties?.name ?? null;
  }

  const boroughMetricsMap = new Map(
    boroughsGeoJson.features.map((feature) => [
      feature.properties?.gss_code,
      {
        boroughCode: feature.properties?.gss_code ?? null,
        boroughName: feature.properties?.name ?? "Unknown borough",
        stationCount: 0,
        annualTrips: 0,
        tripIntensity: 0,
        protectedLaneKm: 0,
        cycleLaneKm: 0,
        quietRouteKm: 0,
        lowStressDensity: 0,
        trafficCalmingCount: 0,
        deficitIndex: 0,
        mismatchStationCount: 0,
        hectares: Number(feature.properties?.hectares ?? 0)
      }
    ])
  );

  for (const metric of stationMetricsMap.values()) {
    if (!metric.boroughCode || !boroughMetricsMap.has(metric.boroughCode)) {
      continue;
    }

    boroughMetricsMap.get(metric.boroughCode).stationCount += 1;
  }

  const infrastructureFeatures = [];

  for (const feature of cycleLaneTrack.features ?? []) {
    const { category, supportScore } = getLaneCategory(feature.properties ?? {});
    const lineStrings = flattenLineCoordinates(feature.geometry);

    for (const coordinates of lineStrings) {
      const bounds = bboxOfCoordinates(coordinates);

      if (!intersectsBounds(bounds, contextBounds)) {
        continue;
      }

      infrastructureFeatures.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates
        },
        properties: {
          source: "cycle_lane_track",
          category,
          supportScore,
          boroughName: feature.properties?.BOROUGH ?? null
        }
      });
    }
  }

  for (const feature of restrictedRoutes.features ?? []) {
    const lineStrings = flattenLineCoordinates(feature.geometry);

    for (const coordinates of lineStrings) {
      const bounds = bboxOfCoordinates(coordinates);

      if (!intersectsBounds(bounds, contextBounds)) {
        continue;
      }

      infrastructureFeatures.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates
        },
        properties: {
          source: "restricted_route",
          category: "quiet",
          supportScore: 3,
          boroughName: feature.properties?.BOROUGH ?? null
        }
      });
    }
  }

  for (const feature of cycleRoutes.features ?? []) {
    const { category, supportScore } = getRouteCategory(feature.properties ?? {});
    const lineStrings = flattenLineCoordinates(feature.geometry);

    for (const coordinates of lineStrings) {
      const bounds = bboxOfCoordinates(coordinates);

      if (!intersectsBounds(bounds, contextBounds)) {
        continue;
      }

      infrastructureFeatures.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates
        },
        properties: {
          source: "cycle_routes",
          category,
          supportScore,
          boroughName: null,
          routeName: feature.properties?.Route_Name ?? null,
          programme: feature.properties?.Programme ?? null
        }
      });
    }
  }

  const cycleInfrastructureGeoJson = {
    type: "FeatureCollection",
    features: infrastructureFeatures
  };

  for (const feature of infrastructureFeatures) {
    const coordinates = feature.geometry.coordinates;

    for (let index = 1; index < coordinates.length; index += 1) {
      const start = coordinates[index - 1];
      const end = coordinates[index];
      const segmentBounds = {
        minLon: Math.min(start[0], end[0]) - NEARBY_LON_PAD,
        maxLon: Math.max(start[0], end[0]) + NEARBY_LON_PAD,
        minLat: Math.min(start[1], end[1]) - NEARBY_LAT_PAD,
        maxLat: Math.max(start[1], end[1]) + NEARBY_LAT_PAD
      };
      const nearbyStations = getNearbyStations(stationGrid, segmentBounds);
      const segmentMidLon = (start[0] + end[0]) / 2;
      const segmentMidLat = (start[1] + end[1]) / 2;
      const lengthMeters = segmentLengthMeters(start[0], start[1], end[0], end[1]);

      for (const station of nearbyStations) {
        const distance = pointToSegmentDistanceMeters(
          station.lon,
          station.lat,
          start[0],
          start[1],
          end[0],
          end[1]
        );

        if (distance > STATION_RADIUS_M) {
          continue;
        }

        const metric = stationMetricsMap.get(String(station.terminalName));
        metric.cycleLaneLength500m += lengthMeters;

        if (feature.properties.category === "protected" || feature.properties.category === "quiet") {
          metric.protectedLaneLength500m += lengthMeters;
          metric.nearestProtectedLaneM =
            metric.nearestProtectedLaneM === null ? distance : Math.min(metric.nearestProtectedLaneM, distance);
        }
      }

      const borough = boroughsGeoJson.features.find((candidate) =>
        pointInPolygonFeature([segmentMidLon, segmentMidLat], candidate)
      );

      if (!borough) {
        continue;
      }

      const boroughMetric = boroughMetricsMap.get(borough.properties?.gss_code);

      if (!boroughMetric) {
        continue;
      }

      boroughMetric.cycleLaneKm += lengthMeters / 1000;

      if (feature.properties.category === "protected") {
        boroughMetric.protectedLaneKm += lengthMeters / 1000;
      }

      if (feature.properties.category === "quiet") {
        boroughMetric.quietRouteKm += lengthMeters / 1000;
      }
    }
  }

  for (const feature of trafficCalming.features ?? []) {
    const points = flattenPointCoordinates(feature.geometry);

    for (const [lon, lat] of points) {
      if (!intersectsBounds({ minLon: lon, maxLon: lon, minLat: lat, maxLat: lat }, contextBounds)) {
        continue;
      }

      const nearbyStations = getNearbyStations(stationGrid, {
        minLon: lon - NEARBY_LON_PAD,
        maxLon: lon + NEARBY_LON_PAD,
        minLat: lat - NEARBY_LAT_PAD,
        maxLat: lat + NEARBY_LAT_PAD
      });

      for (const station of nearbyStations) {
        if (distanceMeters(station.lon, station.lat, lon, lat) <= STATION_RADIUS_M) {
          stationMetricsMap.get(String(station.terminalName)).trafficCalmingCount500m += 1;
        }
      }

      const borough = boroughsGeoJson.features.find((candidate) => pointInPolygonFeature([lon, lat], candidate));

      if (borough && boroughMetricsMap.has(borough.properties?.gss_code)) {
        boroughMetricsMap.get(borough.properties?.gss_code).trafficCalmingCount += 1;
      }
    }
  }

  const hourToDaypart = buildDaypartMap();

  for (const csvPath of tripFiles) {
    const parser = createReadStream(csvPath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true
      })
    );

    for await (const record of parser) {
      const originTerminal = normalizeTerminalName(record["Start station number"]);
      const destinationTerminal = normalizeTerminalName(record["End station number"]);
      const originMetric = stationMetricsMap.get(originTerminal);
      const destinationMetric = stationMetricsMap.get(destinationTerminal);

      if (!originMetric || !destinationMetric) {
        continue;
      }

      const durationMs = Number(record["Total duration (ms)"] ?? 0);

      if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) {
        continue;
      }

      const startDate = toUtcDate(record["Start date"]);

      if (Number.isNaN(startDate.valueOf())) {
        continue;
      }

      const hour = startDate.getUTCHours();
      const dayIndex = startDate.getUTCDay();
      const isWeekend = dayIndex === 0 || dayIndex === 6;

      originMetric.annualTrips += 1;
      originMetric.departures += 1;
      destinationMetric.annualTrips += 1;
      destinationMetric.arrivals += 1;

      if (!isWeekend && hourToDaypart.get(hour) === "am") {
        originMetric.weekdayAMTrips += 1;
        destinationMetric.weekdayAMTrips += 1;
      }

      if (isWeekend && hourToDaypart.get(hour) === "midday") {
        originMetric.weekendMiddayTrips += 1;
        destinationMetric.weekendMiddayTrips += 1;
      }
    }
  }

  const stationMetrics = [...stationMetricsMap.values()].map((metric) => {
    const protectedShare500m =
      metric.cycleLaneLength500m > 0 ? metric.protectedLaneLength500m / metric.cycleLaneLength500m : 0;
    const distanceScore =
      metric.nearestProtectedLaneM === null ? 0 : Math.max(0, 1 - metric.nearestProtectedLaneM / 500);
    const calmingScore = Math.min(1, metric.trafficCalmingCount500m / 8);
    const lowStressScore =
      (protectedShare500m * 0.45 + distanceScore * 0.35 + calmingScore * 0.2) * 100;

    return {
      ...metric,
      protectedShare500m: Number(protectedShare500m.toFixed(3)),
      protectedLaneLength500m: Number(metric.protectedLaneLength500m.toFixed(2)),
      cycleLaneLength500m: Number(metric.cycleLaneLength500m.toFixed(2)),
      nearestProtectedLaneM:
        metric.nearestProtectedLaneM === null ? null : Number(metric.nearestProtectedLaneM.toFixed(1)),
      lowStressScore: Number(lowStressScore.toFixed(1))
    };
  });

  const tripValues = stationMetrics.map((item) => item.annualTrips).sort((left, right) => left - right);
  const supportValues = stationMetrics.map((item) => item.lowStressScore).sort((left, right) => left - right);
  const demandThreshold = quantile(tripValues, 0.75);
  const lowSupportThreshold = quantile(supportValues, 0.35);
  const highSupportThreshold = quantile(supportValues, 0.65);

  for (const metric of stationMetrics) {
    metric.deficitClass = classifyDeficit(
      metric.annualTrips,
      metric.lowStressScore,
      demandThreshold,
      lowSupportThreshold,
      highSupportThreshold
    );

    if (!metric.boroughCode || !boroughMetricsMap.has(metric.boroughCode)) {
      continue;
    }

    const boroughMetric = boroughMetricsMap.get(metric.boroughCode);
    boroughMetric.annualTrips += metric.annualTrips;

    if (metric.deficitClass === "demand-infrastructure-mismatch") {
      boroughMetric.mismatchStationCount += 1;
    }
  }

  const boroughMetrics = [...boroughMetricsMap.values()]
    .map((metric) => {
      const areaSqKm = metric.hectares > 0 ? metric.hectares / 100 : 1;
      const protectedAndQuiet = metric.protectedLaneKm + metric.quietRouteKm;

      return {
        boroughCode: metric.boroughCode,
        boroughName: metric.boroughName,
        stationCount: metric.stationCount,
        annualTrips: metric.annualTrips,
        tripIntensity: Number((metric.annualTrips / Math.max(metric.stationCount, 1)).toFixed(1)),
        protectedLaneKm: Number(metric.protectedLaneKm.toFixed(2)),
        cycleLaneKm: Number(metric.cycleLaneKm.toFixed(2)),
        quietRouteKm: Number(metric.quietRouteKm.toFixed(2)),
        lowStressDensity: Number((protectedAndQuiet / areaSqKm).toFixed(2)),
        trafficCalmingCount: metric.trafficCalmingCount,
        deficitIndex: Number((metric.mismatchStationCount / Math.max(metric.stationCount, 1)).toFixed(3))
      };
    })
    .filter((metric) => metric.stationCount > 0)
    .sort((left, right) => right.annualTrips - left.annualTrips);

  const commuteSlices = annualDataset.profiles
    .find((profile) => profile.id === "weekdays")
    ?.hourSlices.filter((slice) => dayparts.find((item) => item.id === "am").hours.includes(slice.hour)) ?? [];
  const weekendSlices = annualDataset.profiles
    .find((profile) => profile.id === "weekends")
    ?.hourSlices.filter((slice) => dayparts.find((item) => item.id === "midday").hours.includes(slice.hour)) ?? [];

  const corridorMap = new Map();

  function mergeCorridorSlice(slices, targetKey) {
    for (const slice of slices) {
      for (const flow of slice.flows) {
        if (flow.originTerminal === flow.destinationTerminal) {
          continue;
        }

        const key = `${flow.originTerminal}|${flow.destinationTerminal}`;

        if (!corridorMap.has(key)) {
          corridorMap.set(key, {
            id: key,
            originTerminal: flow.originTerminal,
            destinationTerminal: flow.destinationTerminal,
            originName: flow.originName,
            destinationName: flow.destinationName,
            originLon: flow.originLon,
            originLat: flow.originLat,
            destinationLon: flow.destinationLon,
            destinationLat: flow.destinationLat,
            commuteCount: 0,
            weekendCount: 0
          });
        }

        corridorMap.get(key)[targetKey] += flow.tripCount;
      }
    }
  }

  mergeCorridorSlice(commuteSlices, "commuteCount");
  mergeCorridorSlice(weekendSlices, "weekendCount");

  const corridorInsights = [...corridorMap.values()]
    .map((corridor) => {
      const total = corridor.commuteCount + corridor.weekendCount;
      const originMetric = stationMetrics.find((item) => item.terminalName === corridor.originTerminal);
      const destinationMetric = stationMetrics.find((item) => item.terminalName === corridor.destinationTerminal);
      const averageSupport = ((originMetric?.lowStressScore ?? 0) + (destinationMetric?.lowStressScore ?? 0)) / 2;
      const infraSupportClass =
        averageSupport >= 60 ? "high-support" : averageSupport <= 40 ? "low-support" : "medium-support";

      return {
        id: corridor.id,
        originTerminal: corridor.originTerminal,
        destinationTerminal: corridor.destinationTerminal,
        originName: corridor.originName,
        destinationName: corridor.destinationName,
        originLon: corridor.originLon,
        originLat: corridor.originLat,
        destinationLon: corridor.destinationLon,
        destinationLat: corridor.destinationLat,
        flowCount: total,
        commuteShare: total > 0 ? Number((corridor.commuteCount / total).toFixed(3)) : 0,
        weekendShare: total > 0 ? Number((corridor.weekendCount / total).toFixed(3)) : 0,
        infraSupportClass,
        storyRank: corridor.commuteCount * 1.25 + corridor.weekendCount,
        commuteCount: corridor.commuteCount,
        weekendCount: corridor.weekendCount
      };
    })
    .filter((item) => item.flowCount > 0)
    .sort((left, right) => right.storyRank - left.storyRank)
    .slice(0, 16);

  const profileSummaries = annualDataset.profiles.map((profile) => ({
    id: profile.id,
    label: profile.label,
    group: profile.group,
    hourSlices: profile.hourSlices.map((slice) => ({
      hour: slice.hour,
      tripCount: slice.tripCount
    }))
  }));

  const weekdayProfile = annualDataset.profiles.find((profile) => profile.id === "weekdays");
  const weekendProfile = annualDataset.profiles.find((profile) => profile.id === "weekends");
  const allProfile = annualDataset.profiles.find((profile) => profile.id === "all");
  const peakWeekday = weekdayProfile ? hourPeak(weekdayProfile) : null;
  const peakWeekend = weekendProfile ? hourPeak(weekendProfile) : null;
  const topStation = topItems(stationMetrics, (item) => item.annualTrips, 1)[0];
  const topIntensityBorough = topItems(boroughMetrics, (item) => item.tripIntensity, 1)[0];
  const topAnnualVolumeBorough = topItems(boroughMetrics, (item) => item.annualTrips, 1)[0];
  const topMismatchBorough = topItems(boroughMetrics, (item) => item.deficitIndex, 1)[0];
  const topCommuteCorridor = topItems(corridorInsights, (item) => item.commuteCount, 1)[0];
  const topWeekendCorridor = topItems(corridorInsights, (item) => item.weekendCount, 1)[0];
  const topWeekdayPeakFlows = peakWeekday ? topItems(peakWeekday.flows ?? [], (item) => item.tripCount, 5) : [];
  const topWeekendPeakFlows = peakWeekend ? topItems(peakWeekend.flows ?? [], (item) => item.tripCount, 8) : [];
  const topWeekendParkCorridor =
    topItems(
      topWeekendPeakFlows.filter((item) =>
        /Hyde Park|Kensington Gardens/i.test(`${item.originName} ${item.destinationName}`)
      ),
      (item) => item.tripCount,
      1
    )[0] ?? topWeekendCorridor;

  const headlineStats = {
    stationCount: stations.length,
    annualTrips: annualDataset.summary.validTrips,
    boroughCount: boroughMetrics.length,
    protectedLaneKm: Number(
      boroughMetrics.reduce((sum, item) => sum + item.protectedLaneKm + item.quietRouteKm, 0).toFixed(1)
    ),
    mismatchStationCount: stationMetrics.filter((item) => item.deficitClass === "demand-infrastructure-mismatch")
      .length,
    topStationName: topStation?.name ?? null,
    topMismatchBorough: topMismatchBorough?.boroughName ?? null
  };

  const sceneAnnotations = {
    hero: [
      `${annualDataset.summary.validTrips.toLocaleString()} valid trips form the annual evidence base.`,
      `${stations.length} live docking stations define the network geography before any flow is drawn.`
    ],
    network: [
      `${topStation?.name ?? "The busiest station"} sits inside a dense central access zone.`,
      `${topIntensityBorough?.boroughName ?? "The central city"} has the highest trip intensity, while ${topAnnualVolumeBorough?.boroughName ?? "one central borough"} carries the largest annual volume.`
    ],
    rhythm: [
      `Weekday demand peaks around ${String(peakWeekday?.hour ?? 8).padStart(2, "0")}:00.`,
      `Weekend demand peaks around ${String(peakWeekend?.hour ?? 14).padStart(2, "0")}:00 and follows a different daily rhythm.`
    ],
    commute: [
      `${topWeekdayPeakFlows[0]?.originName ?? "A central inbound link"} to ${topWeekdayPeakFlows[0]?.destinationName ?? "the central city"} is the strongest visible weekday ${String(peakWeekday?.hour ?? 8).padStart(2, "0")}:00 link.`,
      `${topCommuteCorridor?.originName ?? "One eastern corridor"} to ${topCommuteCorridor?.destinationName ?? "another eastern station"} is one of the strongest recurring commute corridors across the wider peak window.`,
      `Morning flows compress the network into a few dominant links rather than a uniform web.`
    ],
    weekend: [
      `${topWeekendParkCorridor?.originName ?? "A park corridor"} to ${topWeekendParkCorridor?.destinationName ?? "a leisure destination"} becomes prominent on weekend midday.`,
      `Weekend movement redistributes demand away from a pure workday spine.`
    ],
    infrastructure: [
      `${headlineStats.mismatchStationCount} stations fall into the high-demand, low-support mismatch class.`,
      `${topMismatchBorough?.boroughName ?? "One leading borough"} currently has the strongest mismatch signal.`
    ],
    conclusion: [
      `Temporal rhythm and infrastructure support do not align evenly across the network.`,
      `The strongest planning question is not only where bikes move, but where support lags behind demand.`
    ]
  };

  const storyDataset = {
    summary: {
      source: "TfL Santander Cycles annual trips + TfL cycling infrastructure assets",
      generatedAt: new Date().toISOString(),
      year: 2025,
      annualTrips: annualDataset.summary.validTrips,
      stationCount: stations.length,
      boroughCount: boroughMetrics.length
    },
    profiles: profileSummaries,
    dayparts,
    sceneDefaults,
    headlineStats,
    sceneAnnotations,
    stationMetrics,
    boroughMetrics,
    corridorInsights,
    methodNotes: {
      lowStressProxy:
        "Low-stress accessibility is represented as a proxy based on protected lane proximity, protected lane share within 500m, and nearby traffic calming assets. It is not a full route-based accessibility model.",
      infrastructureSources: [
        "TfL CycleRoutes/CycleRoutes.json",
        "TfL CyclingInfrastructure/data/lines/cycle_lane_track.json",
        "TfL CyclingInfrastructure/data/lines/restricted_route.json",
        "TfL CyclingInfrastructure/data/points/traffic_calming.json"
      ]
    }
  };

  await mkdir(processedDir, { recursive: true });
  await mkdir(publicDataDir, { recursive: true });

  await writeFile(
    path.join(processedDir, "typical_week_story.json"),
    `${JSON.stringify(storyDataset, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(publicDataDir, "typical_week_story.json"),
    `${JSON.stringify(storyDataset, null, 2)}\n`,
    "utf8"
  );

  console.log(
    `Built story dataset with ${storyDataset.stationMetrics.length} station metrics, ${storyDataset.boroughMetrics.length} borough metrics, and ${storyDataset.corridorInsights.length} corridor insights`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
