import { useEffect, useState } from "react";
import type { ServiceContextPoiFeature, ServiceLanduseFeature } from "../types/routeLens";

type FeatureCollection<TFeature> = {
  type: "FeatureCollection";
  features: TFeature[];
};

type ServiceContextState = {
  ready: boolean;
  loading: boolean;
  error: string | null;
  pois: ServiceContextPoiFeature[];
  landuse: ServiceLanduseFeature[];
};

const emptyCollection = { type: "FeatureCollection", features: [] };

function normalizeCollection<TFeature>(payload: unknown): FeatureCollection<TFeature> {
  if (!payload || typeof payload !== "object") return emptyCollection as FeatureCollection<TFeature>;
  const candidate = payload as Partial<FeatureCollection<TFeature>>;
  if (candidate.type !== "FeatureCollection" || !Array.isArray(candidate.features)) {
    return emptyCollection as FeatureCollection<TFeature>;
  }
  return candidate as FeatureCollection<TFeature>;
}

export function useServiceContext(): ServiceContextState {
  const [pois, setPois] = useState<ServiceContextPoiFeature[]>([]);
  const [landuse, setLanduse] = useState<ServiceLanduseFeature[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/service_context_pois.geojson`).then((response) => {
        if (!response.ok) throw new Error(`Failed to load service POI context: ${response.status}`);
        return response.json();
      }),
      fetch(`${import.meta.env.BASE_URL}data/service_landuse_context.geojson`).then((response) => {
        if (!response.ok) throw new Error(`Failed to load service land-use context: ${response.status}`);
        return response.json();
      }),
    ])
      .then(([poiPayload, landusePayload]) => {
        if (cancelled) return;
        setPois(normalizeCollection<ServiceContextPoiFeature>(poiPayload).features);
        setLanduse(normalizeCollection<ServiceLanduseFeature>(landusePayload).features);
        setReady(true);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load service context");
        setReady(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, loading, error, pois, landuse };
}
