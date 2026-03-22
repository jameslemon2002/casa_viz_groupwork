import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OdFlowMapCanvas } from "../components/maps/OdFlowMapCanvas";
import { useHourlyFlows } from "../hooks/useHourlyFlows";
import { useStoryDataset } from "../hooks/useStoryDataset";
import { HeroOverlaySection } from "../components/sections/HeroOverlaySection";
import { StationTooltip } from "../components/ui/StationTooltip";
import { TimeSlider } from "../components/ui/TimeSlider";
import { TimeHeatmapPanelStory } from "../components/charts/TimeHeatmapPanelStory";
import { BoroughBarPanelStory } from "../components/charts/BoroughBarPanelStory";
import { WeekdayWeekendChart } from "../components/charts/WeekdayWeekendChart";
import {
  heroFrames,
  storyScenes as scenes,
  type StoryProfileId,
} from "../content/storyScenes";

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatTrips(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}K`;
  }
  return value.toLocaleString();
}

function getEncodingNote(viewMode: string) {
  switch (viewMode) {
    case "flows":
      return "Brighter overlaps indicate stronger recurring OD movement.";
    case "hotspots":
      return "Contours show where recurring activity gathers and relaxes.";
    case "stations":
      return "Station intensity is scaled by the active story metric.";
    case "infrastructure":
      return "The map compares recurring demand with nearby low-stress support.";
    default:
      return "";
  }
}

export function OdFlowPage() {
  const {
    ready: hourlyReady,
    error: hourlyError,
    globalFlowMax,
    getSlice,
  } = useHourlyFlows();
  const { dataset: storyData, isLoading: storyLoading } = useStoryDataset();

  const [activeIdx, setActiveIdx] = useState(0);
  const [isHeroViewport, setIsHeroViewport] = useState(true);
  const [hoverStation, setHoverStation] = useState<{ station: typeof storyData.stationMetrics[0]; position: { x: number; y: number } } | null>(null);
  const [profileId, setProfileId] = useState<StoryProfileId>("all");
  const [hour, setHour] = useState(17);
  const [heroFrame, setHeroFrame] = useState(0);
  const sentinelRefs = useRef<(HTMLElement | null)[]>([]);

  const visualSceneIdx = isHeroViewport ? 0 : activeIdx;
  const scene = scenes[visualSceneIdx];
  const isHeroScene = visualSceneIdx === 0;

  useEffect(() => {
    if (isHeroScene) return;
    setProfileId(scene.defaultProfileId);
    setHour(scene.defaultHour);
  }, [isHeroScene, scene.defaultHour, scene.defaultProfileId]);

  useEffect(() => {
    if (!isHeroScene || !hourlyReady) return undefined;

    const interval = window.setInterval(() => {
      setHeroFrame((prev) => (prev + 1) % heroFrames.length);
    }, 2400);

    return () => window.clearInterval(interval);
  }, [hourlyReady, isHeroScene]);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const scrollY = window.scrollY;
        const vh = window.innerHeight;
        setIsHeroViewport(scrollY < vh * 0.72);
        const midY = vh * 0.45;
        let bestIdx = 0;
        let bestDist = Infinity;
        sentinelRefs.current.forEach((el, i) => {
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const center = rect.top + rect.height / 2;
          const dist = Math.abs(center - midY);
          if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        });
        setActiveIdx(bestIdx);
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const activeSlice = useMemo(() => {
    if (!hourlyReady) return null;
    if (isHeroScene) {
      const frame = heroFrames[heroFrame];
      return getSlice(frame.profileId, frame.hour);
    }
    return getSlice(profileId, hour);
  }, [getSlice, heroFrame, hour, hourlyReady, isHeroScene, profileId]);

  const compareProfileId = useMemo(() => {
    if (scene.id !== "weekend") return null;
    if (profileId === "weekdays") return "weekends" as const;
    if (profileId === "weekends") return "weekdays" as const;
    return null;
  }, [profileId, scene.id]);

  const compareSlice = useMemo(() => {
    if (!hourlyReady || !compareProfileId) return null;
    return getSlice(compareProfileId, hour);
  }, [compareProfileId, getSlice, hour, hourlyReady]);

  const flows = activeSlice?.flows ?? [];
  const compareFlows = compareSlice?.flows ?? [];
  const hotspots = activeSlice?.hotspots ?? [];

  const handleStationHover = useCallback(
    (station: typeof storyData.stationMetrics[0] | null, position: { x: number; y: number } | null) => {
      if (!station || !position) {
        setHoverStation(null);
        return;
      }

      setHoverStation({ station, position });
    },
    [storyData.stationMetrics],
  );

  const stageClass = isHeroScene ? "map-stage map-stage--hero" : "map-stage map-stage--story";
  function renderEvidencePanel() {
    if (!scene.evidencePanel?.type) return null;
    const config = scene.evidencePanel.config ?? {};

    switch (scene.evidencePanel.type) {
      case "heatmap": {
        const targetProfileId = (config.profileId as string) || profileId;
        const profile = storyData.profiles.find((item) => item.id === targetProfileId);
        if (!profile) return null;

        return (
          <TimeHeatmapPanelStory
            key={`heatmap-${targetProfileId}`}
            profile={profile}
            colorScheme={scene.color}
            activeHour={hour}
            title={(config.title as string) || "Hourly trip volume"}
            onHourClick={setHour}
          />
        );
      }

      case "borough": {
        const metric = (config.metric as "tripIntensity" | "deficitIndex" | "lowStressDensity") || "tripIntensity";
        const limit = (config.limit as number) || 8;

        return (
          <BoroughBarPanelStory
            key={`borough-${metric}`}
            boroughs={storyData.boroughMetrics}
            metric={metric}
            limit={limit}
            colorScheme={scene.color}
            title={config.title as string | undefined}
          />
        );
      }

      case "weekend-comparison": {
        const weekdayProfile = storyData.profiles.find((item) => item.id === "weekdays");
        const weekendProfile = storyData.profiles.find((item) => item.id === "weekends");
        if (!weekdayProfile || !weekendProfile) return null;

        return (
          <div className="evidence-panel evidence-panel--visible">
            <WeekdayWeekendChart
              weekdayProfile={weekdayProfile.hourSlices}
              weekendProfile={weekendProfile.hourSlices}
              activeHour={hour}
              activeProfileId={profileId === "all" ? "weekends" : profileId}
              onBarClick={(nextProfileId, nextHour) => {
                setProfileId(nextProfileId);
                setHour(nextHour);
              }}
            />
          </div>
        );
      }

      default:
        return null;
    }
  }

  if (hourlyError) {
    return (
      <main className="load-screen">
        <p>Hourly flow data failed to load.</p>
        <p style={{ maxWidth: "38rem", textAlign: "center", color: "rgba(220,232,243,0.7)" }}>{hourlyError}</p>
      </main>
    );
  }

  if (!hourlyReady || storyLoading || !activeSlice) {
    return (
      <main className="load-screen">
        <div className="load-ring" />
        <p>Loading hourly story data&hellip;</p>
      </main>
    );
  }

  return (
    <main className="page">
      <section className={stageClass}>
        <OdFlowMapCanvas
          flows={flows}
          compareFlows={compareFlows}
          hotspots={hotspots}
          stations={storyData.stationMetrics}
          viewMode={scene.viewMode}
          stationMetric={scene.stationMetric}
          cameraPreset={scene.camera}
          colorScheme={scene.color}
          activeFlowProfileId={isHeroScene ? heroFrames[heroFrame].profileId : profileId}
          compareFlowProfileId={compareProfileId}
          interactive={false}
          globalFlowMax={globalFlowMax}
          onStationHover={handleStationHover}
          showParticles={Boolean(scene.showParticles)}
          showContours={Boolean(scene.showContours)}
        />

        <div className="vignette" />
        <div className="scroll-pass" />
        <div className="story-editorial-backdrop" aria-hidden="true" />

        <HeroOverlaySection
          isVisible={isHeroScene}
          annualTrips={storyData.summary.annualTrips}
          stationCount={storyData.summary.stationCount}
          boroughCount={storyData.summary.boroughCount}
        />

        <StationTooltip
          station={hoverStation?.station || null}
          position={hoverStation?.position || null}
          visible={hoverStation !== null && (scene.viewMode === "stations" || scene.viewMode === "infrastructure")}
        />

        {!isHeroScene && scene.showControls && (
          <div className="map-dock">
            <TimeSlider
              hour={hour}
              onHourChange={setHour}
              profileId={profileId}
              onProfileChange={setProfileId}
              tripCount={activeSlice.tripCount}
              timeBucket={activeSlice.timeBucket}
              variant="dock"
            />
            <p className="map-dock-note">{getEncodingNote(scene.viewMode)}</p>
          </div>
        )}

      </section>

      <div className={isHeroScene ? "story-flow story-flow--hero" : "story-flow story-flow--story"}>
        {scenes.map((item, index) => (
          <section
            key={item.id}
            data-scene-index={index}
            ref={(element) => {
              sentinelRefs.current[index] = element;
            }}
            className={
              index === 0
                ? "story-step-section story-step-section--hero"
                : index === activeIdx
                  ? "story-step-section story-step-section--active"
                  : "story-step-section"
            }
          >
            {index > 0 && (() => {
              const itemNotes = item.annotationKey ? storyData.sceneAnnotations?.[item.annotationKey] ?? [] : [];

              return (
                <div className="story-step-grid">
                  <div className="story-step-column">
                    <article className={index === activeIdx ? "story-step-copy story-step-copy--active" : "story-step-copy"}>
                      {item.transition ? <p className="story-transition">{item.transition}</p> : null}
                      <div className="story-step-topline">
                        <span className="story-step-index">{String(index).padStart(2, "0")}</span>
                        <span className="card-kicker">{item.eyebrow}</span>
                      </div>
                      <h2 className="card-title">{item.title}</h2>
                      <p className="story-step-lede">{item.body}</p>
                      {itemNotes.length > 0 ? (
                        <div className="story-inline-notes">
                          {itemNotes.slice(0, 2).map((note) => (
                            <p key={note} className="story-inline-note">{note}</p>
                          ))}
                        </div>
                      ) : null}
                      {item.supportingFact && <p className="story-step-aside">{item.supportingFact}</p>}
                      {index === activeIdx ? (
                        <p className="story-inline-stat">
                          At <strong>{formatHour(activeSlice.hour)}</strong>, this scene shows <strong>{formatTrips(activeSlice.tripCount)}</strong> trips across <strong>{flows.length}</strong> visible flow links.
                        </p>
                      ) : null}
                    </article>

                    {index === activeIdx && (
                      <div className="story-step-support">
                        {renderEvidencePanel()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </section>
        ))}
      </div>

      <section className="method">
        <div className="method-inner">
          <span className="card-kicker">Method Appendix</span>
          <h2 className="method-title">Data, aggregation, and limitations</h2>
          <p className="method-lead">
            The frontend now reads true <strong>profile × hour</strong> slices derived from the 2025 TfL Santander Cycles archive.
            That means every hour on the slider resolves to a real aggregated map, rather than a broad daypart placeholder.
          </p>

          <div className="method-grid">
            <article className="method-card">
              <h3>Core datasets</h3>
              <ul>
                <li>TfL Santander Cycles annual trip archive, 2025</li>
                <li>TfL BikePoint API — station coordinates and capacity</li>
                <li>GLA London borough boundaries</li>
                <li>TfL cycle routes and infrastructure assets</li>
              </ul>
            </article>
            <article className="method-card">
              <h3>Aggregation</h3>
              <ul>
                <li>Trips grouped into recurring profiles: all days, weekdays and weekends</li>
                <li>Each profile split into 24 true hourly slices</li>
                <li>Top flows and hotspots preserved per hour for browser performance</li>
                <li>Supporting story metrics loaded from a separate story dataset</li>
              </ul>
            </article>
            <article className="method-card">
              <h3>Infrastructure proxy</h3>
              <ul>
                <li>OpenStreetMap cycleway tags for protected, painted and quiet routes</li>
                <li>500 m station context used as a proxy for low-stress support</li>
                <li>Not a full route-based accessibility model</li>
              </ul>
            </article>
            <article className="method-card">
              <h3>Limitations</h3>
              <ul>
                <li>Shows recurring hourly structure, not every raw trip trace</li>
                <li>No demographic or trip-purpose attributes</li>
                <li>Visual emphasis is editorial, not exhaustive exploration</li>
              </ul>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
