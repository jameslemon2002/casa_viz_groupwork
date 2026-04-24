export type StoryProfileId = "all" | "weekdays" | "weekends";

export type RouteContributor = {
  label: string;
  origin: string;
  destination: string;
  count: number;
};

export type RouteFlowEdge = {
  id: string;
  coordinates: [[number, number], [number, number]];
  category: string;
  lengthM: number;
  annualTripCount: number;
  averageDailyTrips: number;
  contributors: RouteContributor[];
};

export type RouteFlowSlice = {
  profileId: StoryProfileId;
  label: string;
  group: string;
  hour: number;
  timeBucket: string;
  slicePath?: string;
  annualTripCount: number;
  averageDailyTrips: number;
  edgeCount: number;
  candidateOdPairs: number;
  routedOdPairs: number;
  unroutedOdPairs: number;
  routedTripCount: number;
  unroutedTripCount: number;
  assignedRouteCount?: number;
  maxSnapDistanceM: number;
  edges: RouteFlowEdge[];
};

export type RouteFlowProfile = {
  id: StoryProfileId;
  label: string;
  group: string;
  hourSlices: RouteFlowSlice[];
};

export type TemporalMonth = {
  monthKey: string;
  month: number;
  label: string;
  season: "winter" | "spring" | "summer" | "autumn";
  dayCount: number;
  tripCount: number;
  averageDailyTrips: number;
  indexOfPeakMonth: number;
  indexOfTroughMonth: number;
};

export type TemporalSeason = {
  season: "winter" | "spring" | "summer" | "autumn";
  label: string;
  monthKeys: string[];
  dayCount: number;
  tripCount: number;
  averageDailyTrips: number;
};

export type TemporalProfile = {
  id: string;
  label: string;
  group: string;
  dayCount: number;
  annualTripCount: number;
  averageDailyTrips: number;
  peakHour: number | null;
  peakAverageDailyTrips: number;
  troughHour: number | null;
  troughAverageDailyTrips: number;
  hourSlices: Array<{
    hour: number;
    annualTripCount: number;
    averageDailyTrips: number;
  }>;
};

export type TemporalDayOfWeek = {
  id: string;
  label: string;
  dayCount: number;
  annualTripCount: number;
  averageDailyTrips: number;
  peakHour: number | null;
  peakAverageDailyTrips: number;
};

export type TemporalAnnotations = {
  monthPeak: { monthKey: string; label: string; averageDailyTrips: number } | null;
  monthTrough: { monthKey: string; label: string; averageDailyTrips: number } | null;
  seasonPeak: { season: string; label: string; averageDailyTrips: number } | null;
  allDayPeakHour: { hour: number | null; averageDailyTrips: number } | null;
  weekdayPeakHour: { hour: number | null; averageDailyTrips: number } | null;
  weekendPeakHour: { hour: number | null; averageDailyTrips: number } | null;
};

export type TemporalSummary = {
  meta: {
    generatedAt: string;
    source: string;
    sourceTripArchive: string;
    year: number;
    totalTrips: number;
    metricBasis: Record<string, string>;
    dayCounts: Record<string, number>;
  };
  researchQuestion: string;
  months: TemporalMonth[];
  seasons: TemporalSeason[];
  profiles: TemporalProfile[];
  dayOfWeek: TemporalDayOfWeek[];
  annotations: TemporalAnnotations;
};

export type RouteFlowsData = {
  manifestMode?: "sliced-route-flow";
  meta: {
    generatedAt: string;
    source: string;
    sourceGraph: string;
    routeModel: string;
    limitation: string;
    profileIds: StoryProfileId[];
    dayCounts: Record<StoryProfileId, number>;
    maxOdPairsPerSlice: number | "all-retained";
    maxEdgesPerSlice: number;
    routeAssignment?: {
      model: string;
      distribution: string;
      alternativeRouteCount: number;
      detourLimit: number;
      routePenaltyStep: number;
      distanceDecayAlpha: number;
      stochasticJitter: number;
      assignmentSeed: number;
    };
    graph: {
      nodeCount: number;
      edgeCount: number;
      componentCount: number;
      largestComponentSize: number;
    };
    routeStats: {
      candidateOdPairs: number;
      routedOdPairs: number;
      assignedRouteCount?: number;
      unroutedOdPairs: number;
      routedTrips: number;
      unroutedTrips: number;
      maxSnapDistanceM: number;
      maxRouteDistanceM: number;
    };
    maxAverageDailyTrips: number;
  };
  temporalSummary?: {
    researchQuestion?: string;
    monthStatus?: {
      available: boolean;
      metricBasis?: Record<string, string> | null;
    };
    months?: TemporalMonth[];
    seasons?: TemporalSeason[];
    dayOfWeek?: TemporalDayOfWeek[];
    profileDayCounts?: Record<string, number>;
    annotations?: TemporalAnnotations | null;
  };
  profiles: RouteFlowProfile[];
};
