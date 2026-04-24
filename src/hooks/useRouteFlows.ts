import { useCallback, useEffect, useMemo, useState } from "react";
import type { RouteFlowsData, RouteFlowProfile, RouteFlowSlice, StoryProfileId } from "../types/routeFlows";

const emptySlice: RouteFlowSlice = {
  profileId: "all",
  label: "",
  group: "",
  hour: 0,
  timeBucket: "",
  annualTripCount: 0,
  averageDailyTrips: 0,
  edgeCount: 0,
  candidateOdPairs: 0,
  routedOdPairs: 0,
  unroutedOdPairs: 0,
  routedTripCount: 0,
  unroutedTripCount: 0,
  maxSnapDistanceM: 0,
  edges: [],
};

const fallback: RouteFlowsData = {
  meta: {
    generatedAt: "",
    source: "",
    sourceGraph: "",
    routeModel: "",
    limitation: "",
    profileIds: ["all", "weekdays", "weekends"],
    dayCounts: { all: 365, weekdays: 261, weekends: 104 },
    maxOdPairsPerSlice: "all-retained",
    maxEdgesPerSlice: 0,
    graph: {
      nodeCount: 0,
      edgeCount: 0,
      componentCount: 0,
      largestComponentSize: 0,
    },
    routeStats: {
      candidateOdPairs: 0,
      routedOdPairs: 0,
      unroutedOdPairs: 0,
      routedTrips: 0,
      unroutedTrips: 0,
      maxSnapDistanceM: 0,
      maxRouteDistanceM: 0,
    },
    maxAverageDailyTrips: 1,
  },
  profiles: [],
};

type RouteFlowsState = {
  data: RouteFlowsData;
  profiles: RouteFlowProfile[];
  ready: boolean;
  activeSliceReady: boolean;
  error: string | null;
  maxAverageDailyTrips: number;
  getProfile: (id: StoryProfileId) => RouteFlowProfile | null;
  getSlice: (profileId: StoryProfileId, hour: number) => RouteFlowSlice;
};

type RouteFlowsOptions = {
  prefetchAll?: boolean;
  prefetchSlices?: Array<{ profileId: StoryProfileId; hour: number }>;
};

const emptyPrefetchSlices: Array<{ profileId: StoryProfileId; hour: number }> = [];

function normalizePayload(payload: unknown): RouteFlowsData | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<RouteFlowsData>;
  if (!candidate.meta || !Array.isArray(candidate.profiles)) return null;
  return candidate as RouteFlowsData;
}

function sliceKey(profileId: StoryProfileId, hour: number) {
  return `${profileId}:${hour}`;
}

const compactEdgeScales = {
  coordinate: 100000,
  averageDailyTrips: 100,
  strength: 10000,
};
const compactTierNames = ["context", "support", "focus", "accent"] as const;

type CompactRouteFlowEdge = [number, number, number, number, number, number, number];
type RawRouteFlowSlice = Omit<RouteFlowSlice, "edges"> & {
  edges: RouteFlowSlice["edges"] | CompactRouteFlowEdge[];
};

function normalizeRouteSlice(payload: RawRouteFlowSlice): RouteFlowSlice {
  if (payload.edgeFormat !== "compact-v1") return payload as RouteFlowSlice;

  const scales = payload.edgeScales ?? compactEdgeScales;
  return {
    ...payload,
    edges: (payload.edges as CompactRouteFlowEdge[]).map((edge, index) => {
      const start: [number, number] = [edge[0] / scales.coordinate, edge[1] / scales.coordinate];
      const end: [number, number] = [edge[2] / scales.coordinate, edge[3] / scales.coordinate];
      const strength = Number((edge[5] / scales.strength).toFixed(4));

      return {
        id: `${start[0].toFixed(5)},${start[1].toFixed(5)}|${end[0].toFixed(5)},${end[1].toFixed(5)}`,
        coordinates: [start, end],
        averageDailyTrips: Number((edge[4] / scales.averageDailyTrips).toFixed(2)),
        visualRank: index + 1,
        strength,
        visualTier: compactTierNames[edge[6]] ?? "context",
      };
    }),
  };
}

export function useRouteFlows(
  activeProfileId: StoryProfileId = "all",
  activeHour = 17,
  options: RouteFlowsOptions = {},
): RouteFlowsState {
  const { prefetchAll = true, prefetchSlices = emptyPrefetchSlices } = options;
  const [data, setData] = useState<RouteFlowsData>(fallback);
  const [ready, setReady] = useState(false);
  const [sliceCache, setSliceCache] = useState<Record<string, RouteFlowSlice>>({});
  const [activeSliceReady, setActiveSliceReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${import.meta.env.BASE_URL}data/route_flows.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load route flows: ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        const normalized = normalizePayload(payload);
        if (cancelled) return;
        if (!normalized) throw new Error("Invalid route-flow dataset");
        setData(normalized);
        setReady(true);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load route flows");
        setReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const profiles = data.profiles;

  const getProfile = useCallback((id: StoryProfileId): RouteFlowProfile | null => {
    return profiles.find((profile) => profile.id === id) ?? null;
  }, [profiles]);

  const getSlice = useCallback((profileId: StoryProfileId, hour: number): RouteFlowSlice => {
    const cached = sliceCache[sliceKey(profileId, hour)];
    if (cached) return cached;
    const profile = profiles.find((candidate) => candidate.id === profileId) ?? null;
    return profile?.hourSlices.find((slice) => slice.hour === hour) ?? emptySlice;
  }, [profiles, sliceCache]);

  const activeManifestSlice = useMemo(() => {
    return profiles
      .find((profile) => profile.id === activeProfileId)
      ?.hourSlices.find((slice) => slice.hour === activeHour) ?? null;
  }, [activeHour, activeProfileId, profiles]);

  useEffect(() => {
    if (!ready || !activeManifestSlice) return undefined;

    const key = sliceKey(activeProfileId, activeHour);
    if (sliceCache[key]) {
      setActiveSliceReady(true);
      return undefined;
    }

    if (!activeManifestSlice.slicePath) {
      setSliceCache((current) => ({ ...current, [key]: activeManifestSlice }));
      setActiveSliceReady(true);
      return undefined;
    }

    let cancelled = false;
    setActiveSliceReady(false);

    fetch(`${import.meta.env.BASE_URL}${activeManifestSlice.slicePath}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load route slice: ${response.status}`);
        return response.json();
      })
      .then((payload: RawRouteFlowSlice) => {
        if (cancelled) return;
        setSliceCache((current) => ({ ...current, [key]: normalizeRouteSlice(payload) }));
        setActiveSliceReady(true);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load route slice");
        setActiveSliceReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeHour, activeManifestSlice, activeProfileId, ready, sliceCache]);

  useEffect(() => {
    if (!ready || profiles.length === 0) return undefined;

    const pendingSlices = prefetchAll
      ? profiles.flatMap((profile) =>
        profile.hourSlices.filter((slice) => slice.slicePath && !sliceCache[sliceKey(profile.id, slice.hour)]),
      )
      : Array.from(new Map(
        prefetchSlices
          .map((request) => profiles
            .find((profile) => profile.id === request.profileId)
            ?.hourSlices.find((slice) => slice.hour === request.hour))
          .filter((slice): slice is RouteFlowSlice => Boolean(slice?.slicePath && !sliceCache[sliceKey(slice.profileId, slice.hour)]))
          .map((slice) => [sliceKey(slice.profileId, slice.hour), slice] as const),
      ).values());

    if (pendingSlices.length === 0) return undefined;

    let cancelled = false;
    let idleHandle = 0;

    const requestIdle = window.requestIdleCallback
      ? window.requestIdleCallback.bind(window)
      : (callback: IdleRequestCallback) => window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 12 } as IdleDeadline), 80);

    const cancelIdle = window.cancelIdleCallback
      ? window.cancelIdleCallback.bind(window)
      : window.clearTimeout.bind(window);

    const prefetchSequentially = async () => {
      for (const slice of pendingSlices) {
        if (cancelled) return;

        try {
          const response = await fetch(`${import.meta.env.BASE_URL}${slice.slicePath}`);
          if (!response.ok) throw new Error(`Failed to prefetch route slice: ${response.status}`);
          const payload = (await response.json()) as RawRouteFlowSlice;
          if (cancelled) return;
          setSliceCache((current) => {
            const key = sliceKey(slice.profileId, slice.hour);
            if (current[key]) return current;
            return { ...current, [key]: normalizeRouteSlice(payload) };
          });
        } catch (err: unknown) {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Failed to prefetch route slices");
          return;
        }
      }
    };

    idleHandle = requestIdle(() => {
      void prefetchSequentially();
    });

    return () => {
      cancelled = true;
      cancelIdle(idleHandle);
    };
  }, [prefetchAll, prefetchSlices, profiles, ready, sliceCache]);

  return {
    data,
    profiles,
    ready,
    activeSliceReady,
    error,
    maxAverageDailyTrips: data.meta.maxAverageDailyTrips || 1,
    getProfile,
    getSlice,
  };
}
