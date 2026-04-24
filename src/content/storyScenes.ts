import type { ColorScheme, ViewMode } from "../components/maps/OdFlowMapCanvas";
import type { StoryCameraPreset, StoryStationMetric } from "../types/story";

export type StoryProfileId = "all" | "weekdays" | "weekends";

export type EvidencePanelConfig = {
  type: "monthly" | "heatmap" | "borough" | "weekend-comparison" | null;
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
    defaultProfileId: "all",
    defaultHour: 17,
    viewMode: "routes",
    stationMetric: "annualTrips",
    camera: "hero",
    color: "cool",
    eyebrow: "Research question",
    title: "How does time shape bike share use?",
    body: "This project asks how seasonal, weekly and hourly rhythms shape the street-level geography of London's Santander Cycles trips.",
    supportingFact: "The main map shows inferred shortest-route street flow from aggregated OD pairs, not GPS traces.",
    navLabel: "Start",
  },
  {
    id: "season",
    annotationKey: "season",
    transition: "A yearly total is useful as a scale check, but it is a weak place to start the story.",
    defaultProfileId: "all",
    defaultHour: 17,
    viewMode: "routes",
    stationMetric: "annualTrips",
    camera: "spatial",
    color: "cool",
    eyebrow: "Scale 1 - month and season",
    title: "Start with the demand envelope.",
    body: "Monthly and seasonal totals show when the system has room to expand or contract. They do not yet prove a street geography, but they set the outer frame for interpreting later maps.",
    supportingFact: "The chart uses average trips per calendar day, so February and longer months are comparable.",
    evidencePanel: { type: "monthly" },
    navLabel: "Season",
  },
  {
    id: "week",
    annotationKey: "routine",
    transition: "Seasonality describes the envelope. The weekly routine explains why the same hour can mean different things.",
    defaultProfileId: "weekdays",
    defaultHour: 8,
    viewMode: "routes",
    stationMetric: "weekdayAMTrips",
    camera: "commute",
    color: "cool",
    eyebrow: "Scale 2 - weekly routine",
    title: "Weekdays and weekends use the clock differently.",
    body: "The comparison is normalized per profile day. That makes the routine visible without letting the larger number of weekdays overwhelm the weekend profile.",
    supportingFact: "The chart keeps all 24 hours available; the labeled peaks are generated from the data rather than selected as separate story chapters.",
    evidencePanel: { type: "weekend-comparison" },
    showControls: true,
    navLabel: "Week",
  },
  {
    id: "hour",
    annotationKey: "hour",
    transition: "The street-level question belongs to the hourly scale.",
    defaultProfileId: "all",
    defaultHour: 17,
    viewMode: "routes",
    stationMetric: "annualTrips",
    camera: "rhythm",
    color: "cool",
    eyebrow: "Scale 3 - hourly street flow",
    title: "The main atlas is hourly, not a handful of showcase hours.",
    body: "Use the full 24-hour timeline to see how inferred street flow concentrates, disperses and shifts. The visual grammar stays fixed: road color and width encode inferred average daily flow for the selected profile and hour.",
    supportingFact: "Road lines are inferred from aggregated OD pairs routed over the available cycling-permitted graph, not observed GPS paths.",
    evidencePanel: { type: "heatmap", config: { profileId: "all", title: "All-days 24-hour rhythm" } },
    showControls: true,
    navLabel: "Hour",
  },
  {
    id: "explorer",
    transition: "After the guided story, the page becomes a compact atlas.",
    defaultProfileId: "all",
    defaultHour: 17,
    viewMode: "routes",
    stationMetric: "annualTrips",
    camera: "spatial",
    color: "warm",
    eyebrow: "Explorer",
    title: "Test the rhythm directly.",
    body: "Switch between all days, weekdays and weekends, then scrub through the 24-hour atlas. This keeps the final interaction narrow: time scale, profile and layer, rather than a dense dashboard.",
    supportingFact: "Hover a road segment to inspect inferred edge flow and the top OD pairs that contributed to it.",
    showControls: true,
    navLabel: "Explore",
  },
  {
    id: "method",
    annotationKey: "method",
    transition: "The result should be read with its method visible.",
    defaultProfileId: "all",
    defaultHour: 17,
    viewMode: "routes",
    stationMetric: "annualTrips",
    camera: "conclusion",
    color: "cool",
    eyebrow: "Method boundary",
    title: "This is inferred street flow, not observed route choice.",
    body: "The current route-flow layer accumulates OD counts onto shortest paths on the bundled cycling-infrastructure graph. It is strong enough for a prototype atlas, but the final methodology needs graph coverage, station snap distance and unreachable OD counts audited explicitly.",
    supportingFact: "The appendix below records data sources, normalisation and route-inference limitations.",
    navLabel: "Method",
  },
];

export const heroFrames: Array<{ profileId: StoryProfileId; hour: number }> = [
  { profileId: "all", hour: 7 },
  { profileId: "weekdays", hour: 8 },
  { profileId: "all", hour: 13 },
  { profileId: "all", hour: 17 },
  { profileId: "weekends", hour: 13 },
  { profileId: "all", hour: 22 },
];
