export type StoryViewMode = "stations" | "flows" | "hotspots" | "infrastructure";
export type StoryTimeMode = "hour" | "daypart";
export type StoryDaypartId = "am" | "midday" | "pm" | "night";
export type StoryStationMetric = "capacity" | "annualTrips" | "weekdayAMTrips" | "weekendMiddayTrips" | "lowStressScore" | "deficitClass";
export type StoryCameraPreset =
  | "hero"
  | "network"
  | "rhythm"
  | "commute"
  | "weekend"
  | "spatial"
  | "infrastructure"
  | "conclusion";

export type StoryHourSummary = {
  hour: number;
  tripCount: number;
};

export type StoryProfileSummary = {
  id: string;
  label: string;
  group: string;
  hourSlices: StoryHourSummary[];
};

export type StorySceneDefault = {
  id: string;
  title: string;
  profileId: string;
  timeMode: StoryTimeMode;
  hour?: number;
  daypart?: StoryDaypartId;
  viewMode: StoryViewMode;
  stationMetric: StoryStationMetric;
  cameraPreset: StoryCameraPreset;
};

export type StoryHeadlineStats = {
  stationCount: number;
  annualTrips: number;
  boroughCount: number;
  protectedLaneKm: number;
  mismatchStationCount: number;
  topStationName: string | null;
  topMismatchBorough: string | null;
};

export type StationInfraMetricRecord = {
  terminalName: string;
  stationId: string;
  name: string;
  lat: number;
  lon: number;
  capacity: number;
  boroughCode: string | null;
  boroughName: string | null;
  annualTrips: number;
  weekdayAMTrips: number;
  weekendMiddayTrips: number;
  departures: number;
  arrivals: number;
  nearestProtectedLaneM: number | null;
  protectedLaneLength500m: number;
  cycleLaneLength500m: number;
  protectedShare500m: number;
  lowStressScore: number;
  trafficCalmingCount500m: number;
  deficitClass: string;
};

export type BoroughInfraMetricRecord = {
  boroughCode: string | null;
  boroughName: string;
  stationCount: number;
  annualTrips: number;
  tripIntensity: number;
  protectedLaneKm: number;
  cycleLaneKm: number;
  quietRouteKm: number;
  lowStressDensity: number;
  trafficCalmingCount: number;
  deficitIndex: number;
};

export type CorridorInsightRecord = {
  id: string;
  originTerminal: string;
  destinationTerminal: string;
  originName: string;
  destinationName: string;
  originLon: number;
  originLat: number;
  destinationLon: number;
  destinationLat: number;
  flowCount: number;
  commuteShare: number;
  weekendShare: number;
  infraSupportClass: string;
  storyRank: number;
  commuteCount: number;
  weekendCount: number;
};

export type StoryDataset = {
  summary: {
    source: string;
    generatedAt: string;
    year: number;
    annualTrips: number;
    stationCount: number;
    boroughCount: number;
  };
  profiles: StoryProfileSummary[];
  dayparts: Array<{
    id: StoryDaypartId;
    label: string;
    hours: number[];
  }>;
  sceneDefaults: StorySceneDefault[];
  headlineStats: StoryHeadlineStats;
  sceneAnnotations: Record<string, string[]>;
  stationMetrics: StationInfraMetricRecord[];
  boroughMetrics: BoroughInfraMetricRecord[];
  corridorInsights: CorridorInsightRecord[];
  methodNotes: {
    lowStressProxy: string;
    infrastructureSources: string[];
  };
};
