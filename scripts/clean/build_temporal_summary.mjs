import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const annualPath = path.join(projectRoot, "public", "data", "trip_aggregates_annual.json");
const processedDir = path.join(projectRoot, "data", "processed");
const publicDataDir = path.join(projectRoot, "public", "data");

const dayOrder = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const dayLabels = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const seasonLabels = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
};

const monthNames = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function seasonOfMonth(month) {
  if (month === 12 || month <= 2) return "winter";
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  return "autumn";
}

function buildDayCounts(year) {
  const counts = {
    all: 0,
    weekdays: 0,
    weekends: 0,
    mon: 0,
    tue: 0,
    wed: 0,
    thu: 0,
    fri: 0,
    sat: 0,
    sun: 0,
  };

  let date = new Date(Date.UTC(year, 0, 1));
  while (date.getUTCFullYear() === year) {
    const day = date.getUTCDay();
    const dayId = dayOrder[day];
    counts.all += 1;
    counts[dayId] += 1;
    if (day === 0 || day === 6) counts.weekends += 1;
    else counts.weekdays += 1;
    date = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate() + 1));
  }

  return counts;
}

function getProfile(annualDataset, profileId) {
  return annualDataset.profiles.find((profile) => profile.id === profileId);
}

function summarizeProfile(profile, dayCount) {
  const hourSlices = profile.hourSlices.map((slice) => ({
    hour: slice.hour,
    annualTripCount: slice.tripCount,
    averageDailyTrips: round(slice.tripCount / dayCount, 1),
  }));
  const peak = [...hourSlices].sort((left, right) => right.averageDailyTrips - left.averageDailyTrips)[0] ?? null;
  const trough =
    [...hourSlices].filter((slice) => slice.annualTripCount > 0).sort((left, right) => left.averageDailyTrips - right.averageDailyTrips)[0] ??
    null;

  return {
    id: profile.id,
    label: profile.label,
    group: profile.group,
    dayCount,
    annualTripCount: hourSlices.reduce((sum, item) => sum + item.annualTripCount, 0),
    averageDailyTrips: round(hourSlices.reduce((sum, item) => sum + item.averageDailyTrips, 0), 1),
    peakHour: peak?.hour ?? null,
    peakAverageDailyTrips: peak?.averageDailyTrips ?? 0,
    troughHour: trough?.hour ?? null,
    troughAverageDailyTrips: trough?.averageDailyTrips ?? 0,
    hourSlices,
  };
}

function buildMonthlySummary(annualDataset, year) {
  const months = (annualDataset.summary?.availableMonths ?? []).map((monthRecord) => {
    const [, monthText] = monthRecord.monthKey.split("-");
    const month = Number(monthText);
    const monthIndex = month - 1;
    const dayCount = daysInMonth(year, monthIndex);

    return {
      monthKey: monthRecord.monthKey,
      month,
      label: monthNames.format(new Date(Date.UTC(year, monthIndex, 1))),
      season: seasonOfMonth(month),
      dayCount,
      tripCount: monthRecord.tripCount,
      averageDailyTrips: round(monthRecord.tripCount / dayCount, 1),
    };
  });

  const maxAverageDailyTrips = Math.max(...months.map((month) => month.averageDailyTrips), 1);
  const minAverageDailyTrips = Math.min(...months.map((month) => month.averageDailyTrips), 1);

  return months.map((month) => ({
    ...month,
    indexOfPeakMonth: round(month.averageDailyTrips / maxAverageDailyTrips, 3),
    indexOfTroughMonth: round(month.averageDailyTrips / minAverageDailyTrips, 3),
  }));
}

function buildSeasonSummary(months) {
  const seasonMap = new Map();

  for (const month of months) {
    if (!seasonMap.has(month.season)) {
      seasonMap.set(month.season, {
        season: month.season,
        label: seasonLabels[month.season],
        monthKeys: [],
        dayCount: 0,
        tripCount: 0,
      });
    }

    const season = seasonMap.get(month.season);
    season.monthKeys.push(month.monthKey);
    season.dayCount += month.dayCount;
    season.tripCount += month.tripCount;
  }

  return ["winter", "spring", "summer", "autumn"]
    .map((seasonId) => seasonMap.get(seasonId))
    .filter(Boolean)
    .map((season) => ({
      ...season,
      averageDailyTrips: round(season.tripCount / season.dayCount, 1),
    }));
}

function buildDayOfWeekSummary(profileSummaries) {
  return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((id) => {
    const profile = profileSummaries.find((item) => item.id === id);
    return {
      id,
      label: dayLabels[id],
      dayCount: profile?.dayCount ?? 0,
      annualTripCount: profile?.annualTripCount ?? 0,
      averageDailyTrips: profile?.averageDailyTrips ?? 0,
      peakHour: profile?.peakHour ?? null,
      peakAverageDailyTrips: profile?.peakAverageDailyTrips ?? 0,
    };
  });
}

function buildAnnotations(months, seasons, profileSummaries) {
  const monthPeak = [...months].sort((left, right) => right.averageDailyTrips - left.averageDailyTrips)[0] ?? null;
  const monthTrough = [...months].sort((left, right) => left.averageDailyTrips - right.averageDailyTrips)[0] ?? null;
  const seasonPeak = [...seasons].sort((left, right) => right.averageDailyTrips - left.averageDailyTrips)[0] ?? null;
  const weekday = profileSummaries.find((profile) => profile.id === "weekdays");
  const weekend = profileSummaries.find((profile) => profile.id === "weekends");
  const all = profileSummaries.find((profile) => profile.id === "all");

  return {
    monthPeak: monthPeak
      ? {
          monthKey: monthPeak.monthKey,
          label: monthPeak.label,
          averageDailyTrips: monthPeak.averageDailyTrips,
        }
      : null,
    monthTrough: monthTrough
      ? {
          monthKey: monthTrough.monthKey,
          label: monthTrough.label,
          averageDailyTrips: monthTrough.averageDailyTrips,
        }
      : null,
    seasonPeak: seasonPeak
      ? {
          season: seasonPeak.season,
          label: seasonPeak.label,
          averageDailyTrips: seasonPeak.averageDailyTrips,
        }
      : null,
    allDayPeakHour: all
      ? {
          hour: all.peakHour,
          averageDailyTrips: all.peakAverageDailyTrips,
        }
      : null,
    weekdayPeakHour: weekday
      ? {
          hour: weekday.peakHour,
          averageDailyTrips: weekday.peakAverageDailyTrips,
        }
      : null,
    weekendPeakHour: weekend
      ? {
          hour: weekend.peakHour,
          averageDailyTrips: weekend.peakAverageDailyTrips,
        }
      : null,
  };
}

async function main() {
  const annualDataset = JSON.parse(await readFile(annualPath, "utf8"));
  const year = annualDataset.summary?.year ?? annualDataset.contract?.year ?? 2025;
  const dayCounts = buildDayCounts(year);
  const profileSummaries = annualDataset.profiles.map((profile) => summarizeProfile(profile, dayCounts[profile.id] ?? dayCounts.all));
  const months = buildMonthlySummary(annualDataset, year);
  const seasons = buildSeasonSummary(months);
  const dayOfWeek = buildDayOfWeekSummary(profileSummaries);
  const annotations = buildAnnotations(months, seasons, profileSummaries);

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: "Derived from public/data/trip_aggregates_annual.json",
      sourceTripArchive: annualDataset.summary?.source ?? "TfL Santander Cycles usage stats",
      year,
      totalTrips: annualDataset.summary?.validTrips ?? annualDataset.summary?.totalTrips ?? 0,
      metricBasis: {
        annualTripCount: "Observed trips in the retained 2025 TfL archive after station and duration filtering.",
        averageDailyTrips: "annualTripCount divided by the number of calendar days in the selected profile.",
        seasonDefinition: "Meteorological seasons: winter=Dec-Feb, spring=Mar-May, summer=Jun-Aug, autumn=Sep-Nov.",
      },
      dayCounts,
    },
    researchQuestion: "How do seasonal, weekly and hourly rhythms shape the street-level geography of London's bike-share use?",
    months,
    seasons,
    profiles: profileSummaries,
    dayOfWeek,
    annotations,
  };

  await mkdir(processedDir, { recursive: true });
  await mkdir(publicDataDir, { recursive: true });
  await writeFile(path.join(processedDir, "temporal_summary.json"), `${JSON.stringify(output)}\n`, "utf8");
  await writeFile(path.join(publicDataDir, "temporal_summary.json"), `${JSON.stringify(output)}\n`, "utf8");

  console.log(`Built temporal summary for ${months.length} months and ${seasons.length} seasons`);
  console.log(`Peak month: ${annotations.monthPeak?.label ?? "n/a"}`);
  console.log(`Weekday peak hour: ${annotations.weekdayPeakHour?.hour ?? "n/a"}:00`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
