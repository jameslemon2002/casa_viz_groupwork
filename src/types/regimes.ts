import type { StoryCameraPreset } from "./story";
import type { StoryProfileId } from "./routeFlows";

export type RegimeId = "work_core" | "day_leisure" | "night_social" | "dawn_transition";
export type RegimeColorScheme = "cool" | "warm" | "purple";

export type RegimeHotspot = {
  name: string;
  lon: number;
  lat: number;
  activity: number;
};

export type RegimeRecord = {
  id: RegimeId;
  label: string;
  shortLabel: string;
  kicker: string;
  description: string;
  colorScheme: RegimeColorScheme;
  cameraPreset: StoryCameraPreset;
  sliceCount: number;
  profileCounts: Partial<Record<StoryProfileId, number>>;
  averageTripCount: number;
  representative: {
    profileId: StoryProfileId;
    hour: number;
    label: string;
    tripCount: number;
  };
  hoursByProfile: Partial<Record<StoryProfileId, number[]>>;
  topHotspots: RegimeHotspot[];
};

export type RegimeSlice = {
  profileId: StoryProfileId;
  profileLabel: string;
  hour: number;
  label: string;
  tripCount: number;
  regimeId: RegimeId;
  regimeLabel: string;
  isRepresentative: boolean;
};

export type RegimeSummary = {
  summary: {
    generatedAt: string;
    source: string;
    profileIds: StoryProfileId[];
    sliceCount: number;
    clusterCount: number;
    gridSizeDegrees: number;
    method: string;
    seed: number;
    silhouetteScore: number;
    note: string;
  };
  regimes: RegimeRecord[];
  slices: RegimeSlice[];
};
