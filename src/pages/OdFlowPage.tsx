import { useEffect, useMemo, useRef, useState } from "react";
import { RegimeMatrix } from "../components/charts/RegimeMatrix";
import { OdFlowMapCanvas } from "../components/maps/OdFlowMapCanvas";
import { useHourlyFlows } from "../hooks/useHourlyFlows";
import { useRegimeSummary } from "../hooks/useRegimeSummary";
import { useRouteFlows } from "../hooks/useRouteFlows";
import { useStoryDataset } from "../hooks/useStoryDataset";
import type { HourlyFlow } from "../hooks/useHourlyFlows";
import type { RegimeId, RegimeRecord } from "../types/regimes";

type SceneId = "claim" | "states" | "work" | "leisure" | "night" | "limits";

type SceneDefinition = {
  id: SceneId;
  step: string;
  navLabel: string;
  eyebrow: string;
  title: string;
  body: string;
  note?: string;
  regimeId: RegimeId;
};

const scenes: SceneDefinition[] = [
  {
    id: "claim",
    step: "01",
    navLabel: "Claim",
    eyebrow: "Core argument",
    title: "One docking system. Four recurring ways of using it.",
    body:
      "This page is not about finding one dramatic hour. It treats the Santander Cycles network as a stable system inside inner and central London, then asks how recurring usage states reorganise that same system across the week.",
    note: "The study area is the operational docking footprint, not all of Greater London.",
    regimeId: "work_core",
  },
  {
    id: "states",
    step: "02",
    navLabel: "States",
    eyebrow: "Evidence chain",
    title: "Usage states are discovered before representative hours are chosen.",
    body:
      "All 48 weekday and weekend hour slices are clustered by their full hotspot geography. The representative map views are selected afterwards, so the page is driven by regime evidence rather than pre-declared showcase times.",
    note: "A weak dawn transition exists as a fourth state, but the three dominant regimes carry the main argument.",
    regimeId: "work_core",
  },
  {
    id: "work",
    step: "03",
    navLabel: "Work",
    eyebrow: "Regime A",
    title: "A work-core regime locks onto terminals, the City and core employment anchors.",
    body:
      "This is the strongest weekday state. The same network that looks diffuse at other times compresses into Waterloo, Bank, Liverpool Street and adjacent corridors, which is why the project should talk about use patterns rather than a generic hourly atlas.",
    regimeId: "work_core",
  },
  {
    id: "leisure",
    step: "04",
    navLabel: "Leisure",
    eyebrow: "Regime B",
    title: "A daytime leisure regime pulls the network toward parks and mixed central destinations.",
    body:
      "Weekend daytime dominates this state, but weekday midday also falls into it. That matters: leisure-oriented use is not just a weekend anomaly, it is one of the recurring functional modes of the system.",
    regimeId: "day_leisure",
  },
  {
    id: "night",
    step: "05",
    navLabel: "Night",
    eyebrow: "Regime C",
    title: "A night-social regime recentres the map on Soho, Borough and late central activity.",
    body:
      "Evening and night do not simply thin out demand. The geography changes again, with a tighter social core and a different set of recurrent hotspots than the daytime work or leisure regimes.",
    regimeId: "night_social",
  },
  {
    id: "limits",
    step: "06",
    navLabel: "Limits",
    eyebrow: "Boundary",
    title: "The claim is already strong, but V1 is still an interpretation layer, not a finished explanation.",
    body:
      "The road layer is an inferred route-use allocation from aggregated OD pairs, not observed route choice. The functional labels are therefore disciplined interpretations of recurring spatial signatures. The next step is to test them against greenspace, workplace and selected POI context rather than just naming them.",
    note: "The dawn transition is kept visible here because it is structurally distinct, even though it is weaker than the three main regimes.",
    regimeId: "dawn_transition",
  },
];

function formatCompact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000).toLocaleString()}K`;
  return Math.round(value).toLocaleString();
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatHourRange(hours: number[] | undefined) {
  if (!hours || hours.length === 0) return "none";
  const sorted = [...hours].sort((left, right) => left - right);
  const groups: Array<[number, number]> = [];

  for (const hour of sorted) {
    const current = groups.at(-1);
    if (!current || hour > current[1] + 1) {
      groups.push([hour, hour]);
      continue;
    }
    current[1] = hour;
  }

  return groups
    .map(([start, end]) => (start === end ? formatHour(start) : `${formatHour(start)}-${formatHour(end)}`))
    .join(", ");
}

function describeRegimeWindow(regime: RegimeRecord) {
  const weekdayRange = formatHourRange(regime.hoursByProfile.weekdays);
  const weekendRange = formatHourRange(regime.hoursByProfile.weekends);
  return { weekdayRange, weekendRange };
}

function profileLine(regime: RegimeRecord) {
  const weekdayCount = regime.profileCounts.weekdays ?? 0;
  const weekendCount = regime.profileCounts.weekends ?? 0;
  if (weekdayCount > 0 && weekendCount > 0) return `${weekdayCount} weekday slices + ${weekendCount} weekend slices`;
  if (weekdayCount > 0) return `${weekdayCount} weekday slices`;
  if (weekendCount > 0) return `${weekendCount} weekend slices`;
  return `${regime.sliceCount} slices`;
}

function isLoopFlow(flow: HourlyFlow) {
  return flow.oName === flow.dName || (flow.oLon === flow.dLon && flow.oLat === flow.dLat);
}

function selectShowcaseFlows(flows: HourlyFlow[]) {
  const seenPairs = new Set<string>();
  const picked: HourlyFlow[] = [];

  for (const flow of [...flows].sort((left, right) => right.count - left.count)) {
    if (isLoopFlow(flow)) continue;

    const pairKey = `${flow.oName}->${flow.dName}`;
    if (seenPairs.has(pairKey)) continue;

    seenPairs.add(pairKey);
    picked.push(flow);

    if (picked.length === 5) break;
  }

  return picked;
}

export function OdFlowPage() {
  const { dataset: storyData, isLoading: storyLoading } = useStoryDataset();
  const { data: regimeData, ready: regimeReady, error: regimeError, getRegime } = useRegimeSummary();
  const { ready: hourlyReady, error: hourlyError, getSlice: getHourlySlice } = useHourlyFlows();
  const [activeSceneId, setActiveSceneId] = useState<SceneId>("claim");

  const sectionRefs = useRef<Record<SceneId, HTMLElement | null>>({
    claim: null,
    states: null,
    work: null,
    leisure: null,
    night: null,
    limits: null,
  });

  const activeScene = scenes.find((scene) => scene.id === activeSceneId) ?? scenes[0];
  const activeRegime = getRegime(activeScene.regimeId) ?? regimeData.regimes[0] ?? null;
  const activeProfileId = activeRegime?.representative.profileId ?? "weekdays";
  const activeHour = activeRegime?.representative.hour ?? 17;

  const {
    data: routeData,
    ready: routeReady,
    activeSliceReady,
    error: routeError,
    maxAverageDailyTrips,
    getSlice: getRouteSlice,
  } = useRouteFlows(activeProfileId, activeHour);

  const activeRouteSlice = useMemo(() => getRouteSlice(activeProfileId, activeHour), [activeHour, activeProfileId, getRouteSlice]);
  const activeFlowSlice = useMemo(() => getHourlySlice(activeProfileId, activeHour), [activeHour, activeProfileId, getHourlySlice]);
  const showcaseFlows = useMemo(() => selectShowcaseFlows(activeFlowSlice.flows), [activeFlowSlice.flows]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        const sceneId = visible?.target.getAttribute("data-scene-id") as SceneId | null;
        if (sceneId) {
          setActiveSceneId(sceneId);
        }
      },
      {
        threshold: [0.35, 0.55, 0.75],
        rootMargin: "-12% 0px -32% 0px",
      },
    );

    for (const scene of scenes) {
      const element = sectionRefs.current[scene.id];
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, []);

  if (routeError || regimeError || hourlyError) {
    return (
      <main className="load-screen">
        <p>Page data failed to load.</p>
        <p style={{ maxWidth: "38rem", textAlign: "center", color: "rgba(80,90,92,0.75)" }}>
          {routeError || regimeError || hourlyError}
        </p>
      </main>
    );
  }

  if (!regimeReady || !routeReady || !hourlyReady || !activeSliceReady || storyLoading || !activeRegime) {
    return (
      <main className="load-screen">
        <div className="load-ring" />
        <p>Loading redesigned page&hellip;</p>
      </main>
    );
  }

  const { weekdayRange, weekendRange } = describeRegimeWindow(activeRegime);

  function scrollToScene(sceneId: SceneId) {
    sectionRefs.current[sceneId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderSupport(scene: SceneDefinition) {
    const regime = getRegime(scene.regimeId);
    if (!regime) return null;

    if (scene.id === "states") {
      return (
        <div className="brief-support-card brief-support-card--matrix">
          <div className="brief-support-topline">
            <span>48 slices clustered</span>
            <strong>silhouette {regimeData.summary.silhouetteScore.toFixed(4)}</strong>
          </div>
          <RegimeMatrix regimes={regimeData.regimes} slices={regimeData.slices} activeSliceKey={`${activeProfileId}:${activeHour}`} />
        </div>
      );
    }

    const { weekdayRange: regimeWeekdayRange, weekendRange: regimeWeekendRange } = describeRegimeWindow(regime);

    return (
      <div className="brief-support-card">
        <div className="brief-support-topline">
          <span>{regime.label}</span>
          <strong>{profileLine(regime)}</strong>
        </div>

        <dl className="brief-metric-list">
          <div>
            <dt>Representative slice</dt>
            <dd>{regime.representative.label}</dd>
          </div>
          <div>
            <dt>Weekdays</dt>
            <dd>{regimeWeekdayRange}</dd>
          </div>
          <div>
            <dt>Weekends</dt>
            <dd>{regimeWeekendRange}</dd>
          </div>
        </dl>

        <div className="brief-hotspot-list">
          {regime.topHotspots.slice(0, 5).map((hotspot) => (
            <span key={hotspot.name}>{hotspot.name}</span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <main className="brief-page">
      <section className="brief-stage">
        <div className="brief-scroll-shell">
          <nav className="brief-progress" aria-label="Section progress">
            {scenes.map((scene) => (
              <button
                key={scene.id}
                type="button"
                className={scene.id === activeSceneId ? "brief-progress-dot brief-progress-dot--active" : "brief-progress-dot"}
                onClick={() => scrollToScene(scene.id)}
                aria-label={scene.navLabel}
                title={scene.navLabel}
              >
                <span>{scene.step}</span>
              </button>
            ))}
          </nav>

          <div className="brief-scroll-column">
            {scenes.map((scene) => (
              <section
                key={scene.id}
                ref={(node) => {
                  sectionRefs.current[scene.id] = node;
                }}
                className="brief-step"
                data-scene-id={scene.id}
              >
                <article className={scene.id === activeSceneId ? "brief-card brief-card--active" : "brief-card"}>
                  <div className="brief-card-topline">
                    <span>{scene.eyebrow}</span>
                    <strong>{scene.step}</strong>
                  </div>
                  <h1 className="brief-card-title">{scene.title}</h1>
                  <p className="brief-card-body">{scene.body}</p>
                  {scene.note ? <p className="brief-card-note">{scene.note}</p> : null}
                  {scene.id === "claim" ? (
                    <div className="brief-card-stats">
                      <div>
                        <dt>Stations</dt>
                        <dd>{storyData.headlineStats.stationCount.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Trips in 2025</dt>
                        <dd>{formatCompact(storyData.headlineStats.annualTrips)}</dd>
                      </div>
                      <div>
                        <dt>Boroughs</dt>
                        <dd>{storyData.headlineStats.boroughCount}</dd>
                      </div>
                    </div>
                  ) : null}
                  {renderSupport(scene)}
                </article>
              </section>
            ))}
          </div>
        </div>

        <aside className="brief-map-shell">
          <div className="brief-map-frame">
            <OdFlowMapCanvas
              flows={showcaseFlows}
              compareFlows={[]}
              routeEdges={activeRouteSlice.edges}
              hotspots={activeFlowSlice.hotspots.slice(0, 8)}
              stations={storyData.stationMetrics}
              viewMode="routes"
              stationMetric="annualTrips"
              cameraPreset={activeRegime.cameraPreset}
              colorScheme={activeRegime.colorScheme}
              activeFlowProfileId={activeProfileId}
              compareFlowProfileId={null}
              interactive={false}
              globalFlowMax={1}
              routeFlowMax={maxAverageDailyTrips}
            />
            <div className="brief-map-wash" />

            <div className="brief-map-label">Santander Cycles service area</div>

            <div className="brief-map-caption">
              <p className="brief-map-kicker">{activeScene.eyebrow}</p>
              <h2>{activeRegime.label}</h2>
              <p>{activeRegime.description}</p>

              <div className="brief-map-metrics">
                <div>
                  <span>Representative</span>
                  <strong>{activeRegime.representative.label}</strong>
                </div>
                <div>
                  <span>Avg trips / profile day</span>
                  <strong>{Math.round(activeRouteSlice.averageDailyTrips).toLocaleString()}</strong>
                </div>
                <div>
                  <span>Weekday window</span>
                  <strong>{weekdayRange}</strong>
                </div>
                <div>
                  <span>Weekend window</span>
                  <strong>{weekendRange}</strong>
                </div>
              </div>

              {showcaseFlows.length > 0 ? (
                <div className="brief-map-examples">
                  <span>Dominant OD pairs</span>
                  {showcaseFlows.slice(0, 3).map((flow) => (
                    <p key={`${flow.oName}-${flow.dName}`}>
                      {flow.oName} to {flow.dName}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </section>

      <footer className="brief-footer">
        <p>
          Route model: {routeData.meta.routeModel}. Limitation: {routeData.meta.limitation}
        </p>
      </footer>
    </main>
  );
}
