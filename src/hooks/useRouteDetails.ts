import { useEffect, useMemo, useState } from "react";
import type { RouteDetailEdge, RouteDetailSlice } from "../types/routeLens";
import type { StoryProfileId } from "../types/routeFlows";

type RouteDetailsState = {
  ready: boolean;
  loading: boolean;
  error: string | null;
  slice: RouteDetailSlice | null;
  edgesById: Map<string, RouteDetailEdge>;
};

function isRouteDetailSlice(payload: unknown): payload is RouteDetailSlice {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<RouteDetailSlice>;
  return Boolean(candidate.profileId && typeof candidate.hour === "number" && Array.isArray(candidate.edges));
}

export function useRouteDetails(profileId: StoryProfileId, hour: number): RouteDetailsState {
  const [slice, setSlice] = useState<RouteDetailSlice | null>(null);
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

    fetch(`${import.meta.env.BASE_URL}data/route_details/${profileId}_${hourToken}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load route detail slice: ${response.status}`);
        return response.json();
      })
      .then((payload: unknown) => {
        if (cancelled) return;
        if (!isRouteDetailSlice(payload)) throw new Error("Invalid route detail payload");
        setSlice(payload);
        setReady(true);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load route detail slice");
        setReady(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hour, profileId]);

  const edgesById = useMemo(() => {
    return new Map((slice?.edges ?? []).map((edge) => [edge.edgeId, edge]));
  }, [slice]);

  return { ready, loading, error, slice, edgesById };
}
