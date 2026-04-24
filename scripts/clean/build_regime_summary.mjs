import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

const flowsPath = path.join(projectRoot, "public", "data", "flows_hourly.json");
const processedDir = path.join(projectRoot, "data", "processed");
const publicDir = path.join(projectRoot, "public", "data");

const TARGET_PROFILE_IDS = new Set(["weekdays", "weekends"]);
const GRID_SIZE = 0.01;
const CLUSTER_COUNT = 4;
const SEED_COUNT = 16;

const NIGHT_HOURS = new Set([20, 21, 22, 23, 0, 1, 2, 3, 4]);
const DAWN_HOURS = new Set([5, 6, 7]);
const WORK_HOURS = new Set([6, 7, 8, 9, 16, 17, 18]);
const DAY_HOURS = new Set([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

const regimeCatalog = {
  work_core: {
    label: "Work-core rush",
    shortLabel: "Work core",
    kicker: "Weekday peak regime",
    description:
      "A concentrated weekday regime around main rail terminals, the City and core employment anchors. This is the clearest work-oriented use state in the network.",
    colorScheme: "cool",
    cameraPreset: "commute",
  },
  day_leisure: {
    label: "Daytime park and leisure",
    shortLabel: "Day leisure",
    kicker: "Daytime regime",
    description:
      "A broad daytime regime centred on parks, the West End and mixed central destinations. It dominates weekend daytime and large parts of weekday midday.",
    colorScheme: "warm",
    cameraPreset: "weekend",
  },
  night_social: {
    label: "Night and social centre",
    shortLabel: "Night social",
    kicker: "Evening regime",
    description:
      "An evening and night regime focused on the social core: Soho, Borough, London Bridge, Shoreditch and adjacent activity districts.",
    colorScheme: "purple",
    cameraPreset: "spatial",
  },
  dawn_transition: {
    label: "Dawn transition",
    shortLabel: "Dawn",
    kicker: "Transition regime",
    description:
      "A lower-volume shoulder regime bridging late night and the coming workday. It is structurally distinct, but weaker than the three dominant states.",
    colorScheme: "cool",
    cameraPreset: "rhythm",
  },
};

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function gridKey(lon, lat) {
  const snappedLon = Math.round(lon / GRID_SIZE) * GRID_SIZE;
  const snappedLat = Math.round(lat / GRID_SIZE) * GRID_SIZE;
  return `${snappedLon.toFixed(2)}:${snappedLat.toFixed(2)}`;
}

function euclideanDistance(a, b) {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    const delta = a[index] - b[index];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

function averageVector(rows, vectorLength) {
  if (rows.length === 0) {
    return Array.from({ length: vectorLength }, () => 0);
  }

  const sums = Array.from({ length: vectorLength }, () => 0);
  for (const row of rows) {
    for (let index = 0; index < vectorLength; index += 1) {
      sums[index] += row[index];
    }
  }

  return sums.map((value) => value / rows.length);
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function initializeCenters(vectors, clusterCount, seed) {
  const random = seededRandom(seed);
  const centers = [vectors[Math.floor(random() * vectors.length)]];

  while (centers.length < clusterCount) {
    const distances = vectors.map((vector) => {
      let minDistance = Infinity;
      for (const center of centers) {
        minDistance = Math.min(minDistance, euclideanDistance(vector, center) ** 2);
      }
      return minDistance;
    });

    const totalDistance = distances.reduce((sum, value) => sum + value, 0);
    let target = random() * totalDistance;
    let selectedIndex = 0;

    for (let index = 0; index < distances.length; index += 1) {
      target -= distances[index];
      if (target <= 0) {
        selectedIndex = index;
        break;
      }
    }

    centers.push(vectors[selectedIndex]);
  }

  return centers.map((center) => [...center]);
}

function kMeans(vectors, clusterCount, seed, maxIterations = 100) {
  const vectorLength = vectors[0]?.length ?? 0;
  let centers = initializeCenters(vectors, clusterCount, seed);
  let assignments = [];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const nextAssignments = vectors.map((vector) => {
      let bestCluster = 0;
      let bestDistance = Infinity;

      for (let clusterIndex = 0; clusterIndex < centers.length; clusterIndex += 1) {
        const distance = euclideanDistance(vector, centers[clusterIndex]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCluster = clusterIndex;
        }
      }

      return bestCluster;
    });

    if (
      assignments.length === nextAssignments.length &&
      assignments.every((value, index) => value === nextAssignments[index])
    ) {
      assignments = nextAssignments;
      break;
    }

    assignments = nextAssignments;

    centers = centers.map((_, clusterIndex) => {
      const rows = vectors.filter((__, vectorIndex) => assignments[vectorIndex] === clusterIndex);
      return averageVector(rows, vectorLength);
    });
  }

  return { assignments, centers };
}

function silhouetteScore(vectors, assignments) {
  const clusterMembers = new Map();
  assignments.forEach((clusterIndex, vectorIndex) => {
    if (!clusterMembers.has(clusterIndex)) {
      clusterMembers.set(clusterIndex, []);
    }
    clusterMembers.get(clusterIndex).push(vectorIndex);
  });

  const clusterIds = [...clusterMembers.keys()];
  const scores = vectors.map((vector, vectorIndex) => {
    const ownCluster = assignments[vectorIndex];
    const ownMembers = clusterMembers.get(ownCluster);

    if (!ownMembers || ownMembers.length <= 1) {
      return 0;
    }

    let intraDistance = 0;
    for (const otherIndex of ownMembers) {
      if (otherIndex === vectorIndex) continue;
      intraDistance += euclideanDistance(vector, vectors[otherIndex]);
    }
    intraDistance /= ownMembers.length - 1;

    let nearestOtherCluster = Infinity;
    for (const clusterId of clusterIds) {
      if (clusterId === ownCluster) continue;
      const otherMembers = clusterMembers.get(clusterId) ?? [];
      const averageDistance =
        otherMembers.reduce((sum, otherIndex) => sum + euclideanDistance(vector, vectors[otherIndex]), 0) /
        Math.max(otherMembers.length, 1);
      nearestOtherCluster = Math.min(nearestOtherCluster, averageDistance);
    }

    const denominator = Math.max(intraDistance, nearestOtherCluster);
    return denominator === 0 ? 0 : (nearestOtherCluster - intraDistance) / denominator;
  });

  return scores.reduce((sum, value) => sum + value, 0) / Math.max(scores.length, 1);
}

function scoreClusterForType(cluster, maxTripCount) {
  const total = Math.max(cluster.members.length, 1);
  const weekdayShare = cluster.profileCounts.weekdays / total;
  const weekendShare = cluster.profileCounts.weekends / total;
  const nightShare = cluster.bucketCounts.night / total;
  const dawnShare = cluster.bucketCounts.dawn / total;
  const workShare = cluster.bucketCounts.work / total;
  const dayShare = cluster.bucketCounts.day / total;
  const tripScale = cluster.averageTripCount / Math.max(maxTripCount, 1);

  return {
    work_core: weekdayShare * 1.5 + workShare * 2.4 + tripScale * 0.4 - nightShare * 0.6,
    day_leisure: dayShare * 1.8 + weekendShare * 0.6 + tripScale * 0.25 - workShare * 0.35,
    night_social: nightShare * 2.3 + weekendShare * 0.25 - dayShare * 0.25,
    dawn_transition: dawnShare * 2.6 + (1 - tripScale) * 0.45 - dayShare * 0.35,
  };
}

function permutations(values) {
  if (values.length <= 1) return [values];
  const result = [];
  values.forEach((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const permutation of permutations(rest)) {
      result.push([value, ...permutation]);
    }
  });
  return result;
}

function assignRegimeTypes(clusters) {
  const types = ["work_core", "day_leisure", "night_social", "dawn_transition"];
  const maxTripCount = Math.max(...clusters.map((cluster) => cluster.averageTripCount), 1);
  const clusterScores = new Map(
    clusters.map((cluster) => [cluster.clusterIndex, scoreClusterForType(cluster, maxTripCount)]),
  );

  let bestAssignment = null;
  let bestScore = -Infinity;

  for (const order of permutations(types)) {
    let score = 0;
    const assignment = [];

    for (let index = 0; index < clusters.length; index += 1) {
      const cluster = clusters[index];
      const regimeType = order[index];
      score += clusterScores.get(cluster.clusterIndex)[regimeType];
      assignment.push([cluster.clusterIndex, regimeType]);
    }

    if (score > bestScore) {
      bestScore = score;
      bestAssignment = assignment;
    }
  }

  return new Map(bestAssignment);
}

function formatHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

async function main() {
  const flowsData = JSON.parse(await readFile(flowsPath, "utf8"));
  const profiles = flowsData.profiles.filter((profile) => TARGET_PROFILE_IDS.has(profile.id));

  const slices = [];
  const gridKeySet = new Set();

  for (const profile of profiles) {
    for (const hourSlice of profile.hourSlices) {
      const weights = new Map();
      let totalWeight = 0;

      for (const hotspot of hourSlice.hotspots) {
        const key = gridKey(hotspot.lon, hotspot.lat);
        const weight = Number(hotspot.act) || 0;
        weights.set(key, (weights.get(key) ?? 0) + weight);
        totalWeight += weight;
        gridKeySet.add(key);
      }

      slices.push({
        profileId: profile.id,
        profileLabel: profile.label,
        hour: hourSlice.hour,
        label: `${profile.label} ${formatHour(hourSlice.hour)}`,
        tripCount: hourSlice.tripCount,
        hotspots: hourSlice.hotspots,
        weights,
        totalWeight,
      });
    }
  }

  const orderedGridKeys = [...gridKeySet].sort();
  const vectors = slices.map((slice) => {
    const values = orderedGridKeys.map((key) => slice.weights.get(key) ?? 0);
    const sum = values.reduce((total, value) => total + value, 0) || 1;
    return values.map((value) => value / sum);
  });

  let bestRun = null;

  for (let seed = 0; seed < SEED_COUNT; seed += 1) {
    const result = kMeans(vectors, CLUSTER_COUNT, seed);
    const score = silhouetteScore(vectors, result.assignments);
    if (!bestRun || score > bestRun.score) {
      bestRun = { ...result, score, seed };
    }
  }

  const clusters = Array.from({ length: CLUSTER_COUNT }, (_, clusterIndex) => {
    const memberIndices = bestRun.assignments
      .map((assignedCluster, index) => ({ assignedCluster, index }))
      .filter((item) => item.assignedCluster === clusterIndex)
      .map((item) => item.index);

    const members = memberIndices.map((index) => slices[index]);
    const center = bestRun.centers[clusterIndex];
    const medoidIndex = memberIndices.reduce((bestIndex, memberIndex) => {
      if (bestIndex === null) return memberIndex;
      const currentDistance = euclideanDistance(vectors[memberIndex], center);
      const bestDistance = euclideanDistance(vectors[bestIndex], center);
      return currentDistance < bestDistance ? memberIndex : bestIndex;
    }, null);

    const hotspotScores = new Map();
    for (const member of members) {
      for (const hotspot of member.hotspots.slice(0, 20)) {
        const current = hotspotScores.get(hotspot.name) ?? {
          name: hotspot.name,
          lon: hotspot.lon,
          lat: hotspot.lat,
          activity: 0,
        };
        current.activity += hotspot.act;
        hotspotScores.set(hotspot.name, current);
      }
    }

    const profileCounts = { weekdays: 0, weekends: 0 };
    const bucketCounts = { night: 0, dawn: 0, work: 0, day: 0 };

    for (const member of members) {
      profileCounts[member.profileId] += 1;
      if (NIGHT_HOURS.has(member.hour)) bucketCounts.night += 1;
      if (DAWN_HOURS.has(member.hour)) bucketCounts.dawn += 1;
      if (WORK_HOURS.has(member.hour) && member.profileId === "weekdays") bucketCounts.work += 1;
      if (DAY_HOURS.has(member.hour)) bucketCounts.day += 1;
    }

    const averageTripCount =
      members.reduce((sum, member) => sum + member.tripCount, 0) / Math.max(members.length, 1);

    return {
      clusterIndex,
      representative: slices[medoidIndex],
      averageTripCount,
      profileCounts,
      bucketCounts,
      members,
      topHotspots: [...hotspotScores.values()]
        .sort((left, right) => right.activity - left.activity)
        .slice(0, 8)
        .map((item) => ({
          ...item,
          activity: Math.round(item.activity),
        })),
    };
  });

  const regimeTypeByCluster = assignRegimeTypes(clusters);
  const regimeOrder = ["work_core", "day_leisure", "night_social", "dawn_transition"];
  const sortedClusters = [...clusters].sort(
    (left, right) =>
      regimeOrder.indexOf(regimeTypeByCluster.get(left.clusterIndex)) -
      regimeOrder.indexOf(regimeTypeByCluster.get(right.clusterIndex)),
  );

  const regimes = sortedClusters.map((cluster) => {
    const regimeId = regimeTypeByCluster.get(cluster.clusterIndex);
    const config = regimeCatalog[regimeId];

    return {
      id: regimeId,
      label: config.label,
      shortLabel: config.shortLabel,
      kicker: config.kicker,
      description: config.description,
      colorScheme: config.colorScheme,
      cameraPreset: config.cameraPreset,
      sliceCount: cluster.members.length,
      profileCounts: cluster.profileCounts,
      averageTripCount: Math.round(cluster.averageTripCount),
      representative: {
        profileId: cluster.representative.profileId,
        hour: cluster.representative.hour,
        label: cluster.representative.label,
        tripCount: cluster.representative.tripCount,
      },
      hoursByProfile: {
        weekdays: cluster.members.filter((member) => member.profileId === "weekdays").map((member) => member.hour),
        weekends: cluster.members.filter((member) => member.profileId === "weekends").map((member) => member.hour),
      },
      topHotspots: cluster.topHotspots,
    };
  });

  const slicesSummary = slices.map((slice, index) => {
    const assignedCluster = bestRun.assignments[index];
    const regimeId = regimeTypeByCluster.get(assignedCluster);
    const regime = regimes.find((item) => item.id === regimeId);

    return {
      profileId: slice.profileId,
      profileLabel: slice.profileLabel,
      hour: slice.hour,
      label: slice.label,
      tripCount: slice.tripCount,
      regimeId,
      regimeLabel: regime?.label ?? regimeId,
      isRepresentative:
        regime?.representative.profileId === slice.profileId && regime?.representative.hour === slice.hour,
    };
  });

  const output = {
    summary: {
      generatedAt: new Date().toISOString(),
      source: "public/data/flows_hourly.json",
      profileIds: [...TARGET_PROFILE_IDS],
      sliceCount: slicesSummary.length,
      clusterCount: CLUSTER_COUNT,
      gridSizeDegrees: GRID_SIZE,
      method: "kmeans-hotspot-grid",
      seed: bestRun.seed,
      silhouetteScore: round(bestRun.score, 4),
      note:
        "Usage states are derived from full hourly hotspot distributions. Representative hours are selected after clustering, not pre-declared before analysis.",
    },
    regimes,
    slices: slicesSummary,
  };

  await mkdir(processedDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });

  const processedPath = path.join(processedDir, "regime_summary.json");
  const publicPath = path.join(publicDir, "regime_summary.json");

  const payload = `${JSON.stringify(output, null, 2)}\n`;
  await writeFile(processedPath, payload, "utf8");
  await writeFile(publicPath, payload, "utf8");

  console.log(`Wrote regime summary to ${path.relative(projectRoot, processedPath)} and ${path.relative(projectRoot, publicPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
