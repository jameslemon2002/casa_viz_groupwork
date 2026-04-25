import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = await readFile(new URL("../../src/pages/MapReviewPage.tsx", import.meta.url), "utf8");
const canvasSource = await readFile(new URL("../../src/components/maps/OdFlowMapCanvas.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../../src/styles/index.css", import.meta.url), "utf8");

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
  assert.match(exploreLegendRule, /z-index:\s*6;/);
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
