import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ContourLayer, HeatmapLayer } from "@deck.gl/aggregation-layers";
import { ArcLayer, GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { CompactFlow, CompactHotspot } from "../../types/flows";
import type { StationInfraMetricRecord, StoryCameraPreset, StoryStationMetric } from "../../types/story";
import "maplibre-gl/dist/maplibre-gl.css";

/* ── types ── */

export type ViewMode = "flows" | "stations" | "hotspots" | "infrastructure";
export type ColorScheme = "cool" | "warm" | "purple";

type Props = {
  flows: CompactFlow[];
  compareFlows?: CompactFlow[];
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
  onStationHover?: (station: StationInfraMetricRecord | null, position: { x: number; y: number } | null) => void;
  stationFilter?: Set<string>; // active station categories for infrastructure view
  showParticles?: boolean;
  showContours?: boolean;
};

/* ── constants ── */

const MIN_ZOOM = 8.1;
const MAX_ZOOM = 14.2;

const innerNetwork: [[number, number], [number, number]] = [[-0.255, 51.446], [0.026, 51.558]];
const westLeisure: [[number, number], [number, number]] = [[-0.225, 51.478], [-0.035, 51.545]];
const citySpine: [[number, number], [number, number]] = [[-0.155, 51.488], [-0.045, 51.528]];

type CamDef = { bounds: [[number, number], [number, number]]; pitch: number; bearing: number; maxZoom?: number };

const cameras: Record<StoryCameraPreset, CamDef> = {
  hero:           { bounds: innerNetwork, pitch: 54, bearing: -16, maxZoom: 11.2 },
  network:        { bounds: innerNetwork, pitch: 40, bearing: -10, maxZoom: 11.0 },
  rhythm:         { bounds: innerNetwork, pitch: 48, bearing: -14, maxZoom: 11.1 },
  commute:        { bounds: citySpine, pitch: 58, bearing: -18, maxZoom: 12.4 },
  weekend:        { bounds: westLeisure, pitch: 50, bearing: -8, maxZoom: 11.6 },
  spatial:        { bounds: innerNetwork, pitch: 34, bearing: -8, maxZoom: 11.0 },
  infrastructure: { bounds: innerNetwork, pitch: 32, bearing: -10, maxZoom: 10.9 },
  conclusion:     { bounds: innerNetwork, pitch: 42, bearing: -12, maxZoom: 11.0 },
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
  layers: [{
    id: "basemap",
    type: "raster",
    source: "cartoDark",
    paint: {
      "raster-opacity": 0.94,
      "raster-contrast": 0.24,
      "raster-saturation": -0.48,
      "raster-brightness-max": 0.8,
      "raster-brightness-min": 0.04,
    },
  }],
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
    src: (r) => [255, 140 + r * 60, 60 + r * 40],         // vivid orange
    dst: (r) => [255, 200 + r * 40, 140 + r * 40],        // warm peach-white
  },
  purple: {
    src: (r) => [120 + r * 40, 80 + r * 20, 220 + r * 35],
    dst: (r) => [90 + r * 60, 90 + r * 40, 240],
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
    src: (r) => [230 + r * 25, 170 + r * 45, 64 + r * 28],
    dst: (r) => [255, 226 + r * 16, 154 + r * 26],
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

function infraColor(cat: string): RGBA {
  if (cat === "protected") return [100, 230, 255, 155];
  if (cat === "quiet") return [180, 238, 255, 145];
  if (cat === "painted") return [80, 160, 255, 105];
  return [70, 105, 140, 70];
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function flowStrength(flow: CompactFlow, flowMax: number) {
  return Math.sqrt(clamp01(flow.count / flowMax));
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

/* ── component ── */

export function OdFlowMapCanvas({
  flows, compareFlows = [], hotspots, stations, viewMode, stationMetric, cameraPreset, colorScheme, activeFlowProfileId = "all", compareFlowProfileId = null, interactive, globalFlowMax, onStationHover, stationFilter,
  showParticles = false, showContours = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const mapLoadedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [particlePhase, setParticlePhase] = useState(0);

  const localFlowMax = useMemo(() => Math.max(...flows.map((f) => f.count), 1), [flows]);
  const flowMax = globalFlowMax && globalFlowMax > 0 ? globalFlowMax : localFlowMax;
  const hotMax = useMemo(() => Math.max(...hotspots.map((h) => h.act), 1), [hotspots]);
  const stnMax = useMemo(
    () => Math.max(...stations.map((s) => metricVal(s, stationMetric)), 1),
    [stations, stationMetric],
  );
  const sortedFlows = useMemo(() => [...flows].sort((a, b) => a.count - b.count), [flows]);
  const sortedCompareFlows = useMemo(() => [...compareFlows].sort((a, b) => a.count - b.count), [compareFlows]);

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
      center: [-0.11, 51.505],
      zoom: 9.5,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      pitch: cameras.hero.pitch,
      bearing: cameras.hero.bearing,
      attributionControl: false,
    });

    map.scrollZoom.disable();
    map.doubleClickZoom.disable();
    map.keyboard.disable();
    map.dragPan.disable();
    map.dragRotate.disable();
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("boroughs", {
        type: "geojson",
        data: `${import.meta.env.BASE_URL}data/london-boroughs.geojson`,
      });
      map.addSource("outline", {
        type: "geojson",
        data: `${import.meta.env.BASE_URL}data/london-outline.geojson`,
      });

      map.addLayer({
        id: "borough-fill", type: "fill", source: "boroughs",
        paint: { "fill-color": "#08131d", "fill-opacity": 0.22 },
      });
      map.addLayer({
        id: "borough-line", type: "line", source: "boroughs",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "rgba(172,208,246,0.22)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8.5, 0.55, 12, 1.4],
        },
      });
      map.addLayer({
        id: "outline-glow", type: "line", source: "outline",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "rgba(86,188,255,0.34)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8.5, 7, 12, 12],
          "line-blur": 5,
        },
      });
      map.addLayer({
        id: "outline-stroke", type: "line", source: "outline",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "rgba(228,242,255,0.88)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8.5, 1.5, 12, 2.8],
        },
      });

      const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
      map.addControl(overlay as unknown as maplibregl.IControl);
      overlayRef.current = overlay;
      mapLoadedRef.current = true;
      setMapReady(true);
    });

    return () => {
      if (overlayRef.current && mapRef.current)
        mapRef.current.removeControl(overlayRef.current as unknown as maplibregl.IControl);
      map.remove();
      overlayRef.current = null;
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, []);

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
    const viewportWidth = containerRef.current?.clientWidth ?? window.innerWidth;
    const viewportHeight = containerRef.current?.clientHeight ?? window.innerHeight;
    const resolved = map.cameraForBounds(cam.bounds, {
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
  }, [cameraPreset, interactive, mapReady]);

  /* ── deck layers ── */
  const showArcs = viewMode === "flows" || viewMode === "infrastructure";
  const showStations = viewMode === "stations" || viewMode === "infrastructure";
  const showHotspots = viewMode === "hotspots";
  const showInfra = viewMode === "infrastructure";
  const showInfraLines = false; // DISABLED: infrastructure GeoJSON too confusing
  const infraDim = showInfra ? 0.72 : 1;
  const activeFlowPalette = paletteForFlowProfile(activeFlowProfileId, colorScheme);
  const compareFlowPalette = paletteForFlowProfile(compareFlowProfileId, colorScheme);
  const showCompareFlows = showArcs && compareFlowProfileId !== null && sortedCompareFlows.length > 0;

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

  const layers = useMemo(
    () => [
      new GeoJsonLayer({
        id: "infra",
        data: `${import.meta.env.BASE_URL}data/cycle_infrastructure.geojson`,
        visible: showInfraLines,
        pickable: false,
        parameters: { depthTest: false },
        lineWidthUnits: "pixels" as const,
        lineWidthMinPixels: 1,
        getLineWidth: (f: { properties?: { category?: string } }) =>
          f.properties?.category === "protected" || f.properties?.category === "quiet" ? 2.4 : 1.2,
        getLineColor: (f: { properties?: { category?: string } }) =>
          infraColor(f.properties?.category ?? ""),
        opacity: 0.82,
      }),

      new ScatterplotLayer({
        id: "stn-bg",
        data: stations,
        visible: showStations || showHotspots,
        pickable: false,
        radiusUnits: "pixels" as const,
        radiusMinPixels: 1,
        radiusMaxPixels: 3,
        getPosition: (s: StationInfraMetricRecord) => [s.lon, s.lat],
        getRadius: 1.4,
        getFillColor: [200, 220, 240, 44] as RGBA,
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
          [0, 25, 80, 160],     // deep navy
          [0, 100, 200, 180],   // blue
          [0, 200, 180, 190],   // cyan-teal
          [120, 230, 80, 200],  // green-yellow
          [255, 200, 0, 220],   // amber
          [255, 80, 20, 240],   // red-orange
        ],
        opacity: 0.75,
      }),

      new ScatterplotLayer({
        id: "stn-metric",
        data: stations,
        visible: showStations,
        pickable: showStations,
        radiusUnits: "pixels" as const,
        radiusMinPixels: showInfra ? 5 : 3,
        radiusMaxPixels: showInfra ? 14 : 20,
        stroked: true,
        lineWidthMinPixels: showInfra ? 0.5 : 1,
        getPosition: (s: StationInfraMetricRecord) => [s.lon, s.lat],
        getRadius: (s: StationInfraMetricRecord) => {
          if (showInfra && stationFilter && !stationFilter.has(s.deficitClass)) {
            return 2; // shrink filtered-out stations
          }
          return showInfra
            ? 5 + (metricVal(s, stationMetric) / stnMax) * 6
            : 4 + (metricVal(s, stationMetric) / stnMax) * 12;
        },
        getFillColor: (s: StationInfraMetricRecord) => {
          const baseColor = stationColor(s, stationMetric);
          if (stationMetric === "deficitClass" && stationFilter && !stationFilter.has(s.deficitClass)) {
            return [baseColor[0], baseColor[1], baseColor[2], 0] as RGBA; // invisible
          }
          return baseColor;
        },
        getLineColor: showInfra ? [10, 15, 25, 120] as RGBA : [230, 244, 255, 180] as RGBA,
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
    [sortedFlows, sortedCompareFlows, flowMax, hotspots, hotMax, stations, stnMax, stationMetric, showArcs, showCompareFlows, showStations, showHotspots, showInfra, infraDim, activeFlowPalette, compareFlowPalette, onStationHover, stationFilter, particlePoints, showParticles, showContours, contourLevels, cameraPreset],
  );

  /* ── push layers to overlay ── */
  useEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.setProps({ layers });
  }, [layers, mapReady]);

  return <div ref={containerRef} className="gl-canvas" />;
}
