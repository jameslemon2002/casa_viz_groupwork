import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyLanduse,
  classifyPoi,
  edgeIdFromCoordinates,
  geometryAreaSquareMetres,
  summarizeNearbyContext,
} from "./route_lens_utils.mjs";

test("edgeIdFromCoordinates matches frontend compact route edge ids", () => {
  assert.equal(
    edgeIdFromCoordinates([[-0.11387, 51.504], [-0.11391, 51.50402]]),
    "-0.11387,51.50400|-0.11391,51.50402",
  );
});

test("classifyPoi maps broad OSM tags into explore categories", () => {
  assert.equal(classifyPoi({ railway: "station" }), "transit");
  assert.equal(classifyPoi({ office: "company" }), "office-work");
  assert.equal(classifyPoi({ amenity: "pub" }), "food-night");
  assert.equal(classifyPoi({ tourism: "museum" }), "culture-tourism");
  assert.equal(classifyPoi({ amenity: "hospital" }), "health");
});

test("classifyLanduse excludes water and groups common urban polygons", () => {
  assert.equal(classifyLanduse({ natural: "water" }), null);
  assert.equal(classifyLanduse({ landuse: "commercial" }), "commercial");
  assert.equal(classifyLanduse({ amenity: "university" }), "education-civic");
  assert.equal(classifyLanduse({ leisure: "park" }), "leisure-park");
});

test("geometryAreaSquareMetres converts small London lon/lat polygons to metres", () => {
  const area = geometryAreaSquareMetres({
    type: "Polygon",
    coordinates: [[
      [-0.1, 51.5],
      [-0.099, 51.5],
      [-0.099, 51.501],
      [-0.1, 51.501],
      [-0.1, 51.5],
    ]],
  });

  assert.ok(area > 7_600, `expected area > 7600m², got ${area}`);
  assert.ok(area < 7_900, `expected area < 7900m², got ${area}`);
});

test("summarizeNearbyContext counts nearest context categories", () => {
  const summary = summarizeNearbyContext(
    [
      { properties: { category: "transit" } },
      { properties: { category: "transit" } },
      { properties: { category: "retail" } },
    ],
    [
      { properties: { category: "commercial" } },
      { properties: { category: "leisure-park" } },
      { properties: { category: "commercial" } },
    ],
  );

  assert.deepEqual(summary.poiCategories, [
    { category: "transit", count: 2 },
    { category: "retail", count: 1 },
  ]);
  assert.deepEqual(summary.landuseCategories, [
    { category: "commercial", count: 2 },
    { category: "leisure-park", count: 1 },
  ]);
});
