import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = await readFile(new URL("../../src/pages/MapReviewPage.tsx", import.meta.url), "utf8");
const canvasSource = await readFile(new URL("../../src/components/maps/OdFlowMapCanvas.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../../src/styles/index.css", import.meta.url), "utf8");
const functionalCompositionPayload = JSON.parse(
  await readFile(new URL("../../public/data/functional_composition_24h.json", import.meta.url), "utf8"),
);
const routeConcentrationPayload = JSON.parse(
  await readFile(new URL("../../public/data/route_concentration_story.json", import.meta.url), "utf8"),
);

async function readJsonFixture(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

test("MapReviewPage keeps Explore POI off by default", () => {
  const defaultLayerBlock = source.match(/const defaultExploreLayers:[\s\S]*?};/);
  assert.ok(defaultLayerBlock, "defaultExploreLayers block should exist");
  assert.match(defaultLayerBlock[0], /poi:\s*false,/);
});

test("MapReviewPage defaults route colour to intensity ramp", () => {
  assert.match(source, /useState<RouteColorMode>\("intensity"\)/);
});

test("MapReviewPage does not hard-code the guided story route colour as unified", () => {
  assert.doesNotMatch(source, /routeColorMode="unified"[\s\S]*?odRouteLensVariant="story"/);
});

test("MapReviewPage keeps guided story free of station dots and hotspot anchor bubbles", () => {
  const storyMapBlock = source.match(/<OdFlowMapCanvas\s+flows=\{mapProps\.flows\}[\s\S]*?\/>/);
  assert.ok(storyMapBlock, "guided story map block should exist");
  assert.match(storyMapBlock[0], /showStationBackdrop=\{false\}/);
  assert.match(storyMapBlock[0], /showStationsOverlay=\{false\}/);
  assert.doesNotMatch(source, /className=\{hoveredAnchor \? "map-review-anchor-layer/);
});

test("MapReviewPage adds land-use context to guided story without POI", () => {
  const storyMapBlock = source.match(/<OdFlowMapCanvas\s+flows=\{mapProps\.flows\}[\s\S]*?\/>/);
  assert.ok(storyMapBlock, "guided story map block should exist");
  assert.match(storyMapBlock[0], /landuseFeatures=\{serviceContext\.landuse\}/);
  assert.match(storyMapBlock[0], /showLanduseLayer=\{true\}/);
  assert.match(storyMapBlock[0], /showPoiLayer=\{false\}/);
});

test("MapReviewPage gives guided story a legend and route click affordance", () => {
  const storyMapBlock = source.match(/<OdFlowMapCanvas\s+flows=\{mapProps\.flows\}[\s\S]*?\/>/);
  assert.ok(storyMapBlock, "guided story map block should exist");
  assert.match(source, /function StoryMapLegend/);
  assert.match(source, /\{!selectedStoryOdRoute \? \(\s*<StoryMapLegend colorMode=\{storyRouteColorMode\} \/>/);
  assert.match(storyMapBlock[0], /onOdRouteClick=\{handleStoryOdRouteClick\}/);
});

test("MapReviewPage uses a readable daypart functional composition strip instead of the old matrix", () => {
  assert.match(source, /function FunctionalCompositionDaypartChart/);
  assert.match(source, /functional_composition_24h\.json/);
  assert.match(source, /Functional mix by time of day/);
  assert.match(source, /six dayparts/);
  assert.match(source, /not declared trip purpose/);
  assert.doesNotMatch(source, /FunctionRegimeMatrix/);
});

test("functional composition data has weekday and weekend rows for all 24 hours", () => {
  const profiles = functionalCompositionPayload.profiles;
  assert.equal(functionalCompositionPayload.version, 1);
  assert.ok(Array.isArray(functionalCompositionPayload.functions));
  assert.equal(profiles.weekdays.length, 24);
  assert.equal(profiles.weekends.length, 24);

  for (const profileId of ["weekdays", "weekends"]) {
    const hours = profiles[profileId].map((row) => row.hour);
    assert.deepEqual(hours, Array.from({ length: 24 }, (_, hour) => hour));

    for (const row of profiles[profileId]) {
      const shareTotal = Object.values(row.shares).reduce((sum, value) => sum + value, 0);
      assert.ok(Math.abs(shareTotal - 1) < 0.015, `${profileId} ${row.hour} shares should sum to 1`);
      assert.ok(row.totalAverageDailyTrips >= 0, `${profileId} ${row.hour} should expose weighted demand`);
    }
  }
});

test("MapReviewPage adds a route-use inequality inset to the guided story", () => {
  assert.match(source, /function RouteUseInequalityChart/);
  assert.match(source, /route_concentration_story\.json/);
  assert.match(source, /Route-use inequality/);
  assert.match(source, /Lorenz curve/);
  assert.match(source, /Gini/);
  assert.match(source, /Top 10 corridor share/);
  assert.match(source, /step\.id === "weekdays-17"/);
  assert.doesNotMatch(source, /function RouteConcentrationChart/);
  assert.doesNotMatch(source, /Corridor concentration/);
  assert.doesNotMatch(source, /How concentrated are the strongest corridors\?/);
  assert.doesNotMatch(source, /Effective corridors is the inverse Herfindahl index/);
});

test("route concentration story data covers all guided story stops with bounded metrics", async () => {
  const payload = routeConcentrationPayload;
  assert.equal(payload.version, 1);
  assert.equal(payload.storyStops.length, 8);

  for (const row of payload.storyStops) {
    assert.match(row.id, /^(weekdays|weekends)-\d{2}$/);
    assert.ok(row.routeCount > 0, `${row.id} should expose routes`);
    assert.ok(row.totalAverageDailyTrips > 0, `${row.id} should expose demand`);
    assert.ok(row.top10Share > 0 && row.top10Share <= 1, `${row.id} top10Share should be bounded`);
    assert.ok(row.effectiveCorridors > 0, `${row.id} effectiveCorridors should be positive`);
    assert.ok(row.herfindahl > 0 && row.herfindahl <= 1, `${row.id} Herfindahl should be bounded`);
    assert.ok(row.gini >= 0 && row.gini <= 1, `${row.id} Gini should be bounded`);
    assert.ok(Array.isArray(row.lorenzCurve) && row.lorenzCurve.length >= 6, `${row.id} should expose Lorenz points`);
    assert.deepEqual(row.lorenzCurve[0], { x: 0, y: 0 });
    assert.deepEqual(row.lorenzCurve.at(-1), { x: 1, y: 1 });
  }
});

test("MapReviewPage adds temporal centrality but drops the confusing street reuse figure", () => {
  assert.match(source, /function TemporalCentralityShiftChart/);
  assert.match(source, /temporal_centrality_story\.json/);
  assert.match(source, /Which places become central\?/);
  assert.match(source, /step\.id === "weekends-13"/);
  assert.match(source, /What the maps show/);
  assert.doesNotMatch(source, /What the story shows/);
  assert.doesNotMatch(source, /Scroll to begin the guided story/);
  assert.doesNotMatch(source, /Story functions/);
  assert.doesNotMatch(source, /After the guided story/);
  assert.match(source, /Together, the weekday and weekend sequences show/);
  assert.doesNotMatch(source, /function StreetNetworkReuseChart/);
  assert.doesNotMatch(source, /street_network_reuse_story\.json/);
  assert.doesNotMatch(source, /Do the same streets return\?/);
});

test("MapReviewPage wires Explore clicks for route, POI and land-use details", () => {
  const exploreMapBlock = source.match(/<OdFlowMapCanvas\s+flows=\{exploreMapProps\.flows\}[\s\S]*?\/>/);
  assert.ok(exploreMapBlock, "explore map block should exist");
  assert.match(exploreMapBlock[0], /onOdRouteClick=\{handleExploreOdRouteClick\}/);
  assert.match(exploreMapBlock[0], /onPoiClick=\{handleExplorePoiClick\}/);
  assert.match(exploreMapBlock[0], /onLanduseClick=\{handleExploreLanduseClick\}/);
  assert.match(source, /function ContextFeaturePanel/);
});

test("MapReviewPage formats land-use polygon area as square metres", () => {
  assert.match(source, /function formatPolygonArea/);
  assert.match(source, /properties\.areaSqM/);
  assert.doesNotMatch(source, /Math\.round\(\(feature as ServiceLanduseFeature\)\.properties\.area \?\? 0\)\.toLocaleString\("en-GB"\)\} m²/);
});

test("MapReviewPage keeps selected detail cards above map legends", () => {
  const floatingCardRule = cssSource.match(/\.map-review-route-lens--floating\s*\{[\s\S]*?\}/)?.[0] ?? "";
  const storyLegendRule = cssSource.match(/\.map-review-story-legend\s*\{[\s\S]*?\}/)?.[0] ?? "";
  const exploreLegendRule = cssSource.match(/\.map-review-explore-legend\s*\{[\s\S]*?\}/)?.[0] ?? "";

  assert.match(source, /\{!\(selectedOdRoute \|\| selectedContextFeature\) \? \(\s*<ExploreMapLegend/);
  assert.match(floatingCardRule, /z-index:\s*20;/);
  assert.match(cssSource, /\.map-review-route-lens--story\s*\{[\s\S]*?z-index:\s*24;/);
  assert.match(storyLegendRule, /z-index:\s*6;/);
  assert.match(storyLegendRule, /left:\s*1rem;/);
  assert.match(storyLegendRule, /right:\s*auto;/);
  assert.match(exploreLegendRule, /z-index:\s*6;/);
  assert.match(exploreLegendRule, /left:\s*0\.75rem;/);
  assert.match(exploreLegendRule, /right:\s*auto;/);
  assert.match(exploreLegendRule, /bottom:\s*0\.75rem;/);
});

test("MapReviewPage points methodology readers to the GitHub methodology file", () => {
  assert.match(source, /About, Method and Data/);
  assert.match(source, /Why these maps matter/);
  assert.match(source, /github\.com\/jameslemon2002\/casa_viz_groupwork\/blob\/main\/public\/docs\/Methodology_Summary_Group20\.pdf/);
  assert.doesNotMatch(source, /BASE_URL\}docs\/Methodology_Summary_Group20\.pdf/);
});

test("OdFlowMapCanvas makes POI and land-use layers clickable when handlers exist", () => {
  assert.match(canvasSource, /onPoiClick\?: \(feature: ServiceContextPoiFeature \| null\) => void;/);
  assert.match(canvasSource, /onLanduseClick\?: \(feature: ServiceLanduseFeature \| null\) => void;/);
  assert.match(canvasSource, /pickable: Boolean\(onLanduseClick\)/);
  assert.match(canvasSource, /pickable: Boolean\(onPoiClick\)/);
});

test("OdFlowMapCanvas prioritises context feature clicks before route fallback", () => {
  assert.match(canvasSource, /function resolveNearestContextPoi/);
  assert.match(canvasSource, /function resolveLanduseFeatureAtPoint/);

  const pointerDown = canvasSource.match(/const handleCanvasPointerDown = useCallback\(\(event: PointerEvent\) => \{[\s\S]*?\}, \[/)?.[0] ?? "";
  assert.match(pointerDown, /const nearestPoi = resolveNearestContextPoi\(clickPoint\);/);
  assert.match(pointerDown, /if \(nearestPoi\) \{/);
  assert.match(pointerDown, /const nearestRoute = resolveNearestOdRoute\(clickPoint, 26\);/);
  assert.match(pointerDown, /const selectedLanduse = resolveLanduseFeatureAtPoint\(clickPoint\);/);
  assert.ok(
    pointerDown.indexOf("const nearestPoi = resolveNearestContextPoi(clickPoint);") <
      pointerDown.indexOf("const nearestRoute = resolveNearestOdRoute(clickPoint, 26);"),
  );
  assert.ok(
    pointerDown.indexOf("const nearestRoute = resolveNearestOdRoute(clickPoint, 26);") <
      pointerDown.indexOf("const selectedLanduse = resolveLanduseFeatureAtPoint(clickPoint);"),
  );
});
