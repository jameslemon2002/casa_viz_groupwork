import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOdRouteId,
  buildOrderedRouteCoordinates,
  simplifyRouteCoordinates,
} from "./od_route_lens_utils.mjs";

test("buildOrderedRouteCoordinates orients unordered graph edges into one continuous path", () => {
  const graphEdges = new Map([
    ["a|b", { coords: [[-0.12001, 51.50001], [-0.11951, 51.50023]] }],
    ["b|c", { coords: [[-0.11951, 51.50023], [-0.11897, 51.50051]] }],
    ["c|d", { coords: [[-0.11846, 51.50082], [-0.11897, 51.50051]] }],
  ]);

  assert.deepEqual(buildOrderedRouteCoordinates(["a|b", "b|c", "c|d"], graphEdges), [
    [-0.12001, 51.50001],
    [-0.11951, 51.50023],
    [-0.11897, 51.50051],
    [-0.11846, 51.50082],
  ]);
});

test("buildOrderedRouteCoordinates uses lookahead to orient the first edge", () => {
  const graphEdges = new Map([
    ["a|b", { coords: [[-0.11951, 51.50023], [-0.12001, 51.50001]] }],
    ["b|c", { coords: [[-0.11951, 51.50023], [-0.11897, 51.50051]] }],
  ]);

  assert.deepEqual(buildOrderedRouteCoordinates(["a|b", "b|c"], graphEdges), [
    [-0.12001, 51.50001],
    [-0.11951, 51.50023],
    [-0.11897, 51.50051],
  ]);
});

test("simplifyRouteCoordinates removes near-collinear points but preserves endpoints", () => {
  const simplified = simplifyRouteCoordinates(
    [
      [-0.12000, 51.50000],
      [-0.11995, 51.50001],
      [-0.11950, 51.50010],
      [-0.11900, 51.50100],
    ],
    9,
  );

  assert.deepEqual(simplified, [
    [-0.12, 51.5],
    [-0.1195, 51.5001],
    [-0.119, 51.501],
  ]);
});

test("buildOdRouteId is stable and URL-safe", () => {
  assert.equal(buildOdRouteId("weekdays", 8, 12), "weekdays_08_od_0012");
  assert.equal(buildOdRouteId("weekends", 23, 3), "weekends_23_od_0003");
});
