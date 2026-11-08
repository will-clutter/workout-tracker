// Tests for the mini body map in js/bodymap.js. Run them with: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { countIn, miniMapView, renderMiniMap } = require("../js/bodymap.js");

test("countIn: counts how many muscles are in the list", () => {
  assert.equal(countIn(["chest", "biceps"], ["chest", "biceps", "lats"]), 2);
  assert.equal(countIn(["chest"], []), 0);
});

test("miniMapView: chest exercise shows the front, upper body", () => {
  assert.deepEqual(miniMapView(["chest"], ["triceps"]), { side: "front", zoom: "upper" });
});

test("miniMapView: back exercise shows the back", () => {
  assert.equal(miniMapView(["lats"], ["biceps"]).side, "back");
});

test("miniMapView: main muscles count double when picking a side", () => {
  // 1 front main muscle (2 points) beats 1 back helper muscle (1 point)
  assert.equal(miniMapView(["biceps"], ["lats"]).side, "front");
});

test("miniMapView: a tie, or no front/back-only muscles, shows the front", () => {
  assert.equal(miniMapView(["chest", "lats"], []).side, "front");
  assert.equal(miniMapView(["shoulders"], []).side, "front");
});

test("miniMapView: leg-only exercise zooms on the legs", () => {
  assert.equal(miniMapView(["quadriceps", "glutes"], []).zoom, "legs");
});

test("miniMapView: upper and lower body together shows the whole body", () => {
  assert.equal(miniMapView(["quadriceps", "shoulders"], []).zoom, "whole");
});

test("miniMapView: no muscles listed shows the whole body", () => {
  assert.deepEqual(miniMapView([], []), { side: "front", zoom: "whole" });
});

test("renderMiniMap: draws an SVG using the chosen zoom", () => {
  const svg = renderMiniMap(["quadriceps"], []);
  assert.match(svg, /^<svg class="bodymap mini" viewBox="58 158 84 190"/);
});
