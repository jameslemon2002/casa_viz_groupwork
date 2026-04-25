import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyLanduse, classifyPoi } from "../lib/route_lens_utils.mjs";
import { filterFeaturesToBoroughs } from "../lib/geo_filter_utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const stationsPath = path.join(projectRoot, "public", "data", "stations.json");
const storyPath = path.join(projectRoot, "public", "data", "typical_week_story.json");
const boroughsPath = path.join(projectRoot, "public", "data", "london-boroughs.geojson");
const publicDataDir = path.join(projectRoot, "public", "data");
const processedDataDir = path.join(projectRoot, "data", "processed");
const poiOutputName = "service_context_pois.geojson";
const landuseOutputName = "service_landuse_context.geojson";

const overpassEndpoints = [
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const timeoutSeconds = Number(process.env.CONTEXT_TIMEOUT_SEC ?? 240);
const bufferLon = Number(process.env.CONTEXT_BUFFER_LON ?? 0.006);
const bufferLat = Number(process.env.CONTEXT_BUFFER_LAT ?? 0.006);
const userAgent = process.env.OVERPASS_USER_AGENT ?? "viz-group-project/1.0 (Codex local build; contact local user)";
const maxPoisPerCategory = Number(process.env.CONTEXT_MAX_POIS_PER_CATEGORY ?? 850);
const maxLanduseFeatures = Number(process.env.CONTEXT_MAX_LANDUSE ?? 1200);

function clampCoord(value) {
  return Number(value.toFixed(6));
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

function normaliseBBoxFromCoordinates(points) {
  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return {
    west: clampCoord(Math.min(...lons) - bufferLon),
    south: clampCoord(Math.min(...lats) - bufferLat),
    east: clampCoord(Math.max(...lons) + bufferLon),
    north: clampCoord(Math.max(...lats) + bufferLat),
  };
}

function serviceBoroughContext(storyData, boroughs) {
  const serviceBoroughCodes = new Set(
    (storyData.stationMetrics ?? [])
      .map((station) => station.boroughCode)
      .filter(Boolean),
  );
  const serviceBoroughs = (boroughs.features ?? []).filter((feature) => serviceBoroughCodes.has(feature.properties?.gss_code));
  const points = serviceBoroughs.flatMap((feature) => collectCoordinatePairs(feature.geometry?.coordinates));
  if (points.length === 0) {
    throw new Error("No service borough geometry found in public/data/london-boroughs.geojson");
  }
  return {
    serviceBoroughCodes,
    serviceBoroughs,
    bbox: normaliseBBoxFromCoordinates(points),
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

  throw lastError instanceof Error ? lastError : new Error("Failed to fetch service context from Overpass");
}

function elementCenter(element) {
  if (Number.isFinite(element.lon) && Number.isFinite(element.lat)) return [clampCoord(element.lon), clampCoord(element.lat)];
  if (Number.isFinite(element.center?.lon) && Number.isFinite(element.center?.lat)) {
    return [clampCoord(element.center.lon), clampCoord(element.center.lat)];
  }
  const geom = element.geometry ?? [];
  const coords = geom.filter((point) => Number.isFinite(point?.lon) && Number.isFinite(point?.lat));
  if (coords.length === 0) return null;
  const lon = coords.reduce((sum, point) => sum + point.lon, 0) / coords.length;
  const lat = coords.reduce((sum, point) => sum + point.lat, 0) / coords.length;
  return [clampCoord(lon), clampCoord(lat)];
}

function ringArea(coords) {
  let area = 0;
  for (let i = 0; i < coords.length; i += 1) {
    const current = coords[i];
    const next = coords[(i + 1) % coords.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(area) / 2;
}

function geometryArea(geometry) {
  if (!geometry) return 0;
  if (geometry.type === "Polygon") return ringArea(geometry.coordinates[0] ?? []);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce((sum, polygon) => sum + ringArea(polygon[0] ?? []), 0);
  }
  return 0;
}

function wayGeometry(element) {
  const coords = (element.geometry ?? [])
    .filter((point) => Number.isFinite(point?.lon) && Number.isFinite(point?.lat))
    .map((point) => [clampCoord(point.lon), clampCoord(point.lat)]);
  if (coords.length < 4) return null;
  const first = coords[0];
  const last = coords.at(-1);
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) return null;
  return { type: "Polygon", coordinates: [coords] };
}

function relationGeometry(element) {
  const rings = (element.members ?? [])
    .filter((member) => Array.isArray(member.geometry))
    .map((member) =>
      member.geometry
        .filter((point) => Number.isFinite(point?.lon) && Number.isFinite(point?.lat))
        .map((point) => [clampCoord(point.lon), clampCoord(point.lat)]),
    )
    .filter((coords) => {
      const first = coords[0];
      const last = coords.at(-1);
      return coords.length >= 4 && first && last && first[0] === last[0] && first[1] === last[1];
    });

  if (rings.length === 0) return null;
  return { type: "MultiPolygon", coordinates: rings.map((ring) => [ring]) };
}

function tagsFor(element) {
  return element.tags ?? {};
}

function poiFeature(element) {
  const category = classifyPoi(tagsFor(element));
  if (!category) return null;
  const center = elementCenter(element);
  if (!center) return null;
  const tags = tagsFor(element);
  return {
    type: "Feature",
    properties: {
      id: `${element.type}/${element.id}`,
      name: tags.name ?? tags.operator ?? category,
      category,
      osmType: element.type,
      osmId: element.id,
      amenity: tags.amenity ?? null,
      tourism: tags.tourism ?? null,
      shop: tags.shop ?? null,
      office: tags.office ?? null,
      railway: tags.railway ?? null,
      leisure: tags.leisure ?? null,
      source: "OpenStreetMap via Overpass API",
    },
    geometry: { type: "Point", coordinates: center },
  };
}

function landuseFeature(element) {
  const category = classifyLanduse(tagsFor(element));
  if (!category) return null;
  const geometry = element.type === "relation" ? relationGeometry(element) : wayGeometry(element);
  if (!geometry) return null;
  const tags = tagsFor(element);
  return {
    type: "Feature",
    properties: {
      id: `${element.type}/${element.id}`,
      name: tags.name ?? category,
      category,
      osmType: element.type,
      osmId: element.id,
      landuse: tags.landuse ?? null,
      amenity: tags.amenity ?? null,
      leisure: tags.leisure ?? null,
      source: "OpenStreetMap via Overpass API",
      area: Number(geometryArea(geometry).toFixed(8)),
    },
    geometry,
  };
}

function limitPois(features) {
  const byCategory = new Map();
  for (const feature of features) {
    const category = feature.properties.category;
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(feature);
  }

  return [...byCategory.values()]
    .flatMap((items) =>
      items
        .sort((left, right) => {
          const namedDelta = Number(Boolean(right.properties.name)) - Number(Boolean(left.properties.name));
          if (namedDelta !== 0) return namedDelta;
          return String(left.properties.id).localeCompare(String(right.properties.id));
        })
        .slice(0, maxPoisPerCategory),
    )
    .sort((left, right) => String(left.properties.category).localeCompare(String(right.properties.category)));
}

function limitLanduse(features) {
  return features
    .sort((left, right) => (right.properties.area ?? 0) - (left.properties.area ?? 0))
    .slice(0, maxLanduseFeatures)
    .sort((left, right) => String(left.properties.category).localeCompare(String(right.properties.category)));
}

async function main() {
  const [stationsPayload, storyData, boroughs] = await Promise.all([
    readFile(stationsPath, "utf8").then(JSON.parse),
    readFile(storyPath, "utf8").then(JSON.parse),
    readFile(boroughsPath, "utf8").then(JSON.parse),
  ]);
  const stations = stationsPayload.stations ?? [];
  if (!Array.isArray(stations) || stations.length === 0) {
    throw new Error("No stations found in public/data/stations.json");
  }

  const { serviceBoroughCodes, serviceBoroughs, bbox } = serviceBoroughContext(storyData, boroughs);
  const bboxClause = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
  const query = `[out:json][timeout:${timeoutSeconds}];(
    nwr["amenity"~"^(pub|bar|cafe|restaurant|fast_food|nightclub|theatre|cinema|arts_centre|hospital|clinic|doctors|pharmacy|dentist|university|college|school|library|townhall|courthouse|police|fire_station|post_office|marketplace|community_centre|bus_station)$"]${bboxClause};
    nwr["tourism"~"^(museum|gallery|attraction|artwork|viewpoint)$"]${bboxClause};
    nwr["railway"~"^(station|subway_entrance|tram_stop|halt)$"]${bboxClause};
    nwr["public_transport"~"^(station|platform|stop_position)$"]${bboxClause};
    nwr["shop"]${bboxClause};
    nwr["office"]${bboxClause};
    nwr["leisure"~"^(park|garden|sports_centre|stadium|fitness_centre|pitch|playground)$"]${bboxClause};
    way["landuse"~"^(commercial|retail|residential|industrial|education|institutional|recreation_ground|grass|meadow|village_green)$"]${bboxClause};
    relation["landuse"~"^(commercial|retail|residential|industrial|education|institutional|recreation_ground|grass|meadow|village_green)$"]${bboxClause};
    way["amenity"~"^(university|college|school|hospital|townhall|community_centre)$"]${bboxClause};
    relation["amenity"~"^(university|college|school|hospital|townhall|community_centre)$"]${bboxClause};
  );out geom;`;

  const raw = await fetchOverpass(query);
  const elements = raw.elements ?? [];
  const candidatePois = elements.map(poiFeature).filter(Boolean);
  const candidateLanduse = elements.map(landuseFeature).filter(Boolean);
  const boroughPois = filterFeaturesToBoroughs(candidatePois, serviceBoroughs, serviceBoroughCodes);
  const boroughLanduse = filterFeaturesToBoroughs(candidateLanduse, serviceBoroughs, serviceBoroughCodes);
  const pois = limitPois(boroughPois);
  const landuse = limitLanduse(boroughLanduse);

  const metadata = {
    generatedAt: new Date().toISOString(),
    source: "OpenStreetMap via Overpass API",
    bbox,
    serviceBoroughCodes: [...serviceBoroughCodes].sort(),
    fetchBasis: "OSM query uses the union bounding box of boroughs containing Santander Cycles docking stations; features are then clipped by representative point to those borough polygons.",
    stationCount: stations.length,
    rawElementCount: elements.length,
    preFilterPoiCount: candidatePois.length,
    preFilterLanduseCount: candidateLanduse.length,
    boroughPoiCount: boroughPois.length,
    boroughLanduseCount: boroughLanduse.length,
    poiCount: pois.length,
    landuseCount: landuse.length,
    note: "Context features are lightly classified for Free Explore route interpretation. Water features are intentionally excluded.",
  };

  const poiCollection = { type: "FeatureCollection", metadata, features: pois };
  const landuseCollection = { type: "FeatureCollection", metadata, features: landuse };

  await mkdir(publicDataDir, { recursive: true });
  await mkdir(processedDataDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(publicDataDir, poiOutputName), `${JSON.stringify(poiCollection)}\n`, "utf8"),
    writeFile(path.join(processedDataDir, poiOutputName), `${JSON.stringify(poiCollection)}\n`, "utf8"),
    writeFile(path.join(publicDataDir, landuseOutputName), `${JSON.stringify(landuseCollection)}\n`, "utf8"),
    writeFile(path.join(processedDataDir, landuseOutputName), `${JSON.stringify(landuseCollection)}\n`, "utf8"),
  ]);

  console.log(`Fetched ${elements.length} OSM context elements`);
  console.log(`Wrote ${pois.length} POIs to ${path.relative(projectRoot, path.join(publicDataDir, poiOutputName))}`);
  console.log(`Wrote ${landuse.length} landuse polygons to ${path.relative(projectRoot, path.join(publicDataDir, landuseOutputName))}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
