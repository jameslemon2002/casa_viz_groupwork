import { useEffect, useState } from "react";
import type { StoryDataset } from "../types/story";

const fallbackDataset: StoryDataset = {
  summary: {
    source: "fallback",
    generatedAt: "",
    year: 2025,
    annualTrips: 0,
    stationCount: 0,
    boroughCount: 0
  },
  profiles: [],
  dayparts: [
    { id: "am", label: "AM Peak", hours: [7, 8, 9, 10] },
    { id: "midday", label: "Midday", hours: [11, 12, 13, 14, 15] },
    { id: "pm", label: "PM Peak", hours: [16, 17, 18, 19] },
    { id: "night", label: "Night", hours: [20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6] }
  ],
  sceneDefaults: [],
  headlineStats: {
    stationCount: 0,
    annualTrips: 0,
    boroughCount: 0,
    protectedLaneKm: 0,
    mismatchStationCount: 0,
    topStationName: null,
    topMismatchBorough: null
  },
  sceneAnnotations: {},
  stationMetrics: [],
  boroughMetrics: [],
  corridorInsights: [],
  methodNotes: {
    lowStressProxy: "",
    infrastructureSources: []
  }
};

type StoryDatasetState = {
  dataset: StoryDataset;
  isFallback: boolean;
  isLoading: boolean;
};

function normalizePayload(payload: unknown): StoryDataset | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Partial<StoryDataset>;

  if (!candidate.summary || !Array.isArray(candidate.stationMetrics) || !Array.isArray(candidate.boroughMetrics)) {
    return null;
  }

  return candidate as StoryDataset;
}

export function useStoryDataset(): StoryDatasetState {
  const [state, setState] = useState<StoryDatasetState>({
    dataset: fallbackDataset,
    isFallback: true,
    isLoading: true
  });

  useEffect(() => {
    let isCancelled = false;

    async function load() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/typical_week_story.json`);

        if (!response.ok) {
          throw new Error(`Failed to load story dataset: ${response.status}`);
        }

        const payload = normalizePayload(await response.json());

        if (!payload || isCancelled) {
          return;
        }

        setState({
          dataset: payload,
          isFallback: false,
          isLoading: false
        });
      } catch {
        if (isCancelled) {
          return;
        }

        setState({
          dataset: fallbackDataset,
          isFallback: true,
          isLoading: false
        });
      }
    }

    load();

    return () => {
      isCancelled = true;
    };
  }, []);

  return state;
}
