import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const routeFlowDir = path.join(projectRoot, "public", "data", "route_flows");
const manifestPath = path.join(projectRoot, "public", "data", "route_flows.json");
const displayEdgeLimit = process.env.ROUTE_DISPLAY_MAX_EDGES ? Number(process.env.ROUTE_DISPLAY_MAX_EDGES) : Infinity;
const displayEdgeLimitLabel = Number.isFinite(displayEdgeLimit) ? displayEdgeLimit : "all-retained";
const edgeRetention = Number.isFinite(displayEdgeLimit) ? "debug-top-n" : "all-routed-edges";
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
const compactTierNames = ["context", "support", "focus", "accent"];

function visualTierForStrength(strength) {
  if (strength >= 0.56) return "accent";
  if (strength >= 0.34) return "focus";
  if (strength >= 0.18) return "support";
  return "context";
}

function expandCompactEdge(edge, index, scales = compactEdgeScales) {
  const averageDailyTrips = Number((edge[4] / scales.averageDailyTrips).toFixed(2));
  const strength = Number((edge[5] / scales.strength).toFixed(4));
  const start = [edge[0] / scales.coordinate, edge[1] / scales.coordinate];
  const end = [edge[2] / scales.coordinate, edge[3] / scales.coordinate];
  return {
    id: `${start[0].toFixed(5)},${start[1].toFixed(5)}|${end[0].toFixed(5)},${end[1].toFixed(5)}`,
    coordinates: [start, end],
    averageDailyTrips,
    visualRank: index + 1,
    strength,
    visualTier: compactTierNames[edge[6]] ?? visualTierForStrength(strength),
  };
}

function normalizeEdges(slice) {
  if (slice.edgeFormat !== "compact-v1") return slice.edges;
  const scales = slice.edgeScales ?? compactEdgeScales;
  return slice.edges.map((edge, index) => expandCompactEdge(edge, index, scales));
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

function optimizeSlice(slice) {
  const sourceEdges = normalizeEdges(slice);
  const rawEdgeCount = Number.isFinite(displayEdgeLimit)
    ? (slice.rawEdgeCount ?? slice.edgeCount ?? sourceEdges.length)
    : sourceEdges.length;
  const sortedEdges = [...sourceEdges].sort((left, right) => right.averageDailyTrips - left.averageDailyTrips);
  const retainedEdges = Number.isFinite(displayEdgeLimit) ? sortedEdges.slice(0, displayEdgeLimit) : sortedEdges;
  const maxEdgeAverageDailyTrips = sortedEdges[0]?.averageDailyTrips ?? 1;
  const edges = retainedEdges.map((edge, index) => ({
    ...edge,
    visualRank: index + 1,
    strength: Number(Math.sqrt(Math.min(Math.max(edge.averageDailyTrips / Math.max(maxEdgeAverageDailyTrips, 1), 0), 1)).toFixed(4)),
  })).map((edge) => ({
    ...edge,
    visualTier: visualTierForStrength(edge.strength),
  }));

  return maybeCompactRouteSlice({
    ...slice,
    edgeCount: edges.length,
    rawEdgeCount,
    displayEdgeLimit: displayEdgeLimitLabel,
    edgeRetention,
    maxEdgeAverageDailyTrips: Number(maxEdgeAverageDailyTrips.toFixed(2)),
    edges,
  });
}

const files = (await readdir(routeFlowDir)).filter((file) => file.endsWith(".json")).sort();
let totalBefore = 0;
let totalAfter = 0;

for (const file of files) {
  const fullPath = path.join(routeFlowDir, file);
  const slice = JSON.parse(await readFile(fullPath, "utf8"));
  totalBefore += slice.edges.length;
  const optimized = optimizeSlice(slice);
  totalAfter += optimized.edges.length;
  await writeFile(fullPath, `${JSON.stringify(optimized)}\n`, "utf8");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const optimizedManifest = {
  ...manifest,
  meta: {
    ...manifest.meta,
    displayEdgeLimit: displayEdgeLimitLabel,
    edgeRetention,
    edgeStyleBasis: "Per-slice absolute strength: sqrt(edge average daily trips / maximum edge average daily trips in the same slice).",
    routeEdgeFormat,
  },
  profiles: manifest.profiles.map((profile) => ({
    ...profile,
    hourSlices: profile.hourSlices.map((slice) => ({
      ...slice,
      edgeCount: Number.isFinite(displayEdgeLimit)
        ? Math.min(slice.rawEdgeCount ?? slice.edgeCount ?? displayEdgeLimit, displayEdgeLimit)
        : (slice.rawEdgeCount ?? slice.edgeCount),
      rawEdgeCount: slice.rawEdgeCount ?? slice.edgeCount,
      displayEdgeLimit: displayEdgeLimitLabel,
      edgeRetention,
      edgeFormat: routeEdgeFormat,
      ...(routeEdgeFormat === "compact-v1" ? { edgeScales: compactEdgeScales } : {}),
    })),
  })),
};

await writeFile(manifestPath, `${JSON.stringify(optimizedManifest)}\n`, "utf8");

console.log(`Optimized ${files.length} route-flow slices`);
console.log(`Route edges retained for display: ${totalBefore.toLocaleString("en-GB")} -> ${totalAfter.toLocaleString("en-GB")}`);
