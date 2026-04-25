import { useEffect, useState } from "react";
import type { OdRouteLensSlice } from "../types/routeLens";
import type { StoryProfileId } from "../types/routeFlows";

type OdRouteLensState = {
  ready: boolean;
  loading: boolean;
  error: string | null;
  slice: OdRouteLensSlice | null;
};

function isOdRouteLensSlice(payload: unknown): payload is OdRouteLensSlice {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<OdRouteLensSlice>;
  return Boolean(candidate.profileId && typeof candidate.hour === "number" && Array.isArray(candidate.routes));
}

export function useOdRouteLens(profileId: StoryProfileId, hour: number): OdRouteLensState {
  const [slice, setSlice] = useState<OdRouteLensSlice | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hourToken = String(hour).padStart(2, "0");

    setLoading(true);
    setReady(false);
    setError(null);
    setSlice(null);

    fetch(`${import.meta.env.BASE_URL}data/od_route_lens/${profileId}_${hourToken}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load OD route lens slice: ${response.status}`);
        return response.json();
      })
      .then((payload: unknown) => {
        if (cancelled) return;
        if (!isOdRouteLensSlice(payload)) throw new Error("Invalid OD route lens payload");
        setSlice(payload);
        setReady(true);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load OD route lens slice");
        setReady(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hour, profileId]);

  return { ready, loading, error, slice };
}
