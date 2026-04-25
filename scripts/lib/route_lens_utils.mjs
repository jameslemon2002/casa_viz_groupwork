const poiCategoryRules = [
  {
    category: "transit",
    test: (tags) =>
      ["station", "subway_entrance", "tram_stop", "halt"].includes(tags.railway) ||
      ["station", "platform", "stop_position"].includes(tags.public_transport) ||
      ["bus_station"].includes(tags.amenity),
  },
  {
    category: "office-work",
    test: (tags) =>
      Boolean(tags.office) ||
      ["coworking_space"].includes(tags.amenity) ||
      ["commercial"].includes(tags.landuse),
  },
  {
    category: "food-night",
    test: (tags) =>
      ["pub", "bar", "cafe", "restaurant", "fast_food", "nightclub", "biergarten"].includes(tags.amenity),
  },
  {
    category: "retail",
    test: (tags) =>
      Boolean(tags.shop) ||
      ["marketplace"].includes(tags.amenity),
  },
  {
    category: "culture-tourism",
    test: (tags) =>
      ["museum", "gallery", "attraction", "artwork", "viewpoint"].includes(tags.tourism) ||
      ["theatre", "cinema", "arts_centre"].includes(tags.amenity),
  },
  {
    category: "education",
    test: (tags) =>
      ["university", "college", "school", "library"].includes(tags.amenity),
  },
  {
    category: "health",
    test: (tags) =>
      ["hospital", "clinic", "doctors", "pharmacy", "dentist"].includes(tags.amenity) ||
      Boolean(tags.healthcare),
  },
  {
    category: "civic",
    test: (tags) =>
      ["townhall", "courthouse", "police", "fire_station", "post_office", "community_centre"].includes(tags.amenity),
  },
  {
    category: "sport-leisure",
    test: (tags) =>
      ["sports_centre", "stadium", "fitness_centre", "pitch", "playground", "garden", "park"].includes(tags.leisure),
  },
];

const landuseRules = [
  {
    category: "commercial",
    test: (tags) => ["commercial"].includes(tags.landuse) || Boolean(tags.office),
  },
  {
    category: "retail",
    test: (tags) => ["retail"].includes(tags.landuse) || Boolean(tags.shop),
  },
  {
    category: "residential",
    test: (tags) => ["residential"].includes(tags.landuse),
  },
  {
    category: "education-civic",
    test: (tags) =>
      ["education", "institutional"].includes(tags.landuse) ||
      ["university", "college", "school", "hospital", "townhall", "community_centre"].includes(tags.amenity),
  },
  {
    category: "leisure-park",
    test: (tags) =>
      ["park", "garden", "recreation_ground", "sports_centre", "stadium", "pitch", "playground"].includes(tags.leisure) ||
      ["grass", "meadow", "village_green", "recreation_ground"].includes(tags.landuse),
  },
  {
    category: "industrial",
    test: (tags) => ["industrial", "railway"].includes(tags.landuse),
  },
];

const waterValues = new Set(["water", "river", "riverbank", "basin", "reservoir", "dock", "canal"]);
const metresPerDegreeLat = 111_320;

function normaliseTags(tags = {}) {
  return Object.fromEntries(
    Object.entries(tags).map(([key, value]) => [key, String(value).toLowerCase()]),
  );
}

function ringAreaSquareMetres(coords) {
  if (!Array.isArray(coords) || coords.length < 4) return 0;
  const meanLat = coords.reduce((sum, coord) => sum + Number(coord[1] ?? 0), 0) / coords.length;
  const metresPerDegreeLon = metresPerDegreeLat * Math.cos((meanLat * Math.PI) / 180);
  let area = 0;

  for (let index = 0; index < coords.length; index += 1) {
    const current = coords[index];
    const next = coords[(index + 1) % coords.length];
    area += (current[0] * metresPerDegreeLon) * (next[1] * metresPerDegreeLat);
    area -= (next[0] * metresPerDegreeLon) * (current[1] * metresPerDegreeLat);
  }

  return Math.abs(area) / 2;
}

function polygonAreaSquareMetres(rings) {
  if (!Array.isArray(rings) || rings.length === 0) return 0;
  const outer = ringAreaSquareMetres(rings[0]);
  const holes = rings.slice(1).reduce((sum, ring) => sum + ringAreaSquareMetres(ring), 0);
  return Math.max(0, outer - holes);
}

export function edgeIdFromCoordinates(coordinates) {
  const [start, end] = coordinates;
  return `${start[0].toFixed(5)},${start[1].toFixed(5)}|${end[0].toFixed(5)},${end[1].toFixed(5)}`;
}

export function classifyPoi(tagsInput = {}) {
  const tags = normaliseTags(tagsInput);
  for (const rule of poiCategoryRules) {
    if (rule.test(tags)) return rule.category;
  }
  return null;
}

export function classifyLanduse(tagsInput = {}) {
  const tags = normaliseTags(tagsInput);
  if (waterValues.has(tags.natural) || waterValues.has(tags.water) || waterValues.has(tags.waterway) || waterValues.has(tags.landuse)) {
    return null;
  }
  for (const rule of landuseRules) {
    if (rule.test(tags)) return rule.category;
  }
  return null;
}

export function geometryAreaSquareMetres(geometry) {
  if (!geometry) return 0;
  if (geometry.type === "Polygon") return polygonAreaSquareMetres(geometry.coordinates);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce((sum, polygon) => sum + polygonAreaSquareMetres(polygon), 0);
  }
  return 0;
}

function summarizeByCategory(features) {
  const counts = new Map();
  for (const feature of features) {
    const category = feature?.properties?.category;
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));
}

export function summarizeNearbyContext(pois, landuseFeatures) {
  return {
    poiCategories: summarizeByCategory(pois),
    landuseCategories: summarizeByCategory(landuseFeatures),
  };
}
