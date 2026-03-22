import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const rawBoundaryPath = path.join(projectRoot, "data", "raw", "boundaries", "london-boroughs.geojson");
const stationsPath = path.join(projectRoot, "data", "processed", "stations.json");
const processedDir = path.join(projectRoot, "data", "processed", "boundaries");
const publicDataDir = path.join(projectRoot, "public", "data");

function getStationBounds(stations) {
  const lons = stations.map((station) => station.lon).filter(Number.isFinite);
  const lats = stations.map((station) => station.lat).filter(Number.isFinite);

  return {
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats)
  };
}

function expandBounds(bounds, lonFactor = 0.1, latFactor = 0.12) {
  const lonPad = (bounds.maxLon - bounds.minLon || 1) * lonFactor;
  const latPad = (bounds.maxLat - bounds.minLat || 1) * latFactor;

  return {
    minLon: bounds.minLon - lonPad,
    maxLon: bounds.maxLon + lonPad,
    minLat: bounds.minLat - latPad,
    maxLat: bounds.maxLat + latPad
  };
}

function projectMercator(lon, lat) {
  const clampedLat = Math.max(-85, Math.min(85, lat));
  const lambda = (lon * Math.PI) / 180;
  const phi = (clampedLat * Math.PI) / 180;
  const x = lambda;
  const y = Math.log(Math.tan(Math.PI / 4 + phi / 2));

  return { x, y };
}

function toProjectedBounds(bounds) {
  const bottomLeft = projectMercator(bounds.minLon, bounds.minLat);
  const topRight = projectMercator(bounds.maxLon, bounds.maxLat);

  return {
    minX: bottomLeft.x,
    maxX: topRight.x,
    minY: bottomLeft.y,
    maxY: topRight.y
  };
}

function coordinateToXY(lon, lat, bounds) {
  const projectedBounds = toProjectedBounds(bounds);
  const point = projectMercator(lon, lat);
  const xSpan = projectedBounds.maxX - projectedBounds.minX || 1;
  const ySpan = projectedBounds.maxY - projectedBounds.minY || 1;
  const x = 8 + ((point.x - projectedBounds.minX) / xSpan) * 84;
  const y = 10 + (1 - (point.y - projectedBounds.minY) / ySpan) * 80;

  return [Number(x.toFixed(2)), Number(y.toFixed(2))];
}

function geometryBounds(coordinates) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const polygon of coordinates) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
          continue;
        }

        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
    }
  }

  return { minLon, maxLon, minLat, maxLat };
}

function intersects(bounds, candidate) {
  return !(
    candidate.maxLon < bounds.minLon ||
    candidate.minLon > bounds.maxLon ||
    candidate.maxLat < bounds.minLat ||
    candidate.minLat > bounds.maxLat
  );
}

function containsCenter(bounds, candidate) {
  const centerLon = (candidate.minLon + candidate.maxLon) / 2;
  const centerLat = (candidate.minLat + candidate.maxLat) / 2;

  return (
    centerLon >= bounds.minLon &&
    centerLon <= bounds.maxLon &&
    centerLat >= bounds.minLat &&
    centerLat <= bounds.maxLat
  );
}

function toPolygons(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return [];
  }

  if (geometry.type === "Polygon") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates;
  }

  return [];
}

function ringToPath(ring, bounds) {
  const commands = [];

  for (let index = 0; index < ring.length; index += 1) {
    const [lon, lat] = ring[index];
    const [x, y] = coordinateToXY(lon, lat, bounds);
    commands.push(`${index === 0 ? "M" : "L"} ${x} ${y}`);
  }

  if (commands.length === 0) {
    return "";
  }

  return `${commands.join(" ")} Z`;
}

function featureToPath(feature, bounds) {
  const polygons = toPolygons(feature.geometry);
  const pathData = [];

  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) {
        continue;
      }

      const segment = ringToPath(ring, bounds);

      if (segment) {
        pathData.push(segment);
      }
    }
  }

  return pathData.join(" ");
}

function normalizePoint(point, precision = 6) {
  const [lon, lat] = point;
  return `${Number(lon).toFixed(precision)},${Number(lat).toFixed(precision)}`;
}

function buildLondonOutline(features) {
  const segments = new Map();

  for (const feature of features) {
    const polygons = toPolygons(feature.geometry);

    for (const polygon of polygons) {
      for (const ring of polygon) {
        if (!Array.isArray(ring) || ring.length < 4) {
          continue;
        }

        const limit = ring.length - 1;

        for (let index = 0; index < limit; index += 1) {
          const start = ring[index];
          const end = ring[index + 1];

          if (!Array.isArray(start) || !Array.isArray(end)) {
            continue;
          }

          const startKey = normalizePoint(start);
          const endKey = normalizePoint(end);
          const segmentKey = [startKey, endKey].sort().join("|");
          const existing = segments.get(segmentKey);

          if (existing) {
            existing.count += 1;
            continue;
          }

          segments.set(segmentKey, {
            count: 1,
            startKey,
            endKey,
            start,
            end
          });
        }
      }
    }
  }

  const boundarySegments = [...segments.values()].filter((segment) => segment.count === 1);
  const adjacency = new Map();

  for (const segment of boundarySegments) {
    if (!adjacency.has(segment.startKey)) {
      adjacency.set(segment.startKey, []);
    }

    if (!adjacency.has(segment.endKey)) {
      adjacency.set(segment.endKey, []);
    }

    adjacency.get(segment.startKey).push({
      edgeId: `${segment.startKey}|${segment.endKey}`,
      nextKey: segment.endKey,
      coordinate: segment.end
    });
    adjacency.get(segment.endKey).push({
      edgeId: `${segment.startKey}|${segment.endKey}`,
      nextKey: segment.startKey,
      coordinate: segment.start
    });
  }

  const visitedEdges = new Set();
  const lines = [];

  for (const segment of boundarySegments) {
    const edgeId = `${segment.startKey}|${segment.endKey}`;

    if (visitedEdges.has(edgeId)) {
      continue;
    }

    const line = [segment.start];
    let currentKey = segment.startKey;
    let nextKey = segment.endKey;
    visitedEdges.add(edgeId);
    line.push(segment.end);

    while (nextKey !== currentKey) {
      const neighbors = adjacency
        .get(nextKey)
        ?.filter((candidate) => !visitedEdges.has(candidate.edgeId) && candidate.nextKey !== currentKey);

      if (!neighbors || neighbors.length === 0) {
        break;
      }

      const nextSegment = neighbors[0];
      visitedEdges.add(nextSegment.edgeId);
      currentKey = nextKey;
      nextKey = nextSegment.nextKey;
      line.push(nextSegment.coordinate);
    }

    if (line.length >= 4) {
      lines.push(line);
    }
  }

  lines.sort((left, right) => right.length - left.length);

  return {
    type: "FeatureCollection",
    features: lines.length
      ? [
          {
            type: "Feature",
            properties: {
              name: "Greater London outline"
            },
            geometry: {
              type: "MultiLineString",
              coordinates: lines
            }
          }
        ]
      : []
  };
}

async function main() {
  const boundaryPayload = JSON.parse(await readFile(rawBoundaryPath, "utf8"));
  const stationPayload = JSON.parse(await readFile(stationsPath, "utf8"));
  const stations = stationPayload.stations ?? [];
  const stationBounds = getStationBounds(stations);
  const filterBounds = expandBounds(stationBounds);
  const filteredFeatures = (boundaryPayload.features ?? [])
    .map((feature) => {
      const polygons = toPolygons(feature.geometry);
      const candidateBounds = geometryBounds(polygons);

      if (!intersects(filterBounds, candidateBounds) || !containsCenter(filterBounds, candidateBounds)) {
        return null;
      }

      return feature;
    })
    .filter(Boolean);

  const paths = filteredFeatures
    .map((feature) => {
      const pathData = featureToPath(feature, filterBounds);

      if (!pathData) {
        return null;
      }

      return {
        id: String(feature.id ?? feature.properties?.gss_code ?? feature.properties?.name ?? "unknown"),
        name: feature.properties?.name ?? "Unknown borough",
        code: feature.properties?.gss_code ?? null,
        path: pathData
      };
    })
    .filter(Boolean);

  const output = {
    summary: {
      source:
        "https://gis2.london.gov.uk/server/rest/services/apps/webmap_context_layer/MapServer/3/query?where=1%3D1&outFields=*&f=geojson",
      generatedAt: new Date().toISOString(),
      boroughCount: paths.length,
      stationBounds,
      filterBounds
    },
    paths
  };
  const fullGeoJson = {
    type: "FeatureCollection",
    features: boundaryPayload.features ?? []
  };
  const londonOutlineGeoJson = buildLondonOutline(boundaryPayload.features ?? []);

  await mkdir(processedDir, { recursive: true });
  await mkdir(publicDataDir, { recursive: true });

  await writeFile(
    path.join(processedDir, "london-boroughs.json"),
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(publicDataDir, "london-boroughs.json"),
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(processedDir, "london-boroughs.geojson"),
    `${JSON.stringify(fullGeoJson, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(publicDataDir, "london-boroughs.geojson"),
    `${JSON.stringify(fullGeoJson, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(processedDir, "london-outline.geojson"),
    `${JSON.stringify(londonOutlineGeoJson, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(publicDataDir, "london-outline.geojson"),
    `${JSON.stringify(londonOutlineGeoJson, null, 2)}\n`,
    "utf8"
  );

  console.log(`Built borough basemap with ${paths.length} boundary paths`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
