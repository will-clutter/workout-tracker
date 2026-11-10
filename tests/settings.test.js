// Tests for the Settings logic in js/logic.js (units, duration style). Run them with: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  cleanSettings, DEFAULT_SETTINGS, defaultState, parseSavedState, unitLabels,
  showWeight, showDistance, storeWeight, storeDistance, formatDuration, cardioSummaryParts
} = require("../js/logic.js");

test("cleanSettings: only known choices are kept, everything else is the default", () => {
  assert.deepEqual(cleanSettings(), DEFAULT_SETTINGS);
  for (const bad of [null, [], "metric", 5, { units: "stone", durationFormat: 3 }]) {
    assert.deepEqual(cleanSettings(bad), DEFAULT_SETTINGS);
  }
  assert.deepEqual(cleanSettings({ units: "metric", junk: 1 }), { units: "metric", durationFormat: "words" });
  assert.deepEqual(cleanSettings({ durationFormat: "clock" }), { units: "imperial", durationFormat: "clock" });
});

test("settings: new data starts with defaults, old saved data loads with defaults", () => {
  assert.deepEqual(defaultState().settings, DEFAULT_SETTINGS);
  const old = JSON.stringify({ workouts: [{ id: "w", name: "A", items: [] }], activeWorkoutId: "w" });
  assert.deepEqual(parseSavedState(old).settings, DEFAULT_SETTINGS);
  const saved = JSON.stringify({ workouts: [{ id: "w", name: "A", items: [] }], settings: { units: "metric" } });
  assert.equal(parseSavedState(saved).settings.units, "metric");
});

test("unitLabels", () => {
  assert.deepEqual(unitLabels("imperial"), { weight: "lb", distance: "mi" });
  assert.deepEqual(unitLabels("metric"), { weight: "kg", distance: "km" });
  assert.deepEqual(unitLabels(undefined), { weight: "lb", distance: "mi" });
});

test("imperial: stored values pass straight through", () => {
  assert.equal(showWeight("135", "imperial"), "135");
  assert.equal(showDistance("2.5", "imperial"), "2.5");
  assert.equal(storeWeight("135.5", "imperial"), "135.5");
  assert.equal(storeDistance("0.5", "imperial"), "0.5");
});

test("metric: shows 1 decimal, drops .0", () => {
  assert.equal(showWeight("135", "metric"), "61.2");
  assert.equal(showWeight("100", "metric"), "45.4");
  assert.equal(showDistance("1", "metric"), "1.6");
  assert.equal(showWeight("22.046", "metric"), "10");
});

test("metric: tiny values never show as 0", () => {
  assert.equal(showWeight("0.1", "metric"), "0.05");
  assert.equal(showWeight("0.001", "metric"), "0.001");
  assert.notEqual(showWeight("0.0001", "metric"), "0");
});

test("metric: typed kg / km are stored as lb / mi and round-trip", () => {
  for (const kg of ["10", "60", "61.2", "0.5", "100"]) {
    assert.equal(showWeight(storeWeight(kg, "metric"), "metric"), kg);
  }
  assert.equal(showDistance(storeDistance("5", "metric"), "metric"), "5");
  assert.equal(storeWeight("10", "metric"), "22.046");
});

test("empty, zero and junk give empty both ways", () => {
  for (const units of ["imperial", "metric"]) {
    for (const bad of ["", "0", "0.", "abc", null, undefined]) {
      assert.equal(storeWeight(bad, units), "");
      assert.equal(storeDistance(bad, units), "");
    }
    assert.equal(showWeight("", units), "");
    assert.equal(showDistance(undefined, units), "");
  }
});

test("metric: huge values keep the 6-digit cap", () => {
  const stored = storeWeight("999999", "metric");
  assert.ok(Number(stored) < 1e6);
});

test("formatDuration: clock style", () => {
  assert.equal(formatDuration(3930, "clock"), "1:05:30");
  assert.equal(formatDuration(330, "clock"), "5:30");
  assert.equal(formatDuration(45, "clock"), "0:45");
  assert.equal(formatDuration(3600, "clock"), "1:00:00");
  assert.equal(formatDuration(360000 * 2, "clock"), "200:00:00");
  for (const empty of ["", 0, -5, "x"]) assert.equal(formatDuration(empty, "clock"), "");
});

test("formatDuration: words style is unchanged and the default", () => {
  assert.equal(formatDuration(3930), "1h 5m 30s");
  assert.equal(formatDuration(3930, "words"), "1h 5m 30s");
  assert.equal(formatDuration(1500, "words"), "25 min");
});

test("cardioSummaryParts follows the settings", () => {
  const item = { durationSec: 3930, distance: "10", intensity: "High" };
  assert.deepEqual(cardioSummaryParts(item), ["1h 5m 30s", "High intensity", "10 mi"]);
  assert.deepEqual(cardioSummaryParts(item, { units: "metric", durationFormat: "clock" }), ["1:05:30", "High intensity", "16.1 km"]);
});
