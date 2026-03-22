import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const tripDir = path.join(projectRoot, "data", "raw", "trips", "2025");
const tripMetaPath = path.join(projectRoot, "data", "raw", "trips", "trip-year-2025.json");
const stationsPath = path.join(projectRoot, "data", "processed", "stations.json");
const processedDir = path.join(projectRoot, "data", "processed");
const publicDataDir = path.join(projectRoot, "public", "data");

const maxDurationMs = 4 * 60 * 60 * 1000;
const schemaVersion = 2;
const topFlowsPerSlice = 960;
const topHotspotsPerSlice = 120;
const perFileFlowCandidates = 2400;
const perFileHotspotCandidates = 240;

const profileConfigs = [
  { id: "all", label: "All", group: "overview", matches: () => true },
  { id: "weekdays", label: "Weekdays", group: "overview", matches: (isWeekend) => !isWeekend },
  { id: "weekends", label: "Weekends", group: "overview", matches: (isWeekend) => isWeekend },
  { id: "mon", label: "Mon", group: "week", matches: (_, dayIndex) => dayIndex === 1 },
  { id: "tue", label: "Tue", group: "week", matches: (_, dayIndex) => dayIndex === 2 },
  { id: "wed", label: "Wed", group: "week", matches: (_, dayIndex) => dayIndex === 3 },
  { id: "thu", label: "Thu", group: "week", matches: (_, dayIndex) => dayIndex === 4 },
  { id: "fri", label: "Fri", group: "week", matches: (_, dayIndex) => dayIndex === 5 },
  { id: "sat", label: "Sat", group: "week", matches: (_, dayIndex) => dayIndex === 6 },
  { id: "sun", label: "Sun", group: "week", matches: (_, dayIndex) => dayIndex === 0 }
];

function normalizeTerminalName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getTimeBucket(date) {
  const day = date.getUTCDay();
  const hour = date.getUTCHours();
  const isWeekend = day === 0 || day === 6;

  if (isWeekend) {
    return "Weekend";
  }

  if (hour >= 7 && hour < 11) {
    return "AM Peak";
  }

  if (hour >= 11 && hour < 16) {
    return "Midday";
  }

  if (hour >= 16 && hour < 20) {
    return "PM Peak";
  }

  return "Night";
}

function toUtcDate(value) {
  return new Date(`${value.replace(" ", "T")}:00Z`);
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

async function loadStationIndex() {
  const text = await readFile(stationsPath, "utf8");
  const payload = JSON.parse(text);
  const index = new Map();

  for (const station of payload.stations ?? []) {
    const terminalName = normalizeTerminalName(station.terminalName);

    if (!terminalName) {
      continue;
    }

    index.set(terminalName, station);
  }

  return index;
}

async function resolveTripFiles() {
  const entries = await readdir(tripDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".csv"))
    .map((entry) => path.join(tripDir, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}

function ensureFlow(map, key, seed) {
  if (!map.has(key)) {
    map.set(key, { ...seed, tripCount: 0, totalDurationMs: 0 });
  }
}

function ensureHotspot(map, key, seed) {
  if (!map.has(key)) {
    map.set(key, { ...seed, departures: 0, arrivals: 0, activity: 0 });
  }
}

function groupRecordsBySlice(records, sliceKeyOf) {
  const grouped = new Map();

  for (const record of records.values()) {
    const sliceKey = sliceKeyOf(record);

    if (!grouped.has(sliceKey)) {
      grouped.set(sliceKey, []);
    }

    grouped.get(sliceKey).push(record);
  }

  return grouped;
}

function mergeTopFlowCandidates(sourceMap, targetMap) {
  const grouped = groupRecordsBySlice(sourceMap, (record) => `${record.profileId}|${record.hour}`);

  for (const [sliceKey, records] of grouped.entries()) {
    const topRecords = records
      .sort((left, right) => right.tripCount - left.tripCount)
      .slice(0, perFileFlowCandidates);

    for (const record of topRecords) {
      const key = `${sliceKey}|${record.originTerminal}|${record.destinationTerminal}`;

      if (!targetMap.has(key)) {
        targetMap.set(key, { ...record });
        continue;
      }

      const existing = targetMap.get(key);
      existing.tripCount += record.tripCount;
      existing.totalDurationMs += record.totalDurationMs;
    }
  }
}

function mergeTopHotspotCandidates(sourceMap, targetMap) {
  const grouped = groupRecordsBySlice(sourceMap, (record) => `${record.profileId}|${record.hour}`);

  for (const [sliceKey, records] of grouped.entries()) {
    const topRecords = records
      .sort((left, right) => right.activity - left.activity)
      .slice(0, perFileHotspotCandidates);

    for (const record of topRecords) {
      const key = `${sliceKey}|${record.terminal}`;

      if (!targetMap.has(key)) {
        targetMap.set(key, { ...record });
        continue;
      }

      const existing = targetMap.get(key);
      existing.departures += record.departures;
      existing.arrivals += record.arrivals;
      existing.activity += record.activity;
    }
  }
}

async function main() {
  const stationIndex = await loadStationIndex();
  const meta = JSON.parse(await readFile(tripMetaPath, "utf8"));
  const csvFiles = await resolveTripFiles();

  if (csvFiles.length === 0) {
    throw new Error("No annual trip CSV files found in data/raw/trips/2025");
  }

  const candidateFlowMap = new Map();
  const candidateHotspotMap = new Map();
  const sliceTotalsMap = new Map();
  const bikeModelMap = new Map();
  const bucketCounts = new Map();
  const monthTotalsMap = new Map();
  const hourTotalsMap = new Map();

  let rowCount = 0;
  let validTrips = 0;
  let droppedMissingStations = 0;
  let droppedDuration = 0;
  let startDateMin = null;
  let startDateMax = null;

  for (const csvPath of csvFiles) {
    const fileFlowMap = new Map();
    const fileHotspotMap = new Map();
    const parser = createReadStream(csvPath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true
      })
    );

    for await (const record of parser) {
      rowCount += 1;

      const originTerminal = normalizeTerminalName(record["Start station number"]);
      const destinationTerminal = normalizeTerminalName(record["End station number"]);
      const originStation = stationIndex.get(originTerminal);
      const destinationStation = stationIndex.get(destinationTerminal);

      if (!originStation || !destinationStation) {
        droppedMissingStations += 1;
        continue;
      }

      const durationMs = Number(record["Total duration (ms)"] ?? 0);

      if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > maxDurationMs) {
        droppedDuration += 1;
        continue;
      }

      const startDate = toUtcDate(record["Start date"]);

      if (Number.isNaN(startDate.valueOf())) {
        droppedDuration += 1;
        continue;
      }

      validTrips += 1;

      if (!startDateMin || startDate < startDateMin) {
        startDateMin = startDate;
      }

      if (!startDateMax || startDate > startDateMax) {
        startDateMax = startDate;
      }

      const hour = startDate.getUTCHours();
      const dayIndex = startDate.getUTCDay();
      const isWeekend = dayIndex === 0 || dayIndex === 6;
      const bucket = getTimeBucket(startDate);
      const monthKey = startDate.toISOString().slice(0, 7);
      const bikeModel = record["Bike model"] || "UNKNOWN";

      bikeModelMap.set(bikeModel, (bikeModelMap.get(bikeModel) ?? 0) + 1);
      bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);

      if (!monthTotalsMap.has(monthKey)) {
        monthTotalsMap.set(monthKey, {
          monthKey,
          tripCount: 0
        });
      }

      if (!hourTotalsMap.has(hour)) {
        hourTotalsMap.set(hour, {
          hour,
          tripCount: 0
        });
      }

      monthTotalsMap.get(monthKey).tripCount += 1;
      hourTotalsMap.get(hour).tripCount += 1;

      for (const profile of profileConfigs) {
        if (!profile.matches(isWeekend, dayIndex)) {
          continue;
        }

        const sliceKey = `${profile.id}|${hour}`;
        const flowKey = `${sliceKey}|${originTerminal}|${destinationTerminal}`;
        const originHotspotKey = `${sliceKey}|${originTerminal}`;
        const destinationHotspotKey = `${sliceKey}|${destinationTerminal}`;

        if (!sliceTotalsMap.has(sliceKey)) {
          sliceTotalsMap.set(sliceKey, {
            profileId: profile.id,
            label: profile.label,
            group: profile.group,
            hour,
            tripCount: 0
          });
        }

        sliceTotalsMap.get(sliceKey).tripCount += 1;

        ensureFlow(fileFlowMap, flowKey, {
          profileId: profile.id,
          hour,
          timeBucket: bucket,
          originTerminal,
          destinationTerminal,
          originName: record["Start station"],
          destinationName: record["End station"],
          originLon: originStation.lon,
          originLat: originStation.lat,
          destinationLon: destinationStation.lon,
          destinationLat: destinationStation.lat
        });

        ensureHotspot(fileHotspotMap, originHotspotKey, {
          profileId: profile.id,
          label: profile.label,
          group: profile.group,
          hour,
          terminal: originTerminal,
          name: record["Start station"],
          x: originStation.x,
          y: originStation.y,
          lon: originStation.lon,
          lat: originStation.lat
        });

        ensureHotspot(fileHotspotMap, destinationHotspotKey, {
          profileId: profile.id,
          label: profile.label,
          group: profile.group,
          hour,
          terminal: destinationTerminal,
          name: record["End station"],
          x: destinationStation.x,
          y: destinationStation.y,
          lon: destinationStation.lon,
          lat: destinationStation.lat
        });

        const flow = fileFlowMap.get(flowKey);
        flow.tripCount += 1;
        flow.totalDurationMs += durationMs;

        const originHotspot = fileHotspotMap.get(originHotspotKey);
        originHotspot.departures += 1;
        originHotspot.activity += 1;

        const destinationHotspot = fileHotspotMap.get(destinationHotspotKey);
        destinationHotspot.arrivals += 1;
        destinationHotspot.activity += 1;
      }
    }

    mergeTopFlowCandidates(fileFlowMap, candidateFlowMap);
    mergeTopHotspotCandidates(fileHotspotMap, candidateHotspotMap);
    console.log(`Merged annual candidates from ${path.basename(csvPath)}`);
  }

  const flowRecordsBySlice = groupRecordsBySlice(
    new Map(
      [...candidateFlowMap.entries()].map(([key, flow]) => [
        key,
        {
          id: `${flow.profileId}-${flow.hour}-${flow.originTerminal}-${flow.destinationTerminal}`,
          profileId: flow.profileId,
          hour: flow.hour,
          timeBucket: flow.timeBucket,
          originTerminal: flow.originTerminal,
          destinationTerminal: flow.destinationTerminal,
          originName: flow.originName,
          destinationName: flow.destinationName,
          originLon: flow.originLon,
          originLat: flow.originLat,
          destinationLon: flow.destinationLon,
          destinationLat: flow.destinationLat,
          tripCount: flow.tripCount,
          avgDurationMin: round(flow.totalDurationMs / flow.tripCount / 60000)
        }
      ])
    ),
    (record) => `${record.profileId}|${record.hour}`
  );

  const hotspotRecordsBySlice = groupRecordsBySlice(
    candidateHotspotMap,
    (record) => `${record.profileId}|${record.hour}`
  );

  const profiles = profileConfigs.map((profile) => ({
    id: profile.id,
    label: profile.label,
    group: profile.group,
    hourSlices: Array.from({ length: 24 }, (_, hour) => {
      const sliceKey = `${profile.id}|${hour}`;
      const sliceMeta = sliceTotalsMap.get(sliceKey) ?? {
        profileId: profile.id,
        label: profile.label,
        group: profile.group,
        hour,
        tripCount: 0
      };

      const flows = (flowRecordsBySlice.get(sliceKey) ?? [])
        .sort((left, right) => right.tripCount - left.tripCount)
        .slice(0, topFlowsPerSlice);

      const hotspots = (hotspotRecordsBySlice.get(sliceKey) ?? [])
        .sort((left, right) => right.activity - left.activity)
        .slice(0, topHotspotsPerSlice)
        .map((spot) => ({
          profileId: spot.profileId,
          hour: spot.hour,
          terminal: spot.terminal,
          name: spot.name,
          x: spot.x,
          y: spot.y,
          lon: spot.lon,
          lat: spot.lat,
          departures: spot.departures,
          arrivals: spot.arrivals,
          activity: spot.activity
        }));

      return {
        profileId: profile.id,
        label: profile.label,
        group: profile.group,
        hour,
        tripCount: sliceMeta.tripCount,
        flows,
        hotspots
      };
    })
  }));

  const sliceMetrics = profiles.reduce(
    (acc, profile) => {
      for (const slice of profile.hourSlices) {
        acc.hourSliceCount += 1;

        if ((slice.flows?.length ?? 0) > 0) {
          acc.nonEmptyFlowSlices += 1;
          acc.maxFlowsPerSlice = Math.max(acc.maxFlowsPerSlice, slice.flows.length);
        }

        if ((slice.hotspots?.length ?? 0) > 0) {
          acc.nonEmptyHotspotSlices += 1;
          acc.maxHotspotsPerSlice = Math.max(acc.maxHotspotsPerSlice, slice.hotspots.length);
        }
      }

      return acc;
    },
    {
      hourSliceCount: 0,
      nonEmptyFlowSlices: 0,
      nonEmptyHotspotSlices: 0,
      maxFlowsPerSlice: 0,
      maxHotspotsPerSlice: 0
    }
  );

  const summary = {
    source: meta.source,
    fileName: `TfL 2025 annual extracts (${csvFiles.length} files)`,
    capturedAt: meta.capturedAt,
    generatedAt: new Date().toISOString(),
    schemaVersion,
    year: 2025,
    fileCount: csvFiles.length,
    profileCount: profiles.length,
    hourSliceCount: sliceMetrics.hourSliceCount,
    nonEmptyFlowSlices: sliceMetrics.nonEmptyFlowSlices,
    nonEmptyHotspotSlices: sliceMetrics.nonEmptyHotspotSlices,
    maxFlowsPerSlice: sliceMetrics.maxFlowsPerSlice,
    maxHotspotsPerSlice: sliceMetrics.maxHotspotsPerSlice,
    rowCount,
    validTrips,
    droppedMissingStations,
    droppedDuration,
    topFlowCount: profiles.reduce(
      (sum, profile) => sum + profile.hourSlices.reduce((hourSum, slice) => hourSum + slice.flows.length, 0),
      0
    ),
    startDate: startDateMin?.toISOString() ?? null,
    endDate: startDateMax?.toISOString() ?? null,
    bucketCounts: Object.fromEntries(bucketCounts),
    availableMonths: [...monthTotalsMap.values()].sort((left, right) => left.monthKey.localeCompare(right.monthKey)),
    hourTotals: [...hourTotalsMap.values()].sort((left, right) => left.hour - right.hour),
    bikeModels: [...bikeModelMap.entries()]
      .map(([model, count]) => ({ model, count }))
      .sort((left, right) => right.count - left.count)
  };

  const output = {
    contract: {
      schemaVersion,
      year: 2025,
      profileCount: profiles.length,
      hourSliceCount: sliceMetrics.hourSliceCount,
      expectedFlowsPerSlice: topFlowsPerSlice,
      expectedHotspotsPerSlice: topHotspotsPerSlice
    },
    summary,
    profiles
  };

  await mkdir(processedDir, { recursive: true });
  await mkdir(publicDataDir, { recursive: true });

  await writeFile(
    path.join(processedDir, "trip_aggregates_annual.json"),
    `${JSON.stringify(output)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(publicDataDir, "trip_aggregates_annual.json"),
    `${JSON.stringify(output)}\n`,
    "utf8"
  );

  console.log(`Built annual trip aggregates from ${csvFiles.length} files`);
  console.log(`Valid trips: ${summary.validTrips}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
