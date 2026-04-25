import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { FilterSpecification, StyleSpecification } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ContourLayer, HeatmapLayer } from "@deck.gl/aggregation-layers";
import { ArcLayer, GeoJsonLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { CompactFlow, CompactHotspot } from "../../types/flows";
import type { OdRouteLensRoute, RouteColorMode, ServiceContextPoiFeature, ServiceLanduseFeature } from "../../types/routeLens";
import type { RouteFlowEdge } from "../../types/routeFlows";
import type { StationInfraMetricRecord, StoryCameraPreset, StoryStationMetric } from "../../types/story";
import "maplibre-gl/dist/maplibre-gl.css";

/* ── types ── */

export type ViewMode = "routes" | "flows" | "stations" | "hotspots" | "infrastructure";
export type ColorScheme = "cool" | "warm" | "purple";
export type FunctionAnchorTone = "blue" | "green" | "orange" | "pink";
export type FunctionAnchor = {
  id: string;
  lon: number;
  lat: number;
  label: string;
  category?: string;
  description?: string;
  evidence?: string;
  tone: FunctionAnchorTone;
  weight?: number;
};
type RouteDisplayMode = "hierarchy" | "all";

type Props = {
  flows: CompactFlow[];
  compareFlows?: CompactFlow[];
  routeEdges?: RouteFlowEdge[];
  hotspots: CompactHotspot[];
  stations: StationInfraMetricRecord[];
  viewMode: ViewMode;
  stationMetric: StoryStationMetric;
  cameraPreset: StoryCameraPreset;
  colorScheme: ColorScheme;
  activeFlowProfileId?: "all" | "weekdays" | "weekends";
  compareFlowProfileId?: "weekdays" | "weekends" | null;
  interactive: boolean;
  globalFlowMax?: number; // if provided, arcs normalize against this instead of local max
  routeFlowMax?: number;
  onRouteHover?: (edge: RouteFlowEdge | null, position: { x: number; y: number } | null) => void;
  onRouteClick?: (edge: RouteFlowEdge | null) => void;
  odRouteLensRoutes?: OdRouteLensRoute[];
  selectedOdRouteId?: string | null;
  hoveredOdRouteId?: string | null;
  showOdRouteLens?: boolean;
  odRouteLensVariant?: "story" | "explore";
  onOdRouteHover?: (route: OdRouteLensRoute | null, position: { x: number; y: number } | null) => void;
  onOdRouteClick?: (route: OdRouteLensRoute | null) => void;
  onStationHover?: (station: StationInfraMetricRecord | null, position: { x: number; y: number } | null) => void;
  stationFilter?: Set<string>; // active station categories for infrastructure view
  showParticles?: boolean;
  showContours?: boolean;
  routeDisplayMode?: RouteDisplayMode;
  routeColorMode?: RouteColorMode;
  selectedRouteEdgeId?: string | null;
  hoveredRouteEdgeId?: string | null;
  focusBounds?: [[number, number], [number, number]] | null;
  functionAnchors?: FunctionAnchor[];
  showHotspotsOverlay?: boolean;
  showStationsOverlay?: boolean;
  showStationBackdrop?: boolean;
  contextPois?: ServiceContextPoiFeature[];
  landuseFeatures?: ServiceLanduseFeature[];
  showPoiLayer?: boolean;
  showLanduseLayer?: boolean;
  selectedPoiId?: string | null;
  selectedLanduseId?: string | null;
  onPoiClick?: (feature: ServiceContextPoiFeature | null) => void;
  onLanduseClick?: (feature: ServiceLanduseFeature | null) => void;
  onFunctionAnchorHover?: (anchor: FunctionAnchor | null, position: { x: number; y: number } | null) => void;
  showContextWater?: boolean;
  onMapReady?: (map: maplibregl.Map | null) => void;
};

/* ── constants ── */

const MIN_ZOOM = 8.1;
const MAX_ZOOM = 14.2;

const innerNetwork: [[number, number], [number, number]] = [[-0.255, 51.446], [0.026, 51.558]];
const reviewFootprint: [[number, number], [number, number]] = [[-0.2246, 51.4571], [-0.011, 51.5457]];
const westLeisure: [[number, number], [number, number]] = [[-0.225, 51.478], [-0.035, 51.545]];
const citySpine: [[number, number], [number, number]] = [[-0.155, 51.488], [-0.045, 51.528]];
const waterAreaFilter = ["==", ["get", "layer"], "water-area"] as FilterSpecification;
const riverLineFilter = ["==", ["get", "layer"], "river-line"] as FilterSpecification;

type CamDef = { bounds: [[number, number], [number, number]]; pitch: number; bearing: number; maxZoom?: number };

const cameras: Record<StoryCameraPreset, CamDef> = {
  hero:           { bounds: innerNetwork, pitch: 0, bearing: 0, maxZoom: 11.0 },
  network:        { bounds: innerNetwork, pitch: 0, bearing: 0, maxZoom: 11.0 },
  review:         { bounds: reviewFootprint, pitch: 0, bearing: 0, maxZoom: 11.8 },
  rhythm:         { bounds: innerNetwork, pitch: 0, bearing: 0, maxZoom: 11.1 },
  commute:        { bounds: citySpine, pitch: 0, bearing: 0, maxZoom: 12.0 },
  weekend:        { bounds: westLeisure, pitch: 0, bearing: 0, maxZoom: 11.4 },
  spatial:        { bounds: innerNetwork, pitch: 0, bearing: 0, maxZoom: 11.0 },
  infrastructure: { bounds: innerNetwork, pitch: 0, bearing: 0, maxZoom: 10.9 },
  conclusion:     { bounds: innerNetwork, pitch: 0, bearing: 0, maxZoom: 11.0 },
};

function getCameraPadding(cameraPreset: StoryCameraPreset, width: number, height: number) {
  if (cameraPreset === "hero") {
    if (width < 768) {
      const edge = 18;
      return { top: edge, right: edge, bottom: Math.max(28, Math.round(height * 0.08)), left: edge };
    }

    return {
      top: 48,
      right: 52,
      bottom: Math.max(64, Math.round(height * 0.18)),
      left: Math.min(Math.max(Math.round(width * 0.18), 180), 300),
    };
  }

  if (cameraPreset === "review") {
    if (width < 900) {
      return {
        top: 24,
        right: 24,
        bottom: Math.max(180, Math.round(height * 0.28)),
        left: 24,
      };
    }

    return {
      top: 44,
      right: 44,
      left: 44,
      bottom: 132,
    };
  }

  if (width < 900) {
    return {
      top: 24,
      right: 24,
      bottom: Math.max(180, Math.round(height * 0.28)),
      left: 24,
    };
  }

  return {
    top: 52,
    right: 56,
    left: 56,
    bottom: 168,
  };
}

const basemapStyle: StyleSpecification = {
  version: 8,
  sources: {
    cartoDark: {
      type: "raster",
      tiles: ["https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png"],
      tileSize: 256,
      attribution: "&copy; OSM &copy; CARTO",
    },
  },
  layers: [
    {
      id: "map-background",
      type: "background",
      paint: {
        "background-color": "#3a4861",
      },
    },
    {
      id: "basemap",
      type: "raster",
      source: "cartoDark",
      paint: {
        "raster-opacity": 0.78,
        "raster-contrast": 0.08,
        "raster-saturation": -0.24,
        "raster-brightness-max": 0.9,
        "raster-brightness-min": 0.34,
      },
    },
  ],
};

/* ── colour palettes ── */

type RGBA = [number, number, number, number];

/* ── colour palettes (bright, saturated for visibility) ── */
const palettes: Record<ColorScheme, {
  src: (r: number) => [number, number, number];
  dst: (r: number) => [number, number, number];
}> = {
  cool: {
    src: (r) => [100 + r * 100, 200 + r * 40, 255],       // bright cyan at origin
    dst: (r) => [200 + r * 55, 230 + r * 25, 255],        // white-blue at destination
  },
  warm: {
    src: (r) => [58 + r * 30, 186 + r * 36, 122 + r * 34],
    dst: (r) => [156 + r * 30, 246, 194 + r * 16],
  },
  purple: {
    src: (r) => [190 + r * 36, 72 + r * 28, 164 + r * 24],
    dst: (r) => [255, 156 + r * 36, 220 + r * 18],
  },
};

const profilePalettes: Record<"weekdays" | "weekends", {
  src: (r: number) => [number, number, number];
  dst: (r: number) => [number, number, number];
}> = {
  weekdays: {
    src: (r) => [85 + r * 70, 170 + r * 45, 255],
    dst: (r) => [208 + r * 35, 236 + r * 12, 255],
  },
  weekends: {
    src: (r) => [68 + r * 34, 186 + r * 36, 122 + r * 32],
    dst: (r) => [182 + r * 20, 242, 204 + r * 12],
  },
};

function paletteForFlowProfile(
  profileId: "all" | "weekdays" | "weekends" | null | undefined,
  colorScheme: ColorScheme,
) {
  if (profileId === "weekdays" || profileId === "weekends") {
    return profilePalettes[profileId];
  }
  return palettes[colorScheme];
}

function rgba(rgb: [number, number, number], a: number): RGBA {
  return [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2]), Math.round(a)];
}

const unifiedRoutePalette = {
  route: [103, 207, 255] as [number, number, number],
  routeLight: [226, 247, 255] as [number, number, number],
  anchor: [103, 207, 255] as [number, number, number],
};

function mixRgb(left: [number, number, number], right: [number, number, number], ratio: number): [number, number, number] {
  const t = clamp01(ratio);
  return [
    left[0] + (right[0] - left[0]) * t,
    left[1] + (right[1] - left[1]) * t,
    left[2] + (right[2] - left[2]) * t,
  ];
}

function metricVal(s: StationInfraMetricRecord, m: StoryStationMetric) {
  switch (m) {
    case "capacity": return s.capacity;
    case "annualTrips": return s.annualTrips;
    case "weekdayAMTrips": return s.weekdayAMTrips;
    case "weekendMiddayTrips": return s.weekendMiddayTrips;
    case "lowStressScore": return s.lowStressScore;
    case "deficitClass": return s.deficitClass === "demand-infrastructure-mismatch" ? 100 : s.lowStressScore;
    default: return s.annualTrips;
  }
}

function stationColor(s: StationInfraMetricRecord, m: StoryStationMetric): RGBA {
  if (m === "deficitClass") {
    // Only show 2 meaningful categories, everything else nearly invisible
    if (s.deficitClass === "demand-infrastructure-mismatch") return [255, 60, 80, 255]; // bright red
    if (s.deficitClass === "high-flow-high-support") return [60, 230, 120, 255]; // bright green
    // All other stations: very faint
    return [120, 150, 180, 30];
  }
  if (m === "lowStressScore") {
    const r = Math.min(s.lowStressScore / 100, 1);
    return [80 + r * 120, 130 + r * 80, 255, 170 + r * 50];
  }

  // Heatmap for trip-based metrics
  if (m === "weekdayAMTrips" || m === "annualTrips" || m === "weekendMiddayTrips") {
    const val = metricVal(s, m);
    const ceiling = m === "annualTrips" ? 40000 : m === "weekdayAMTrips" ? 4000 : 3000;
    const r = Math.min(val / ceiling, 1);
    // Dark blue → cyan → yellow → bright white
    if (r < 0.33) {
      const t = r / 0.33;
      return [30 + t * 40, 60 + t * 100, 140 + t * 80, 120 + t * 60];
    }
    if (r < 0.66) {
      const t = (r - 0.33) / 0.33;
      return [70 + t * 185, 160 + t * 60, 220 - t * 60, 180 + t * 40];
    }
    const t = (r - 0.66) / 0.34;
    return [255, 220 + t * 35, 160 + t * 60, 220 + t * 20];
  }

  // Default: capacity
  return [150, 218, 255, 185];
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function flowStrength(flow: CompactFlow, flowMax: number) {
  return Math.sqrt(clamp01(flow.count / flowMax));
}

function routeStrength(edge: RouteFlowEdge, routeMax: number) {
  return Math.sqrt(clamp01(edge.averageDailyTrips / routeMax));
}

function routeVisualStrength(edge: RouteFlowEdge, routeMax: number) {
  return edge.strength ?? routeStrength(edge, routeMax);
}

function editorialRouteColor(edge: RouteFlowEdge, routeMax: number, _colorScheme: ColorScheme): RGBA {
  const strength = routeVisualStrength(edge, routeMax);
  const palette = unifiedRoutePalette;
  return rgba(mixRgb(palette.route, palette.routeLight, 0.18 + strength * 0.68), 112 + Math.round(strength * 80));
}

function intensityRouteColor(edge: RouteFlowEdge, routeMax: number): RGBA {
  const strength = routeVisualStrength(edge, routeMax);
  const cold: [number, number, number] = [78, 188, 255];
  const mid: [number, number, number] = [255, 217, 91];
  const hot: [number, number, number] = [255, 89, 139];
  const rgb = strength < 0.5
    ? mixRgb(cold, mid, strength / 0.5)
    : mixRgb(mid, hot, (strength - 0.5) / 0.5);

  return rgba(rgb, 86 + Math.round(strength * 136));
}

function editorialRouteHalo(edge: RouteFlowEdge, routeMax: number): RGBA {
  const strength = routeVisualStrength(edge, routeMax);
  return [235, 248, 255, 44 + Math.round(strength * 68)] as RGBA;
}

function editorialRouteContext(edge: RouteFlowEdge, routeMax: number): RGBA {
  const strength = routeVisualStrength(edge, routeMax);
  return [118, 145, 178, 18 + Math.round(strength * 28)] as RGBA;
}

function routeColorForMode(edge: RouteFlowEdge, routeMax: number, colorScheme: ColorScheme, routeColorMode: RouteColorMode): RGBA {
  if (routeColorMode === "intensity") return intensityRouteColor(edge, routeMax);
  return editorialRouteColor(edge, routeMax, colorScheme);
}

function withSelectionOpacity(
  color: RGBA,
  edge: RouteFlowEdge,
  selectedRouteEdgeId: string | null | undefined,
  selectedOdRouteId: string | null | undefined = null,
): RGBA {
  if (selectedRouteEdgeId) {
    return edge.id === selectedRouteEdgeId ? color : [color[0], color[1], color[2], Math.round(color[3] * 0.28)];
  }
  if (selectedOdRouteId) return [color[0], color[1], color[2], Math.round(color[3] * 0.48)];
  return color;
}

function odRouteColor(route: OdRouteLensRoute, routeColorMode: RouteColorMode): RGBA {
  const strength = clamp01(route.strength);
  if (routeColorMode === "intensity") {
    const cold: [number, number, number] = [44, 180, 255];
    const mid: [number, number, number] = [255, 203, 64];
    const hot: [number, number, number] = [255, 72, 126];
    const rgb = strength < 0.5
      ? mixRgb(cold, mid, strength / 0.5)
      : mixRgb(mid, hot, (strength - 0.5) / 0.5);
    return rgba(rgb, 138 + Math.round(strength * 108));
  }
  return rgba(mixRgb([82, 218, 255], [234, 252, 255], 0.08 + strength * 0.62), 116 + Math.round(strength * 96));
}

function withOdRouteSelectionOpacity(
  color: RGBA,
  route: OdRouteLensRoute,
  selectedOdRouteId: string | null | undefined,
  hoveredOdRouteId: string | null | undefined,
): RGBA {
  if (selectedOdRouteId) {
    return route.id === selectedOdRouteId ? color : [color[0], color[1], color[2], Math.round(color[3] * 0.18)];
  }
  if (hoveredOdRouteId) {
    return route.id === hoveredOdRouteId ? color : [color[0], color[1], color[2], Math.round(color[3] * 0.72)];
  }
  return color;
}

function poiCategoryColor(category: ServiceContextPoiFeature["properties"]["category"]): RGBA {
  switch (category) {
    case "transit":
      return [78, 188, 255, 178];
    case "office-work":
      return [82, 151, 255, 164];
    case "food-night":
      return [255, 89, 139, 176];
    case "retail":
      return [255, 177, 94, 164];
    case "culture-tourism":
      return [191, 119, 255, 168];
    case "education":
      return [106, 224, 188, 158];
    case "health":
      return [255, 118, 118, 168];
    case "civic":
      return [224, 240, 255, 152];
    case "sport-leisure":
      return [100, 225, 143, 168];
    default:
      return [210, 226, 250, 128];
  }
}

function landuseCategoryColor(category: ServiceLanduseFeature["properties"]["category"]): RGBA {
  switch (category) {
    case "commercial":
      return [82, 151, 255, 82];
    case "retail":
      return [255, 177, 94, 78];
    case "residential":
      return [190, 205, 226, 42];
    case "education-civic":
      return [106, 224, 188, 70];
    case "leisure-park":
      return [100, 225, 143, 86];
    case "industrial":
      return [181, 119, 255, 66];
    default:
      return [190, 205, 226, 38];
  }
}

function routeCssColor(_colorScheme: ColorScheme) {
  const [red, green, blue] = unifiedRoutePalette.route;
  return `rgb(${red}, ${green}, ${blue})`;
}

function functionAnchorColors(tone: FunctionAnchorTone) {
  if (tone === "green") {
    return [86, 211, 142, 156] as RGBA;
  }
  if (tone === "orange") {
    return [242, 176, 126, 152] as RGBA;
  }
  if (tone === "pink") {
    return [226, 78, 179, 156] as RGBA;
  }
  return [92, 149, 255, 156] as RGBA;
}

function quantileOfSorted(values: number[], ratio: number) {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * ratio)));
  return values[index];
}

function arcHeight(cameraPreset: StoryCameraPreset, strength: number) {
  switch (cameraPreset) {
    case "hero":
      return 0.34 + strength * 0.94;
    case "rhythm":
      return 0.3 + strength * 0.82;
    case "commute":
      return 0.28 + strength * 0.74;
    case "weekend":
      return 0.32 + strength * 0.76;
    case "conclusion":
      return 0.28 + strength * 0.68;
    default:
      return 0.22 + strength * 0.56;
  }
}

function interpolateParticle(flow: CompactFlow, t: number, laneOffset: number) {
  const ox = flow.oLon;
  const oy = flow.oLat;
  const dx = flow.dLon;
  const dy = flow.dLat;
  const vx = dx - ox;
  const vy = dy - oy;
  const length = Math.max(Math.hypot(vx, vy), 0.0001);
  const nx = -vy / length;
  const ny = vx / length;
  const bow = Math.sin(t * Math.PI) * (0.012 + Math.min(length * 0.22, 0.028));

  return [
    ox + vx * t + nx * (bow + laneOffset),
    oy + vy * t + ny * (bow * 0.8 + laneOffset * 0.65),
  ] as [number, number];
}

function distanceToScreenSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const wx = point.x - start.x;
  const wy = point.y - start.y;
  const lengthSquared = vx * vx + vy * vy;
  if (lengthSquared <= 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp01((wx * vx + wy * vy) / lengthSquared);
  return Math.hypot(point.x - (start.x + vx * t), point.y - (start.y + vy * t));
}

function distanceToScreenPolyline(
  point: { x: number; y: number },
  projected: Array<{ x: number; y: number }>,
) {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < projected.length; index += 1) {
    nearest = Math.min(nearest, distanceToScreenSegment(point, projected[index - 1], projected[index]));
  }
  return nearest;
}

function pointInRing(point: [number, number], ring: number[][]) {
  let inside = false;
  const [x, y] = point;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygon(point: [number, number], polygon: number[][][]) {
  if (!pointInRing(point, polygon[0] ?? [])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

function landuseContainsPoint(feature: ServiceLanduseFeature, point: [number, number]) {
  if (feature.geometry.type === "Polygon") {
    return pointInPolygon(point, feature.geometry.coordinates as number[][][]);
  }

  return (feature.geometry.coordinates as number[][][][]).some((polygon) => pointInPolygon(point, polygon));
}

/* ── component ── */

export function OdFlowMapCanvas({
  flows, compareFlows = [], routeEdges = [], hotspots, stations, viewMode, stationMetric, cameraPreset, colorScheme, activeFlowProfileId = "all", compareFlowProfileId = null, interactive, globalFlowMax, routeFlowMax, onRouteHover, onRouteClick, onStationHover, stationFilter,
  odRouteLensRoutes = [],
  selectedOdRouteId = null,
  hoveredOdRouteId = null,
  showOdRouteLens = false,
  odRouteLensVariant = "explore",
  onOdRouteHover,
  onOdRouteClick,
  showParticles = false, showContours = false,
  routeDisplayMode = "hierarchy",
  routeColorMode = "unified",
  selectedRouteEdgeId = null,
  hoveredRouteEdgeId = null,
  focusBounds = null,
  functionAnchors = [],
  showHotspotsOverlay = false,
  showStationsOverlay = false,
  showStationBackdrop = true,
  contextPois = [],
  landuseFeatures = [],
  showPoiLayer = false,
  showLanduseLayer = false,
  selectedPoiId = null,
  selectedLanduseId = null,
  onPoiClick,
  onLanduseClick,
  onFunctionAnchorHover,
  showContextWater = false,
  onMapReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const mapLoadedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [particlePhase, setParticlePhase] = useState(0);

  const localFlowMax = useMemo(() => Math.max(...flows.map((f) => f.count), 1), [flows]);
  const flowMax = globalFlowMax && globalFlowMax > 0 ? globalFlowMax : localFlowMax;
  const localRouteMax = useMemo(() => Math.max(...routeEdges.map((edge) => edge.averageDailyTrips), 1), [routeEdges]);
  const resolvedRouteMax = routeFlowMax && routeFlowMax > 0 ? routeFlowMax : localRouteMax;
  const hotMax = useMemo(() => Math.max(...hotspots.map((h) => h.act), 1), [hotspots]);
  const stnMax = useMemo(
    () => Math.max(...stations.map((s) => metricVal(s, stationMetric)), 1),
    [stations, stationMetric],
  );
  const sortedFlows = useMemo(() => [...flows].sort((a, b) => a.count - b.count), [flows]);
  const sortedCompareFlows = useMemo(() => [...compareFlows].sort((a, b) => a.count - b.count), [compareFlows]);
  const routeEdgesHaveVisualTiers = useMemo(() => routeEdges.some((edge) => edge.visualTier), [routeEdges]);
  const sortedRouteEdges = useMemo(
    () => routeEdgesHaveVisualTiers ? routeEdges : [...routeEdges].sort((a, b) => a.averageDailyTrips - b.averageDailyTrips),
    [routeEdges, routeEdgesHaveVisualTiers],
  );
  const sortedRouteValues = useMemo(
    () => routeEdgesHaveVisualTiers ? [] : sortedRouteEdges.map((edge) => edge.averageDailyTrips),
    [routeEdgesHaveVisualTiers, sortedRouteEdges],
  );
  const routeContextCutoff = useMemo(() => Math.max(quantileOfSorted(sortedRouteValues, 0.5), 0.05), [sortedRouteValues]);
  const routeSupportCutoff = useMemo(() => Math.max(quantileOfSorted(sortedRouteValues, 0.74), 0.1), [sortedRouteValues]);
  const routeFocusCutoff = useMemo(() => Math.max(quantileOfSorted(sortedRouteValues, 0.88), 0.16), [sortedRouteValues]);
  const routeAccentCutoff = useMemo(() => Math.max(quantileOfSorted(sortedRouteValues, 0.96), 0.28), [sortedRouteValues]);
  const contextRouteEdges = useMemo(
    () => routeEdgesHaveVisualTiers
      ? routeEdges
      : sortedRouteEdges.filter((edge) => edge.averageDailyTrips >= routeContextCutoff),
    [routeContextCutoff, routeEdges, routeEdgesHaveVisualTiers, sortedRouteEdges],
  );
  const supportRouteEdges = useMemo(
    () => routeEdgesHaveVisualTiers
      ? routeEdges.filter((edge) => edge.visualTier !== "context")
      : sortedRouteEdges.filter((edge) => edge.averageDailyTrips >= routeSupportCutoff),
    [routeEdges, routeEdgesHaveVisualTiers, routeSupportCutoff, sortedRouteEdges],
  );
  const focusRouteEdges = useMemo(
    () => routeEdgesHaveVisualTiers
      ? routeEdges.filter((edge) => edge.visualTier === "focus" || edge.visualTier === "accent")
      : sortedRouteEdges.filter((edge) => edge.averageDailyTrips >= routeFocusCutoff),
    [routeEdges, routeEdgesHaveVisualTiers, routeFocusCutoff, sortedRouteEdges],
  );
  const accentRouteEdges = useMemo(
    () => routeEdgesHaveVisualTiers
      ? routeEdges.filter((edge) => edge.visualTier === "accent")
      : sortedRouteEdges.filter((edge) => edge.averageDailyTrips >= routeAccentCutoff),
    [routeAccentCutoff, routeEdges, routeEdgesHaveVisualTiers, sortedRouteEdges],
  );
  const clickableRouteEdges = useMemo(() => {
    return routeEdges;
  }, [routeEdges]);
  const visibleOdRoutes = useMemo(
    () => showOdRouteLens ? odRouteLensRoutes.filter((route) => route.coordinates.length >= 2) : [],
    [odRouteLensRoutes, showOdRouteLens],
  );
  const odLensWidth = odRouteLensVariant === "story"
    ? { haloBase: 1.5, haloScale: 2.2, lineBase: 0.75, lineScale: 1.95, selectedBase: 2.6, selectedScale: 1.8 }
    : { haloBase: 1.7, haloScale: 2.8, lineBase: 0.86, lineScale: 2.28, selectedBase: 3.0, selectedScale: 2.05 };
  const highlightedOdRoutes = useMemo(() => {
    const highlightedIds = new Set([selectedOdRouteId, hoveredOdRouteId].filter(Boolean));
    if (highlightedIds.size === 0) return [];
    return visibleOdRoutes.filter((route) => highlightedIds.has(route.id));
  }, [hoveredOdRouteId, selectedOdRouteId, visibleOdRoutes]);
  const highlightedRouteEdges = useMemo(() => {
    const highlightedIds = new Set([selectedRouteEdgeId, hoveredRouteEdgeId].filter(Boolean));
    if (highlightedIds.size === 0) return [];
    return clickableRouteEdges.filter((edge) => highlightedIds.has(edge.id));
  }, [clickableRouteEdges, hoveredRouteEdgeId, selectedRouteEdgeId]);
  useEffect(() => {
    if (!showParticles) return undefined;

    const interval = window.setInterval(() => {
      setParticlePhase((prev) => (prev + 0.018) % 1);
    }, 90);

    return () => window.clearInterval(interval);
  }, [showParticles]);

  /* ── mount map (once) ── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle,
      center: [-0.105, 51.508],
      zoom: 11.2,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      pitch: cameras.hero.pitch,
      bearing: cameras.hero.bearing,
    });

    map.scrollZoom.disable();
    map.doubleClickZoom.disable();
    map.keyboard.disable();
    map.dragPan.disable();
    map.dragRotate.disable();
    mapRef.current = map;
    if (import.meta.env.DEV) {
      (window as unknown as { __bikeMap?: maplibregl.Map }).__bikeMap = map;
    }

    map.on("load", () => {
      map.addSource("boroughs", {
        type: "geojson",
        data: `${import.meta.env.BASE_URL}data/london-boroughs.geojson`,
      });
      map.addSource("outline", {
        type: "geojson",
        data: `${import.meta.env.BASE_URL}data/london-outline.geojson`,
      });
      if (showContextWater) {
        map.addSource("context-water", {
          type: "geojson",
          data: `${import.meta.env.BASE_URL}data/service_water.geojson`,
        });
      }

      map.addLayer({
        id: "borough-mask", type: "fill", source: "boroughs",
        paint: { "fill-color": "#1d2739", "fill-opacity": 0.22 },
      });
      map.addLayer({
        id: "borough-fill", type: "fill", source: "boroughs",
        paint: { "fill-color": "#53627f", "fill-opacity": 0.05 },
      });
      if (showContextWater) {
        map.addLayer({
          id: "context-water-area",
          type: "fill",
          source: "context-water",
          filter: waterAreaFilter,
          paint: {
            "fill-color": "#75cfff",
            "fill-opacity": 0.11,
            "fill-outline-color": "rgba(178, 226, 255, 0.17)",
          },
        });
        map.addLayer({
          id: "context-water-line",
          type: "line",
          source: "context-water",
          filter: riverLineFilter,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#6bb9e9",
            "line-opacity": 0.16,
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 5.5, 11.5, 16],
            "line-blur": 1.4,
          },
        });
      }
      map.addLayer({
        id: "borough-line", type: "line", source: "boroughs",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "rgba(181,198,224,0.13)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8.5, 0.36, 12, 0.66],
        },
      });
      map.addLayer({
        id: "borough-active-outline", type: "line", source: "boroughs",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "rgba(214,231,255,0.19)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8.5, 0.48, 12, 0.78],
          "line-blur": 0.08,
        },
      });
      map.addLayer({
        id: "outline-glow", type: "line", source: "outline",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "rgba(170,194,235,0.05)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8.5, 0.9, 12, 1.45],
          "line-blur": 1.05,
        },
      });
      map.addLayer({
        id: "outline-stroke", type: "line", source: "outline",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "rgba(128,145,178,0.12)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8.5, 0.34, 12, 0.58],
        },
      });
      try {
        map.addSource("route-flow", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "route-flow-native-halo",
          type: "line",
          source: "route-flow",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "rgba(255,255,250,0.78)",
            "line-opacity": 0,
            "line-width": 7,
          },
        });
        map.addLayer({
          id: "route-flow-native-core",
          type: "line",
          source: "route-flow",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#1f745e",
            "line-opacity": 0,
            "line-width": 3.8,
          },
        });
      } catch (error) {
        console.warn("Route-flow native layer failed to initialise", error);
      }

      const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
      map.addControl(overlay as unknown as maplibregl.IControl);
      overlayRef.current = overlay;
      mapLoadedRef.current = true;
      setMapReady(true);
      onMapReady?.(map);
    });

    return () => {
      if (overlayRef.current && mapRef.current)
        mapRef.current.removeControl(overlayRef.current as unknown as maplibregl.IControl);
      map.remove();
      overlayRef.current = null;
      mapRef.current = null;
      mapLoadedRef.current = false;
      onMapReady?.(null);
    };
  }, [onMapReady, showContextWater]);

  /* ── camera changes ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    if (interactive) {
      map.dragPan.enable();
      map.scrollZoom.enable();
      map.dragRotate.enable();
    } else {
      map.dragPan.disable();
      map.scrollZoom.disable();
      map.dragRotate.disable();
    }

    const cam = cameras[cameraPreset];
    const bounds = focusBounds ?? cam.bounds;
    const viewportWidth = containerRef.current?.clientWidth ?? window.innerWidth;
    const viewportHeight = containerRef.current?.clientHeight ?? window.innerHeight;
    const resolved = map.cameraForBounds(bounds, {
      padding: getCameraPadding(cameraPreset, viewportWidth, viewportHeight),
      maxZoom: cam.maxZoom ?? MAX_ZOOM,
    });
    if (resolved) {
      map.easeTo({
        ...resolved,
        pitch: cam.pitch,
        bearing: cam.bearing,
        duration: 1800,
        essential: true,
      });
    }
  }, [cameraPreset, focusBounds, interactive, mapReady]);

  /* ── deck layers ── */
  const showRoutes = viewMode === "routes";
  const showArcs = viewMode === "flows";
  const showAllRouteEdges = showRoutes && routeDisplayMode === "all";
  const showStationMetric = viewMode === "stations" || viewMode === "infrastructure";
  const showStations = showStationMetric || showStationsOverlay;
  const showHotspots = viewMode === "hotspots" || showHotspotsOverlay;
  const showInfra = viewMode === "infrastructure";
  const infraDim = showInfra ? 0.72 : 1;
  const activeFlowPalette = paletteForFlowProfile(activeFlowProfileId, colorScheme);
  const compareFlowPalette = paletteForFlowProfile(compareFlowProfileId, colorScheme);
  const showCompareFlows = showArcs && compareFlowProfileId !== null && sortedCompareFlows.length > 0;
  const serviceBoroughCodes = useMemo(
    () => [...new Set(stations.map((station) => station.boroughCode).filter((value): value is string => Boolean(value)))],
    [stations],
  );

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const source = mapRef.current.getSource("route-flow") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    if (mapRef.current.getLayer("route-flow-native-core")) {
      mapRef.current.setPaintProperty("route-flow-native-core", "line-color", routeCssColor(colorScheme));
    }

    if (import.meta.env.DEV) {
      (window as unknown as { __routeEdgeCount?: number }).__routeEdgeCount = focusRouteEdges.length;
    }

    source.setData({
      type: "FeatureCollection",
      features: [],
    });
  }, [colorScheme, focusRouteEdges.length, mapReady, showRoutes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || serviceBoroughCodes.length === 0) return;

    const activeFilter = ["in", "gss_code", ...serviceBoroughCodes] as unknown as FilterSpecification;
    const inactiveFilter = ["!in", "gss_code", ...serviceBoroughCodes] as unknown as FilterSpecification;

    if (map.getLayer("borough-mask")) {
      map.setFilter("borough-mask", inactiveFilter);
    }
    if (map.getLayer("borough-fill")) {
      map.setFilter("borough-fill", activeFilter);
    }
    if (map.getLayer("borough-line")) {
      map.setFilter("borough-line", null);
    }
    if (map.getLayer("borough-active-outline")) {
      map.setFilter("borough-active-outline", activeFilter);
    }
  }, [mapReady, serviceBoroughCodes]);

  const particlePoints = useMemo(() => {
    if (!showParticles || sortedFlows.length === 0) return [];

    const visibleFlows = sortedFlows.slice(-90);

    return visibleFlows.flatMap((flow, flowIndex) => {
      const strength = flowStrength(flow, flowMax);
      const particleCount = strength > 0.82 ? 2 : 1;
      const laneSpread = 0.00045 + strength * 0.00065;

      return Array.from({ length: particleCount }, (_, particleIndex) => {
        const basePhase = (particlePhase * (0.52 + strength * 0.88) + flowIndex * 0.071 + particleIndex * 0.23) % 1;
        const laneOffset = (particleIndex - (particleCount - 1) / 2) * laneSpread;
        const [lon, lat] = interpolateParticle(flow, basePhase, laneOffset);

        return {
          lon,
          lat,
          radius: 0.9 + strength * 1.25,
          color: rgba(activeFlowPalette.dst(0.42 + strength * 0.58), 72 + Math.round(strength * 58)),
        };
      });
    });
  }, [activeFlowPalette, flowMax, particlePhase, showParticles, sortedFlows]);

  const contourLevels = useMemo(
    () => [
      { threshold: hotMax * 0.14, color: [82, 154, 255, 54] as RGBA, strokeWidth: 1 },
      { threshold: hotMax * 0.28, color: [104, 192, 255, 92] as RGBA, strokeWidth: 1.4 },
      { threshold: hotMax * 0.46, color: [154, 186, 255, 132] as RGBA, strokeWidth: 2.1 },
      { threshold: hotMax * 0.68, color: [255, 166, 214, 166] as RGBA, strokeWidth: 2.8 },
    ],
    [hotMax],
  );

  const showcaseFlows = useMemo(() => {
    if (!showRoutes || sortedFlows.length === 0) return [];
    return sortedFlows.filter((flow) => flow.oName !== flow.dName || flow.oLon !== flow.dLon || flow.oLat !== flow.dLat);
  }, [showRoutes, sortedFlows]);

  const showcaseFlowMax = useMemo(() => Math.max(...showcaseFlows.map((flow) => flow.count), 1), [showcaseFlows]);
  const anchorTotals = useMemo(() => {
    const origins = new Map<string, { lon: number; lat: number; name: string; count: number }>();
    const destinations = new Map<string, { lon: number; lat: number; name: string; count: number }>();

    for (const flow of showcaseFlows) {
      const origin = origins.get(flow.oName) ?? { lon: flow.oLon, lat: flow.oLat, name: flow.oName, count: 0 };
      origin.count += flow.count;
      origins.set(flow.oName, origin);

      const destination = destinations.get(flow.dName) ?? { lon: flow.dLon, lat: flow.dLat, name: flow.dName, count: 0 };
      destination.count += flow.count;
      destinations.set(flow.dName, destination);
    }

    return {
      origins: [...origins.values()].sort((left, right) => left.count - right.count),
      destinations: [...destinations.values()].sort((left, right) => left.count - right.count),
    };
  }, [showcaseFlows]);
  const anchorMax = useMemo(
    () => Math.max(...anchorTotals.origins.map((anchor) => anchor.count), ...anchorTotals.destinations.map((anchor) => anchor.count), 1),
    [anchorTotals.destinations, anchorTotals.origins],
  );
  const routePalette = unifiedRoutePalette;

  const layers = useMemo(
    () => [
      new GeoJsonLayer<ServiceLanduseFeature>({
        id: "service-landuse-context",
        data: { type: "FeatureCollection", features: landuseFeatures } as never,
        visible: showLanduseLayer && landuseFeatures.length > 0,
        pickable: Boolean(onLanduseClick),
        filled: true,
        stroked: true,
        autoHighlight: Boolean(onLanduseClick),
        highlightColor: [255, 248, 214, 78] as RGBA,
        getFillColor: (feature: unknown) => {
          const typedFeature = feature as ServiceLanduseFeature;
          const color = landuseCategoryColor(typedFeature.properties.category);
          if (selectedLanduseId && typedFeature.properties.id !== selectedLanduseId) {
            return [color[0], color[1], color[2], Math.round(color[3] * 0.52)] as RGBA;
          }
          if (selectedLanduseId === typedFeature.properties.id) {
            return [color[0], color[1], color[2], Math.min(142, Math.round(color[3] * 1.65))] as RGBA;
          }
          return color;
        },
        getLineColor: (feature: unknown) => {
          const typedFeature = feature as ServiceLanduseFeature;
          return selectedLanduseId === typedFeature.properties.id
            ? [255, 248, 214, 210] as RGBA
            : [197, 219, 250, 36] as RGBA;
        },
        lineWidthMinPixels: selectedLanduseId ? 0.72 : 0.25,
        parameters: { depthTest: false } as never,
        onClick: (info: { object?: ServiceLanduseFeature }) => {
          onLanduseClick?.(info.object ?? null);
          return Boolean(info.object);
        },
        onHover: (info: { object?: ServiceLanduseFeature }) => {
          if (mapRef.current && onLanduseClick) {
            mapRef.current.getCanvas().style.cursor = info.object ? "pointer" : "";
          }
        },
        updateTriggers: {
          getFillColor: [selectedLanduseId],
          getLineColor: [selectedLanduseId],
        },
      }),

      new ScatterplotLayer<ServiceContextPoiFeature>({
        id: "service-poi-context",
        data: contextPois,
        visible: showPoiLayer && contextPois.length > 0,
        pickable: Boolean(onPoiClick),
        autoHighlight: Boolean(onPoiClick),
        highlightColor: [255, 248, 214, 92] as RGBA,
        radiusUnits: "pixels" as const,
        radiusMinPixels: 1.6,
        radiusMaxPixels: 5.6,
        stroked: false,
        getPosition: (feature) => feature.geometry.coordinates,
        getRadius: (feature) => {
          const base = feature.properties.category === "transit" ? 3.5 : feature.properties.category === "food-night" ? 3.1 : 2.4;
          return selectedPoiId === feature.properties.id ? base + 2.8 : base;
        },
        getFillColor: (feature) => {
          const color = poiCategoryColor(feature.properties.category);
          if (selectedPoiId && feature.properties.id !== selectedPoiId) {
            return [color[0], color[1], color[2], Math.round(color[3] * 0.42)] as RGBA;
          }
          return selectedPoiId === feature.properties.id
            ? [255, 248, 214, 232] as RGBA
            : color;
        },
        parameters: { depthTest: false } as never,
        onClick: (info: { object?: ServiceContextPoiFeature }) => {
          onPoiClick?.(info.object ?? null);
          return Boolean(info.object);
        },
        onHover: (info: { object?: ServiceContextPoiFeature }) => {
          if (mapRef.current && onPoiClick) {
            mapRef.current.getCanvas().style.cursor = info.object ? "pointer" : "";
          }
        },
        updateTriggers: {
          getRadius: [selectedPoiId],
          getFillColor: [selectedPoiId],
        },
      }),

      new PathLayer<RouteFlowEdge>({
        id: "route-flow-context",
        data: contextRouteEdges,
        visible: showRoutes && contextRouteEdges.length > 0,
        pickable: false,
        widthUnits: "pixels" as const,
        widthMinPixels: 1,
        widthMaxPixels: 7,
        jointRounded: true,
        capRounded: true,
        getPath: (edge) => edge.coordinates,
        getWidth: (edge) => showAllRouteEdges ? 0.72 + routeVisualStrength(edge, resolvedRouteMax) * 0.72 : 0.8 + routeVisualStrength(edge, resolvedRouteMax) * 3.2,
        getColor: (edge) => withSelectionOpacity(
          showAllRouteEdges
            ? routeColorMode === "intensity"
              ? intensityRouteColor(edge, resolvedRouteMax)
              : rgba(routePalette.routeLight, 34 + Math.round(routeVisualStrength(edge, resolvedRouteMax) * 68))
            : editorialRouteContext(edge, resolvedRouteMax),
          edge,
          selectedRouteEdgeId,
          selectedOdRouteId,
        ),
        opacity: showAllRouteEdges ? 1 : 0.84,
        updateTriggers: {
          getColor: [routeColorMode, resolvedRouteMax, selectedRouteEdgeId, selectedOdRouteId],
          getWidth: [resolvedRouteMax, showAllRouteEdges],
        },
      }),

      new PathLayer<RouteFlowEdge>({
        id: "route-flow-support",
        data: supportRouteEdges,
        visible: showRoutes && supportRouteEdges.length > 0,
        pickable: false,
        widthUnits: "pixels" as const,
        widthMinPixels: 1,
        widthMaxPixels: 8,
        jointRounded: true,
        capRounded: true,
        getPath: (edge) => edge.coordinates,
        getWidth: (edge) => showAllRouteEdges ? 0.82 + routeVisualStrength(edge, resolvedRouteMax) * 0.98 : 0.95 + routeVisualStrength(edge, resolvedRouteMax) * 4.6,
        getColor: (edge) => withSelectionOpacity(
          showAllRouteEdges
            ? routeColorMode === "intensity"
              ? intensityRouteColor(edge, resolvedRouteMax)
              : rgba(routePalette.route, 42 + Math.round(routeVisualStrength(edge, resolvedRouteMax) * 110))
            : rgba(routePalette.routeLight, 42 + Math.round(routeVisualStrength(edge, resolvedRouteMax) * 34)),
          edge,
          selectedRouteEdgeId,
          selectedOdRouteId,
        ),
        opacity: showAllRouteEdges ? 0.94 : 0.46,
        updateTriggers: {
          getColor: [routeColorMode, resolvedRouteMax, selectedRouteEdgeId, selectedOdRouteId],
          getWidth: [resolvedRouteMax, showAllRouteEdges],
        },
      }),

      new PathLayer<RouteFlowEdge>({
        id: "route-flow-halo",
        data: showAllRouteEdges ? accentRouteEdges : focusRouteEdges,
        visible: showRoutes && (showAllRouteEdges ? accentRouteEdges.length > 0 : focusRouteEdges.length > 0),
        pickable: false,
        widthUnits: "pixels" as const,
        widthMinPixels: 2,
        widthMaxPixels: 15,
        jointRounded: true,
        capRounded: true,
        getPath: (edge) => edge.coordinates,
        getWidth: (edge) => showAllRouteEdges ? 1.15 + routeVisualStrength(edge, resolvedRouteMax) * 0.95 : 2.2 + routeVisualStrength(edge, resolvedRouteMax) * 10.5,
        getColor: (edge) => withSelectionOpacity(editorialRouteHalo(edge, resolvedRouteMax), edge, selectedRouteEdgeId, selectedOdRouteId),
        opacity: showAllRouteEdges ? 0.38 : 0.92,
        updateTriggers: {
          getColor: [resolvedRouteMax, selectedRouteEdgeId, selectedOdRouteId],
          getWidth: [resolvedRouteMax, showAllRouteEdges],
        },
      }),

      new PathLayer<RouteFlowEdge>({
        id: "route-flow-streets",
        data: showAllRouteEdges ? accentRouteEdges : focusRouteEdges,
        visible: showRoutes && (showAllRouteEdges ? accentRouteEdges.length > 0 : focusRouteEdges.length > 0),
        pickable: false,
        widthUnits: "pixels" as const,
        widthMinPixels: 1,
        widthMaxPixels: 9,
        jointRounded: true,
        capRounded: true,
        getPath: (edge) => edge.coordinates,
        getWidth: (edge) => showAllRouteEdges ? 0.95 + routeVisualStrength(edge, resolvedRouteMax) * 1.1 : 0.95 + routeVisualStrength(edge, resolvedRouteMax) * 6.9,
        getColor: (edge) => withSelectionOpacity(
          routeColorForMode(edge, resolvedRouteMax, colorScheme, routeColorMode),
          edge,
          selectedRouteEdgeId,
          selectedOdRouteId,
        ),
        opacity: 0.98,
        updateTriggers: {
          getColor: [colorScheme, routeColorMode, resolvedRouteMax, selectedRouteEdgeId, selectedOdRouteId],
          getWidth: [resolvedRouteMax, showAllRouteEdges],
        },
      }),

      new PathLayer<RouteFlowEdge>({
        id: "route-flow-highlight",
        data: highlightedRouteEdges,
        visible: showRoutes && highlightedRouteEdges.length > 0,
        pickable: false,
        widthUnits: "pixels" as const,
        widthMinPixels: 3,
        widthMaxPixels: 13,
        jointRounded: true,
        capRounded: true,
        getPath: (edge) => edge.coordinates,
        getWidth: (edge) => selectedRouteEdgeId === edge.id ? 5.2 : 3.4,
        getColor: (edge) => selectedRouteEdgeId === edge.id ? [255, 248, 214, 248] as RGBA : [255, 255, 255, 168] as RGBA,
        parameters: { depthTest: false } as never,
      }),

      new PathLayer<OdRouteLensRoute>({
        id: "od-route-lens-halo",
        data: visibleOdRoutes,
        visible: showRoutes && showOdRouteLens && visibleOdRoutes.length > 0,
        pickable: false,
        widthUnits: "pixels" as const,
        widthMinPixels: 1.4,
        widthMaxPixels: 9,
        jointRounded: true,
        capRounded: true,
        getPath: (route) => route.coordinates,
        getWidth: (route) => odLensWidth.haloBase + clamp01(route.strength) * odLensWidth.haloScale,
        getColor: (route) => withOdRouteSelectionOpacity(
          [226, 247, 255, 18 + Math.round(clamp01(route.strength) * 38)] as RGBA,
          route,
          selectedOdRouteId,
          hoveredOdRouteId,
        ),
        parameters: { depthTest: false } as never,
        updateTriggers: {
          getColor: [selectedOdRouteId, hoveredOdRouteId],
          getWidth: [odLensWidth.haloBase, odLensWidth.haloScale],
        },
      }),

      new PathLayer<OdRouteLensRoute>({
        id: "od-route-lens-routes",
        data: visibleOdRoutes,
        visible: showRoutes && showOdRouteLens && visibleOdRoutes.length > 0,
        pickable: false,
        widthUnits: "pixels" as const,
        widthMinPixels: 0.7,
        widthMaxPixels: 7,
        jointRounded: true,
        capRounded: true,
        getPath: (route) => route.coordinates,
        getWidth: (route) => odLensWidth.lineBase + clamp01(route.strength) * odLensWidth.lineScale,
        getColor: (route) => withOdRouteSelectionOpacity(
          odRouteColor(route, routeColorMode),
          route,
          selectedOdRouteId,
          hoveredOdRouteId,
        ),
        parameters: { depthTest: false } as never,
        updateTriggers: {
          getColor: [routeColorMode, selectedOdRouteId, hoveredOdRouteId],
          getWidth: [odLensWidth.lineBase, odLensWidth.lineScale],
        },
      }),

      new PathLayer<OdRouteLensRoute>({
        id: "od-route-lens-selected",
        data: highlightedOdRoutes,
        visible: showRoutes && showOdRouteLens && highlightedOdRoutes.length > 0,
        pickable: false,
        widthUnits: "pixels" as const,
        widthMinPixels: 2,
        widthMaxPixels: 9,
        jointRounded: true,
        capRounded: true,
        getPath: (route) => route.coordinates,
        getWidth: (route) => selectedOdRouteId === route.id
          ? odLensWidth.selectedBase + clamp01(route.strength) * odLensWidth.selectedScale
          : Math.max(2, odLensWidth.lineBase + clamp01(route.strength) * 1.2),
        getColor: (route) => selectedOdRouteId === route.id ? [255, 248, 214, 246] as RGBA : [255, 255, 255, 162] as RGBA,
        parameters: { depthTest: false } as never,
        updateTriggers: {
          getColor: [selectedOdRouteId],
          getWidth: [selectedOdRouteId, odLensWidth.lineBase, odLensWidth.selectedBase, odLensWidth.selectedScale],
        },
      }),

      new PathLayer<RouteFlowEdge>({
        id: "route-flow-hit-target",
        data: clickableRouteEdges,
        visible: showRoutes && Boolean(onRouteHover || onRouteClick) && clickableRouteEdges.length > 0,
        pickable: true,
        widthUnits: "pixels" as const,
        widthMinPixels: 10,
        widthMaxPixels: 16,
        jointRounded: true,
        capRounded: true,
        getPath: (edge) => edge.coordinates,
        getWidth: () => 12,
        getColor: [255, 255, 255, 1] as RGBA,
        opacity: 0.01,
        onHover: (info: { object?: RouteFlowEdge; x?: number; y?: number }) => {
          if (mapRef.current) {
            mapRef.current.getCanvas().style.cursor = info.object ? "pointer" : "";
          }
          if (!onRouteHover) return;
          if (info.object && info.x !== undefined && info.y !== undefined) {
            onRouteHover(info.object, { x: info.x, y: info.y });
          } else {
            onRouteHover(null, null);
          }
        },
        onClick: (info: { object?: RouteFlowEdge }) => {
          if (!onRouteClick) return false;
          onRouteClick(info.object ?? null);
          return true;
        },
      }),

      new ArcLayer<CompactFlow>({
        id: "route-od-connectors",
        data: showcaseFlows,
        visible: showRoutes && showcaseFlows.length > 0,
        pickable: false,
        greatCircle: false,
        getSourcePosition: (flow) => [flow.oLon, flow.oLat],
        getTargetPosition: (flow) => [flow.dLon, flow.dLat],
        getWidth: (flow) => 0.45 + Math.sqrt(clamp01(flow.count / showcaseFlowMax)) * 0.35,
        getHeight: (flow) => 0.08 + Math.sqrt(clamp01(flow.count / showcaseFlowMax)) * 0.12,
        widthUnits: "pixels" as const,
        getSourceColor: (flow) => rgba(routePalette.routeLight, 34 + Math.round(Math.sqrt(clamp01(flow.count / showcaseFlowMax)) * 28)),
        getTargetColor: (flow) => rgba(routePalette.routeLight, 40 + Math.round(Math.sqrt(clamp01(flow.count / showcaseFlowMax)) * 36)),
        opacity: 0.62,
      }),

      new ScatterplotLayer({
        id: "route-origin-anchors",
        data: anchorTotals.origins,
        visible: showRoutes && anchorTotals.origins.length > 0,
        pickable: false,
        radiusUnits: "pixels" as const,
        radiusMinPixels: 3,
        radiusMaxPixels: 9,
        stroked: true,
        lineWidthMinPixels: 1.2,
        getPosition: (anchor: { lon: number; lat: number }) => [anchor.lon, anchor.lat],
        getRadius: (anchor: { count: number }) => 2.8 + Math.sqrt(clamp01(anchor.count / anchorMax)) * 5.2,
        getFillColor: [255, 255, 255, 228] as RGBA,
        getLineColor: rgba(routePalette.anchor, 232),
        parameters: { depthTest: false },
      }),

      new ScatterplotLayer({
        id: "route-destination-anchors",
        data: anchorTotals.destinations,
        visible: showRoutes && anchorTotals.destinations.length > 0,
        pickable: false,
        radiusUnits: "pixels" as const,
        radiusMinPixels: 3,
        radiusMaxPixels: 11,
        stroked: true,
        lineWidthMinPixels: 1,
        getPosition: (anchor: { lon: number; lat: number }) => [anchor.lon, anchor.lat],
        getRadius: (anchor: { count: number }) => 3.3 + Math.sqrt(clamp01(anchor.count / anchorMax)) * 6.8,
        getFillColor: rgba(routePalette.route, 232),
        getLineColor: [255, 255, 255, 240] as RGBA,
        parameters: { depthTest: false },
      }),

      new ScatterplotLayer<FunctionAnchor>({
        id: "function-anchor-core",
        data: functionAnchors,
        visible: showRoutes && functionAnchors.length > 0,
        pickable: true,
        radiusUnits: "pixels" as const,
        radiusMinPixels: 4,
        radiusMaxPixels: 18,
        stroked: false,
        getPosition: (anchor) => [anchor.lon, anchor.lat],
        getRadius: (anchor) => 5.2 + (anchor.weight ?? 1) * 5.6,
        getFillColor: (anchor) => functionAnchorColors(anchor.tone),
        onHover: (info: { object?: FunctionAnchor; x?: number; y?: number }) => {
          if (!onFunctionAnchorHover) return;
          if (info.object && info.x !== undefined && info.y !== undefined) {
            onFunctionAnchorHover(info.object, { x: info.x, y: info.y });
          } else {
            onFunctionAnchorHover(null, null);
          }
        },
      }),

      new ScatterplotLayer({
        id: "stn-bg",
        data: stations,
        visible: (showStationBackdrop && showRoutes) || showStations || showHotspots,
        pickable: false,
        radiusUnits: "pixels" as const,
        radiusMinPixels: 1,
        radiusMaxPixels: 5,
        getPosition: (s: StationInfraMetricRecord) => [s.lon, s.lat],
        getRadius: showRoutes
          ? routeEdges.length === 0 && sortedFlows.length === 0
            ? 2.3
            : 1.2
          : 1.4,
        getFillColor: showRoutes
          ? routeEdges.length === 0 && sortedFlows.length === 0
            ? [116, 191, 255, 138] as RGBA
            : [146, 185, 255, 36] as RGBA
          : [200, 220, 240, 44] as RGBA,
        parameters: { depthTest: false },
      }),

      new ArcLayer({
        id: "compare-arc-aura",
        data: sortedCompareFlows,
        visible: showCompareFlows,
        pickable: false,
        greatCircle: false,
        getSourcePosition: (f: CompactFlow) => [f.oLon, f.oLat],
        getTargetPosition: (f: CompactFlow) => [f.dLon, f.dLat],
        getWidth: (f: CompactFlow) => {
          const strength = flowStrength(f, flowMax);
          return 1.25 + strength * 1.05;
        },
        getHeight: (f: CompactFlow) => arcHeight(cameraPreset, flowStrength(f, flowMax)) * 0.84,
        widthUnits: "pixels" as const,
        getSourceColor: (f: CompactFlow) => {
          const strength = flowStrength(f, flowMax);
          return rgba(compareFlowPalette.src(0.26 + strength * 0.52), 12 + Math.round(strength * 18));
        },
        getTargetColor: (f: CompactFlow) => {
          const strength = flowStrength(f, flowMax);
          return rgba(compareFlowPalette.dst(0.24 + strength * 0.52), 12 + Math.round(strength * 18));
        },
        opacity: 0.28 * infraDim,
        parameters: { depthTest: false },
      }),

      new ArcLayer({
        id: "compare-arc-body",
        data: sortedCompareFlows,
        visible: showCompareFlows,
        pickable: false,
        greatCircle: false,
        getSourcePosition: (f: CompactFlow) => [f.oLon, f.oLat],
        getTargetPosition: (f: CompactFlow) => [f.dLon, f.dLat],
        getWidth: (f: CompactFlow) => {
          const strength = flowStrength(f, flowMax);
          return 0.5 + strength * 0.34;
        },
        getHeight: (f: CompactFlow) => arcHeight(cameraPreset, flowStrength(f, flowMax)) * 0.84,
        widthUnits: "pixels" as const,
        getSourceColor: (f: CompactFlow) => {
          const strength = flowStrength(f, flowMax);
          return rgba(compareFlowPalette.src(0.34 + strength * 0.52), 84 + Math.round(strength * 30));
        },
        getTargetColor: (f: CompactFlow) => {
          const strength = flowStrength(f, flowMax);
          return rgba(compareFlowPalette.dst(0.34 + strength * 0.52), 88 + Math.round(strength * 28));
        },
        opacity: 0.46 * infraDim,
        parameters: { depthTest: false },
      }),

      new ArcLayer({
        id: "arc-aura",
        data: sortedFlows,
        visible: showArcs,
        pickable: false,
        greatCircle: false,
        getSourcePosition: (f: CompactFlow) => [f.oLon, f.oLat],
        getTargetPosition: (f: CompactFlow) => [f.dLon, f.dLat],
        getWidth: (f: CompactFlow) => {
          const strength = flowStrength(f, flowMax);
          return 1.85 + strength * 1.7;
        },
        getHeight: (f: CompactFlow) => arcHeight(cameraPreset, flowStrength(f, flowMax)),
        widthUnits: "pixels" as const,
        getSourceColor: (f: CompactFlow) => {
          const strength = flowStrength(f, flowMax);
          return rgba(activeFlowPalette.src(0.32 + strength * 0.68), 26 + Math.round(strength * 36));
        },
        getTargetColor: (f: CompactFlow) => {
          const strength = flowStrength(f, flowMax);
          return rgba(activeFlowPalette.dst(0.3 + strength * 0.7), 24 + Math.round(strength * 34));
        },
        opacity: 0.52 * infraDim,
        parameters: { depthTest: false },
      }),

      new ArcLayer({
        id: "arc-body",
        data: sortedFlows,
        visible: showArcs,
        pickable: false,
        greatCircle: false,
        getSourcePosition: (f: CompactFlow) => [f.oLon, f.oLat],
        getTargetPosition: (f: CompactFlow) => [f.dLon, f.dLat],
        getWidth: (f: CompactFlow) => {
          const strength = flowStrength(f, flowMax);
          return 0.72 + strength * 0.54;
        },
        getHeight: (f: CompactFlow) => arcHeight(cameraPreset, flowStrength(f, flowMax)),
        widthUnits: "pixels" as const,
        getSourceColor: (f: CompactFlow) => {
          const strength = flowStrength(f, flowMax);
          return rgba(activeFlowPalette.src(0.38 + strength * 0.62), 210 + Math.round(strength * 45));
        },
        getTargetColor: (f: CompactFlow) => {
          const strength = flowStrength(f, flowMax);
          return rgba(activeFlowPalette.dst(0.34 + strength * 0.66), 214 + Math.round(strength * 41));
        },
        opacity: 0.94 * infraDim,
        parameters: { depthTest: false },
      }),

      new ArcLayer({
        id: "arc-core",
        data: sortedFlows,
        visible: showArcs,
        pickable: false,
        greatCircle: false,
        getSourcePosition: (f: CompactFlow) => [f.oLon, f.oLat],
        getTargetPosition: (f: CompactFlow) => [f.dLon, f.dLat],
        getWidth: (f: CompactFlow) => {
          const strength = flowStrength(f, flowMax);
          return 0.18 + strength * 0.14;
        },
        getHeight: (f: CompactFlow) => arcHeight(cameraPreset, flowStrength(f, flowMax)),
        widthUnits: "pixels" as const,
        getSourceColor: () => {
          return [232, 244, 255, 255] as RGBA;
        },
        getTargetColor: () => {
          return [255, 242, 247, 255] as RGBA;
        },
        opacity: 0.94 * infraDim,
        parameters: { depthTest: false },
      }),

      new ScatterplotLayer({
        id: "flow-particles",
        data: particlePoints,
        visible: showParticles && particlePoints.length > 0,
        pickable: false,
        radiusUnits: "pixels" as const,
        radiusMinPixels: 0.7,
        radiusMaxPixels: 2.8,
        getPosition: (d: { lon: number; lat: number }) => [d.lon, d.lat],
        getRadius: (d: { radius: number }) => d.radius,
        getFillColor: (d: { color: RGBA }) => d.color,
        parameters: { depthTest: false, blend: true },
        opacity: 0.58,
      }),

      new ContourLayer<CompactHotspot>({
        id: "hotspot-contours",
        data: hotspots,
        visible: showHotspots && showContours && hotspots.length > 0,
        pickable: false,
        cellSize: 240,
        contours: contourLevels,
        getPosition: (h: CompactHotspot) => [h.lon, h.lat],
        getWeight: (h: CompactHotspot) => h.act,
      }),

      new HeatmapLayer<CompactHotspot>({
        id: "hotspot-heatmap",
        data: hotspots,
        visible: showHotspots && hotspots.length > 0,
        pickable: false,
        getPosition: (h: CompactHotspot) => [h.lon, h.lat],
        getWeight: (h: CompactHotspot) => h.act,
        radiusPixels: 45,
        intensity: 1.2,
        threshold: 0.04,
        colorRange: [
          [16, 28, 88, 140],
          [0, 116, 255, 170],
          [0, 229, 255, 188],
          [143, 118, 255, 206],
          [255, 78, 196, 226],
          [255, 208, 74, 245],
        ],
        opacity: 0.88,
      }),

      new ScatterplotLayer({
        id: "stn-metric",
        data: stations,
        visible: showStations,
        pickable: showStations,
        radiusUnits: "pixels" as const,
        radiusMinPixels: showRoutes ? 1.4 : showInfra ? 5 : 3,
        radiusMaxPixels: showRoutes ? 3.2 : showInfra ? 14 : 20,
        stroked: true,
        lineWidthMinPixels: showInfra ? 0.5 : 1,
        getPosition: (s: StationInfraMetricRecord) => [s.lon, s.lat],
        getRadius: (s: StationInfraMetricRecord) => {
          if (showRoutes) {
            return 1.8;
          }
          if (showInfra && stationFilter && !stationFilter.has(s.deficitClass)) {
            return 2; // shrink filtered-out stations
          }
          return showInfra
            ? 5 + (metricVal(s, stationMetric) / stnMax) * 6
            : 4 + (metricVal(s, stationMetric) / stnMax) * 12;
        },
        getFillColor: (s: StationInfraMetricRecord) => {
          if (showRoutes) {
            return [224, 236, 220, 62] as RGBA;
          }
          const baseColor = stationColor(s, stationMetric);
          if (stationMetric === "deficitClass" && stationFilter && !stationFilter.has(s.deficitClass)) {
            return [baseColor[0], baseColor[1], baseColor[2], 0] as RGBA; // invisible
          }
          return baseColor;
        },
        getLineColor: showRoutes ? [10, 15, 18, 70] as RGBA : showInfra ? [10, 15, 25, 120] as RGBA : [230, 244, 255, 180] as RGBA,
        parameters: { depthTest: false },
        onHover: (info: { object?: StationInfraMetricRecord; x?: number; y?: number }) => {
          if (onStationHover) {
            if (info.object && info.x !== undefined && info.y !== undefined) {
              onStationHover(info.object, { x: info.x, y: info.y });
            } else {
              onStationHover(null, null);
            }
          }
        },
      }),
    ],
    [accentRouteEdges, activeFlowPalette, anchorMax, anchorTotals.destinations, anchorTotals.origins, cameraPreset, clickableRouteEdges, colorScheme, compareFlowPalette, contextPois, contextRouteEdges, contourLevels, flowMax, focusRouteEdges, functionAnchors, highlightedOdRoutes, highlightedRouteEdges, hotMax, hotspots, hoveredOdRouteId, infraDim, landuseFeatures, odLensWidth.haloBase, odLensWidth.haloScale, odLensWidth.lineBase, odLensWidth.lineScale, odLensWidth.selectedBase, odLensWidth.selectedScale, onFunctionAnchorHover, onLanduseClick, onPoiClick, onRouteClick, onRouteHover, onStationHover, particlePoints, resolvedRouteMax, routeColorMode, routeDisplayMode, routePalette.anchor, routePalette.route, routePalette.routeLight, selectedLanduseId, selectedOdRouteId, selectedPoiId, selectedRouteEdgeId, showcaseFlowMax, showcaseFlows, showAllRouteEdges, showArcs, showCompareFlows, showContours, showHotspots, showInfra, showLanduseLayer, showOdRouteLens, showParticles, showPoiLayer, showRoutes, showStationBackdrop, showStations, sortedCompareFlows, sortedFlows, sortedRouteEdges, stationFilter, stationMetric, stations, stnMax, supportRouteEdges, visibleOdRoutes],
  );

  /* ── push layers to overlay ── */
  useEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.setProps({
      layers,
      onClick: (info: { object?: unknown }) => {
        if (!showRoutes || info.object) return false;
        if (onOdRouteClick && showOdRouteLens) return false;
        if (onRouteClick) onRouteClick(null);
        return false;
      },
    });
  }, [layers, mapReady, onOdRouteClick, onRouteClick, showOdRouteLens, showRoutes]);

  const resolveNearestOdRoute = useCallback((point: { x: number; y: number }, thresholdPixels = 24) => {
    if (!mapRef.current || visibleOdRoutes.length === 0) return null;
    let nearestRoute: OdRouteLensRoute | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const route of visibleOdRoutes) {
      const projected = route.coordinates.map((coordinate) => mapRef.current!.project(coordinate));
      const distance = distanceToScreenPolyline(point, projected);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestRoute = route;
      }
    }

    return nearestDistance <= thresholdPixels ? nearestRoute : null;
  }, [visibleOdRoutes]);

  function resolveNearestContextPoi(point: { x: number; y: number }) {
    if (!mapRef.current || !showPoiLayer || !onPoiClick || contextPois.length === 0) return null;
    let nearestPoi: ServiceContextPoiFeature | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const feature of contextPois) {
      const projected = mapRef.current.project(feature.geometry.coordinates);
      const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPoi = feature;
      }
    }

    return nearestDistance <= 8 ? nearestPoi : null;
  }

  function resolveLanduseFeatureAtPoint(point: { x: number; y: number }) {
    if (!mapRef.current || !showLanduseLayer || !onLanduseClick || landuseFeatures.length === 0) return null;
    const coordinate = mapRef.current.unproject([point.x, point.y]);
    const lngLat: [number, number] = [coordinate.lng, coordinate.lat];

    return landuseFeatures.find((feature) => landuseContainsPoint(feature, lngLat)) ?? null;
  }

  const eventPoint = useCallback((event: PointerEvent) => {
    if (!containerRef.current) return null;
    const bounds = containerRef.current.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  }, []);

  const handleCanvasPointerDown = useCallback((event: PointerEvent) => {
    if (!showRoutes || !mapRef.current || !containerRef.current) return;
    const clickPoint = eventPoint(event);
    if (!clickPoint) return;

    const nearestPoi = resolveNearestContextPoi(clickPoint);
    if (nearestPoi) {
      onPoiClick?.(nearestPoi);
      return;
    }

    if (onOdRouteClick && showOdRouteLens) {
      const nearestRoute = resolveNearestOdRoute(clickPoint, 26);
      if (nearestRoute) {
        onOdRouteClick(nearestRoute);
        return;
      }

      const selectedLanduse = resolveLanduseFeatureAtPoint(clickPoint);
      if (selectedLanduse) {
        onLanduseClick?.(selectedLanduse);
        return;
      }

      onOdRouteClick(null);
      onPoiClick?.(null);
      onLanduseClick?.(null);
      return;
    }

    if (!onRouteClick || routeEdges.length === 0) return;
    let nearestEdge: RouteFlowEdge | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const edge of routeEdges) {
      const start = mapRef.current.project(edge.coordinates[0]);
      const end = mapRef.current.project(edge.coordinates[1]);
      const distance = distanceToScreenSegment(clickPoint, start, end);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestEdge = edge;
      }
    }

    onRouteClick(nearestDistance <= 14 ? nearestEdge : null);
  }, [eventPoint, onLanduseClick, onOdRouteClick, onPoiClick, onRouteClick, resolveLanduseFeatureAtPoint, resolveNearestContextPoi, resolveNearestOdRoute, routeEdges, showOdRouteLens, showRoutes]);

  const handleCanvasPointerMove = useCallback((event: PointerEvent) => {
    if (!showRoutes || !showOdRouteLens || !mapRef.current) return;
    const point = eventPoint(event);
    if (!point) return;

    if (resolveNearestContextPoi(point)) {
      mapRef.current.getCanvas().style.cursor = "pointer";
      if (onOdRouteHover) onOdRouteHover(null, null);
      return;
    }

    const nearestRoute = resolveNearestOdRoute(point, 22);
    if (nearestRoute) {
      mapRef.current.getCanvas().style.cursor = "pointer";
      if (onOdRouteHover) onOdRouteHover(nearestRoute, point);
      return;
    }

    mapRef.current.getCanvas().style.cursor = resolveLanduseFeatureAtPoint(point) ? "pointer" : "";
    if (onOdRouteHover) onOdRouteHover(null, null);
  }, [eventPoint, onOdRouteHover, resolveLanduseFeatureAtPoint, resolveNearestContextPoi, resolveNearestOdRoute, showOdRouteLens, showRoutes]);

  const handleCanvasPointerLeave = useCallback(() => {
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = "";
    if (onOdRouteHover) onOdRouteHover(null, null);
  }, [onOdRouteHover]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || (!onRouteClick && !onOdRouteClick && !onOdRouteHover && !onPoiClick && !onLanduseClick)) return undefined;
    container.addEventListener("pointerdown", handleCanvasPointerDown, { capture: true });
    container.addEventListener("pointermove", handleCanvasPointerMove, { passive: true });
    container.addEventListener("pointerleave", handleCanvasPointerLeave, { passive: true });
    return () => {
      container.removeEventListener("pointerdown", handleCanvasPointerDown, { capture: true });
      container.removeEventListener("pointermove", handleCanvasPointerMove);
      container.removeEventListener("pointerleave", handleCanvasPointerLeave);
    };
  }, [handleCanvasPointerDown, handleCanvasPointerLeave, handleCanvasPointerMove, onLanduseClick, onOdRouteClick, onOdRouteHover, onPoiClick, onRouteClick]);

  return <div ref={containerRef} className="gl-canvas" />;
}
