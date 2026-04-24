import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useSearchParams } from "react-router-dom";
import { WeekdayWeekendChart } from "../components/charts/WeekdayWeekendChart";
import { OdFlowMapCanvas } from "../components/maps/OdFlowMapCanvas";
import { useHourlyFlows } from "../hooks/useHourlyFlows";
import { useRouteFlows } from "../hooks/useRouteFlows";
import { useStoryDataset } from "../hooks/useStoryDataset";
import type { HourlyFlow, HourlySlice } from "../hooks/useHourlyFlows";
import type { ColorScheme, FunctionAnchor, FunctionAnchorTone } from "../components/maps/OdFlowMapCanvas";
import type { RouteFlowSlice, StoryProfileId } from "../types/routeFlows";

type MapVariant = "all-routes" | "corridors-od" | "flows" | "hotspots" | "stations";
type ExploreLayer = "routes" | "hotspots";
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

const variantOrder: MapVariant[] = ["all-routes", "corridors-od", "flows", "hotspots", "stations"];
const exploreLayerOptions: Array<{ id: ExploreLayer; label: string }> = [
  { id: "routes", label: "Routes" },
  { id: "hotspots", label: "Hotspots" },
];

const reviewTracks: ReviewTrackDefinition[] = [
  {
    id: "weekday",
    label: "Weekday",
    eyebrow: "Weekday guided story",
    intro:
      "Across weekdays, the same docking network is pulled sharply into the work city in the morning, relaxes into a more mixed central geography at midday, reforms as an outward evening release, and then thins into a smaller late-night pattern.",
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
          `In a typical weekday morning at 08:00, the network reaches ${formatPrecise(averageDailyTrips)} trips per profile day and the routed street texture converges most clearly on ${joinNatural(topHotspots.slice(0, 3))}. This is the hour at which the system reads most strongly as a connector between rail terminals, the City and the inner employment core.`,
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
          `By 13:00 on weekdays, activity falls to ${formatPrecise(averageDailyTrips)} trips per profile day and the work-centred pattern loosens. ${joinNatural(topHotspots.slice(0, 4))} rise into the hotspot set together, suggesting a central geography that mixes office access with short lunchtime and park-adjacent circulation rather than simply extending the morning commute.`,
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
          `By 23:00 on weekdays, demand drops to ${formatPrecise(averageDailyTrips)} trips per weekday and the map recentres on ${joinNatural(topHotspots.slice(0, 4))}. Classic commuter anchors no longer dominate. What remains is a much thinner and more fragmented geography of hospitals, riverfront destinations and mixed late-evening districts.`,
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
      "Weekends follow a different time structure. The morning starts thinner and more dispersed, afternoon and early evening consolidate around parks and leisure destinations, and late night recentres on a looser social geography rather than the weekday employment core.",
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
          `By 13:00 on weekends, activity reaches ${formatPrecise(averageDailyTrips)} trips per day and the map locks decisively onto ${joinNatural(topHotspots.slice(0, 4))}. This is not simply weaker weekday demand. It is a different service function, organised around parks, open space and leisure-oriented central movement.`,
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
          `By 17:00 on weekends, use remains high at ${formatPrecise(averageDailyTrips)} trips per day and ${joinNatural(topHotspots.slice(0, 5))} continue to dominate the field. The afternoon leisure regime therefore persists into early evening rather than collapsing once lunch is over.`,
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

type DisplayAnchor = FunctionAnchor & {
  source: "manual" | "hotspot";
  activity?: number;
};

type AreaLabel = {
  id: string;
  text: string;
  lon: number;
  lat: number;
  size?: "sm" | "md";
};

type GreenSpaceFeature = {
  type: "Feature";
  properties: {
    id: string;
    name: string;
    source?: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};

type GreenSpaceFeatureCollection = {
  type: "FeatureCollection";
  features: GreenSpaceFeature[];
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

const stepGreenspaceIds: Record<string, string[]> = {
  "weekdays-13": ["hyde-park", "kensington-gardens", "green-park", "st-jamess-park"],
  "weekends-08": ["hyde-park", "kensington-gardens", "regents-park"],
  "weekends-13": ["hyde-park", "kensington-gardens", "regents-park", "green-park", "st-jamess-park"],
  "weekends-17": ["hyde-park", "kensington-gardens", "battersea-park", "regents-park"],
};

const evidenceStepIds = new Set(["weekdays-08", "weekends-13"]);

type StoryPostcardDefinition = {
  kicker: string;
  title: string;
  body: string;
  tone: FunctionAnchorTone;
  position: string;
};

const stepPostcards: Record<string, StoryPostcardDefinition> = {
  "weekdays-13": {
    kicker: "Map note",
    title: "The western parks enter the weekday story.",
    body:
      "The midday map is not just a weaker commute. It pulls Hyde Park, Exhibition Road and nearby cultural edges into the same service field as the office core.",
    tone: "green",
    position: "42% 55%",
  },
  "weekends-23": {
    kicker: "Map note",
    title: "Night geography is smaller, but not random.",
    body:
      "Late weekend routes thin out, yet the remaining activity still clusters around Soho, South Bank and Whitechapel rather than dissolving evenly across the network.",
    tone: "pink",
    position: "56% 48%",
  },
};

function dominantToneForStep(stepId: string): FunctionAnchorTone {
  if (stepId.includes("23")) return "pink";
  if (stepId.includes("13") || stepId.includes("17")) {
    return stepId.startsWith("weekend") ? "green" : "orange";
  }
  return stepId.startsWith("weekday") ? "blue" : "orange";
}

function squaredDistance(leftLon: number, leftLat: number, rightLon: number, rightLat: number) {
  return (leftLon - rightLon) ** 2 + (leftLat - rightLat) ** 2;
}

function inferHotspotTone(
  stepId: string,
  hotspot: { lon: number; lat: number; name: string },
  manualAnchors: FunctionAnchor[],
): FunctionAnchorTone {
  const lowered = hotspot.name.toLowerCase();
  if (/(park|gate|serpentine|gardens)/.test(lowered)) return "green";
  if (/(soho|pier|west end|south bank|old street|tooley|moorgate|old st)/.test(lowered)) return "pink";
  if (/(station|street|bank|waterloo|liverpool|kings cross|stratford|city|cheapside|queen)/.test(lowered)) return "blue";
  if (/(museum|exhibition|borough|battersea|smithfield|south kensington)/.test(lowered)) return "orange";

  const nearest = manualAnchors
    .map((anchor) => ({
      tone: anchor.tone,
      distance: squaredDistance(anchor.lon, anchor.lat, hotspot.lon, hotspot.lat),
    }))
    .sort((left, right) => left.distance - right.distance)[0];

  if (nearest && nearest.distance < 0.00026) {
    return nearest.tone;
  }

  return dominantToneForStep(stepId);
}

const reviewSteps = reviewTracks.flatMap((track) => track.steps);
const reviewStepsById = Object.fromEntries(reviewSteps.map((step) => [step.id, step])) as Record<string, ReviewStepDefinition>;

function normalizeVariant(value: string | null): MapVariant {
  return variantOrder.includes(value as MapVariant) ? (value as MapVariant) : "all-routes";
}

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

function pickShowcaseFlows(flows: HourlyFlow[]) {
  const seenPairs = new Set<string>();
  const picked: HourlyFlow[] = [];

  for (const flow of [...flows].sort((left, right) => right.count - left.count)) {
    if (isLoopFlow(flow)) continue;
    const pairKey = `${flow.oName}->${flow.dName}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    picked.push(flow);
    if (picked.length === 10) break;
  }

  return picked;
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

function StoryPostcard({ card }: { card: StoryPostcardDefinition }) {
  return (
    <aside className={`map-review-story-postcard map-review-story-postcard--${card.tone}`}>
      <div
        className="map-review-story-postcard-image"
        style={{ backgroundPosition: card.position }}
        aria-hidden="true"
      />
      <div className="map-review-story-postcard-copy">
        <span>{card.kicker}</span>
        <strong>{card.title}</strong>
        <p>{card.body}</p>
      </div>
    </aside>
  );
}

type ProjectedAnchor = DisplayAnchor & {
  x: number;
  y: number;
  size: number;
  opacity: number;
};

type HoverTarget = ProjectedAnchor & {
  hoverRadius: number;
  priority: number;
};

type ProjectedGreenspace = GreenSpaceFeature["properties"] & {
  points: string;
};

function hoverAnchorPriority(anchor: DisplayAnchor) {
  const category = anchor.category ?? "";
  let priority = anchor.weight ?? 0;
  if (/Functional district|Functional zone|Leisure district|Riverfront district/i.test(category)) priority += 0.5;
  if (/Nightlife|Park access|Institutional anchor|Rail terminal/i.test(category)) priority += 0.18;
  return priority;
}

function anchorVisualSize(anchor: DisplayAnchor) {
  return Math.round(anchor.source === "manual"
    ? 8 + (anchor.weight ?? 1) * 11
    : 3.2 + (anchor.weight ?? 1) * 5.8);
}

function anchorVisualOpacity(anchor: DisplayAnchor) {
  return anchor.source === "manual" ? 0.76 : 0.48;
}

function isGreenSpacePayload(payload: unknown): payload is GreenSpaceFeatureCollection {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<GreenSpaceFeatureCollection>;
  return candidate.type === "FeatureCollection" && Array.isArray(candidate.features);
}

function exteriorRings(geometry: GreenSpaceFeature["geometry"]): number[][][] {
  if (geometry.type === "Polygon") {
    return [(geometry.coordinates as number[][][])[0]].filter(Boolean);
  }
  if (geometry.type !== "MultiPolygon") return [];
  return (geometry.coordinates as number[][][][])
    .map((polygon) => polygon[0])
    .filter(Boolean);
}

function resolveHoverTarget(
  x: number,
  y: number,
  targets: HoverTarget[],
  currentId: string | null,
) {
  let best: HoverTarget | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const target of targets) {
    const distance = Math.hypot(target.x - x, target.y - y);
    if (distance > target.hoverRadius) continue;
    const score = distance - target.priority * 0.75;
    if (score < bestScore) {
      best = target;
      bestScore = score;
    }
  }

  if (best) return best;

  const current = currentId ? targets.find((target) => target.id === currentId) ?? null : null;
  if (!current) return null;
  const currentDistance = Math.hypot(current.x - x, current.y - y);
  return currentDistance <= current.hoverRadius + 5 ? current : null;
}

export function MapReviewPage() {
  const [searchParams] = useSearchParams();
  const variant = normalizeVariant(searchParams.get("variant"));
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
  const [exploreLayer, setExploreLayer] = useState<ExploreLayer>("routes");
  const [activeStepId, setActiveStepId] = useState(defaultStep.id);
  const activeStepIdRef = useRef(defaultStep.id);
  const [hoveredAnchorId, setHoveredAnchorId] = useState<string | null>(null);
  const [greenspaces, setGreenspaces] = useState<GreenSpaceFeature[]>([]);
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
  } = useRouteFlows(activeStep.profileId, activeStep.hour);
  const {
    ready: exploreRouteReady,
    activeSliceReady: exploreRouteSliceReady,
    error: exploreRouteError,
    maxAverageDailyTrips: exploreMaxAverageDailyTrips,
    getSlice: getExploreRouteSlice,
  } = useRouteFlows(exploreProfileId, exploreHour, { prefetchAll: false });

  const stepSummaries = useMemo(() => {
    const entries = reviewSteps.map((step) => {
      const routeSlice = getRouteSlice(step.profileId, step.hour);
      const hourlySlice = getHourlySlice(step.profileId, step.hour);
      return [step.id, summaryForStep(routeSlice, hourlySlice)];
    });

    return Object.fromEntries(entries) as Record<string, ReviewStepSummary>;
  }, [getHourlySlice, getRouteSlice]);

  const activeSummary = stepSummaries[activeStep.id];
  const routeProfilesById = useMemo(() => {
    return Object.fromEntries(
      routeData.profiles.map((profile) => [profile.id, profile.hourSlices]),
    ) as Partial<Record<StoryProfileId, RouteFlowSlice[]>>;
  }, [routeData.profiles]);
  const showcaseFlows = useMemo(() => pickShowcaseFlows(activeSummary?.hourlySlice.flows ?? []), [activeSummary]);
  const manualFunctionAnchors = stepFunctionAnchors[activeStep.id] ?? [];
  const activeFunctionAnchors = useMemo<DisplayAnchor[]>(() => {
    const baseAnchors = manualFunctionAnchors.map((anchor) => ({
      ...anchor,
      label: compactPlace(anchor.label),
      source: "manual" as const,
    }));
    const hotspots = activeSummary?.hourlySlice.hotspots ?? [];
    const hotspotMax = Math.max(...hotspots.map((hotspot) => hotspot.act), 1);
    const hotspotAnchors = hotspots
      .filter((hotspot) => {
        return baseAnchors.every((anchor) => squaredDistance(anchor.lon, anchor.lat, hotspot.lon, hotspot.lat) > 0.000018);
      })
      .slice(0, 72)
      .map((hotspot, index) => ({
        id: `${activeStep.id}-hotspot-${index}`,
        label: compactPlace(hotspot.name),
        lon: hotspot.lon,
        lat: hotspot.lat,
        tone: inferHotspotTone(activeStep.id, hotspot, baseAnchors),
        weight: 0.34 + Math.sqrt(hotspot.act / hotspotMax) * 0.42,
        category: "Docking station hotspot",
        description: `${activeTrack.label} ${activeStep.timeLabel} active docking station`,
        evidence: `${hotspot.act.toLocaleString("en-GB")} total arrivals and departures in the retained hourly slice.`,
        source: "hotspot" as const,
        activity: hotspot.act,
      }));

    return [...baseAnchors, ...hotspotAnchors];
  }, [activeStep.id, activeStep.timeLabel, activeSummary, activeTrack.label, manualFunctionAnchors]);
  const localRouteMax = useMemo(
    () => Math.max(...(activeSummary?.routeSlice.edges ?? []).map((edge) => edge.averageDailyTrips), 1),
    [activeSummary],
  );

  const handleMapReady = useCallback((map: MapLibreMap | null) => {
    setMapInstance(map);
  }, []);

  const projectedFunctionAnchors = useMemo(() => {
    if (!mapInstance || !mapPaneRef.current) return [];

    const width = mapPaneRef.current.clientWidth;
    const height = mapPaneRef.current.clientHeight;

    return activeFunctionAnchors
      .map((anchor) => {
        const point = mapInstance.project([anchor.lon, anchor.lat]);
        return {
          ...anchor,
          x: Math.round(point.x),
          y: Math.round(point.y),
          size: anchorVisualSize(anchor),
          opacity: anchorVisualOpacity(anchor),
        };
      })
      .filter((anchor) => anchor.x > -28 && anchor.x < width + 28 && anchor.y > -28 && anchor.y < height + 28);
  }, [activeFunctionAnchors, mapInstance, projectionVersion]);

  const projectedHoverTargets = useMemo<HoverTarget[]>(() => {
    return projectedFunctionAnchors
      .map((anchor) => ({
        ...anchor,
        hoverRadius: anchor.source === "manual"
          ? Math.max(anchor.size * 0.5 + 14, 18)
          : Math.max(anchor.size * 0.5 + 8, 11),
        priority: hoverAnchorPriority(anchor) - (anchor.source === "hotspot" ? 0.4 : 0),
      }))
      .sort((left, right) => right.priority - left.priority);
  }, [projectedFunctionAnchors]);

  const hoveredAnchor = useMemo(
    () => projectedHoverTargets.find((anchor) => anchor.id === hoveredAnchorId) ?? null,
    [hoveredAnchorId, projectedHoverTargets],
  );

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

  const projectedGreenspaces = useMemo<ProjectedGreenspace[]>(() => {
    if (!mapInstance || !mapPaneRef.current) return [];
    const retainedIds = new Set(stepGreenspaceIds[activeStep.id] ?? []);
    if (retainedIds.size === 0) return [];

    return greenspaces
      .filter((feature) => retainedIds.has(feature.properties.id))
      .flatMap((feature) => exteriorRings(feature.geometry).map((ring, index) => ({
        ...feature.properties,
        points: ring
          .map(([lon, lat]) => {
            const point = mapInstance.project([lon, lat]);
            return `${Math.round(point.x)},${Math.round(point.y)}`;
          })
          .join(" "),
        id: `${feature.properties.id}-${index}`,
      })))
      .filter((feature) => feature.points.length > 0);
  }, [activeStep.id, greenspaces, mapInstance, projectionVersion]);

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
    setHoveredAnchorId(null);
  }, [activeStep.id]);

  useEffect(() => {
    if (hoveredAnchorId && !projectedHoverTargets.some((anchor) => anchor.id === hoveredAnchorId)) {
      setHoveredAnchorId(null);
    }
  }, [hoveredAnchorId, projectedHoverTargets]);

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
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/service_greenspaces.geojson`)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load greenspaces: ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (cancelled || !isGreenSpacePayload(payload)) return;
        setGreenspaces(payload.features);
      })
      .catch(() => {
        if (!cancelled) setGreenspaces([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

    if (variant === "stations") {
      return {
        viewMode: "routes" as const,
        flows: [] as HourlyFlow[],
        hotspots: [],
        routeEdges: [],
        activeFlowProfileId: activeStep.profileId as StoryProfileId,
        globalFlowMax: 1,
      };
    }

    if (variant === "all-routes") {
      return {
        viewMode: "routes" as const,
        flows: [] as HourlyFlow[],
        hotspots: [],
        routeEdges: activeSummary.routeSlice.edges,
        activeFlowProfileId: activeStep.profileId as StoryProfileId,
        globalFlowMax: 1,
      };
    }

    if (variant === "corridors-od") {
      return {
        viewMode: "routes" as const,
        flows: showcaseFlows,
        hotspots: activeSummary.hourlySlice.hotspots.slice(0, 8),
        routeEdges: activeSummary.routeSlice.edges,
        activeFlowProfileId: activeStep.profileId as StoryProfileId,
        globalFlowMax: 1,
      };
    }

    if (variant === "hotspots") {
      return {
        viewMode: "hotspots" as const,
        flows: [] as HourlyFlow[],
        hotspots: activeSummary.hourlySlice.hotspots,
        routeEdges: [],
        activeFlowProfileId: activeStep.profileId as StoryProfileId,
        globalFlowMax: 1,
      };
    }

    return {
      viewMode: "flows" as const,
      flows: activeSummary.hourlySlice.flows.filter((flow) => !isLoopFlow(flow)).slice(0, 120),
      hotspots: [],
      routeEdges: [],
      activeFlowProfileId: activeStep.profileId as StoryProfileId,
      globalFlowMax,
    };
  }, [activeStep.profileId, activeSummary, globalFlowMax, showcaseFlows, variant]);

  const weekdayHourlyProfile = getHourlyProfile("weekdays");
  const weekendHourlyProfile = getHourlyProfile("weekends");
  const exploreHourlySlice = getHourlySlice(exploreProfileId, exploreHour);
  const exploreRouteSlice = getExploreRouteSlice(exploreProfileId, exploreHour);
  const exploreRouteMax = useMemo(
    () => Math.max(...exploreRouteSlice.edges.map((edge) => edge.averageDailyTrips), 1),
    [exploreRouteSlice],
  );
  const exploreMapProps = useMemo(() => {
    if (exploreLayer === "routes") {
      return {
        viewMode: "routes" as const,
        flows: [] as HourlyFlow[],
        hotspots: exploreHourlySlice.hotspots.slice(0, 24),
        routeEdges: exploreRouteSlice.edges,
        routeDisplayMode: "all" as const,
        routeFlowMax: exploreRouteMax,
      };
    }
    return {
      viewMode: "hotspots" as const,
      flows: [] as HourlyFlow[],
      hotspots: exploreHourlySlice.hotspots,
      routeEdges: [] as typeof exploreRouteSlice.edges,
      routeDisplayMode: "hierarchy" as const,
      routeFlowMax: exploreMaxAverageDailyTrips,
    };
  }, [exploreHourlySlice, exploreLayer, exploreMaxAverageDailyTrips, exploreRouteMax, exploreRouteSlice.edges]);

  const mapFocusBounds = useMemo(() => null, []);
  const tooltipPlacement = useMemo(() => {
    if (!hoveredAnchor || !mapPaneRef.current) return null;
    const paneWidth = mapPaneRef.current.clientWidth;
    const tooltipWidth = Math.min(276, paneWidth - 28);
    const halfWidth = tooltipWidth / 2;
    const left = Math.max(halfWidth + 14, Math.min(hoveredAnchor.x, paneWidth - halfWidth - 14));
    const flipBelow = hoveredAnchor.y < 198;
    const pointerX = Math.max(22, Math.min(hoveredAnchor.x - (left - halfWidth), tooltipWidth - 22));

    return {
      left,
      top: hoveredAnchor.y,
      width: tooltipWidth,
      flipBelow,
      pointerX,
    };
  }, [hoveredAnchor]);

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

  function handleAnchorLayerPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const next = resolveHoverTarget(x, y, projectedHoverTargets, hoveredAnchorId);
    const nextId = next?.id ?? null;

    setHoveredAnchorId((current) => (current === nextId ? current : nextId));
  }

  function handleAnchorLayerPointerLeave() {
    setHoveredAnchorId(null);
  }

  function tooltipToneClass(anchor: FunctionAnchor) {
    return `map-review-tooltip--${anchor.tone}`;
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
            The docking stations stay fixed. What changes is the city they serve: morning rail access, midday park
            circulation, evening release from work, and late-night social movement.
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
                and area labels change together as the story moves through the day.
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
                      const postcard = stepPostcards[step.id];
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
                          {postcard ? <StoryPostcard card={postcard} /> : null}
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
                Taken together, the two day types show that temporal change in bike-share use is not only a question
                of how much travel occurs, but of what kind of city the system is serving at a given moment. The maps
                shown here are inferred street-use allocations rather than observed GPS traces, but they are sufficient
                to show that time reorganises the functional geography of the network rather than merely its volume.
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
            routeFlowMax={variant === "all-routes" ? localRouteMax : maxAverageDailyTrips}
            routeDisplayMode={variant === "all-routes" ? "all" : "hierarchy"}
            focusBounds={mapFocusBounds}
            functionAnchors={[]}
            onMapReady={handleMapReady}
          />
          <div className="map-review-wash" />
          {projectedGreenspaces.length > 0 ? (
            <svg className="map-review-zone-layer" aria-hidden="true">
              {projectedGreenspaces.map((zone) => (
                <polygon
                  key={zone.id}
                  className="map-review-zone map-review-zone--park"
                  points={zone.points}
                />
              ))}
            </svg>
          ) : null}

          <div
            className={hoveredAnchor ? "map-review-anchor-layer map-review-anchor-layer--hovering" : "map-review-anchor-layer"}
            onPointerMove={handleAnchorLayerPointerMove}
            onPointerLeave={handleAnchorLayerPointerLeave}
          >
            {projectedFunctionAnchors.map((anchor) => (
              <span
                key={anchor.id}
                className={`map-review-anchor map-review-anchor--${anchor.tone} map-review-anchor--${anchor.source}`}
                style={{
                  left: `${anchor.x}px`,
                  top: `${anchor.y}px`,
                  width: `${anchor.size}px`,
                  height: `${anchor.size}px`,
                  opacity: anchor.opacity,
                }}
                aria-hidden="true"
              />
            ))}

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

          {hoveredAnchor && tooltipPlacement ? (
            <aside
              className={[
                "map-review-tooltip",
                hoveredAnchor.source === "hotspot" ? "map-review-tooltip--compact" : "",
                tooltipToneClass(hoveredAnchor),
                tooltipPlacement.flipBelow ? "map-review-tooltip--below" : "",
              ].filter(Boolean).join(" ")}
              style={{
                left: tooltipPlacement.left,
                top: tooltipPlacement.top,
                width: tooltipPlacement.width,
                ["--tooltip-pointer-x" as string]: `${tooltipPlacement.pointerX}px`,
              }}
            >
              <h3>{hoveredAnchor.label}</h3>
              <div className="map-review-tooltip-rule" />
              {hoveredAnchor.category ? (
                <p className="map-review-tooltip-category">{hoveredAnchor.category}</p>
              ) : null}
              {hoveredAnchor.description ? (
                <p><strong>Role:</strong> {hoveredAnchor.description}</p>
              ) : null}
              {hoveredAnchor.source === "manual" && hoveredAnchor.evidence ? (
                <p><strong>Evidence:</strong> {hoveredAnchor.evidence}</p>
              ) : null}
              {hoveredAnchor.source === "hotspot" && hoveredAnchor.activity ? (
                <p><strong>Activity:</strong> {hoveredAnchor.activity.toLocaleString("en-GB")} arrivals and departures in this hourly slice.</p>
              ) : null}
            </aside>
          ) : null}
        </section>
      </div>

      <section className="map-review-explore" aria-labelledby="map-review-explore-title">
        <div className="map-review-explore-copy">
          <p className="map-review-kicker">Free Exploration</p>
          <h2 id="map-review-explore-title">Explore the system yourself.</h2>
          <p>
            After the guided story, keep the same map grammar and test other hours directly. Switch the day profile,
            scrub through the 24-hour cycle, and compare inferred routes with hourly docking hotspots.
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
              <span>Layer</span>
              <div className="map-review-control-buttons">
                {exploreLayerOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={exploreLayer === option.id ? "map-review-control-button map-review-control-button--active" : "map-review-control-button"}
                    onClick={() => setExploreLayer(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <dl className="map-review-explore-metrics">
            <div>
              <dt>Rides in hour</dt>
              <dd>{formatPrecise(exploreRouteSlice.averageDailyTrips || exploreHourlySlice.tripCount)}</dd>
            </div>
            <div>
              <dt>Route segments</dt>
              <dd>{exploreRouteSlice.edgeCount.toLocaleString("en-GB")}</dd>
            </div>
            <div>
              <dt>Hotspots</dt>
              <dd>{exploreHourlySlice.hotspots.length.toLocaleString("en-GB")}</dd>
            </div>
          </dl>
          {exploreLayer === "routes" && (!exploreRouteReady || !exploreRouteSliceReady) ? (
            <p className="map-review-explore-status">Loading the selected route slice...</p>
          ) : null}
          {exploreRouteError ? (
            <p className="map-review-explore-status map-review-explore-status--error">{exploreRouteError}</p>
          ) : null}
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
            focusBounds={mapFocusBounds}
            functionAnchors={[]}
          />
          <div className="map-review-explore-map-label">
            {exploreProfileId === "all" ? "All days" : exploreProfileId === "weekdays" ? "Weekday" : "Weekend"} ·{" "}
            {String(exploreHour).padStart(2, "0")}:00 · {exploreLayerOptions.find((option) => option.id === exploreLayer)?.label}
          </div>
        </div>
      </section>

      <section className="map-review-appendix" aria-labelledby="map-review-method-title">
        <div>
          <p className="map-review-kicker">Method and Credits</p>
          <h2 id="map-review-method-title">Method, data and credits.</h2>
        </div>
        <div className="map-review-appendix-grid">
          <article>
            <h3>Data</h3>
            <p>
              The project uses TfL Santander Cycles trip records, BikePoint station metadata, London borough
              boundaries and an OSM-derived service-area street network.
            </p>
          </article>
          <article>
            <h3>Method</h3>
            <p>
              Route layers are inferred street-use allocations from OD pairs, station snapping and stochastic
              distance-decay assignment. They are not observed GPS traces.
            </p>
          </article>
          <article>
            <h3>Team</h3>
            <p>Rong Zhao · Zhuohang Duan · Dailing Wu</p>
          </article>
        </div>
      </section>
    </main>
  );
}
