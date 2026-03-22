import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const annualPath = path.join(projectRoot, "public", "data", "trip_aggregates_annual.json");
const processedDir = path.join(projectRoot, "data", "processed");
const publicDataDir = path.join(projectRoot, "public", "data");

const profileIds = ["all", "weekdays", "weekends"];
const topFlowsPerHour = {
  all: 520,
  weekdays: 560,
  weekends: 460,
};
const topHotspotsPerHour = 100;

function toCompactHotspot(spot) {
  return {
    lon: spot.lon,
    lat: spot.lat,
    name: spot.name,
    dep: spot.departures,
    arr: spot.arrivals,
    act: spot.activity,
  };
}

function toCompactFlow(flow) {
  return {
    oLon: flow.originLon,
    oLat: flow.originLat,
    dLon: flow.destinationLon,
    dLat: flow.destinationLat,
    oName: flow.originName,
    dName: flow.destinationName,
    count: flow.tripCount,
    dur: flow.avgDurationMin,
  };
}

function getTimeBucket(hour, profileId) {
  if (profileId === "weekends") {
    if (hour >= 10 && hour < 18) return "Weekend Day";
    if (hour >= 18 && hour < 23) return "Weekend Evening";
    return "Weekend Night";
  }

  if (hour >= 5 && hour < 7) return "Early Morning";
  if (hour >= 7 && hour < 10) return "AM Peak";
  if (hour >= 10 && hour < 16) return "Midday";
  if (hour >= 16 && hour < 19) return "PM Peak";
  if (hour >= 19 && hour < 22) return "Evening";
  if ((hour >= 22 && hour <= 23) || (hour >= 0 && hour < 2)) return "Night";
  return "Late Night";
}

async function main() {
  const raw = JSON.parse(await readFile(annualPath, "utf8"));
  const annualProfiles = Array.isArray(raw.profiles) ? raw.profiles : [];

  const profiles = profileIds.map((profileId) => {
    const profile = annualProfiles.find((item) => item.id === profileId);

    if (!profile) {
      throw new Error(`Missing profile ${profileId} in trip_aggregates_annual.json`);
    }

    return {
      id: profile.id,
      label: profile.label,
      group: profile.group,
      hourSlices: (profile.hourSlices ?? []).map((slice) => ({
        profileId: profile.id,
        label: profile.label,
        group: profile.group,
        hour: slice.hour,
        timeBucket: getTimeBucket(slice.hour, profile.id),
        tripCount: slice.tripCount,
        flows: (slice.flows ?? [])
          .sort((left, right) => right.tripCount - left.tripCount)
          .slice(0, topFlowsPerHour[profile.id] ?? 480)
          .map(toCompactFlow),
        hotspots: (slice.hotspots ?? [])
          .sort((left, right) => right.activity - left.activity)
          .slice(0, topHotspotsPerHour)
          .map(toCompactHotspot),
      })),
    };
  });

  const globalFlowMax = profiles.reduce((max, profile) => {
    return Math.max(
      max,
      ...profile.hourSlices.flatMap((slice) => slice.flows.map((flow) => flow.count)),
    );
  }, 1);

  const output = {
    meta: {
      year: raw.summary?.year ?? 2025,
      totalTrips: raw.summary?.validTrips ?? raw.summary?.totalTrips ?? 0,
      generatedAt: new Date().toISOString(),
      source: "Derived from trip_aggregates_annual.json",
      profileIds,
      globalFlowMax,
    },
    profiles,
  };

  await mkdir(processedDir, { recursive: true });
  await mkdir(publicDataDir, { recursive: true });

  await writeFile(path.join(processedDir, "flows_hourly.json"), `${JSON.stringify(output)}\n`, "utf8");
  await writeFile(path.join(publicDataDir, "flows_hourly.json"), `${JSON.stringify(output)}\n`, "utf8");

  console.log(`Built hourly story flows for ${profiles.length} profiles`);
  console.log(`Global flow max: ${globalFlowMax}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
