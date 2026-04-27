import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const publicDataDir = join(rootDir, "public", "data");

const storyStops = [
  { id: "weekdays-08", profileId: "weekdays", hour: 8, label: "Weekday 08:00", slotLabel: "AM peak" },
  { id: "weekdays-13", profileId: "weekdays", hour: 13, label: "Weekday 13:00", slotLabel: "Midday" },
  { id: "weekdays-17", profileId: "weekdays", hour: 17, label: "Weekday 17:00", slotLabel: "PM peak" },
  { id: "weekdays-23", profileId: "weekdays", hour: 23, label: "Weekday 23:00", slotLabel: "Late" },
  { id: "weekends-08", profileId: "weekends", hour: 8, label: "Weekend 08:00", slotLabel: "Morning" },
  { id: "weekends-13", profileId: "weekends", hour: 13, label: "Weekend 13:00", slotLabel: "Afternoon" },
  { id: "weekends-17", profileId: "weekends", hour: 17, label: "Weekend 17:00", slotLabel: "Evening" },
  { id: "weekends-23", profileId: "weekends", hour: 23, label: "Weekend 23:00", slotLabel: "Late" },
];

const centralityAnchors = [
  { id: "waterloo", label: "Waterloo", color: "#6aa7d8", patterns: [/waterloo/i] },
  { id: "hyde-park", label: "Hyde Park", color: "#72b98d", patterns: [/hyde park/i, /serpentine/i, /park lane/i] },
  { id: "city-bank", label: "City / Bank", color: "#75beb5", patterns: [/bank/i, /st\.? paul/i, /queen street/i, /liverpool street/i, /moorgate/i, /finsbury/i] },
  { id: "west-end", label: "Soho / West End", color: "#d7659b", patterns: [/soho/i, /wardour/i, /covent garden/i, /leicester square/i, /piccadilly/i, /regent street/i, /oxford circus/i, /mayfair/i] },
  { id: "london-bridge", label: "London Bridge / Borough", color: "#d89c68", patterns: [/london bridge/i, /borough/i, /bermondsey/i, /shad thames/i, /southwark/i] },
  { id: "battersea-chelsea", label: "Battersea / Chelsea", color: "#b78cf0", patterns: [/battersea/i, /chelsea/i, /sloane/i, /knightsbridge/i, /south kensington/i] },
];

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function rounded(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function buildLorenzCurve(weights) {
  const sorted = [...weights].filter((value) => value > 0).sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (sorted.length === 0 || total <= 0) return [{ x: 0, y: 0 }, { x: 1, y: 1 }];

  const cumulative = [0];
  for (const value of sorted) cumulative.push(cumulative.at(-1) + value);

  return Array.from({ length: 11 }, (_, index) => {
    if (index === 0) return { x: 0, y: 0 };
    if (index === 10) return { x: 1, y: 1 };
    const rank = Math.round((index / 10) * sorted.length);
    return {
      x: rounded(rank / sorted.length, 4),
      y: rounded(cumulative[rank] / total, 4),
    };
  });
}

function giniForWeights(weights) {
  const sorted = [...weights].filter((value) => value > 0).sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (sorted.length === 0 || total <= 0) return 0;
  const weightedRankSum = sorted.reduce((sum, value, index) => sum + (index + 1) * value, 0);
  return rounded((2 * weightedRankSum) / (sorted.length * total) - (sorted.length + 1) / sorted.length, 4);
}

function concentrationForRoutes(routes) {
  const weightedRoutes = (routes ?? [])
    .map((route) => ({ ...route, averageDailyTrips: Math.max(0, Number(route.averageDailyTrips ?? 0)) }))
    .filter((route) => route.averageDailyTrips > 0)
    .sort((left, right) => right.averageDailyTrips - left.averageDailyTrips);

  const totalAverageDailyTrips = weightedRoutes.reduce((sum, route) => sum + route.averageDailyTrips, 0);
  const weights = weightedRoutes.map((route) => route.averageDailyTrips);
  const shares = weightedRoutes.map((route) => route.averageDailyTrips / Math.max(totalAverageDailyTrips, 1e-9));
  const herfindahl = shares.reduce((sum, share) => sum + share * share, 0);
  const top10AverageDailyTrips = weightedRoutes.slice(0, 10).reduce((sum, route) => sum + route.averageDailyTrips, 0);
  const top25AverageDailyTrips = weightedRoutes.slice(0, 25).reduce((sum, route) => sum + route.averageDailyTrips, 0);
  const dominant = weightedRoutes[0];

  return {
    routeCount: weightedRoutes.length,
    totalAverageDailyTrips: rounded(totalAverageDailyTrips, 2),
    top10AverageDailyTrips: rounded(top10AverageDailyTrips, 2),
    top10Share: rounded(top10AverageDailyTrips / Math.max(totalAverageDailyTrips, 1e-9)),
    top25Share: rounded(top25AverageDailyTrips / Math.max(totalAverageDailyTrips, 1e-9)),
    herfindahl: rounded(herfindahl, 5),
    gini: giniForWeights(weights),
    lorenzCurve: buildLorenzCurve(weights),
    effectiveCorridors: rounded(herfindahl > 0 ? 1 / herfindahl : 0, 1),
    dominantCorridor: dominant ? `${dominant.origin} to ${dominant.destination}` : null,
  };
}

async function buildStoryStop(stop) {
  const hourKey = String(stop.hour).padStart(2, "0");
  const slice = await readJson(join(publicDataDir, "od_route_lens", `${stop.profileId}_${hourKey}.json`));
  return {
    ...stop,
    ...concentrationForRoutes(slice.routes),
  };
}

function anchorForName(name) {
  return centralityAnchors.find((anchor) => anchor.patterns.some((pattern) => pattern.test(name ?? ""))) ?? null;
}

function centralityForRoutes(stop, routes) {
  const scores = Object.fromEntries(centralityAnchors.map((anchor) => [anchor.id, 0]));

  for (const route of routes ?? []) {
    const weight = Math.max(0, Number(route.averageDailyTrips ?? 0));
    if (weight <= 0) continue;
    for (const name of [route.origin, route.destination]) {
      const anchor = anchorForName(name);
      if (anchor) scores[anchor.id] += weight;
    }
  }

  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  const ranked = centralityAnchors
    .map((anchor) => ({ id: anchor.id, value: scores[anchor.id], share: total > 0 ? scores[anchor.id] / total : 0 }))
    .sort((left, right) => right.value - left.value);
  const rankById = new Map(ranked.map((anchor, index) => [anchor.id, index + 1]));

  return {
    id: stop.id,
    profileId: stop.profileId,
    hour: stop.hour,
    label: stop.label,
    slotLabel: stop.slotLabel,
    matchedAverageDailyTrips: rounded(total, 2),
    anchors: centralityAnchors.map((anchor) => ({
      id: anchor.id,
      share: rounded(total > 0 ? scores[anchor.id] / total : 0),
      rank: rankById.get(anchor.id) ?? centralityAnchors.length,
    })),
  };
}

async function main() {
  const rows = [];
  const routeSlices = new Map();
  for (const stop of storyStops) {
    const hourKey = String(stop.hour).padStart(2, "0");
    routeSlices.set(stop.id, await readJson(join(publicDataDir, "od_route_lens", `${stop.profileId}_${hourKey}.json`)));
    rows.push({ ...stop, ...concentrationForRoutes(routeSlices.get(stop.id).routes) });
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    basis:
      "Concentration metrics are calculated from visible OD route-lens corridors. Top-10 share and Herfindahl index show whether routed demand is dominated by a small number of corridors or distributed across a wider street-use field.",
    storyStops: rows,
  };

  const outputPath = join(publicDataDir, "route_concentration_story.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);

  const centralityPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    basis:
      "Anchor centrality is estimated from OD route-lens origins and destinations. It measures which named urban areas appear around visible route demand, not complete station accessibility.",
    anchors: centralityAnchors.map(({ id, label, color }) => ({ id, label, color })),
    storyStops: storyStops.map((stop) => centralityForRoutes(stop, routeSlices.get(stop.id).routes)),
  };
  const centralityPath = join(publicDataDir, "temporal_centrality_story.json");
  await writeFile(centralityPath, `${JSON.stringify(centralityPayload, null, 2)}\n`);
  console.log(`Wrote ${centralityPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
