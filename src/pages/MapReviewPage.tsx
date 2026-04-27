import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useSearchParams } from "react-router-dom";
import { WeekdayWeekendChart } from "../components/charts/WeekdayWeekendChart";
import { OdFlowMapCanvas } from "../components/maps/OdFlowMapCanvas";
import { useHourlyFlows } from "../hooks/useHourlyFlows";
import { useOdRouteLens } from "../hooks/useOdRouteLens";
import { useRouteFlows } from "../hooks/useRouteFlows";
import { useServiceContext } from "../hooks/useServiceContext";
import { useStoryDataset } from "../hooks/useStoryDataset";
import type { HourlyFlow, HourlySlice } from "../hooks/useHourlyFlows";
import type { ColorScheme, FunctionAnchor, FunctionAnchorTone } from "../components/maps/OdFlowMapCanvas";
import type { ExploreLayerId, LanduseCategory, OdRouteLensRoute, PoiCategory, RouteColorMode, ServiceContextPoiFeature, ServiceLanduseFeature } from "../types/routeLens";
import type { RouteFlowSlice, StoryProfileId } from "../types/routeFlows";
import type { StationInfraMetricRecord } from "../types/story";

type ReviewTrackId = "weekday" | "weekend";
type ReviewStepProfileId = "weekdays" | "weekends";

type ReviewStepSummary = {
  routeSlice: RouteFlowSlice;
  hourlySlice: HourlySlice;
  averageDailyTrips: number;
  topHotspots: string[];
  topFlows: string[];
};

type ReviewStepDefinition = {
  id: string;
  trackId: ReviewTrackId;
  profileId: ReviewStepProfileId;
  hour: number;
  timeLabel: string;
  railLabel: string;
  slotLabel: string;
  title: string;
  colorScheme: ColorScheme;
  body: (summary: ReviewStepSummary) => string;
  note: (summary: ReviewStepSummary) => string;
};

type ReviewTrackDefinition = {
  id: ReviewTrackId;
  label: string;
  eyebrow: string;
  intro: string;
  steps: ReviewStepDefinition[];
};

type RegimeFunctionId = "transit-work" | "park-leisure" | "culture-retail" | "night-social" | "civic-health";

type FunctionRegimeRow = {
  stepId: string;
  label: string;
  regime: string;
  values: Record<RegimeFunctionId, 0 | 1 | 2 | 3>;
};

const exploreLayerOptions: Array<{ id: ExploreLayerId; label: string }> = [
  { id: "routes", label: "Routes" },
  { id: "hotspots", label: "Hotspots" },
  { id: "stations", label: "Stations" },
  { id: "poi", label: "POI" },
  { id: "landuse", label: "Land use" },
];

type ExploreLayerState = Record<ExploreLayerId, boolean>;

const defaultExploreLayers: ExploreLayerState = {
  routes: true,
  hotspots: false,
  stations: false,
  poi: false,
  landuse: true,
};

const poiLabels: Record<PoiCategory, string> = {
  transit: "Transit",
  "office-work": "Office / work",
  "food-night": "Food / night",
  retail: "Retail",
  "culture-tourism": "Culture",
  education: "Education",
  health: "Health",
  civic: "Civic",
  "sport-leisure": "Sport / leisure",
};

const landuseLabels: Record<LanduseCategory, string> = {
  commercial: "Commercial",
  retail: "Retail",
  residential: "Residential",
  "education-civic": "Education / civic",
  "leisure-park": "Leisure / park",
  industrial: "Industrial",
};

const poiLegendCategories: PoiCategory[] = ["transit", "office-work", "food-night", "retail", "culture-tourism", "sport-leisure"];
const landuseLegendCategories: LanduseCategory[] = ["commercial", "retail", "residential", "education-civic", "leisure-park", "industrial"];

const regimeFunctionColumns: Array<{ id: RegimeFunctionId; label: string; short: string }> = [
  { id: "transit-work", label: "Transit / work", short: "Work" },
  { id: "park-leisure", label: "Park / leisure", short: "Park" },
  { id: "culture-retail", label: "Culture / retail", short: "Visit" },
  { id: "night-social", label: "Night / social", short: "Night" },
  { id: "civic-health", label: "Civic / health", short: "Civic" },
];

const functionRegimeRows: FunctionRegimeRow[] = [
  {
    stepId: "weekdays-08",
    label: "Weekday 08",
    regime: "Rail-employment access",
    values: { "transit-work": 3, "park-leisure": 0, "culture-retail": 1, "night-social": 0, "civic-health": 0 },
  },
  {
    stepId: "weekdays-13",
    label: "Weekday 13",
    regime: "Mixed central short trips",
    values: { "transit-work": 1, "park-leisure": 2, "culture-retail": 2, "night-social": 0, "civic-health": 1 },
  },
  {
    stepId: "weekdays-17",
    label: "Weekday 17",
    regime: "Employment release",
    values: { "transit-work": 3, "park-leisure": 0, "culture-retail": 1, "night-social": 0, "civic-health": 0 },
  },
  {
    stepId: "weekdays-23",
    label: "Weekday 23",
    regime: "Late-evening fragments",
    values: { "transit-work": 1, "park-leisure": 0, "culture-retail": 1, "night-social": 3, "civic-health": 2 },
  },
  {
    stepId: "weekends-08",
    label: "Weekend 08",
    regime: "Early leisure field",
    values: { "transit-work": 0, "park-leisure": 2, "culture-retail": 2, "night-social": 0, "civic-health": 0 },
  },
  {
    stepId: "weekends-13",
    label: "Weekend 13",
    regime: "Park accessibility",
    values: { "transit-work": 0, "park-leisure": 3, "culture-retail": 2, "night-social": 0, "civic-health": 0 },
  },
  {
    stepId: "weekends-17",
    label: "Weekend 17",
    regime: "Lingering leisure",
    values: { "transit-work": 0, "park-leisure": 3, "culture-retail": 2, "night-social": 1, "civic-health": 0 },
  },
  {
    stepId: "weekends-23",
    label: "Weekend 23",
    regime: "Night-time social geography",
    values: { "transit-work": 1, "park-leisure": 0, "culture-retail": 1, "night-social": 3, "civic-health": 1 },
  },
];

const reviewTracks: ReviewTrackDefinition[] = [
  {
    id: "weekday",
    label: "Weekday",
    eyebrow: "Weekday guided story",
    intro:
      "Across weekdays, the same docking network moves through a sequence of mobility regimes: rail-employment access in the morning, mixed central short trips at midday, employment release in the evening, and a thinner late-evening service geography.",
    steps: [
      {
        id: "weekdays-08",
        trackId: "weekday",
        profileId: "weekdays",
        hour: 8,
        timeLabel: "08:00",
        railLabel: "08",
        slotLabel: "Morning peak",
        title: "Inbound work access",
        colorScheme: "cool",
        body: ({ averageDailyTrips, topHotspots }) =>
          `In a typical weekday morning at 08:00, the network reaches ${formatPrecise(averageDailyTrips)} trips per profile day and the routed street texture converges most clearly on ${joinNatural(topHotspots.slice(0, 3))}. In urban science terms, this is an access regime: the same docking infrastructure is being reweighted towards rail terminals, the City and the inner employment core.`,
        note: ({ topFlows }) =>
          `Leading retained pairs include ${joinNatural(topFlows.slice(0, 3))}.`,
      },
      {
        id: "weekdays-13",
        trackId: "weekday",
        profileId: "weekdays",
        hour: 13,
        timeLabel: "13:00",
        railLabel: "13",
        slotLabel: "Midday lull",
        title: "A more mixed central geography",
        colorScheme: "warm",
        body: ({ averageDailyTrips, topHotspots }) =>
          `By 13:00 on weekdays, activity falls to ${formatPrecise(averageDailyTrips)} trips per profile day and the work-centred pattern loosens. ${joinNatural(topHotspots.slice(0, 4))} rise into the hotspot set together, showing how land-use context changes the network's function: office access, short lunchtime circulation and park-adjacent trips overlap in the same central street system.`,
        note: ({ topFlows }) =>
          `The strongest retained movements shift towards shorter central links, including ${joinNatural(topFlows.slice(0, 3))}.`,
      },
      {
        id: "weekdays-17",
        trackId: "weekday",
        profileId: "weekdays",
        hour: 17,
        timeLabel: "17:00",
        railLabel: "17",
        slotLabel: "Evening peak",
        title: "Release from the employment core",
        colorScheme: "cool",
        body: ({ averageDailyTrips, topHotspots }) =>
          `In the weekday evening peak at 17:00, volume rises again to ${formatPrecise(averageDailyTrips)} trips per weekday, but the directional logic changes. ${joinNatural(topHotspots.slice(0, 5))} dominate the active network, and the same work-facing system now reads less as a morning pull into the centre than as an outward release from it.`,
        note: ({ topFlows }) =>
          `The clearest retained pairs now feed back towards Waterloo, including ${joinNatural(topFlows.slice(0, 3))}.`,
      },
      {
        id: "weekdays-23",
        trackId: "weekday",
        profileId: "weekdays",
        hour: 23,
        timeLabel: "23:00",
        railLabel: "23",
        slotLabel: "Late evening",
        title: "A thinner late-night geography",
        colorScheme: "purple",
        body: ({ averageDailyTrips, topHotspots }) =>
          `By 23:00 on weekdays, demand drops to ${formatPrecise(averageDailyTrips)} trips per weekday and the map recentres on ${joinNatural(topHotspots.slice(0, 4))}. Classic commuter anchors no longer dominate. What remains is a thinner temporal layer of essential institutions, riverfront destinations and mixed late-evening districts.`,
        note: ({ topFlows }) =>
          `The retained pairs are smaller and more scattered, with ${joinNatural(topFlows.slice(0, 3))} among the strongest links.`,
      },
    ],
  },
  {
    id: "weekend",
    label: "Weekend",
    eyebrow: "Weekend guided story",
    intro:
      "Weekends follow a different time structure. The morning starts thinner and more dispersed, afternoon and early evening consolidate into a park and leisure accessibility regime, and late night recentres on a social geography rather than the weekday employment core.",
    steps: [
      {
        id: "weekends-08",
        trackId: "weekend",
        profileId: "weekends",
        hour: 8,
        timeLabel: "08:00",
        railLabel: "08",
        slotLabel: "Quiet start",
        title: "A dispersed early-day field",
        colorScheme: "warm",
        body: ({ averageDailyTrips, topHotspots }) =>
          `In a typical weekend morning at 08:00, the network is still relatively light at ${formatPrecise(averageDailyTrips)} trips per profile day. ${joinNatural(topHotspots.slice(0, 4))} sit near the top of the hotspot set, producing a scattered early-day pattern that is already less commuter-oriented than its weekday equivalent.`,
        note: ({ topFlows }) =>
          `The strongest retained pairs remain comparatively small, including ${joinNatural(topFlows.slice(0, 3))}.`,
      },
      {
        id: "weekends-13",
        trackId: "weekend",
        profileId: "weekends",
        hour: 13,
        timeLabel: "13:00",
        railLabel: "13",
        slotLabel: "Afternoon peak",
        title: "Parks and leisure dominate",
        colorScheme: "warm",
        body: ({ averageDailyTrips, topHotspots }) =>
          `By 13:00 on weekends, activity reaches ${formatPrecise(averageDailyTrips)} trips per day and the map locks decisively onto ${joinNatural(topHotspots.slice(0, 4))}. This is not simply weaker weekday demand. It is a different accessibility regime, organised around parks, open space and leisure-oriented central movement.`,
        note: ({ topFlows }) =>
          `The clearest retained pairs are short internal park links such as ${joinNatural(topFlows.slice(0, 3))}.`,
      },
      {
        id: "weekends-17",
        trackId: "weekend",
        profileId: "weekends",
        hour: 17,
        timeLabel: "17:00",
        railLabel: "17",
        slotLabel: "Lingering evening",
        title: "The leisure regime persists",
        colorScheme: "warm",
        body: ({ averageDailyTrips, topHotspots }) =>
          `By 17:00 on weekends, use remains high at ${formatPrecise(averageDailyTrips)} trips per day and ${joinNatural(topHotspots.slice(0, 5))} continue to dominate the field. The afternoon leisure regime therefore persists into early evening, showing a temporal extension of green-space and visitor accessibility rather than a short lunchtime spike.`,
        note: ({ topFlows }) =>
          `The strongest retained links still circle the western park system, including ${joinNatural(topFlows.slice(0, 3))}.`,
      },
      {
        id: "weekends-23",
        trackId: "weekend",
        profileId: "weekends",
        hour: 23,
        timeLabel: "23:00",
        railLabel: "23",
        slotLabel: "Night-time social city",
        title: "A looser late-night network",
        colorScheme: "purple",
        body: ({ averageDailyTrips, topHotspots }) =>
          `By 23:00 on weekends, activity falls to ${formatPrecise(averageDailyTrips)} trips per day and the map recentres on ${joinNatural(topHotspots.slice(0, 4))}. The park-oriented afternoon field gives way to a more diffuse social geography tied to late-evening central districts, riverfront destinations and eastern interchange edges.`,
        note: ({ topFlows }) =>
          `The strongest retained links now include ${joinNatural(topFlows.slice(0, 3))}, revealing a scattered rather than corridor-dominant night pattern.`,
      },
    ],
  },
];

const stepFunctionAnchors: Record<string, FunctionAnchor[]> = {
  "weekdays-08": [
    { id: "wk08-waterloo", label: "Waterloo Station", lon: -0.112824, lat: 51.503791, tone: "blue", weight: 1.35, category: "Rail terminal", description: "Morning work anchor", evidence: "Top weekday 08:00 hotspot and leading OD origin" },
    { id: "wk08-bank", label: "Queen Street", lon: -0.09294, lat: 51.511553, tone: "blue", weight: 1.05, category: "Employment core", description: "Bank / City destination", evidence: "Strong 08:00 destination from Waterloo" },
    { id: "wk08-moorgate", label: "Moorfields", lon: -0.088285, lat: 51.519069, tone: "blue", weight: 0.92, category: "Employment core", description: "Moorgate office cluster", evidence: "High weekday morning activity" },
    { id: "wk08-stratford", label: "Stratford Station", lon: -0.00481, lat: 51.541793, tone: "blue", weight: 0.86, category: "Interchange edge", description: "Eastern transfer node", evidence: "Leading pair with Monier Road at 08:00" },
    { id: "wk08-city", label: "City of London", lon: -0.0915, lat: 51.5148, tone: "blue", weight: 1.05, category: "Functional district", description: "Main weekday employment core", evidence: "Concentration of weekday morning destinations" },
    { id: "wk08-cheapside", label: "Cheapside", lon: -0.09294, lat: 51.51397, tone: "blue", weight: 0.8, category: "Employment core", description: "Secondary City destination", evidence: "Appears in leading morning pairs" },
  ],
  "weekdays-13": [
    { id: "wk13-hydepark", label: "Hyde Park Corner", lon: -0.15352, lat: 51.503117, tone: "green", weight: 1.2, category: "Park access", description: "Green-space anchor", evidence: "Top weekday 13:00 hotspot" },
    { id: "wk13-albert", label: "Albert Gate", lon: -0.158456, lat: 51.502953, tone: "green", weight: 0.98, category: "Park access", description: "Hyde Park edge", evidence: "Strong midday park circulation" },
    { id: "wk13-exhibition", label: "Exhibition Road", lon: -0.174554, lat: 51.499917, tone: "orange", weight: 0.92, category: "Cultural destination", description: "Museum quarter", evidence: "Top weekday 13:00 hotspot" },
    { id: "wk13-borough", label: "Hop Exchange", lon: -0.091773, lat: 51.504627, tone: "orange", weight: 0.78, category: "Mixed central activity", description: "Lunch and short central circulation", evidence: "Persistent midday activity in The Borough" },
    { id: "wk13-hydepark-district", label: "Hyde Park", lon: -0.167, lat: 51.5074, tone: "green", weight: 1.08, category: "Functional zone", description: "Midday open-space destination", evidence: "Weekday midday route texture thickens around the park system" },
    { id: "wk13-smithfield", label: "West Smithfield", lon: -0.100791, lat: 51.518218, tone: "orange", weight: 0.68, category: "Mixed central activity", description: "Short lunchtime circulation", evidence: "Leading midday link towards Waterloo" },
  ],
  "weekdays-17": [
    { id: "wk17-waterloo", label: "Waterloo Station", lon: -0.112824, lat: 51.503791, tone: "blue", weight: 1.32, category: "Rail terminal", description: "Evening release anchor", evidence: "Dominant 17:00 destination" },
    { id: "wk17-livst", label: "Wormwood Street", lon: -0.082422, lat: 51.516154, tone: "blue", weight: 1.02, category: "Employment core", description: "Liverpool Street edge", evidence: "Leading 17:00 flow to Waterloo" },
    { id: "wk17-kx", label: "Argyle Street", lon: -0.123944, lat: 51.529416, tone: "blue", weight: 0.95, category: "Rail node", description: "King's Cross connector", evidence: "High evening hotspot intensity" },
    { id: "wk17-bank", label: "Cheapside", lon: -0.09294, lat: 51.51397, tone: "blue", weight: 0.88, category: "Employment core", description: "City departure point", evidence: "Leading return-oriented pair" },
    { id: "wk17-city", label: "City of London", lon: -0.0915, lat: 51.5148, tone: "blue", weight: 1.02, category: "Functional district", description: "Evening release from the City", evidence: "Dense 17:00 street-use texture in the central employment core" },
    { id: "wk17-waterloo1", label: "Waterloo Station", lon: -0.113864, lat: 51.504027, tone: "blue", weight: 0.8, category: "Rail terminal", description: "Secondary Waterloo anchor", evidence: "Consistently high in weekday peaks" },
  ],
  "weekdays-23": [
    { id: "wk23-soho", label: "Soho Square", lon: -0.132328, lat: 51.515631, tone: "pink", weight: 1.05, category: "Nightlife", description: "Late-evening social core", evidence: "Recurring late-night hotspot" },
    { id: "wk23-tooley", label: "Tooley Street", lon: -0.07962, lat: 51.503493, tone: "pink", weight: 0.95, category: "Late-evening district", description: "Southern riverfront anchor", evidence: "Strong 23:00 activity" },
    { id: "wk23-hop", label: "Hop Exchange", lon: -0.091773, lat: 51.504627, tone: "pink", weight: 0.88, category: "Social district", description: "Borough evening node", evidence: "Persistent after-hours activity" },
    { id: "wk23-hospital", label: "Royal London Hospital", lon: -0.06111, lat: 51.518675, tone: "blue", weight: 0.82, category: "Institutional anchor", description: "Late-night essential node", evidence: "Top 23:00 hotspot in Whitechapel" },
    { id: "wk23-westend", label: "West End", lon: -0.1312, lat: 51.5119, tone: "pink", weight: 0.94, category: "Functional district", description: "Night-time social core", evidence: "Late-evening activity clusters around Soho and nearby streets" },
    { id: "wk23-oldstreet", label: "Old Street", lon: -0.088532, lat: 51.525615, tone: "pink", weight: 0.74, category: "Late-evening district", description: "Northern night node", evidence: "Weekend and weekday late-night hotspot" },
  ],
  "weekends-08": [
    { id: "we08-serp", label: "Serpentine Car Park", lon: -0.17306, lat: 51.505014, tone: "green", weight: 1.04, category: "Park access", description: "Early park movement", evidence: "Top weekend 08:00 hotspot" },
    { id: "we08-ethel", label: "Ethelburga Estate", lon: -0.164786, lat: 51.477292, tone: "orange", weight: 0.9, category: "Leisure edge", description: "Southern weekend destination", evidence: "High early-weekend activity" },
    { id: "we08-exhibition", label: "Exhibition Road", lon: -0.174554, lat: 51.499917, tone: "orange", weight: 0.84, category: "Cultural destination", description: "West-end visitor activity", evidence: "Persistent weekend morning hotspot" },
    { id: "we08-borough", label: "Hop Exchange", lon: -0.091773, lat: 51.504627, tone: "orange", weight: 0.72, category: "Mixed central activity", description: "Early central circulation", evidence: "Weekend morning hotspot in The Borough" },
    { id: "we08-hydepark", label: "Hyde Park", lon: -0.167, lat: 51.5074, tone: "green", weight: 0.98, category: "Functional zone", description: "Early leisure field", evidence: "Weekend morning route texture already thickens around the western park system" },
    { id: "we08-southken", label: "South Kensington", lon: -0.178, lat: 51.496, tone: "orange", weight: 0.72, category: "Visitor district", description: "Museum-quarter access", evidence: "Cultural destinations appear before the afternoon peak" },
  ],
  "weekends-13": [
    { id: "we13-hydepark", label: "Hyde Park Corner", lon: -0.15352, lat: 51.503117, tone: "green", weight: 1.34, category: "Park access", description: "Main leisure anchor", evidence: "Top weekend 13:00 hotspot" },
    { id: "we13-albert", label: "Albert Gate", lon: -0.158456, lat: 51.502953, tone: "green", weight: 1.12, category: "Park circulation", description: "Internal Hyde Park movement", evidence: "Leading pair with Hyde Park Corner" },
    { id: "we13-blacklion", label: "Black Lion Gate", lon: -0.187842, lat: 51.509908, tone: "green", weight: 1.04, category: "Green-space edge", description: "Kensington Gardens anchor", evidence: "Top weekend 13:00 hotspot" },
    { id: "we13-serp", label: "Serpentine Car Park", lon: -0.17306, lat: 51.505014, tone: "green", weight: 0.96, category: "Park circulation", description: "Internal park movement", evidence: "Strong midday park pair" },
    { id: "we13-hop", label: "Hop Exchange", lon: -0.091773, lat: 51.504627, tone: "orange", weight: 0.7, category: "Mixed central activity", description: "Secondary central leisure node", evidence: "Appears behind western park system" },
    { id: "we13-hydepark-district", label: "Hyde Park", lon: -0.167, lat: 51.5074, tone: "green", weight: 1.22, category: "Functional zone", description: "Main weekend leisure field", evidence: "Weekend afternoon routes concentrate across the whole park system" },
    { id: "we13-exhibition", label: "Exhibition Road", lon: -0.174554, lat: 51.499917, tone: "orange", weight: 0.76, category: "Cultural destination", description: "Secondary leisure anchor", evidence: "Weekend afternoon hotspot at the museum quarter edge" },
  ],
  "weekends-17": [
    { id: "we17-hydepark", label: "Hyde Park Corner", lon: -0.15352, lat: 51.503117, tone: "green", weight: 1.26, category: "Park access", description: "Lingering leisure anchor", evidence: "Strong weekend 17:00 hotspot" },
    { id: "we17-albert", label: "Albert Gate", lon: -0.158456, lat: 51.502953, tone: "green", weight: 1.1, category: "Park edge", description: "Hyde Park circulation", evidence: "Weekend evening park pair" },
    { id: "we17-blacklion", label: "Black Lion Gate", lon: -0.187842, lat: 51.509908, tone: "green", weight: 0.98, category: "Green-space edge", description: "Western park system", evidence: "Persistent leisure hotspot at 17:00" },
    { id: "we17-bps", label: "Battersea Power Station", lon: -0.147714, lat: 51.483507, tone: "orange", weight: 0.86, category: "Leisure destination", description: "South-west destination", evidence: "Important secondary weekend evening node" },
    { id: "we17-hydepark-district", label: "Hyde Park", lon: -0.167, lat: 51.5074, tone: "green", weight: 1.12, category: "Functional zone", description: "Lingering leisure field", evidence: "Weekend evening movement stays concentrated around parks" },
    { id: "we17-battersea", label: "Battersea", lon: -0.152, lat: 51.482, tone: "orange", weight: 0.76, category: "Leisure district", description: "South-west destination zone", evidence: "Secondary route concentration near Battersea" },
  ],
  "weekends-23": [
    { id: "we23-soho", label: "Moor Street", lon: -0.13011, lat: 51.513527, tone: "pink", weight: 1.08, category: "Nightlife", description: "West End social core", evidence: "Weekend 23:00 hotspot in Soho" },
    { id: "we23-sohosq", label: "Soho Square", lon: -0.132328, lat: 51.515631, tone: "pink", weight: 0.96, category: "Nightlife", description: "Late-evening social cluster", evidence: "Recurring weekend night hotspot" },
    { id: "we23-tooley", label: "Tooley Street", lon: -0.07962, lat: 51.503493, tone: "pink", weight: 0.9, category: "Late-evening district", description: "South bank night movement", evidence: "Strong weekend 23:00 activity" },
    { id: "we23-westminster", label: "Westminster Pier", lon: -0.123823, lat: 51.501513, tone: "pink", weight: 0.84, category: "Riverfront", description: "Night-time river edge", evidence: "Weekend late-evening anchor" },
    { id: "we23-hospital", label: "Royal London Hospital", lon: -0.06111, lat: 51.518675, tone: "blue", weight: 0.72, category: "Institutional anchor", description: "Whitechapel late-night node", evidence: "Top weekend 23:00 hotspot" },
    { id: "we23-westend", label: "West End", lon: -0.1312, lat: 51.5119, tone: "pink", weight: 1.02, category: "Functional district", description: "Night-time social zone", evidence: "Weekend late-evening activity thickens around Soho and nearby streets" },
    { id: "we23-southbank", label: "South Bank", lon: -0.106, lat: 51.504, tone: "pink", weight: 0.78, category: "Riverfront district", description: "Late-night river edge", evidence: "Strong late-evening movement along the Thames edge" },
  ],
};

type AreaLabel = {
  id: string;
  text: string;
  lon: number;
  lat: number;
  size?: "sm" | "md";
};

const stepAreaLabels: Record<string, AreaLabel[]> = {
  "weekdays-08": [
    { id: "wk08-waterloo", text: "Waterloo", lon: -0.114, lat: 51.5044, size: "md" },
    { id: "wk08-city", text: "City of London", lon: -0.092, lat: 51.5147, size: "md" },
    { id: "wk08-kx", text: "King's Cross", lon: -0.123, lat: 51.5302 },
    { id: "wk08-stratford", text: "Stratford", lon: -0.003, lat: 51.5417 },
  ],
  "weekdays-13": [
    { id: "wk13-hydepark", text: "Hyde Park", lon: -0.167, lat: 51.5085, size: "md" },
    { id: "wk13-exhibition", text: "Exhibition Road", lon: -0.176, lat: 51.4998 },
    { id: "wk13-borough", text: "Borough", lon: -0.091, lat: 51.5047 },
    { id: "wk13-city", text: "City of London", lon: -0.094, lat: 51.515 },
  ],
  "weekdays-17": [
    { id: "wk17-waterloo", text: "Waterloo", lon: -0.114, lat: 51.5045, size: "md" },
    { id: "wk17-city", text: "City of London", lon: -0.092, lat: 51.5147, size: "md" },
    { id: "wk17-liverpool", text: "Liverpool Street", lon: -0.082, lat: 51.5171 },
    { id: "wk17-kx", text: "King's Cross", lon: -0.123, lat: 51.5302 },
  ],
  "weekdays-23": [
    { id: "wk23-soho", text: "Soho", lon: -0.133, lat: 51.5149, size: "md" },
    { id: "wk23-westend", text: "West End", lon: -0.129, lat: 51.5114, size: "md" },
    { id: "wk23-southbank", text: "South Bank", lon: -0.106, lat: 51.5043 },
    { id: "wk23-whitechapel", text: "Whitechapel", lon: -0.061, lat: 51.519 },
  ],
  "weekends-08": [
    { id: "we08-hydepark", text: "Hyde Park", lon: -0.167, lat: 51.5084, size: "md" },
    { id: "we08-southken", text: "South Kensington", lon: -0.177, lat: 51.4965 },
    { id: "we08-borough", text: "Borough", lon: -0.091, lat: 51.5047 },
  ],
  "weekends-13": [
    { id: "we13-hydepark", text: "Hyde Park", lon: -0.167, lat: 51.5085, size: "md" },
    { id: "we13-kensington", text: "Kensington Gardens", lon: -0.184, lat: 51.5099, size: "md" },
    { id: "we13-southken", text: "South Kensington", lon: -0.177, lat: 51.4965 },
    { id: "we13-borough", text: "Borough", lon: -0.091, lat: 51.5047 },
  ],
  "weekends-17": [
    { id: "we17-hydepark", text: "Hyde Park", lon: -0.167, lat: 51.5085, size: "md" },
    { id: "we17-kensington", text: "Kensington Gardens", lon: -0.184, lat: 51.5099 },
    { id: "we17-battersea", text: "Battersea", lon: -0.151, lat: 51.4837, size: "md" },
  ],
  "weekends-23": [
    { id: "we23-soho", text: "Soho", lon: -0.133, lat: 51.5148, size: "md" },
    { id: "we23-westend", text: "West End", lon: -0.129, lat: 51.5114, size: "md" },
    { id: "we23-southbank", text: "South Bank", lon: -0.106, lat: 51.5042 },
    { id: "we23-whitechapel", text: "Whitechapel", lon: -0.061, lat: 51.519 },
    { id: "we23-oldstreet", text: "Old Street", lon: -0.089, lat: 51.5254 },
  ],
};

const baseAreaLabels: AreaLabel[] = [
  { id: "base-westminster", text: "Westminster", lon: -0.128, lat: 51.5018 },
  { id: "base-city", text: "City of London", lon: -0.0915, lat: 51.5146, size: "md" },
  { id: "base-soho", text: "Soho", lon: -0.133, lat: 51.5149 },
  { id: "base-southbank", text: "South Bank", lon: -0.106, lat: 51.5042 },
  { id: "base-hydepark", text: "Hyde Park", lon: -0.167, lat: 51.5085, size: "md" },
  { id: "base-borough", text: "Borough", lon: -0.091, lat: 51.5047 },
  { id: "base-kingscross", text: "King's Cross", lon: -0.123, lat: 51.5302 },
  { id: "base-whitechapel", text: "Whitechapel", lon: -0.061, lat: 51.519 },
  { id: "base-stratford", text: "Stratford", lon: -0.003, lat: 51.5417 },
];

const evidenceStepIds = new Set(["weekdays-08", "weekends-13"]);

function dominantToneForStep(stepId: string): FunctionAnchorTone {
  if (stepId.includes("23")) return "pink";
  if (stepId.includes("13") || stepId.includes("17")) {
    return stepId.startsWith("weekend") ? "green" : "orange";
  }
  return stepId.startsWith("weekday") ? "blue" : "orange";
}

const reviewSteps = reviewTracks.flatMap((track) => track.steps);
const reviewStepsById = Object.fromEntries(reviewSteps.map((step) => [step.id, step])) as Record<string, ReviewStepDefinition>;
const storyRoutePrefetchSlices = reviewSteps.map((step) => ({ profileId: step.profileId, hour: step.hour }));

function normalizeProfile(value: string | null): ReviewStepProfileId | null {
  return value === "weekdays" || value === "weekends" ? value : null;
}

function normalizeHour(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : null;
}

function formatPrecise(value: number) {
  return value.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function compactPlace(name: string) {
  return (name.split(",")[0]?.trim() ?? name).replace(/\s+\d+$/, "");
}

function joinNatural(items: string[]) {
  const filtered = items.filter(Boolean);
  if (filtered.length === 0) return "no dominant locations";
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(", ")} and ${filtered.at(-1)}`;
}

function isLoopFlow(flow: HourlyFlow) {
  return flow.oName === flow.dName || (flow.oLon === flow.dLon && flow.oLat === flow.dLat);
}

function stepFromQuery(profileId: ReviewStepProfileId | null, hour: number | null) {
  if (!profileId || hour === null) return null;
  return reviewSteps.find((step) => step.profileId === profileId && step.hour === hour) ?? null;
}

function summaryForStep(routeSlice: RouteFlowSlice, hourlySlice: HourlySlice): ReviewStepSummary {
  const topHotspots = Array.from(
    new Set(hourlySlice.hotspots.slice(0, 8).map((hotspot) => compactPlace(hotspot.name))),
  ).slice(0, 5);

  return {
    routeSlice,
    hourlySlice,
    averageDailyTrips: routeSlice.averageDailyTrips,
    topHotspots,
    topFlows: hourlySlice.flows
      .filter((flow) => !isLoopFlow(flow))
      .slice(0, 4)
      .map((flow) => `${compactPlace(flow.oName)} to ${compactPlace(flow.dName)}`),
  };
}

function formatCompact(value: number) {
  if (value >= 1000) return `${(value / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })}k`;
  return Math.round(value).toLocaleString("en-GB");
}

const londonMeanLat = 51.5072;
const earthRadiusM = 6371008.8;

type NearbyStation = StationInfraMetricRecord & { distanceM: number };
type CategorySummary<TCategory extends string> = {
  category: TCategory;
  count: number;
  names: string[];
};

type SelectedContextFeature =
  | { kind: "poi"; feature: ServiceContextPoiFeature }
  | { kind: "landuse"; feature: ServiceLanduseFeature };

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toLocalXY(lon: number, lat: number) {
  return [
    earthRadiusM * toRadians(lon) * Math.cos(toRadians(londonMeanLat)),
    earthRadiusM * toRadians(lat),
  ] as const;
}

function distanceMetersBetween(leftLon: number, leftLat: number, rightLon: number, rightLat: number) {
  const [leftX, leftY] = toLocalXY(leftLon, leftLat);
  const [rightX, rightY] = toLocalXY(rightLon, rightLat);
  return Math.hypot(leftX - rightX, leftY - rightY);
}

function routeLensMidpoint(route: OdRouteLensRoute | null) {
  if (!route || route.coordinates.length === 0) return null;
  const midpoint = route.coordinates[Math.floor(route.coordinates.length / 2)];
  return {
    lon: midpoint[0],
    lat: midpoint[1],
  };
}

function routeLensSamplePoints(route: OdRouteLensRoute | null) {
  if (!route || route.coordinates.length === 0) return [];
  const sampleCount = Math.min(route.coordinates.length, 16);
  if (sampleCount <= 2) return route.coordinates.map(([lon, lat]) => ({ lon, lat }));
  return Array.from({ length: sampleCount }, (_, index) => {
    const coordIndex = Math.round((index / (sampleCount - 1)) * (route.coordinates.length - 1));
    const [lon, lat] = route.coordinates[coordIndex];
    return { lon, lat };
  });
}

function minimumDistanceToSamples(lon: number, lat: number, samples: Array<{ lon: number; lat: number }>) {
  if (samples.length === 0) return Number.POSITIVE_INFINITY;
  return samples.reduce(
    (minimum, sample) => Math.min(minimum, distanceMetersBetween(lon, lat, sample.lon, sample.lat)),
    Number.POSITIVE_INFINITY,
  );
}

function formatDistance(value: number) {
  if (value >= 1000) return `${(value / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })} km`;
  return `${Math.round(value)} m`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatPolygonArea(areaSqM: number) {
  if (!Number.isFinite(areaSqM) || areaSqM <= 0) return "Unknown";
  if (areaSqM >= 1_000_000) {
    return `${(areaSqM / 1_000_000).toLocaleString("en-GB", { maximumFractionDigits: 2 })} km²`;
  }
  return `${Math.round(areaSqM).toLocaleString("en-GB")} m²`;
}

function collectCoordinatePairs(value: unknown, output: Array<[number, number]> = []) {
  if (!Array.isArray(value)) return output;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    output.push([value[0], value[1]]);
    return output;
  }
  for (const item of value) collectCoordinatePairs(item, output);
  return output;
}

function featureCentroid(feature: ServiceLanduseFeature) {
  const points = collectCoordinatePairs(feature.geometry.coordinates);
  if (points.length === 0) return null;
  const total = points.reduce((acc, point) => ({ lon: acc.lon + point[0], lat: acc.lat + point[1] }), { lon: 0, lat: 0 });
  return {
    lon: total.lon / points.length,
    lat: total.lat / points.length,
  };
}

function summarizeCategories<TFeature, TCategory extends string>(
  features: TFeature[],
  categoryOf: (feature: TFeature) => TCategory,
  nameOf: (feature: TFeature) => string,
): Array<CategorySummary<TCategory>> {
  const summary = new Map<TCategory, CategorySummary<TCategory>>();
  for (const feature of features) {
    const category = categoryOf(feature);
    const current = summary.get(category) ?? { category, count: 0, names: [] };
    current.count += 1;
    const name = compactPlace(nameOf(feature));
    if (name && current.names.length < 3 && !current.names.includes(name)) current.names.push(name);
    summary.set(category, current);
  }
  return [...summary.values()].sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));
}

function routeContextForRoute(
  route: OdRouteLensRoute | null,
  stations: StationInfraMetricRecord[],
  pois: ServiceContextPoiFeature[],
  landuseFeatures: ServiceLanduseFeature[],
) {
  const midpoint = routeLensMidpoint(route);
  const samples = routeLensSamplePoints(route);
  if (!midpoint || samples.length === 0) {
    return {
      nearbyStations: [] as NearbyStation[],
      poiSummary: [] as Array<CategorySummary<PoiCategory>>,
      landuseSummary: [] as Array<CategorySummary<LanduseCategory>>,
    };
  }

  const nearbyStations = stations
    .map((station) => ({
      ...station,
      distanceM: minimumDistanceToSamples(station.lon, station.lat, samples),
    }))
    .sort((left, right) => left.distanceM - right.distanceM)
    .slice(0, 5);

  const nearbyPois = pois
    .map((feature) => ({
      feature,
      distanceM: minimumDistanceToSamples(feature.geometry.coordinates[0], feature.geometry.coordinates[1], samples),
    }))
    .filter((item) => item.distanceM <= 380)
    .sort((left, right) => left.distanceM - right.distanceM)
    .slice(0, 48)
    .map((item) => item.feature);

  const nearbyLanduse = landuseFeatures
    .map((feature) => {
      const centroid = featureCentroid(feature);
      return {
        feature,
        distanceM: centroid ? minimumDistanceToSamples(centroid.lon, centroid.lat, samples) : Number.POSITIVE_INFINITY,
      };
    })
    .filter((item) => item.distanceM <= 620)
    .sort((left, right) => left.distanceM - right.distanceM)
    .slice(0, 28)
    .map((item) => item.feature);

  return {
    nearbyStations,
    poiSummary: summarizeCategories(nearbyPois, (feature) => feature.properties.category, (feature) => feature.properties.name),
    landuseSummary: summarizeCategories(nearbyLanduse, (feature) => feature.properties.category, (feature) => feature.properties.name),
  };
}

type RouteLensPanelProps = {
  selectedRoute: OdRouteLensRoute | null;
  lensLoading: boolean;
  lensError: string | null;
  floating?: boolean;
  nearbyStations: NearbyStation[];
  poiSummary: Array<CategorySummary<PoiCategory>>;
  landuseSummary: Array<CategorySummary<LanduseCategory>>;
  onClear: () => void;
};

function RouteLensPanel({
  selectedRoute,
  lensLoading,
  lensError,
  floating = false,
  nearbyStations,
  poiSummary,
  landuseSummary,
  onClear,
}: RouteLensPanelProps) {
  if (!selectedRoute) {
    return (
      <aside className="map-review-route-lens map-review-route-lens--empty" aria-label="Route lens details">
        <p className="map-review-route-lens-kicker">Route Lens</p>
        <h3>Click a route corridor.</h3>
        <p>
          The panel locks onto a full inferred OD route, then summarises its demand, rank, nearby stations and
          surrounding urban context.
        </p>
        {lensLoading ? <p className="map-review-route-lens-status">Loading OD corridors...</p> : null}
        {lensError ? <p className="map-review-route-lens-status map-review-route-lens-status--error">{lensError}</p> : null}
      </aside>
    );
  }

  return (
    <aside
      className={floating ? "map-review-route-lens map-review-route-lens--floating" : "map-review-route-lens"}
      aria-label="Selected OD route details"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="map-review-route-lens-header">
        <div>
          <p className="map-review-route-lens-kicker">Selected OD corridor</p>
          <h3>{compactPlace(selectedRoute.origin)} to {compactPlace(selectedRoute.destination)}</h3>
        </div>
        <button type="button" onClick={onClear}>Clear</button>
      </div>

      <dl className="map-review-route-lens-grid">
        <div>
          <dt>Trips per profile day</dt>
          <dd>{formatPrecise(selectedRoute.averageDailyTrips)}</dd>
        </div>
        <div>
          <dt>Slice rank</dt>
          <dd>#{selectedRoute.rank.toLocaleString("en-GB")}</dd>
        </div>
        <div>
          <dt>Predicted distance</dt>
          <dd>{formatDistance(selectedRoute.distanceM)}</dd>
        </div>
        <div>
          <dt>Typical duration</dt>
          <dd>{selectedRoute.durationMin.toFixed(1)} min</dd>
        </div>
      </dl>

      <section className="map-review-route-lens-block">
        <h4>Route identity</h4>
        <div className="map-review-route-lens-chips">
          <span>Strength {formatPercent(selectedRoute.strength)}</span>
          <span>{selectedRoute.visualTier}</span>
          <span>{selectedRoute.routeEdgeCount.toLocaleString("en-GB")} street segments</span>
          <span>{selectedRoute.coordinateCount.toLocaleString("en-GB")} path points</span>
        </div>
      </section>

      <section className="map-review-route-lens-block">
        <h4>Nearby stations</h4>
        <div className="map-review-route-lens-list">
          {nearbyStations.map((station) => (
            <span key={station.stationId}>{compactPlace(station.name)} · {formatDistance(station.distanceM)}</span>
          ))}
        </div>
      </section>

      <section className="map-review-route-lens-block">
        <h4>POI context</h4>
        <div className="map-review-route-lens-chips">
          {poiSummary.length ? poiSummary.slice(0, 6).map((item) => (
            <span key={item.category} className={`map-review-context-chip map-review-context-chip--poi-${item.category}`}>
              {poiLabels[item.category]} · {item.count}
            </span>
          )) : <span className="map-review-route-lens-muted">No nearby POI category within the lens radius.</span>}
        </div>
      </section>

      <section className="map-review-route-lens-block">
        <h4>Land-use context</h4>
        <div className="map-review-route-lens-chips">
          {landuseSummary.length ? landuseSummary.slice(0, 5).map((item) => (
            <span key={item.category} className={`map-review-context-chip map-review-context-chip--landuse-${item.category}`}>
              {landuseLabels[item.category]} · {item.count}
            </span>
          )) : <span className="map-review-route-lens-muted">No classified land-use polygon near the selected corridor.</span>}
        </div>
      </section>
    </aside>
  );
}

type StoryMapLegendProps = {
  colorMode: RouteColorMode;
};

function StoryMapLegend({ colorMode }: StoryMapLegendProps) {
  return (
    <aside className="map-review-story-legend" aria-label="Guided story map legend">
      <div className="map-review-explore-legend-section">
        <strong>Map layers</strong>
        <span><i className="map-review-legend-line map-review-legend-line--corridor" />clickable OD corridor</span>
        {colorMode === "intensity" ? <span><i className="map-review-legend-ramp" />low to high route intensity</span> : null}
        <span><i className="map-review-legend-swatch map-review-legend-landuse--commercial" />OSM land-use context</span>
      </div>
    </aside>
  );
}

type StoryRoutePanelProps = {
  route: OdRouteLensRoute;
  onClear: () => void;
};

function StoryRoutePanel({ route, onClear }: StoryRoutePanelProps) {
  return (
    <aside
      className="map-review-route-lens map-review-route-lens--floating map-review-route-lens--story"
      aria-label="Guided story selected route"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="map-review-route-lens-header">
        <div>
          <p className="map-review-route-lens-kicker">Story route</p>
          <h3>{compactPlace(route.origin)} to {compactPlace(route.destination)}</h3>
        </div>
        <button type="button" onClick={onClear}>Clear</button>
      </div>
      <dl className="map-review-route-lens-grid">
        <div>
          <dt>Trips per profile day</dt>
          <dd>{formatPrecise(route.averageDailyTrips)}</dd>
        </div>
        <div>
          <dt>Slice rank</dt>
          <dd>#{route.rank.toLocaleString("en-GB")}</dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd>{formatDistance(route.distanceM)}</dd>
        </div>
        <div>
          <dt>Strength</dt>
          <dd>{formatPercent(route.strength)}</dd>
        </div>
      </dl>
    </aside>
  );
}

type ContextFeaturePanelProps = {
  selected: SelectedContextFeature;
  onClear: () => void;
};

function ContextFeaturePanel({ selected, onClear }: ContextFeaturePanelProps) {
  const isPoi = selected.kind === "poi";
  const feature = selected.feature;
  const title = compactPlace(String(feature.properties.name || (isPoi ? poiLabels[feature.properties.category as PoiCategory] : landuseLabels[feature.properties.category as LanduseCategory])));
  const categoryLabel = isPoi
    ? poiLabels[(feature as ServiceContextPoiFeature).properties.category]
    : landuseLabels[(feature as ServiceLanduseFeature).properties.category];
  const osmId = feature.properties.osmId ? `${feature.properties.osmType ?? "OSM"} ${feature.properties.osmId}` : "OSM context";
  const polygonAreaSqM = !isPoi
    ? ((feature as ServiceLanduseFeature).properties.areaSqM ?? (feature as ServiceLanduseFeature).properties.area)
    : null;

  return (
    <aside
      className="map-review-route-lens map-review-route-lens--floating map-review-context-panel"
      aria-label="Selected map context feature"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="map-review-route-lens-header">
        <div>
          <p className="map-review-route-lens-kicker">{isPoi ? "Selected POI" : "Selected land use"}</p>
          <h3>{title}</h3>
        </div>
        <button type="button" onClick={onClear}>Clear</button>
      </div>
      <dl className="map-review-route-lens-grid">
        <div>
          <dt>Category</dt>
          <dd>{categoryLabel}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{osmId}</dd>
        </div>
        {!isPoi && typeof polygonAreaSqM === "number" ? (
          <div>
            <dt>Polygon area</dt>
            <dd>{formatPolygonArea(polygonAreaSqM)}</dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}

type ExploreMapLegendProps = {
  layers: ExploreLayerState;
  colorMode: RouteColorMode;
};

function ExploreMapLegend({ layers, colorMode }: ExploreMapLegendProps) {
  return (
    <aside className="map-review-explore-legend" aria-label="Explore map legend">
      <div className="map-review-explore-legend-section">
        <strong>Route lens</strong>
        <span><i className="map-review-legend-line map-review-legend-line--segment" />street-use texture</span>
        <span><i className="map-review-legend-line map-review-legend-line--corridor" />clickable OD corridor</span>
        {colorMode === "intensity" ? <span><i className="map-review-legend-ramp" />low to high intensity</span> : null}
      </div>
      {layers.hotspots || layers.stations ? (
        <div className="map-review-explore-legend-section">
          <strong>Activity</strong>
          {layers.hotspots ? <span><i className="map-review-legend-dot map-review-legend-dot--hotspot" />hourly hotspot</span> : null}
          {layers.stations ? <span><i className="map-review-legend-dot map-review-legend-dot--station" />bike station</span> : null}
        </div>
      ) : null}
      {layers.poi ? (
        <div className="map-review-explore-legend-section">
          <strong>POI</strong>
          <div className="map-review-explore-legend-grid">
            {poiLegendCategories.map((category) => (
              <span key={category}><i className={`map-review-legend-dot map-review-legend-poi--${category}`} />{poiLabels[category]}</span>
            ))}
          </div>
        </div>
      ) : null}
      {layers.landuse ? (
        <div className="map-review-explore-legend-section">
          <strong>Land use</strong>
          <div className="map-review-explore-legend-grid">
            {landuseLegendCategories.map((category) => (
              <span key={category}><i className={`map-review-legend-swatch map-review-legend-landuse--${category}`} />{landuseLabels[category]}</span>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

type FunctionRegimeMatrixProps = {
  activeStepId: string;
};

function FunctionRegimeMatrix({ activeStepId }: FunctionRegimeMatrixProps) {
  return (
    <article className="map-review-regime-matrix-card" aria-label="Function regime matrix">
      <div className="map-review-regime-matrix-header">
        <div>
          <p className="map-review-regime-matrix-kicker">Urban Science Lens</p>
          <h3>Function regime matrix</h3>
        </div>
        <p>
          Each time stop is interpreted as a mobility regime, linking top hotspots and OD corridors to OSM land-use
          and POI context.
        </p>
      </div>
      <div className="map-review-regime-matrix" role="table" aria-label="Function regime matrix">
        <div className="map-review-regime-matrix-row map-review-regime-matrix-row--head" role="row">
          <span role="columnheader">Time</span>
          {regimeFunctionColumns.map((column) => (
            <span key={column.id} role="columnheader">{column.short}</span>
          ))}
        </div>
        {functionRegimeRows.map((row) => {
          const isActive = row.stepId === activeStepId;
          return (
            <div
              key={row.stepId}
              className={isActive ? "map-review-regime-matrix-row map-review-regime-matrix-row--active" : "map-review-regime-matrix-row"}
              role="row"
            >
              <span role="rowheader">
                <strong>{row.label}</strong>
                <small>{row.regime}</small>
              </span>
              {regimeFunctionColumns.map((column) => {
                const level = row.values[column.id];
                return (
                  <span
                    key={column.id}
                    className={`map-review-regime-cell map-review-regime-cell--${column.id} map-review-regime-cell--level-${level}`}
                    title={`${column.label}: ${level}/3`}
                    role="cell"
                    aria-label={`${row.label}, ${column.label}, level ${level} of 3`}
                  >
                    {Array.from({ length: 3 }, (_, index) => (
                      <i
                        key={index}
                        className={index < level ? "map-review-regime-dot map-review-regime-dot--on" : "map-review-regime-dot"}
                      />
                    ))}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="map-review-regime-matrix-note">
        Matrix levels summarise the dominant function of each story stop from top hotspots, retained OD corridors and
        OSM context. They are interpretive categories, not demographic or equity measures.
      </p>
    </article>
  );
}

function buildMiniRhythmGeometry(slices: RouteFlowSlice[], activeHour: number) {
  const width = 220;
  const height = 74;
  const paddingX = 9;
  const paddingY = 8;
  const sorted = [...slices].sort((left, right) => left.hour - right.hour);
  const max = Math.max(...sorted.map((slice) => slice.averageDailyTrips), 1);
  const points = sorted.map((slice, index) => {
    const denominator = Math.max(sorted.length - 1, 1);
    return {
      hour: slice.hour,
      x: paddingX + (index / denominator) * (width - paddingX * 2),
      y: height - paddingY - (slice.averageDailyTrips / max) * (height - paddingY * 2),
      value: slice.averageDailyTrips,
    };
  });
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = points.length > 0
    ? `${linePath} L ${points.at(-1)?.x.toFixed(1)} ${height - paddingY} L ${points[0].x.toFixed(1)} ${height - paddingY} Z`
    : "";
  const activePoint = points.find((point) => point.hour === activeHour) ?? points[0] ?? null;
  const peakPoint = points.reduce((best, point) => (point.value > best.value ? point : best), points[0] ?? { hour: 0, x: 0, y: 0, value: 0 });

  return { width, height, linePath, areaPath, activePoint, peakPoint, max };
}

type StepEvidenceCardProps = {
  step: ReviewStepDefinition;
  summary: ReviewStepSummary;
  profileSlices: RouteFlowSlice[];
};

function StepEvidenceCard({ step, summary, profileSlices }: StepEvidenceCardProps) {
  const tone = (stepFunctionAnchors[step.id]?.[0]?.tone ?? dominantToneForStep(step.id)) as FunctionAnchorTone;
  const geometry = useMemo(() => buildMiniRhythmGeometry(profileSlices, step.hour), [profileSlices, step.hour]);
  const dominantPlace = summary.topHotspots[0] ?? "no single dominant hotspot";
  const activeHourLabel = `${String(step.hour).padStart(2, "0")}:00`;
  const typicalDayLabel = step.profileId === "weekdays" ? "typical weekday" : "typical weekend day";

  return (
    <aside className={`map-review-step-inset map-review-step-inset--${tone}`} aria-label={`${step.timeLabel} evidence card`}>
      <div className="map-review-step-inset-copy">
        <span className="map-review-step-inset-kicker">{step.profileId === "weekdays" ? "Weekday pulse" : "Weekend pulse"}</span>
        <strong>{activeHourLabel}</strong>
        <span>{formatCompact(summary.averageDailyTrips)} rides in this hour per {typicalDayLabel} · {summary.routeSlice.edgeCount.toLocaleString("en-GB")} routed segments</span>
      </div>
      <svg
        className="map-review-step-sparkline"
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        role="img"
        aria-label={`24 hour trip rhythm with ${activeHourLabel} highlighted`}
      >
        <path className="map-review-step-sparkline-area" d={geometry.areaPath} />
        <path className="map-review-step-sparkline-line" d={geometry.linePath} />
        {geometry.peakPoint ? (
          <circle className="map-review-step-sparkline-peak" cx={geometry.peakPoint.x} cy={geometry.peakPoint.y} r="2.7" />
        ) : null}
        {geometry.activePoint ? (
          <>
            <line
              className="map-review-step-sparkline-marker"
              x1={geometry.activePoint.x}
              x2={geometry.activePoint.x}
              y1="8"
              y2="66"
            />
            <circle className="map-review-step-sparkline-active" cx={geometry.activePoint.x} cy={geometry.activePoint.y} r="4.2" />
          </>
        ) : null}
      </svg>
      <div className="map-review-step-inset-foot">
        <span>Top place</span>
        <strong>{dominantPlace}</strong>
      </div>
    </aside>
  );
}

export function MapReviewPage() {
  const [searchParams] = useSearchParams();
  const explicitProfileId = normalizeProfile(searchParams.get("profile"));
  const explicitHour = normalizeHour(searchParams.get("hour"));
  const captureMode = searchParams.get("capture") === "1";
  const queryStep = captureMode ? stepFromQuery(explicitProfileId, explicitHour) : null;
  const defaultStep = queryStep ?? reviewSteps[0];

  const { dataset: storyData, isLoading: storyLoading } = useStoryDataset();
  const {
    ready: hourlyReady,
    error: hourlyError,
    getSlice: getHourlySlice,
    getProfile: getHourlyProfile,
    globalFlowMax,
  } = useHourlyFlows();
  const [exploreProfileId, setExploreProfileId] = useState<StoryProfileId>("weekdays");
  const [exploreHour, setExploreHour] = useState(13);
  const [exploreLayers, setExploreLayers] = useState<ExploreLayerState>(defaultExploreLayers);
  const [storyRouteColorMode, setStoryRouteColorMode] = useState<RouteColorMode>("intensity");
  const [exploreRouteColorMode, setExploreRouteColorMode] = useState<RouteColorMode>("intensity");
  const [selectedStoryOdRouteId, setSelectedStoryOdRouteId] = useState<string | null>(null);
  const [hoveredStoryOdRouteId, setHoveredStoryOdRouteId] = useState<string | null>(null);
  const [selectedOdRouteId, setSelectedOdRouteId] = useState<string | null>(null);
  const [hoveredOdRouteId, setHoveredOdRouteId] = useState<string | null>(null);
  const [selectedContextFeature, setSelectedContextFeature] = useState<SelectedContextFeature | null>(null);
  const [activeStepId, setActiveStepId] = useState(defaultStep.id);
  const activeStepIdRef = useRef(defaultStep.id);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [projectionVersion, setProjectionVersion] = useState(0);
  const stepRefs = useRef<Record<string, HTMLElement | null>>({});
  const mapPaneRef = useRef<HTMLElement | null>(null);
  const pendingScrollStepRef = useRef<string | null>(queryStep?.id ?? null);
  const initialScrollHandledRef = useRef(false);

  const activeStep = reviewStepsById[activeStepId] ?? reviewSteps[0];
  const activeTrack = reviewTracks.find((track) => track.id === activeStep.trackId) ?? reviewTracks[0];

  const {
    ready: routeReady,
    activeSliceReady,
    error: routeError,
    data: routeData,
    maxAverageDailyTrips,
    getSlice: getRouteSlice,
  } = useRouteFlows(activeStep.profileId, activeStep.hour, {
    prefetchAll: false,
    prefetchSlices: storyRoutePrefetchSlices,
  });
  const storyOdRouteLens = useOdRouteLens(activeStep.profileId, activeStep.hour);
  const {
    ready: exploreRouteReady,
    activeSliceReady: exploreRouteSliceReady,
    error: exploreRouteError,
    maxAverageDailyTrips: exploreMaxAverageDailyTrips,
    getSlice: getExploreRouteSlice,
  } = useRouteFlows(exploreProfileId, exploreHour, { prefetchAll: false });
  const odRouteLens = useOdRouteLens(exploreProfileId, exploreHour);
  const serviceContext = useServiceContext();

  useEffect(() => {
    setSelectedStoryOdRouteId(null);
    setHoveredStoryOdRouteId(null);
  }, [activeStep.hour, activeStep.profileId]);

  useEffect(() => {
    setSelectedOdRouteId(null);
    setHoveredOdRouteId(null);
    setSelectedContextFeature(null);
  }, [exploreHour, exploreProfileId]);

  const stepSummaries = useMemo(() => {
    const entries = reviewSteps.map((step) => {
      const routeSlice = getRouteSlice(step.profileId, step.hour);
      const hourlySlice = getHourlySlice(step.profileId, step.hour);
      return [step.id, summaryForStep(routeSlice, hourlySlice)];
    });

    return Object.fromEntries(entries) as Record<string, ReviewStepSummary>;
  }, [getHourlySlice, getRouteSlice]);

  const activeSummary = stepSummaries[activeStep.id];
  const storyUsesOdLens = Boolean(storyOdRouteLens.slice?.routes.length);
  const routeProfilesById = useMemo(() => {
    return Object.fromEntries(
      routeData.profiles.map((profile) => [profile.id, profile.hourSlices]),
    ) as Partial<Record<StoryProfileId, RouteFlowSlice[]>>;
  }, [routeData.profiles]);
  const handleMapReady = useCallback((map: MapLibreMap | null) => {
    setMapInstance(map);
  }, []);

  const projectedAreaLabels = useMemo(() => {
    if (!mapInstance || !mapPaneRef.current) return [];
    const width = mapPaneRef.current.clientWidth;
    const height = mapPaneRef.current.clientHeight;
    const labelsByText = new Map<string, AreaLabel>();
    for (const label of baseAreaLabels) labelsByText.set(label.text, label);
    for (const label of stepAreaLabels[activeStep.id] ?? []) labelsByText.set(label.text, label);

    return Array.from(labelsByText.values())
      .map((label) => {
        const point = mapInstance.project([label.lon, label.lat]);
        return { ...label, x: Math.round(point.x), y: Math.round(point.y) };
      })
      .filter((label) => label.x > 12 && label.x < width - 12 && label.y > 12 && label.y < height - 12);
  }, [activeStep.id, mapInstance, projectionVersion]);

  useEffect(() => {
    if (!queryStep) return;
    setActiveStepId(queryStep.id);
    activeStepIdRef.current = queryStep.id;
    pendingScrollStepRef.current = queryStep.id;
  }, [queryStep]);

  useEffect(() => {
    activeStepIdRef.current = activeStepId;
  }, [activeStepId]);

  useEffect(() => {
    if (captureMode || initialScrollHandledRef.current) return;
    initialScrollHandledRef.current = true;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [captureMode]);

  useEffect(() => {
    if (!mapInstance) return undefined;

    const syncProjection = () => {
      setProjectionVersion((value) => value + 1);
    };

    syncProjection();
    mapInstance.on("move", syncProjection);
    mapInstance.on("moveend", syncProjection);
    mapInstance.on("resize", syncProjection);

    return () => {
      mapInstance.off("move", syncProjection);
      mapInstance.off("moveend", syncProjection);
      mapInstance.off("resize", syncProjection);
    };
  }, [mapInstance]);

  useEffect(() => {
    let frame = 0;

    function updateActiveStepFromScroll() {
      frame = 0;
      const viewportHeight = window.innerHeight;
      const viewportAnchor = viewportHeight * 0.52;
      let bestStepId: string | null = null;
      let bestDistance = Infinity;

      for (const step of reviewSteps) {
        const element = stepRefs.current[step.id];
        if (!element) continue;

        const rect = element.getBoundingClientRect();
        if (rect.bottom < viewportHeight * 0.12 || rect.top > viewportHeight * 0.88) continue;

        const stepCenter = rect.top + rect.height * 0.5;
        const distance = Math.abs(stepCenter - viewportAnchor);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestStepId = step.id;
        }
      }

      if (bestStepId && bestStepId !== activeStepIdRef.current) {
        activeStepIdRef.current = bestStepId;
        setActiveStepId(bestStepId);
      }
    }

    function onScrollOrResize() {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActiveStepFromScroll);
    }

    onScrollOrResize();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, []);

  useEffect(() => {
    if (!routeReady || !hourlyReady || storyLoading || !activeSliceReady) return;
    const pendingStepId = pendingScrollStepRef.current;
    if (!pendingStepId) return;
    const element = stepRefs.current[pendingStepId];
    if (!element) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const top = window.scrollY + element.getBoundingClientRect().top - 24;
        window.scrollTo({ top: Math.max(top, 0), behavior: "auto" });
      });
    });
    pendingScrollStepRef.current = null;
  }, [activeSliceReady, hourlyReady, routeReady, storyLoading]);

  const mapProps = useMemo(() => {
    if (!activeSummary) {
      return {
        viewMode: "routes" as const,
        flows: [] as HourlyFlow[],
        hotspots: [],
        routeEdges: [],
        activeFlowProfileId: activeStep.profileId as StoryProfileId,
        globalFlowMax: 1,
      };
    }

    return {
      viewMode: "routes" as const,
      flows: [] as HourlyFlow[],
      hotspots: [],
      routeEdges: storyUsesOdLens ? [] : activeSummary.routeSlice.edges,
      activeFlowProfileId: activeStep.profileId as StoryProfileId,
      globalFlowMax: 1,
    };
  }, [activeStep.profileId, activeSummary, storyUsesOdLens]);

  const weekdayHourlyProfile = getHourlyProfile("weekdays");
  const weekendHourlyProfile = getHourlyProfile("weekends");
  const exploreHourlySlice = getHourlySlice(exploreProfileId, exploreHour);
  const exploreRouteSlice = getExploreRouteSlice(exploreProfileId, exploreHour);
  const exploreUsesOdLens = exploreLayers.routes && Boolean(odRouteLens.slice?.routes.length);
  const exploreMapProps = useMemo(() => {
    return {
      viewMode: "routes" as const,
      flows: [] as HourlyFlow[],
      hotspots: exploreLayers.hotspots ? exploreHourlySlice.hotspots : [],
      routeEdges: exploreLayers.routes && !exploreUsesOdLens ? exploreRouteSlice.edges : [],
      routeDisplayMode: "all" as const,
      routeFlowMax: exploreMaxAverageDailyTrips,
    };
  }, [exploreHourlySlice.hotspots, exploreLayers.hotspots, exploreLayers.routes, exploreMaxAverageDailyTrips, exploreRouteSlice.edges, exploreUsesOdLens]);

  const selectedOdRoute = useMemo(() => {
    if (!selectedOdRouteId) return null;
    return odRouteLens.slice?.routes.find((route) => route.id === selectedOdRouteId) ?? null;
  }, [odRouteLens.slice?.routes, selectedOdRouteId]);
  const selectedStoryOdRoute = useMemo(() => {
    if (!selectedStoryOdRouteId) return null;
    return storyOdRouteLens.slice?.routes.find((route) => route.id === selectedStoryOdRouteId) ?? null;
  }, [selectedStoryOdRouteId, storyOdRouteLens.slice?.routes]);
  const selectedRouteContext = useMemo(
    () => routeContextForRoute(selectedOdRoute, storyData.stationMetrics, serviceContext.pois, serviceContext.landuse),
    [selectedOdRoute, serviceContext.landuse, serviceContext.pois, storyData.stationMetrics],
  );

  const mapFocusBounds = useMemo(() => null, []);

  if (routeError || hourlyError) {
    return (
      <main className="load-screen">
        <p>Map review data failed to load.</p>
        <p style={{ maxWidth: "38rem", textAlign: "center", color: "rgba(80,90,92,0.75)" }}>
          {routeError || hourlyError}
        </p>
      </main>
    );
  }

  if (!routeReady || !hourlyReady || !activeSliceReady || storyLoading || !activeSummary) {
    return (
      <main className="load-screen">
        <div className="load-ring" />
        <p>Loading map review&hellip;</p>
      </main>
    );
  }

  function scrollToStep(stepId: string) {
    activeStepIdRef.current = stepId;
    setActiveStepId(stepId);
    stepRefs.current[stepId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleExploreLayer(layerId: ExploreLayerId) {
    setExploreLayers((current) => {
      if (layerId === "routes" && current.routes) return current;
      return {
        ...current,
        [layerId]: !current[layerId],
        routes: layerId === "routes" ? true : current.routes,
      };
    });
  }

  function handleStoryOdRouteClick(route: OdRouteLensRoute | null) {
    setSelectedStoryOdRouteId(route?.id ?? null);
  }

  function handleStoryOdRouteHover(route: OdRouteLensRoute | null) {
    setHoveredStoryOdRouteId((current) => (current === (route?.id ?? null) ? current : route?.id ?? null));
  }

  function handleExploreOdRouteClick(route: OdRouteLensRoute | null) {
    setSelectedOdRouteId(route?.id ?? null);
    setSelectedContextFeature(null);
  }

  function handleExploreOdRouteHover(route: OdRouteLensRoute | null) {
    setHoveredOdRouteId((current) => (current === (route?.id ?? null) ? current : route?.id ?? null));
  }

  function handleExplorePoiClick(feature: ServiceContextPoiFeature | null) {
    setSelectedContextFeature(feature ? { kind: "poi", feature } : null);
    setSelectedOdRouteId(null);
  }

  function handleExploreLanduseClick(feature: ServiceLanduseFeature | null) {
    setSelectedContextFeature(feature ? { kind: "landuse", feature } : null);
    setSelectedOdRouteId(null);
  }

  const panelLabel = `${activeTrack.label} ${activeStep.timeLabel}`;

  return (
    <main className={captureMode ? "map-review-page map-review-page--capture" : "map-review-page"} data-map-review-root>
      <section className="map-review-hero" aria-labelledby="map-review-hero-title">
        <div className="map-review-hero-copy">
          <p className="map-review-kicker">Santander Cycles · inner London street-use story</p>
          <h1 id="map-review-hero-title">How London Borrows Its Bikes</h1>
          <p className="map-review-hero-subtitle">
            A scroll-driven map of how Santander Cycles shifts between commuting, parks, leisure and night-time
            movement across inner London.
          </p>
          <p className="map-review-hero-deck">
            We read bike-share demand as a temporal layer of urban accessibility: the same docking network is
            reweighted by commuting peaks, leisure rhythms, park use and the night-time economy.
          </p>
          <div className="map-review-hero-cues" aria-label="Story functions">
            <span><i className="map-review-key-dot map-review-key-dot--work" />Work access</span>
            <span><i className="map-review-key-dot map-review-key-dot--park" />Parks</span>
            <span><i className="map-review-key-dot map-review-key-dot--leisure" />Leisure</span>
            <span><i className="map-review-key-dot map-review-key-dot--night" />Night city</span>
          </div>
        </div>
        <div className="map-review-hero-team">Rong Zhao · Zhuohang Duan · Dailing Wu</div>
        <div className="map-review-hero-scroll">Scroll to begin the guided story</div>
      </section>
      <div className="map-review-stage">
        <aside className="map-review-editorial">
          <div className="map-review-editorial-inner">
            <section className="map-review-intro">
              <p className="map-review-kicker">Guided Story</p>
              <h2>Follow the day through changing map states.</h2>
              <p className="map-review-summary">
                Each stop below is a data state: profile, hour, inferred route segments, hotspots, functional anchors
                and area labels change together as the story moves through the day. The argument is temporal-functional
                coupling: fixed docking infrastructure takes on different urban functions as land use, activity rhythms
                and street-network allocation change by hour.
              </p>
              <div className="map-review-function-key" aria-label="Function colour key">
                <span><i className="map-review-key-dot map-review-key-dot--work" />Work</span>
                <span><i className="map-review-key-dot map-review-key-dot--park" />Parks</span>
                <span><i className="map-review-key-dot map-review-key-dot--leisure" />Leisure</span>
                <span><i className="map-review-key-dot map-review-key-dot--night" />Night</span>
              </div>
              {weekdayHourlyProfile && weekendHourlyProfile ? (
                <div className="map-review-evidence-card">
                  <WeekdayWeekendChart
                    weekdayProfile={weekdayHourlyProfile.hourSlices}
                    weekendProfile={weekendHourlyProfile.hourSlices}
                    weekdayDayCount={routeData.meta.dayCounts.weekdays}
                    weekendDayCount={routeData.meta.dayCounts.weekends}
                    activeHour={activeStep.hour}
                    activeProfileId={activeStep.profileId}
                    onBarClick={(profileId, hour) => {
                      const targetStep = stepFromQuery(profileId, hour);
                      if (targetStep) {
                        scrollToStep(targetStep.id);
                        return;
                      }
                      setExploreProfileId(profileId);
                      setExploreHour(hour);
                    }}
                  />
                </div>
              ) : null}
              <FunctionRegimeMatrix activeStepId={activeStep.id} />
            </section>

            {reviewTracks.map((track) => (
              <section key={track.id} className="map-review-track">
                <div className="map-review-track-shell">
                  <aside className="map-review-time-rail" aria-label={`${track.label} time rail`}>
                    <p className="map-review-time-rail-kicker">{track.eyebrow}</p>
                    <div className="map-review-time-rail-line">
                      <div
                        className="map-review-time-rail-progress"
                        style={{
                          height: `${(() => {
                            const trackOrder = reviewTracks.findIndex((candidate) => candidate.id === track.id);
                            const activeTrackOrder = reviewTracks.findIndex((candidate) => candidate.id === activeTrack.id);
                            if (trackOrder < activeTrackOrder) return 100;
                            if (trackOrder > activeTrackOrder) return 0;
                            const activeIndex = track.steps.findIndex((step) => step.id === activeStep.id);
                            if (activeIndex <= 0) return 10;
                            return 10 + (activeIndex / Math.max(track.steps.length - 1, 1)) * 90;
                          })()}%`,
                        }}
                      />
                    </div>
                    <div className="map-review-time-stops">
                      {track.steps.map((step) => {
                        const isActive = step.id === activeStep.id;
                        return (
                          <button
                            key={step.id}
                            type="button"
                            className={isActive ? "map-review-time-stop map-review-time-stop--active" : "map-review-time-stop"}
                            onClick={() => scrollToStep(step.id)}
                            aria-current={isActive ? "step" : undefined}
                          >
                            <span>{step.railLabel}</span>
                            <small>{step.slotLabel}</small>
                          </button>
                        );
                      })}
                    </div>
                  </aside>

                  <div className="map-review-track-article">
                    <header className="map-review-track-intro">
                      <p className="map-review-track-deck">{track.intro}</p>
                    </header>

                    {track.steps.map((step) => {
                      const summary = stepSummaries[step.id];
                      const isActive = step.id === activeStep.id;
                      return (
                        <section
                          key={step.id}
                          ref={(node) => {
                            stepRefs.current[step.id] = node;
                          }}
                          data-review-step={step.id}
                          className={isActive ? "map-review-step map-review-step--active" : "map-review-step"}
                        >
                          <p className="map-review-step-body">{step.body(summary)}</p>
                          <p className="map-review-step-note">{step.note(summary)}</p>
                          {evidenceStepIds.has(step.id) ? (
                            <StepEvidenceCard
                              step={step}
                              summary={summary}
                              profileSlices={routeProfilesById[step.profileId] ?? []}
                            />
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                </div>
              </section>
            ))}

            <section className="map-review-conclusion">
              <p className="map-review-kicker">Reading across both sequences</p>
              <p>
                The maps show a temporal reconfiguration of accessibility: a fixed docking-bike system alternates
                between employment access, green-space circulation, visitor and leisure movement, and night-time
                centrality. These are inferred street-use allocations rather than observed GPS traces, but they show
                that time reorganises the functional geography of the network rather than merely its volume.
              </p>
            </section>
          </div>
        </aside>

        <section
          className="map-review-map-pane"
          ref={(node) => {
            mapPaneRef.current = node;
          }}
        >
          <OdFlowMapCanvas
            flows={mapProps.flows}
            compareFlows={[]}
            routeEdges={mapProps.routeEdges}
            hotspots={mapProps.hotspots}
            stations={storyData.stationMetrics}
            viewMode={mapProps.viewMode}
            stationMetric="annualTrips"
            cameraPreset="review"
            colorScheme={activeStep.colorScheme}
            activeFlowProfileId={mapProps.activeFlowProfileId}
            compareFlowProfileId={null}
            interactive={false}
            globalFlowMax={mapProps.globalFlowMax}
            routeFlowMax={maxAverageDailyTrips}
            routeDisplayMode="all"
            routeColorMode={storyRouteColorMode}
            selectedOdRouteId={selectedStoryOdRouteId}
            hoveredOdRouteId={hoveredStoryOdRouteId}
            odRouteLensRoutes={storyOdRouteLens.slice?.routes ?? []}
            showOdRouteLens={storyUsesOdLens}
            odRouteLensVariant="story"
            focusBounds={mapFocusBounds}
            functionAnchors={[]}
            showStationsOverlay={false}
            showStationBackdrop={false}
            contextPois={[]}
            landuseFeatures={serviceContext.landuse}
            showPoiLayer={false}
            showLanduseLayer={true}
            onOdRouteHover={handleStoryOdRouteHover}
            onOdRouteClick={handleStoryOdRouteClick}
            onMapReady={handleMapReady}
          />
          <div className="map-review-story-route-toggle" aria-label="Guided story route colour">
            <span>Route colour</span>
            {(["unified", "intensity"] as RouteColorMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={storyRouteColorMode === mode ? "map-review-story-route-button map-review-story-route-button--active" : "map-review-story-route-button"}
                onClick={() => setStoryRouteColorMode(mode)}
                aria-pressed={storyRouteColorMode === mode}
              >
                {mode === "unified" ? "Unified" : "Intensity"}
              </button>
            ))}
          </div>
          {!selectedStoryOdRoute ? (
            <StoryMapLegend colorMode={storyRouteColorMode} />
          ) : null}
          <div className="map-review-wash" />
          <div className="map-review-area-label-layer" aria-hidden="true">
            {projectedAreaLabels.map((label) => (
              <span
                key={label.id}
                className={label.size === "md" ? "map-review-area-label map-review-area-label--md" : "map-review-area-label"}
                style={{
                  left: `${label.x}px`,
                  top: `${label.y}px`,
                }}
              >
                {label.text}
              </span>
            ))}
          </div>

          <div className="map-review-map-label-stack">
            <div className="map-review-map-label">Inferred street-use allocation</div>
            <div className="map-review-map-label map-review-map-label--slice">{panelLabel}</div>
          </div>

          {selectedStoryOdRoute ? (
            <StoryRoutePanel
              route={selectedStoryOdRoute}
              onClear={() => setSelectedStoryOdRouteId(null)}
            />
          ) : null}
        </section>
      </div>

      <section className="map-review-explore" aria-labelledby="map-review-explore-title">
        <div className="map-review-explore-copy">
          <p className="map-review-kicker">Free Exploration</p>
          <h2 id="map-review-explore-title">Explore the system yourself.</h2>
          <p>
            After the guided story, use the map as a route lens. Choose a profile and hour, then click a full OD
            corridor to inspect its predicted route, intensity and nearby service context.
          </p>

          <div className="map-review-explore-controls" aria-label="Free exploration controls">
            <div className="map-review-control-group">
              <span>Profile</span>
              <div className="map-review-control-buttons">
                {(["all", "weekdays", "weekends"] as StoryProfileId[]).map((profileId) => (
                  <button
                    key={profileId}
                    type="button"
                    className={exploreProfileId === profileId ? "map-review-control-button map-review-control-button--active" : "map-review-control-button"}
                    onClick={() => setExploreProfileId(profileId)}
                  >
                    {profileId === "all" ? "All" : profileId === "weekdays" ? "Weekday" : "Weekend"}
                  </button>
                ))}
              </div>
            </div>

            <label className="map-review-control-group">
              <span>Hour: {String(exploreHour).padStart(2, "0")}:00</span>
              <input
                type="range"
                min="0"
                max="23"
                step="1"
                value={exploreHour}
                onChange={(event) => setExploreHour(Number(event.currentTarget.value))}
              />
            </label>

            <div className="map-review-control-group">
              <span>Layers</span>
              <div className="map-review-control-buttons">
                {exploreLayerOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={exploreLayers[option.id] ? "map-review-control-button map-review-control-button--active" : "map-review-control-button"}
                    onClick={() => toggleExploreLayer(option.id)}
                    aria-pressed={exploreLayers[option.id]}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="map-review-control-group">
              <span>Route colour</span>
              <div className="map-review-control-buttons">
                {(["unified", "intensity"] as RouteColorMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={exploreRouteColorMode === mode ? "map-review-control-button map-review-control-button--active" : "map-review-control-button"}
                    onClick={() => setExploreRouteColorMode(mode)}
                    aria-pressed={exploreRouteColorMode === mode}
                  >
                    {mode === "unified" ? "Unified" : "Intensity ramp"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <dl className="map-review-explore-metrics">
            <div>
              <dt>Trips per profile day</dt>
              <dd>{formatPrecise(exploreRouteSlice.averageDailyTrips || exploreHourlySlice.tripCount)}</dd>
            </div>
            <div>
              <dt>OD corridors</dt>
              <dd>{(odRouteLens.slice?.routeCount ?? 0).toLocaleString("en-GB")}</dd>
            </div>
            <div>
              <dt>Street segments</dt>
              <dd>{exploreRouteSlice.edgeCount.toLocaleString("en-GB")}</dd>
            </div>
          </dl>
          {exploreLayers.routes && (!exploreRouteReady || !exploreRouteSliceReady) ? (
            <p className="map-review-explore-status">Loading the selected route slice...</p>
          ) : null}
          {exploreLayers.routes && odRouteLens.loading ? (
            <p className="map-review-explore-status">Loading OD corridors...</p>
          ) : null}
          {exploreRouteError ? (
            <p className="map-review-explore-status map-review-explore-status--error">{exploreRouteError}</p>
          ) : null}
          {odRouteLens.error ? (
            <p className="map-review-explore-status map-review-explore-status--error">{odRouteLens.error}</p>
          ) : null}
          {serviceContext.error ? (
            <p className="map-review-explore-status map-review-explore-status--error">{serviceContext.error}</p>
          ) : null}

          {selectedOdRoute ? (
            <aside className="map-review-route-lens map-review-route-lens--empty" aria-label="Pinned route lens state">
              <p className="map-review-route-lens-kicker">Route Lens</p>
              <h3>Corridor pinned on the map.</h3>
              <p>The detailed card now sits inside the map so the route and its context stay visually connected.</p>
            </aside>
          ) : (
            <RouteLensPanel
              selectedRoute={null}
              lensLoading={odRouteLens.loading}
              lensError={odRouteLens.error}
              nearbyStations={[]}
              poiSummary={[]}
              landuseSummary={[]}
              onClear={() => setSelectedOdRouteId(null)}
            />
          )}
        </div>

        <div className="map-review-explore-map" aria-label="Interactive free exploration map">
          <OdFlowMapCanvas
            flows={exploreMapProps.flows}
            compareFlows={[]}
            routeEdges={exploreMapProps.routeEdges}
            hotspots={exploreMapProps.hotspots}
            stations={storyData.stationMetrics}
            viewMode={exploreMapProps.viewMode}
            stationMetric="annualTrips"
            cameraPreset="review"
            colorScheme={exploreProfileId === "weekends" ? "warm" : "cool"}
            activeFlowProfileId={exploreProfileId}
            compareFlowProfileId={null}
            interactive={true}
            globalFlowMax={globalFlowMax}
            routeFlowMax={exploreMapProps.routeFlowMax}
            routeDisplayMode={exploreMapProps.routeDisplayMode}
            routeColorMode={exploreRouteColorMode}
            selectedOdRouteId={selectedOdRouteId}
            hoveredOdRouteId={hoveredOdRouteId}
            odRouteLensRoutes={odRouteLens.slice?.routes ?? []}
            showOdRouteLens={exploreLayers.routes}
            odRouteLensVariant="explore"
            focusBounds={mapFocusBounds}
            functionAnchors={[]}
            showHotspotsOverlay={exploreLayers.hotspots}
            showStationsOverlay={exploreLayers.stations}
            showStationBackdrop={exploreLayers.stations}
            contextPois={serviceContext.pois}
            landuseFeatures={serviceContext.landuse}
            showPoiLayer={exploreLayers.poi}
            showLanduseLayer={exploreLayers.landuse}
            selectedPoiId={selectedContextFeature?.kind === "poi" ? selectedContextFeature.feature.properties.id : null}
            selectedLanduseId={selectedContextFeature?.kind === "landuse" ? selectedContextFeature.feature.properties.id : null}
            onOdRouteHover={handleExploreOdRouteHover}
            onOdRouteClick={handleExploreOdRouteClick}
            onPoiClick={handleExplorePoiClick}
            onLanduseClick={handleExploreLanduseClick}
          />
          <div className="map-review-explore-map-label">
            {exploreProfileId === "all" ? "All days" : exploreProfileId === "weekdays" ? "Weekday" : "Weekend"} ·{" "}
            {String(exploreHour).padStart(2, "0")}:00 · {exploreRouteColorMode === "unified" ? "Unified route colour" : "Intensity ramp"}
          </div>
          {selectedOdRoute ? (
            <RouteLensPanel
              selectedRoute={selectedOdRoute}
              floating={true}
              lensLoading={odRouteLens.loading}
              lensError={odRouteLens.error}
              nearbyStations={selectedRouteContext.nearbyStations}
              poiSummary={selectedRouteContext.poiSummary}
              landuseSummary={selectedRouteContext.landuseSummary}
              onClear={() => setSelectedOdRouteId(null)}
            />
          ) : null}
          {selectedContextFeature ? (
            <ContextFeaturePanel
              selected={selectedContextFeature}
              onClear={() => setSelectedContextFeature(null)}
            />
          ) : null}
          {!(selectedOdRoute || selectedContextFeature) ? (
            <ExploreMapLegend layers={exploreLayers} colorMode={exploreRouteColorMode} />
          ) : null}
        </div>
      </section>

      <section className="map-review-appendix" aria-labelledby="map-review-method-title">
        <div className="map-review-appendix-intro">
          <p className="map-review-kicker">About, Method and References</p>
          <h2 id="map-review-method-title">How to read the maps.</h2>
          <p>
            The project treats Santander Cycles as a short-range access layer in central London. The question is not
            whether the docking system moves, but how the same infrastructure is reweighted by daily rhythms of work,
            parks, visitor activity and the night-time economy.
          </p>
        </div>
        <div className="map-review-appendix-grid">
          <article>
            <h3>Urban science framing</h3>
            <p>
              The story connects temporal urbanism, land-use and mobility interaction, and network allocation. OD
              trips are assigned to a street graph so hourly bike-share demand can be read as changing street-use
              geography rather than only as station counts.
            </p>
          </article>
          <article>
            <h3>Data and cleaning</h3>
            <p>
              We use 2025 TfL Santander Cycles usage statistics, retaining 8,846,143 valid trips across 797 matched
              stations. Trips with unmatched endpoints, non-positive duration or duration above four hours are excluded.
            </p>
          </article>
          <article>
            <h3>Route allocation</h3>
            <p>
              The route layer uses an OSM street graph with 337,680 nodes and 359,397 edges. We route 36,960 OD
              candidate pairs using four alternatives, detour limit 1.55, distance-decay alpha 3.2, jitter 0.18 and
              seed 2025.
            </p>
          </article>
          <article>
            <h3>Interpretation limits</h3>
            <p>
              Routes are modelled allocations, not GPS traces. The maps do not claim precise route choice, individual
              behaviour, dockless cycling, weather effects, event effects or equity impacts. Equity analysis would
              require additional demographic and accessibility data.
            </p>
          </article>
          <article>
            <h3>Open data and code</h3>
            <p>
              Source data comes from <a href="https://cycling.data.tfl.gov.uk/" target="_blank" rel="noreferrer">TfL
              Santander Cycles usage statistics</a>, OpenStreetMap and Overpass context layers. Code and processing
              scripts are in the <a href="https://github.com/jameslemon2002/casa_viz_groupwork" target="_blank" rel="noreferrer">GitHub repository</a>.
              The project methodology is summarised in the <a href={`${import.meta.env.BASE_URL}docs/Methodology_Summary_Group20.pdf`}>Methodology Summary PDF</a>.
            </p>
          </article>
          <article>
            <h3>References</h3>
            <ul>
              <li><a href="https://doi.org/10.1016/j.jtrangeo.2013.06.007" target="_blank" rel="noreferrer">O'Brien, Cheshire and Batty, 2014</a></li>
              <li><a href="https://doi.org/10.1080/01441647.2015.1033036" target="_blank" rel="noreferrer">Fishman, 2016</a></li>
              <li><a href="https://doi.org/10.1016/j.jtrangeo.2014.01.013" target="_blank" rel="noreferrer">Faghih-Imani et al., 2014</a></li>
              <li>OpenStreetMap contributors; TfL Open Data.</li>
            </ul>
          </article>
          <article className="map-review-appendix--wide">
            <h3>Team and AI use</h3>
            <p>
              Rong Zhao · Zhuohang Duan · Dailing Wu. The group carried out the main research decisions, data analysis,
              code construction, visual implementation and final integration. AI tools were used at a moderate level
              for debugging, wording checks, visual comparison, and build or layout troubleshooting; all material was
              reviewed by the group before submission.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
