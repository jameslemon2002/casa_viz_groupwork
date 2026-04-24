import { useEffect, useState } from "react";
import type { TemporalSummary } from "../types/routeFlows";

const fallbackTemporalSummary: TemporalSummary = {
  meta: {
    generatedAt: "",
    source: "",
    sourceTripArchive: "",
    year: 2025,
    totalTrips: 0,
    metricBasis: {},
    dayCounts: {},
  },
  researchQuestion: "",
  months: [],
  seasons: [],
  profiles: [],
  dayOfWeek: [],
  annotations: {
    monthPeak: null,
    monthTrough: null,
    seasonPeak: null,
    allDayPeakHour: null,
    weekdayPeakHour: null,
    weekendPeakHour: null,
  },
};

type TemporalSummaryState = {
  summary: TemporalSummary;
  ready: boolean;
  error: string | null;
  getProfile: (id: string) => TemporalSummary["profiles"][number] | null;
};

function normalizePayload(payload: unknown): TemporalSummary | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<TemporalSummary>;
  if (!candidate.meta || !Array.isArray(candidate.months) || !Array.isArray(candidate.seasons)) return null;
  return candidate as TemporalSummary;
}

export function useTemporalSummary(): TemporalSummaryState {
  const [summary, setSummary] = useState<TemporalSummary>(fallbackTemporalSummary);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${import.meta.env.BASE_URL}data/temporal_summary.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load temporal summary: ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        const normalized = normalizePayload(payload);
        if (cancelled) return;
        if (!normalized) throw new Error("Invalid temporal summary dataset");
        setSummary(normalized);
        setReady(true);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load temporal summary");
        setReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function getProfile(id: string) {
    return summary.profiles.find((profile) => profile.id === id) ?? null;
  }

  return { summary, ready, error, getProfile };
}
