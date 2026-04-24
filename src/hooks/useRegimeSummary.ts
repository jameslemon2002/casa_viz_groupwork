import { useEffect, useMemo, useState } from "react";
import type { RegimeId, RegimeRecord, RegimeSlice, RegimeSummary } from "../types/regimes";
import type { StoryProfileId } from "../types/routeFlows";

const fallback: RegimeSummary = {
  summary: {
    generatedAt: "",
    source: "",
    profileIds: ["weekdays", "weekends"],
    sliceCount: 0,
    clusterCount: 0,
    gridSizeDegrees: 0.01,
    method: "",
    seed: 0,
    silhouetteScore: 0,
    note: "",
  },
  regimes: [],
  slices: [],
};

type RegimeSummaryState = {
  data: RegimeSummary;
  ready: boolean;
  error: string | null;
  getRegime: (id: RegimeId) => RegimeRecord | null;
  getSlice: (profileId: StoryProfileId, hour: number) => RegimeSlice | null;
};

function normalizePayload(payload: unknown): RegimeSummary | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<RegimeSummary>;
  if (!candidate.summary || !Array.isArray(candidate.regimes) || !Array.isArray(candidate.slices)) return null;
  return candidate as RegimeSummary;
}

export function useRegimeSummary(): RegimeSummaryState {
  const [data, setData] = useState<RegimeSummary>(fallback);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${import.meta.env.BASE_URL}data/regime_summary.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load regime summary: ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        const normalized = normalizePayload(payload);
        if (cancelled) return;
        if (!normalized) throw new Error("Invalid regime summary dataset");
        setData(normalized);
        setReady(true);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(fallback);
        setReady(false);
        setError(err instanceof Error ? err.message : "Failed to load regime summary");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const regimeMap = useMemo(() => new Map(data.regimes.map((regime) => [regime.id, regime])), [data.regimes]);
  const sliceMap = useMemo(
    () => new Map(data.slices.map((slice) => [`${slice.profileId}:${slice.hour}`, slice])),
    [data.slices],
  );

  return {
    data,
    ready,
    error,
    getRegime: (id) => regimeMap.get(id) ?? null,
    getSlice: (profileId, hour) => sliceMap.get(`${profileId}:${hour}`) ?? null,
  };
}
