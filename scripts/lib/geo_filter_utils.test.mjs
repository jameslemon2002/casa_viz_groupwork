import test from "node:test";
import assert from "node:assert/strict";
import {
  featureRepresentativePoint,
  filterFeaturesToBoroughs,
  pointInPolygon,
} from "./geo_filter_utils.mjs";

const boroughs = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { gss_code: "A" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ]],
      },
    },
    {
      type: "Feature",
      properties: { gss_code: "B" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [[
            [10, 10],
            [11, 10],
            [11, 11],
            [10, 11],
            [10, 10],
          ]],
        ],
      },
    },
  ],
};

test("pointInPolygon includes points inside a polygon ring and excludes outside points", () => {
  assert.equal(pointInPolygon([1, 1], boroughs.features[0].geometry), true);
  assert.equal(pointInPolygon([3, 1], boroughs.features[0].geometry), false);
});

test("pointInPolygon supports multipolygon borough geometry", () => {
  assert.equal(pointInPolygon([10.5, 10.5], boroughs.features[1].geometry), true);
  assert.equal(pointInPolygon([9, 10.5], boroughs.features[1].geometry), false);
});

test("featureRepresentativePoint returns points and polygon centroids", () => {
  assert.deepEqual(featureRepresentativePoint({ geometry: { type: "Point", coordinates: [1.2, 1.3] } }), [1.2, 1.3]);
  assert.deepEqual(
    featureRepresentativePoint({
      geometry: {
        type: "Polygon",
        coordinates: [[
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ]],
      },
    }),
    [0.8, 0.8],
  );
});

test("filterFeaturesToBoroughs keeps only features whose representative point is in active boroughs", () => {
  const features = [
    { type: "Feature", properties: { id: "inside-a" }, geometry: { type: "Point", coordinates: [1, 1] } },
    { type: "Feature", properties: { id: "inside-b" }, geometry: { type: "Point", coordinates: [10.5, 10.5] } },
    { type: "Feature", properties: { id: "outside" }, geometry: { type: "Point", coordinates: [4, 4] } },
  ];

  assert.deepEqual(
    filterFeaturesToBoroughs(features, boroughs.features, new Set(["A"])).map((feature) => feature.properties.id),
    ["inside-a"],
  );
});
