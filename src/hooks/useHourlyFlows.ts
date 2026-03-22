import { useEffect, useState } from "react";
import type { CompactFlow, CompactHotspot } from "../types/flows";

export type HourlyFlow = CompactFlow;
export type HourlyHotspot = CompactHotspot;

export type HourlySlice = {
  profileId: string;
  label: string;
  group: string;
  hour: number;
  timeBucket: string;
  tripCount: number;
  flows: HourlyFlow[];
  hotspots: HourlyHotspot[];
};

export type HourlyProfile = {
  id: string;
  label: string;
  group: string;
  hourSlices: HourlySlice[];
};

export type HourlyFlowsData = {
  meta: {
    year: number;
    totalTrips: number;
    generatedAt: string;
    source: string;
    profileIds: string[];
    globalFlowMax: number;
  };
  profiles: HourlyProfile[];
};

export type HourlyFlowsState = {
  profiles: HourlyProfile[];
  meta: HourlyFlowsData["meta"];
  ready: boolean;
  error: string | null;
  globalFlowMax: number;
  getProfile: (id: string) => HourlyProfile | null;
  getSlice: (profileId: string, hour: number) => HourlySlice;
};

const emptySlice: HourlySlice = {
  profileId: "all",
  label: "",
  group: "",
  hour: 0,
  timeBucket: "",
  tripCount: 0,
  flows: [],
  hotspots: [],
};

const fallback: HourlyFlowsData = {
  meta: {
    year: 2025,
    totalTrips: 0,
    generatedAt: "",
    source: "",
    profileIds: ["all", "weekdays", "weekends"],
    globalFlowMax: 1,
  },
  profiles: [],
};

function normalizePayload(payload: unknown): HourlyFlowsData | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Partial<HourlyFlowsData>;
  if (!candidate.meta || !Array.isArray(candidate.profiles)) {
    return null;
  }

  return candidate as HourlyFlowsData;
}

export function useHourlyFlows(): HourlyFlowsState {
  const [data, setData] = useState<HourlyFlowsData>(fallback);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${import.meta.env.BASE_URL}data/flows_hourly.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load hourly flows: ${response.status}`);
        }
        return response.json();
      })
      .then((loaded) => {
        const normalized = normalizePayload(loaded);

        if (cancelled) return;
        if (!normalized) {
          throw new Error("Invalid hourly flow dataset");
        }

        setData(normalized);
        setReady(true);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load hourly flows");
        setReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function getProfile(id: string): HourlyProfile | null {
    return data.profiles.find((profile) => profile.id === id) ?? null;
  }

  function getSlice(profileId: string, hour: number): HourlySlice {
    const profile = getProfile(profileId);
    return profile?.hourSlices.find((slice) => slice.hour === hour) ?? emptySlice;
  }

  return {
    profiles: data.profiles,
    meta: data.meta,
    ready,
    error,
    globalFlowMax: data.meta.globalFlowMax || 1,
    getProfile,
    getSlice,
  };
}
