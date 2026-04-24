import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const flowsPath = path.join(projectRoot, "public", "data", "flows_hourly.json");
const storyPath = path.join(projectRoot, "public", "data", "typical_week_story.json");
const temporalPath = path.join(projectRoot, "public", "data", "temporal_summary.json");
const streetNetworkPath = path.join(projectRoot, "public", "data", "service_street_network.geojson");
const processedDir = path.join(projectRoot, "data", "processed");
const publicDataDir = path.join(projectRoot, "public", "data");

const coordinatePrecision = 5;
const maxOdPairsPerSlice = process.env.ROUTE_FLOW_MAX_OD ? Number(process.env.ROUTE_FLOW_MAX_OD) : Infinity;
const maxEdgesPerSlice = process.env.ROUTE_FLOW_MAX_EDGES ? Number(process.env.ROUTE_FLOW_MAX_EDGES) : Infinity;
const routeDisplayEdgeLimit = process.env.ROUTE_DISPLAY_MAX_EDGES ? Number(process.env.ROUTE_DISPLAY_MAX_EDGES) : Infinity;
const edgeRetentionMode = Number.isFinite(routeDisplayEdgeLimit) ? "debug-top-n" : "all-routed-edges";
const includeEdgeContributors = process.env.ROUTE_INCLUDE_EDGE_CONTRIBUTORS === "1";
const routeEdgeFormat = process.env.ROUTE_EDGE_FORMAT ?? "compact-v1";
const compactEdgeScales = {
  coordinate: 100000,
  averageDailyTrips: 100,
  strength: 10000,
};
const compactTierCodes = {
  context: 0,
  support: 1,
  focus: 2,
  accent: 3,
};
const maxContributorCount = 3;
const maxSnapDistanceM = Number(process.env.ROUTE_MAX_SNAP_M ?? 600);
const targetSliceFilter = new Set(
  (process.env.ROUTE_TARGET_SLICES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const alternativeRouteCount = Number(process.env.ROUTE_ALT_COUNT ?? 4);
const detourLimit = Number(process.env.ROUTE_DETOUR_LIMIT ?? 1.55);
const routePenaltyStep = Number(process.env.ROUTE_PENALTY_STEP ?? 0.72);
const distanceDecayAlpha = Number(process.env.ROUTE_DECAY_ALPHA ?? 3.2);
const stochasticJitter = Number(process.env.ROUTE_JITTER ?? 0.18);
const assignmentSeed = Number(process.env.ROUTE_ASSIGNMENT_SEED ?? 2025);
const londonMeanLat = 51.5072;
const earthRadiusM = 6371008.8;

const dayCounts = {
  all: 365,
  weekdays: 261,
  weekends: 104,
};

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toLocalXY([lon, lat]) {
  return [
    earthRadiusM * toRadians(lon) * Math.cos(toRadians(londonMeanLat)),
    earthRadiusM * toRadians(lat),
  ];
}

function distanceMeters(a, b) {
  const [ax, ay] = toLocalXY(a);
  const [bx, by] = toLocalXY(b);
  return Math.hypot(ax - bx, ay - by);
}

function keyOf(coord) {
  return `${coord[0].toFixed(coordinatePrecision)},${coord[1].toFixed(coordinatePrecision)}`;
}

function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function seededRandomFromString(value) {
  let hash = assignmentSeed >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return (hash >>> 0) / 4294967295;
}

function bikePriority(properties = {}) {
  return [
    properties.bicycle,
    properties.cycleway,
    properties["cycleway:left"],
    properties["cycleway:right"],
    properties["cycleway:both"],
    properties["cycleway:lane"],
  ].some((value) => typeof value === "string" && value.length > 0 && value !== "no");
}

function edgeWeightMultiplier(properties = {}) {
  const highway = properties.highway?.toLowerCase?.();
  if (highway) {
    const preferred = bikePriority(properties);
    switch (highway) {
      case "cycleway":
        return 0.82;
      case "residential":
      case "living_street":
        return preferred ? 0.9 : 0.98;
      case "service":
      case "unclassified":
        return preferred ? 0.92 : 1;
      case "tertiary":
      case "tertiary_link":
        return preferred ? 0.95 : 1.03;
      case "secondary":
      case "secondary_link":
        return preferred ? 1 : 1.08;
      case "primary":
      case "primary_link":
        return preferred ? 1.04 : 1.16;
      case "trunk":
      case "trunk_link":
        return preferred ? 1.08 : 1.22;
      case "track":
      case "path":
      case "pedestrian":
      case "footway":
      case "bridleway":
        return preferred ? 0.96 : 1.04;
      default:
        return preferred ? 0.95 : 1.01;
    }
  }

  switch (properties.category) {
    case "protected":
      return 0.85;
    case "quiet":
      return 0.92;
    case "painted":
      return 1;
    case "mixed":
      return 1.08;
    default:
      return 1.12;
  }
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) return null;
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return first;
  }

  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].score <= this.items[index].score) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  sinkDown(index) {
    const length = this.items.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (left < length && this.items[left].score < this.items[smallest].score) {
        smallest = left;
      }
      if (right < length && this.items[right].score < this.items[smallest].score) {
        smallest = right;
      }
      if (smallest === index) break;

      [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
      index = smallest;
    }
  }

  get size() {
    return this.items.length;
  }
}

function addContributor(edgeRecord, flow, assignedCount = flow.count) {
  const label = `${flow.oName} -> ${flow.dName}`;
  const existing = edgeRecord.contributors.find((item) => item.label === label);
  if (existing) {
    existing.count += assignedCount;
  } else {
    edgeRecord.contributors.push({
      label,
      origin: flow.oName,
      destination: flow.dName,
      count: assignedCount,
    });
  }
  edgeRecord.contributors.sort((a, b) => b.count - a.count);
  if (edgeRecord.contributors.length > maxContributorCount) {
    edgeRecord.contributors.length = maxContributorCount;
  }
}

function buildGraph(infrastructure) {
  const nodes = [];
  const nodeIndex = new Map();
  const adjacency = [];
  const edges = new Map();

  function getNode(coord) {
    const key = keyOf(coord);
    const existing = nodeIndex.get(key);
    if (existing !== undefined) return existing;

    const id = nodes.length;
    const rounded = [
      Number(coord[0].toFixed(coordinatePrecision)),
      Number(coord[1].toFixed(coordinatePrecision)),
    ];
    nodes.push({ id, key, coord: rounded });
    nodeIndex.set(key, id);
    adjacency.push([]);
    return id;
  }

  function addEdge(aId, bId, properties) {
    if (aId === bId) return;
    const a = nodes[aId];
    const b = nodes[bId];
    const key = edgeKey(a.key, b.key);
    const lengthM = distanceMeters(a.coord, b.coord);
    if (!Number.isFinite(lengthM) || lengthM <= 0) return;

    const weight = lengthM * edgeWeightMultiplier(properties);
    const existing = edges.get(key);
    if (existing && existing.weight <= weight) return;

    const edge = {
      id: key,
      aId,
      bId,
      aKey: a.key,
      bKey: b.key,
      coords: [a.coord, b.coord],
      lengthM,
      weight,
      category: properties.category ?? properties.routingClass ?? properties.highway ?? "unknown",
      highway: properties.highway ?? null,
    };
    edges.set(key, edge);
  }

  for (const feature of infrastructure.features ?? []) {
    const geometry = feature.geometry;
    if (!geometry || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
      continue;
    }
    const properties = feature.properties ?? {};
    for (let i = 1; i < geometry.coordinates.length; i += 1) {
      const prev = geometry.coordinates[i - 1];
      const curr = geometry.coordinates[i];
      if (!Array.isArray(prev) || !Array.isArray(curr)) continue;
      const aId = getNode(prev);
      const bId = getNode(curr);
      addEdge(aId, bId, properties);
    }
  }

  for (const edge of edges.values()) {
    adjacency[edge.aId].push({ node: edge.bId, edgeId: edge.id, weight: edge.weight });
    adjacency[edge.bId].push({ node: edge.aId, edgeId: edge.id, weight: edge.weight });
  }

  return { nodes, adjacency, edges };
}

function componentLabels(graph) {
  const labels = new Int32Array(graph.nodes.length).fill(-1);
  const sizes = [];
  let componentId = 0;

  for (let i = 0; i < graph.nodes.length; i += 1) {
    if (labels[i] !== -1) continue;
    const stack = [i];
    labels[i] = componentId;
    let size = 0;

    while (stack.length > 0) {
      const node = stack.pop();
      size += 1;
      for (const next of graph.adjacency[node]) {
        if (labels[next.node] !== -1) continue;
        labels[next.node] = componentId;
        stack.push(next.node);
      }
    }

    sizes.push(size);
    componentId += 1;
  }

  return { labels, sizes };
}

function buildSpatialIndex(nodes) {
  const cellSize = 0.006;
  const grid = new Map();
  for (const node of nodes) {
    const x = Math.floor(node.coord[0] / cellSize);
    const y = Math.floor(node.coord[1] / cellSize);
    const key = `${x}:${y}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(node.id);
  }

  return { grid, cellSize };
}

function nearestNode(coord, graph, spatialIndex, labels, allowedComponents) {
  const [lon, lat] = coord;
  const cx = Math.floor(lon / spatialIndex.cellSize);
  const cy = Math.floor(lat / spatialIndex.cellSize);
  let best = null;

  for (let radius = 0; radius <= 8; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const ids = spatialIndex.grid.get(`${cx + dx}:${cy + dy}`) ?? [];
        for (const id of ids) {
          if (allowedComponents && !allowedComponents.has(labels[id])) continue;
          const distanceM = distanceMeters(coord, graph.nodes[id].coord);
          if (!best || distanceM < best.distanceM) {
            best = { nodeId: id, distanceM };
          }
        }
      }
    }
    if (best && best.distanceM <= maxSnapDistanceM) break;
  }

  return best;
}

function routeLengthMeters(graph, edgeIds) {
  return edgeIds.reduce((sum, edgeId) => sum + (graph.edges.get(edgeId)?.lengthM ?? 0), 0);
}

function shortestPath(graph, labels, sourceId, targetId, edgePenalty = null) {
  if (sourceId === targetId) return { edgeIds: [], distanceM: 0 };
  if (labels[sourceId] !== labels[targetId]) return null;

  const targetCoord = graph.nodes[targetId].coord;
  const queue = new MinHeap();
  const best = new Map();
  const previous = new Map();

  best.set(sourceId, 0);
  queue.push({ node: sourceId, score: distanceMeters(graph.nodes[sourceId].coord, targetCoord), cost: 0 });

  while (queue.size > 0) {
    const current = queue.pop();
    if (!current) break;
    if (current.cost > (best.get(current.node) ?? Infinity)) continue;
    if (current.node === targetId) {
      const edgeIds = [];
      let node = targetId;
      while (node !== sourceId) {
        const prev = previous.get(node);
        if (!prev) break;
        edgeIds.push(prev.edgeId);
        node = prev.node;
      }
          edgeIds.reverse();
          return {
            edgeIds,
            distanceM: routeLengthMeters(graph, edgeIds),
            weightedCost: current.cost,
          };
        }

    for (const next of graph.adjacency[current.node]) {
      const multiplier = edgePenalty?.get(next.edgeId) ?? 1;
      const nextCost = current.cost + next.weight * multiplier;
      if (nextCost >= (best.get(next.node) ?? Infinity)) continue;
      best.set(next.node, nextCost);
      previous.set(next.node, { node: current.node, edgeId: next.edgeId });
      queue.push({
        node: next.node,
        cost: nextCost,
        score: nextCost + distanceMeters(graph.nodes[next.node].coord, targetCoord),
      });
    }
  }

  return null;
}

function averageDaily(count, profileId) {
  return count / (dayCounts[profileId] ?? dayCounts.all);
}

function visualTierForStrength(strength) {
  if (strength >= 0.56) return "accent";
  if (strength >= 0.34) return "focus";
  if (strength >= 0.18) return "support";
  return "context";
}

function prepareStyledEdges(edges, displayLimit = routeDisplayEdgeLimit, strengthMaxAverageDailyTrips = null) {
  const sorted = edges.sort((a, b) => b.averageDailyTrips - a.averageDailyTrips);
  const retained = Number.isFinite(displayLimit) ? sorted.slice(0, displayLimit) : sorted;
  const maxEdgeAverageDailyTrips = sorted[0]?.averageDailyTrips ?? 1;
  const strengthDenominator = strengthMaxAverageDailyTrips ?? maxEdgeAverageDailyTrips;

  return {
    styledEdges: retained.map((edge, index) => {
      const strength = Number(Math.sqrt(Math.min(Math.max(edge.averageDailyTrips / Math.max(strengthDenominator, 1), 0), 1)).toFixed(4));
      return {
        ...edge,
        visualRank: index + 1,
        visualTier: visualTierForStrength(strength),
        strength,
      };
    }),
    maxEdgeAverageDailyTrips: Number(maxEdgeAverageDailyTrips.toFixed(2)),
  };
}

function compactRouteEdge(edge) {
  const [start, end] = edge.coordinates;
  return [
    Math.round(start[0] * compactEdgeScales.coordinate),
    Math.round(start[1] * compactEdgeScales.coordinate),
    Math.round(end[0] * compactEdgeScales.coordinate),
    Math.round(end[1] * compactEdgeScales.coordinate),
    Math.round(edge.averageDailyTrips * compactEdgeScales.averageDailyTrips),
    Math.round((edge.strength ?? 0) * compactEdgeScales.strength),
    compactTierCodes[edge.visualTier] ?? compactTierCodes.context,
  ];
}

function maybeCompactRouteSlice(slice) {
  if (routeEdgeFormat !== "compact-v1") return slice;
  return {
    ...slice,
    edgeFormat: "compact-v1",
    edgeScales: compactEdgeScales,
    edges: slice.edges.map(compactRouteEdge),
  };
}

function includeSlice(profileId, hour) {
  if (targetSliceFilter.size === 0) return true;
  return targetSliceFilter.has(`${profileId}:${hour}`);
}

function routeSignature(route) {
  return route.edgeIds.join(">");
}

function buildPenaltyMap(routes, attemptIndex) {
  const penalty = new Map();
  for (const route of routes) {
    for (const edgeId of route.edgeIds) {
      const current = penalty.get(edgeId) ?? 1;
      penalty.set(edgeId, Math.max(current, 1 + routePenaltyStep * attemptIndex));
    }
  }
  return penalty;
}

function routeAssignmentWeights(routes, cacheKey) {
  if (routes.length === 0) return [];
  const minDistance = Math.max(Math.min(...routes.map((route) => route.distanceM).filter((value) => value > 0)), 1);
  const raw = routes.map((route, index) => {
    const detourRatio = Math.max(route.distanceM / minDistance, 1);
    const jitter = 1 - stochasticJitter / 2 + seededRandomFromString(`${cacheKey}|${index}|${routeSignature(route).slice(0, 120)}`) * stochasticJitter;
    return Math.pow(detourRatio, -distanceDecayAlpha) * jitter;
  });
  const total = raw.reduce((sum, value) => sum + value, 0) || 1;
  return routes.map((route, index) => ({
    ...route,
    detourRatio: Number((route.distanceM / minDistance).toFixed(3)),
    probability: raw[index] / total,
  }));
}

function stochasticRouteSet(graph, labels, sourceId, targetId, cacheKey) {
  const base = shortestPath(graph, labels, sourceId, targetId);
  if (!base) return null;
  if (base.edgeIds.length === 0) {
    return {
      routes: [{ ...base, detourRatio: 1, probability: 1 }],
      baseDistanceM: 0,
    };
  }

  const routes = [base];
  const seen = new Set([routeSignature(base)]);
  const baseDistanceM = Math.max(base.distanceM, 1);

  for (let attempt = 1; attempt < alternativeRouteCount; attempt += 1) {
    const penalty = buildPenaltyMap(routes, attempt);
    const candidate = shortestPath(graph, labels, sourceId, targetId, penalty);
    if (!candidate) continue;
    if (candidate.distanceM > baseDistanceM * detourLimit) continue;

    const signature = routeSignature(candidate);
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);
    routes.push(candidate);
  }

  return {
    routes: routeAssignmentWeights(routes, cacheKey),
    baseDistanceM,
  };
}

function seasonOfMonth(month) {
  if (month === 12 || month <= 2) return "winter";
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  return "autumn";
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function buildTemporalSummary(storyData, temporalData) {
  if (temporalData) {
    return {
      researchQuestion: temporalData.researchQuestion,
      monthStatus: {
        available: Array.isArray(temporalData.months) && temporalData.months.length > 0,
        metricBasis: temporalData.meta?.metricBasis ?? null,
      },
      months: temporalData.months ?? [],
      seasons: temporalData.seasons ?? [],
      dayOfWeek: temporalData.dayOfWeek ?? [],
      profileDayCounts: temporalData.meta?.dayCounts ?? dayCounts,
      annotations: temporalData.annotations ?? null,
    };
  }

  const profiles = storyData.profiles ?? [];
  const dayOfWeek = profiles
    .filter((profile) => ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(profile.id))
    .map((profile) => {
      const peak = [...profile.hourSlices].sort((a, b) => b.tripCount - a.tripCount)[0];
      return {
        id: profile.id,
        label: profile.label,
        totalAnnualTrips: profile.hourSlices.reduce((sum, item) => sum + item.tripCount, 0),
        peakHour: peak?.hour ?? null,
        peakAnnualTrips: peak?.tripCount ?? 0,
      };
    });

  return {
    researchQuestion: "How do seasonal, weekly and hourly rhythms shape the street-level geography of London's bike-share use?",
    monthStatus: {
      available: false,
      reason: "Monthly and seasonal trip aggregates require the raw TfL 2025 trip archive. The current repository snapshot only contains hourly and weekly frontend summaries.",
      seasons: ["winter", "spring", "summer", "autumn"].map((season) => ({ season, status: "requires raw archive rebuild" })),
    },
    dayOfWeek,
    profileDayCounts: dayCounts,
    seasonDefinition: {
      winter: "December-February",
      spring: "March-May",
      summer: "June-August",
      autumn: "September-November",
      mapper: "meteorological seasons",
      example: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, season: seasonOfMonth(i + 1) })),
    },
  };
}

async function main() {
  const [flowsData, storyData, temporalData, streetNetwork] = await Promise.all([
    readFile(flowsPath, "utf8").then(JSON.parse),
    readFile(storyPath, "utf8").then(JSON.parse),
    readOptionalJson(temporalPath),
    readFile(streetNetworkPath, "utf8").then(JSON.parse).catch((error) => {
      if (error?.code === "ENOENT") {
        throw new Error("Missing public/data/service_street_network.geojson. Run `npm run data:fetch:street-network` before rebuilding route flows.");
      }
      throw error;
    }),
  ]);

  const graph = buildGraph(streetNetwork);
  const components = componentLabels(graph);
  const largestComponents = new Set(
    components.sizes
      .map((size, id) => ({ id, size }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 40)
      .map((item) => item.id),
  );
  const spatialIndex = buildSpatialIndex(graph.nodes);
  const routeCache = new Map();
  const stationSnapCache = new Map();

  function snapStation(lon, lat, name) {
    const key = `${lon.toFixed(5)},${lat.toFixed(5)}`;
    const cached = stationSnapCache.get(key);
    if (cached) return cached;
    const preferred = nearestNode([lon, lat], graph, spatialIndex, components.labels, largestComponents);
    const fallback = preferred ?? nearestNode([lon, lat], graph, spatialIndex, components.labels, null);
    const snapped = fallback
      ? {
          nodeId: fallback.nodeId,
          nodeKey: graph.nodes[fallback.nodeId].key,
          componentId: components.labels[fallback.nodeId],
          snapDistanceM: Number(fallback.distanceM.toFixed(1)),
          name,
        }
      : null;
    stationSnapCache.set(key, snapped);
    return snapped;
  }

  function routeFlow(flow) {
    const origin = snapStation(flow.oLon, flow.oLat, flow.oName);
    const destination = snapStation(flow.dLon, flow.dLat, flow.dName);
    if (!origin || !destination) return { status: "unsnapped", origin, destination, routeSet: null };

    const cacheKey = `${origin.nodeKey}|${destination.nodeKey}`;
    if (!routeCache.has(cacheKey)) {
      routeCache.set(cacheKey, stochasticRouteSet(graph, components.labels, origin.nodeId, destination.nodeId, cacheKey));
    }

    const routeSet = routeCache.get(cacheKey);
    if (!routeSet) return { status: "unreachable", origin, destination, routeSet: null };
    return { status: "routed", origin, destination, routeSet };
  }

  const routeStats = {
    candidateOdPairs: 0,
    routedOdPairs: 0,
    unroutedOdPairs: 0,
    routedTrips: 0,
    unroutedTrips: 0,
    maxSnapDistanceM: 0,
    maxRouteDistanceM: 0,
    assignedRouteCount: 0,
  };

  const profiles = flowsData.profiles.map((profile) => ({
    id: profile.id,
    label: profile.label,
    group: profile.group,
    hourSlices: profile.hourSlices.filter((slice) => includeSlice(profile.id, slice.hour)).map((slice) => {
      const edgeMap = new Map();
      const sortedFlows = [...(slice.flows ?? [])].sort((a, b) => b.count - a.count).slice(0, maxOdPairsPerSlice);
      const sliceStats = {
        profileId: profile.id,
        hour: slice.hour,
        candidateOdPairs: sortedFlows.length,
        routedOdPairs: 0,
        unroutedOdPairs: 0,
        routedTripCount: 0,
        unroutedTripCount: 0,
        assignedRouteCount: 0,
        maxSnapDistanceM: 0,
      };

      for (const flow of sortedFlows) {
        routeStats.candidateOdPairs += 1;
        const result = routeFlow(flow);
        sliceStats.maxSnapDistanceM = Math.max(
          sliceStats.maxSnapDistanceM,
          result.origin?.snapDistanceM ?? 0,
          result.destination?.snapDistanceM ?? 0,
        );
        if (result.status !== "routed" || !result.routeSet) {
          sliceStats.unroutedOdPairs += 1;
          sliceStats.unroutedTripCount += flow.count;
          routeStats.unroutedOdPairs += 1;
          routeStats.unroutedTrips += flow.count;
          continue;
        }

        sliceStats.routedOdPairs += 1;
        sliceStats.routedTripCount += flow.count;
        routeStats.routedOdPairs += 1;
        routeStats.routedTrips += flow.count;
        routeStats.maxSnapDistanceM = Math.max(routeStats.maxSnapDistanceM, sliceStats.maxSnapDistanceM);
        sliceStats.assignedRouteCount += result.routeSet.routes.length;
        routeStats.assignedRouteCount += result.routeSet.routes.length;

        for (const route of result.routeSet.routes) {
          routeStats.maxRouteDistanceM = Math.max(routeStats.maxRouteDistanceM, route.distanceM);
          const assignedCount = flow.count * route.probability;
          const assignedAverageDaily = averageDaily(assignedCount, profile.id);

          for (const edgeId of route.edgeIds) {
            const edge = graph.edges.get(edgeId);
            if (!edge) continue;
            if (!edgeMap.has(edgeId)) {
              edgeMap.set(edgeId, {
                id: edgeId,
                coordinates: edge.coords,
                category: edge.category,
                lengthM: Number(edge.lengthM.toFixed(1)),
                annualTripCount: 0,
                averageDailyTrips: 0,
                ...(includeEdgeContributors ? { contributors: [] } : {}),
              });
            }
            const edgeRecord = edgeMap.get(edgeId);
            edgeRecord.annualTripCount += assignedCount;
            edgeRecord.averageDailyTrips += assignedAverageDaily;
            if (includeEdgeContributors) {
              addContributor(edgeRecord, flow, assignedCount);
            }
          }
        }
      }

      const rawEdges = [...edgeMap.values()]
        .sort((a, b) => b.averageDailyTrips - a.averageDailyTrips)
        .slice(0, maxEdgesPerSlice)
        .map((edge) => {
          const roundedEdge = {
            ...edge,
            annualTripCount: Math.round(edge.annualTripCount),
            averageDailyTrips: Number(edge.averageDailyTrips.toFixed(2)),
          };
          if (includeEdgeContributors) {
            roundedEdge.contributors = edge.contributors.map((item) => ({ ...item, count: Math.round(item.count) }));
          }
          return roundedEdge;
        });
      const { styledEdges, maxEdgeAverageDailyTrips } = prepareStyledEdges(rawEdges);

      return {
        profileId: profile.id,
        label: profile.label,
        group: profile.group,
        hour: slice.hour,
        timeBucket: slice.timeBucket,
        annualTripCount: slice.tripCount,
        averageDailyTrips: Number(averageDaily(slice.tripCount, profile.id).toFixed(1)),
        edgeCount: styledEdges.length,
        rawEdgeCount: rawEdges.length,
        displayEdgeLimit: Number.isFinite(routeDisplayEdgeLimit) ? routeDisplayEdgeLimit : "all-retained",
        edgeRetention: edgeRetentionMode,
        maxEdgeAverageDailyTrips,
        ...sliceStats,
        maxSnapDistanceM: Number(sliceStats.maxSnapDistanceM.toFixed(1)),
        edges: styledEdges,
      };
    }),
  }));

  let maxAverageDailyTrips = 1;
  for (const profile of profiles) {
    for (const slice of profile.hourSlices) {
      maxAverageDailyTrips = Math.max(maxAverageDailyTrips, slice.maxEdgeAverageDailyTrips ?? 1);
    }
  }
  const styledProfiles = profiles.map((profile) => ({
    ...profile,
    hourSlices: profile.hourSlices.map((slice) => {
      const { styledEdges } = prepareStyledEdges(slice.edges, routeDisplayEdgeLimit, maxAverageDailyTrips);
      return {
        ...slice,
        edges: styledEdges,
      };
    }),
  }));

  const graphSourceLabel = "OSM-derived rideable street network clipped to the Santander Cycles service area";
  const routeModelDescription = "Seeded stochastic multi-route assignment with power-law distance decay over an OSM-derived service-area street network";
  const limitationDescription = "These are inferred route-use allocations, not GPS traces or observed route choice. Routes are assigned on a simplified, undirected OSM street graph within the service area; turn restrictions, one-way rules and detailed bike access constraints are not fully modelled.";

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: "Derived from public/data/flows_hourly.json and public/data/service_street_network.geojson",
      sourceGraph: graphSourceLabel,
      routeModel: routeModelDescription,
      limitation: limitationDescription,
      profileIds: styledProfiles.map((profile) => profile.id),
      dayCounts,
      maxOdPairsPerSlice: Number.isFinite(maxOdPairsPerSlice) ? maxOdPairsPerSlice : "all-retained",
      maxEdgesPerSlice: Number.isFinite(maxEdgesPerSlice) ? maxEdgesPerSlice : "all-retained",
      displayEdgeLimit: Number.isFinite(routeDisplayEdgeLimit) ? routeDisplayEdgeLimit : "all-retained",
      edgeRetention: edgeRetentionMode,
      edgeStyleBasis: "Global absolute strength: sqrt(edge average daily trips / maximum edge average daily trips across all route slices).",
      routeEdgeFormat,
      routeAssignment: {
        model: "candidate-route distance-decay allocation",
        distribution: "power-law",
        alternativeRouteCount,
        detourLimit,
        routePenaltyStep,
        distanceDecayAlpha,
        stochasticJitter,
        assignmentSeed,
      },
      graph: {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.size,
        componentCount: components.sizes.length,
        largestComponentSize: Math.max(...components.sizes),
      },
      routeStats: {
        ...routeStats,
        maxSnapDistanceM: Number(routeStats.maxSnapDistanceM.toFixed(1)),
        maxRouteDistanceM: Number(routeStats.maxRouteDistanceM.toFixed(1)),
      },
      maxAverageDailyTrips: Number(maxAverageDailyTrips.toFixed(2)),
    },
    temporalSummary: buildTemporalSummary(storyData, temporalData),
    profiles: styledProfiles,
  };

  await mkdir(processedDir, { recursive: true });
  await mkdir(publicDataDir, { recursive: true });

  const processedSlicesDir = path.join(processedDir, "route_flows");
  const publicSlicesDir = path.join(publicDataDir, "route_flows");
  await mkdir(processedSlicesDir, { recursive: true });
  await mkdir(publicSlicesDir, { recursive: true });

  const sliceWrites = [];
  const manifestProfiles = output.profiles.map((profile) => ({
    ...profile,
    hourSlices: profile.hourSlices.map((slice) => {
      const sliceName = `${profile.id}_${String(slice.hour).padStart(2, "0")}.json`;
      const slicePath = `data/route_flows/${sliceName}`;
      const slicePayload = maybeCompactRouteSlice({
        ...slice,
        slicePath,
      });

      sliceWrites.push(
        writeFile(path.join(processedSlicesDir, sliceName), `${JSON.stringify(slicePayload)}\n`, "utf8"),
        writeFile(path.join(publicSlicesDir, sliceName), `${JSON.stringify(slicePayload)}\n`, "utf8"),
      );

      return {
        ...slice,
        edges: [],
        slicePath,
        edgeFormat: routeEdgeFormat,
        ...(routeEdgeFormat === "compact-v1" ? { edgeScales: compactEdgeScales } : {}),
      };
    }),
  }));

  const manifestOutput = {
    ...output,
    manifestMode: "sliced-route-flow",
    profiles: manifestProfiles,
  };

  await Promise.all(sliceWrites);
  await writeFile(path.join(processedDir, "route_flows.json"), `${JSON.stringify(manifestOutput)}\n`, "utf8");
  await writeFile(path.join(publicDataDir, "route_flows.json"), `${JSON.stringify(manifestOutput)}\n`, "utf8");

  console.log(`Built inferred route flows for ${profiles.length} profiles`);
  if (targetSliceFilter.size > 0) {
    console.log(`Retained slices: ${[...targetSliceFilter].join(", ")}`);
  }
  console.log(`Graph nodes: ${graph.nodes.length}; graph edges: ${graph.edges.size}`);
  console.log(`Routed OD pairs: ${routeStats.routedOdPairs}; unrouted OD pairs: ${routeStats.unroutedOdPairs}`);
  console.log(`Assigned stochastic routes: ${routeStats.assignedRouteCount}`);
  console.log(`Wrote sliced route-flow payloads to ${path.relative(projectRoot, publicSlicesDir)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
