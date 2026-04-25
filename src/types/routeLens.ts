import type { StoryProfileId } from "./routeFlows";

export type ExploreLayerId = "routes" | "hotspots" | "stations" | "poi" | "landuse";
export type RouteColorMode = "unified" | "intensity";

export type PoiCategory =
  | "transit"
  | "office-work"
  | "food-night"
  | "retail"
  | "culture-tourism"
  | "education"
  | "health"
  | "civic"
  | "sport-leisure";

export type LanduseCategory =
  | "commercial"
  | "retail"
  | "residential"
  | "education-civic"
  | "leisure-park"
  | "industrial";

export type ServiceContextPoiFeature = {
  type: "Feature";
  properties: {
    id: string;
    name: string;
    category: PoiCategory;
    osmType?: string;
    osmId?: number;
    source?: string;
    [key: string]: string | number | null | undefined;
  };
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
};

export type ServiceLanduseFeature = {
  type: "Feature";
  properties: {
    id: string;
    name: string;
    category: LanduseCategory;
    osmType?: string;
    osmId?: number;
    source?: string;
    area?: number;
    areaSqM?: number;
    [key: string]: string | number | null | undefined;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};

export type RouteDetailContributor = {
  origin: string;
  destination: string;
  count: number;
  share: number;
  durationMin: number;
};

export type RouteDetailEdge = {
  edgeId: string;
  averageDailyTrips: number;
  strength: number;
  visualTier: "context" | "support" | "focus" | "accent";
  rank: number | null;
  contributors: RouteDetailContributor[];
};

export type RouteDetailSlice = {
  profileId: StoryProfileId;
  label: string;
  hour: number;
  timeBucket: string;
  edgeCount: number;
  detailBasis: string;
  contributorsBasis: string;
  edges: RouteDetailEdge[];
};

export type OdRouteLensRoute = {
  id: string;
  profileId: StoryProfileId;
  hour: number;
  rank: number;
  origin: string;
  destination: string;
  originPosition: [number, number];
  destinationPosition: [number, number];
  annualTripCount: number;
  averageDailyTrips: number;
  durationMin: number;
  distanceM: number;
  detourRatio: number;
  routeProbability: number;
  routeEdgeCount: number;
  coordinateCount: number;
  strength: number;
  visualTier: "context" | "support" | "focus" | "accent";
  coordinates: Array<[number, number]>;
};

export type OdRouteLensSlice = {
  profileId: StoryProfileId;
  label: string;
  hour: number;
  timeBucket: string;
  routeCount: number;
  totalRoutedOdRouteCount: number;
  maxRouteAverageDailyTrips: number;
  lensBasis: string;
  routeStyleBasis: string;
  simplificationToleranceM: number;
  routes: OdRouteLensRoute[];
};
