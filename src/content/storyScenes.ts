import type { ColorScheme, ViewMode } from "../components/maps/OdFlowMapCanvas";
import type { StoryCameraPreset, StoryStationMetric } from "../types/story";

export type StoryProfileId = "all" | "weekdays" | "weekends";

export type EvidencePanelConfig = {
  type: "heatmap" | "borough" | "weekend-comparison" | null;
  config?: Record<string, unknown>;
} | null | undefined;

export type StoryScene = {
  id: string;
  annotationKey?: string;
  transition?: string;
  defaultProfileId: StoryProfileId;
  defaultHour: number;
  viewMode: ViewMode;
  stationMetric: StoryStationMetric;
  camera: StoryCameraPreset;
  color: ColorScheme;
  eyebrow: string;
  title: string;
  body: string;
  supportingFact?: string;
  evidencePanel?: EvidencePanelConfig;
  showParticles?: boolean;
  showContours?: boolean;
  showControls?: boolean;
  navLabel?: string;
};

export const storyScenes: StoryScene[] = [
  {
    id: "hero",
    annotationKey: "hero",
    defaultProfileId: "weekdays",
    defaultHour: 8,
    viewMode: "flows",
    stationMetric: "annualTrips",
    camera: "hero",
    color: "cool",
    eyebrow: "London Shared Bike Rhythms",
    title: "One network. Many temporal Londons.",
    body: "We begin with a simple claim: London's bike-share system is not one static map. Across 2025, Santander Cycles logged 8.9 million valid journeys across 800 stations, but the city those journeys describe keeps changing with the hour.",
    supportingFact: "This story follows a typical week built from the full 2025 archive.",
    showParticles: true,
    navLabel: "Start",
  },
  {
    id: "rhythm",
    annotationKey: "rhythm",
    transition: "To see that change clearly, we begin by following a full day.",
    defaultProfileId: "all",
    defaultHour: 17,
    viewMode: "flows",
    stationMetric: "annualTrips",
    camera: "rhythm",
    color: "cool",
    eyebrow: "Act 1 · 24-hour rhythm",
    title: "First, watch the network breathe across the day.",
    body: "If we scrub through the typical day, London does not simply get busier and quieter. By 17:00 the all-days profile reaches 900,571 trips; by 03:00 it falls to 18,633. As volume rises and falls, the center of activity also shifts across space.",
    supportingFact: "Each step on the slider is a real hourly aggregation from the 2025 archive.",
    evidencePanel: { type: "heatmap", config: { profileId: "all", title: "Typical 24-hour volume" } },
    showParticles: true,
    showControls: true,
    navLabel: "24h",
  },
  {
    id: "weekday",
    annotationKey: "commute",
    transition: "But the all-day rhythm still hides the system’s sharpest shape.",
    defaultProfileId: "weekdays",
    defaultHour: 8,
    viewMode: "flows",
    stationMetric: "weekdayAMTrips",
    camera: "commute",
    color: "cool",
    eyebrow: "Act 2 · Weekday peak",
    title: "In the morning, the city tightens.",
    body: "On weekdays, the clearest commuter shape appears at 08:00, when demand reaches 806,716 trips. Waterloo to Bank and St Paul's becomes especially prominent, and east-London links such as Bow to Mile End also sharpen. Compared with 14:00, the system is nearly three times busier and far more directional.",
    supportingFact: "The weekday peak is not only larger than midday. It is more concentrated, more channelled, and more visibly pulled toward the central city.",
    evidencePanel: { type: "heatmap", config: { profileId: "weekdays", title: "Weekday hourly shape" } },
    showParticles: true,
    showControls: true,
    navLabel: "Weekday",
  },
  {
    id: "weekend",
    annotationKey: "weekend",
    transition: "That weekday city is only half of the story.",
    defaultProfileId: "weekends",
    defaultHour: 14,
    viewMode: "flows",
    stationMetric: "weekendMiddayTrips",
    camera: "weekend",
    color: "warm",
    eyebrow: "Act 3 · Weekend city",
    title: "At the weekend, the city arrives later.",
    body: "Weekend demand peaks around 13:00 with 173,293 trips and stays high into 14:00, creating a broader midday plateau. The map loosens with it: commuter intensity gives way to leisure clusters, and Hyde Park plus Kensington Gardens become much more legible as destinations in their own right.",
    supportingFact: "The weekend city is defined by a later peak, a wider afternoon spread, and a stronger park-centered pattern.",
    evidencePanel: { type: "weekend-comparison" },
    showParticles: true,
    showControls: true,
    navLabel: "Weekend",
  },
  {
    id: "spatial",
    transition: "To compare those temporal cities directly, we need to step back from the flow lines.",
    defaultProfileId: "weekends",
    defaultHour: 14,
    viewMode: "hotspots",
    stationMetric: "annualTrips",
    camera: "spatial",
    color: "purple",
    eyebrow: "Act 4 · Spatial shift",
    title: "Now step back and watch time reorganise space.",
    body: "This is the same story told with a different visual grammar. When OD lines become too dense to parse on their own, contours make the shift legible. The City of London stays the sharpest concentration of recurring activity, while Westminster and the park edge become more visible when the network relaxes.",
    supportingFact: "In the current story dataset, City of London has the highest trip intensity. Westminster is next, while Newham and Camden also stand out.",
    evidencePanel: { type: "borough", config: { metric: "tripIntensity", limit: 8, title: "Borough trip intensity" } },
    showContours: true,
    showControls: true,
    navLabel: "Spatial",
  },
  {
    id: "conclusion",
    annotationKey: "conclusion",
    transition: "Taken together, these chapters point to the same conclusion.",
    defaultProfileId: "all",
    defaultHour: 17,
    viewMode: "flows",
    stationMetric: "annualTrips",
    camera: "conclusion",
    color: "cool",
    eyebrow: "Act 5 · What this reveals",
    title: "Taken together, these scenes show a rhythm system, not a static network.",
    body: "A single annual map would flatten the most important pattern. What the 2025 archive actually reveals is a sequence of recurring urban conditions: a tightened weekday morning, a later and broader weekend city, and several transition hours in between. The geography that matters is the one that keeps changing.",
    supportingFact: "The method appendix below explains how this hourly synthesis was built and where its limits remain.",
    navLabel: "Conclusion",
  },
];

export const heroFrames: Array<{ profileId: StoryProfileId; hour: number }> = [
  { profileId: "weekdays", hour: 8 },
  { profileId: "all", hour: 12 },
  { profileId: "weekdays", hour: 17 },
  { profileId: "weekends", hour: 14 },
  { profileId: "all", hour: 22 },
];
