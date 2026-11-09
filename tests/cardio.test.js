// Tests for cardio in js/logic.js. Run them with: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  isCardio, newCardioItem, cardioSummaryParts, buildCardioHistoryEntry, isCardioSession,
  clearCrossOffsFromOtherDays, joinDuration, splitDuration, formatDuration
} = require("../js/logic.js");
const database = require("../data/exercises.json");

/* ---------- The cardio tag ---------- */

test("isCardio: true for an exercise tagged cardio", () => {
  assert.equal(isCardio({ name: "Stairmaster", category: "cardio" }), true);
});

test("isCardio: false for an exercise without the tag", () => {
  assert.equal(isCardio({ name: "Barbell Curl" }), false);
});

test("database: exactly the 14 cardio exercises are tagged", () => {
  const tagged = database.filter(isCardio).map(ex => ex.id).sort();
  assert.deepEqual(tagged, [
    "Bicycling", "Bicycling_Stationary", "Elliptical_Trainer", "Jogging_Treadmill",
    "Prowler_Sprint", "Recumbent_Bike", "Rope_Jumping", "Rowing_Stationary",
    "Running_Treadmill", "Skating", "Stairmaster", "Step_Mill",
    "Trail_Running_Walking", "Walking_Treadmill"
  ]);
});

/* ---------- newCardioItem ---------- */

test("newCardioItem: every field starts empty", () => {
  const item = newCardioItem({ id: "Stairmaster" });
  assert.equal(item.exId, "Stairmaster");
  assert.ok(item.uid);
  for (const field of ["durationSec", "intensity", "heartRate", "calories", "distance", "notes"]) {
    assert.equal(item[field], "", field);
  }
});

/* ---------- cardioSummaryParts ---------- */

test("cardioSummaryParts: all fields filled in, in order", () => {
  const item = { durationSec: 1800, intensity: "High", heartRate: "145", calories: "320", distance: "2.5", notes: "hills" };
  assert.deepEqual(cardioSummaryParts(item), ["30 min", "High intensity", "145 bpm", "320 cal", "2.5 mi"]);
});

test("cardioSummaryParts: only what's filled in is shown", () => {
  assert.deepEqual(cardioSummaryParts({ durationSec: 1230, intensity: "", heartRate: "", calories: "180", distance: "" }),
    ["20m 30s", "180 cal"]);
});

test("cardioSummaryParts: nothing filled in shows nothing", () => {
  assert.deepEqual(cardioSummaryParts(newCardioItem({ id: "Skating" })), []);
  assert.deepEqual(cardioSummaryParts({ heartRate: "  " }), []); // just spaces counts as empty
  assert.deepEqual(cardioSummaryParts({}), []);                  // older or missing fields
});

test("cardioSummaryParts: fields set to 0 aren't shown", () => {
  for (const zero of ["0", "0.0", 0]) {
    assert.deepEqual(cardioSummaryParts({ durationSec: zero, heartRate: zero, calories: zero, distance: zero }), [], String(zero));
  }
  assert.deepEqual(cardioSummaryParts({ durationSec: 0, intensity: "Low", distance: "0" }), ["Low intensity"]);
});

test("cardioSummaryParts: an entry that still has whole minutes shows them", () => {
  assert.deepEqual(cardioSummaryParts({ duration: "25" }), ["25 min"]);
});

/* ---------- Duration ---------- */

test("formatDuration: minutes only, seconds only, and mixed", () => {
  assert.equal(formatDuration(25 * 60), "25 min");
  assert.equal(formatDuration(45), "45 sec");
  assert.equal(formatDuration(25 * 60 + 30), "25m 30s");
  assert.equal(formatDuration(3600 + 5 * 60), "1h 5m");
  assert.equal(formatDuration(3600 + 5 * 60 + 30), "1h 5m 30s");
  assert.equal(formatDuration(3600 + 30), "1h 30s");
  assert.equal(formatDuration(2 * 3600), "2h");
});

test("formatDuration: 90 minutes reads as 1h 30m", () => {
  assert.equal(formatDuration(joinDuration("", "90", "")), "1h 30m");
});

test("formatDuration: 0 or blank gives nothing", () => {
  assert.equal(formatDuration(0), "");
  assert.equal(formatDuration(""), "");
  assert.equal(formatDuration(undefined), "");
});

test("joinDuration: adds up the boxes; blanks count as 0; 0 total is empty", () => {
  assert.equal(joinDuration("1", "5", "30"), 3930);
  assert.equal(joinDuration("", "25", ""), 1500);
  assert.equal(joinDuration("", "", ""), "");
  assert.equal(joinDuration("0", "0", "0"), "");
  assert.equal(joinDuration("-3", "2", ""), 120); // negatives are ignored
});

test("splitDuration: seconds back into the three boxes", () => {
  assert.deepEqual(splitDuration(3930), { h: 1, m: 5, s: 30 });
  assert.deepEqual(splitDuration(1500), { h: 0, m: 25, s: 0 });
  assert.deepEqual(splitDuration(""), { h: "", m: "", s: "" });
  assert.deepEqual(splitDuration(0), { h: "", m: "", s: "" });
});

/* ---------- History ---------- */

test("buildCardioHistoryEntry: saves the cardio fields and what was done", () => {
  const items = [
    { uid: "1", exId: "Stairmaster", durationSec: 1200, intensity: "Medium", heartRate: "", calories: "", distance: "", notes: "", doneAt: 123 },
    { uid: "2", exId: "gone", durationSec: "", intensity: "", heartRate: "", calories: "", distance: "", notes: "skipped" }
  ];
  const names = { Stairmaster: "Stairmaster" };
  const now = new Date("2026-11-08T10:00:00Z");
  const entry = buildCardioHistoryEntry(items, exId => names[exId], now);

  assert.equal(entry.type, "cardio");
  assert.equal(entry.workoutName, "Cardio");
  assert.equal(entry.date, now.toISOString());
  assert.deepEqual(entry.items, [
    { name: "Stairmaster", durationSec: 1200, intensity: "Medium", heartRate: "", calories: "", distance: "", notes: "", done: true },
    { name: "Unknown exercise", durationSec: "", intensity: "", heartRate: "", calories: "", distance: "", notes: "skipped", done: false }
  ]);
});

test("isCardioSession: cardio entries are cardio; older entries with no type are workouts", () => {
  assert.equal(isCardioSession(buildCardioHistoryEntry([], () => "")), true);
  assert.equal(isCardioSession({ workoutName: "Legs", items: [] }), false);
});

test("clearCrossOffsFromOtherDays: also un-crosses yesterday's cardio", () => {
  const now = new Date(2026, 10, 8, 12);
  const yesterday = new Date(2026, 10, 7, 12).getTime();
  const cardio = { items: [{ uid: "1", doneAt: yesterday }, { uid: "2", doneAt: now.getTime() }] };
  assert.equal(clearCrossOffsFromOtherDays([cardio], now), true);
  assert.equal(cardio.items[0].doneAt, undefined);
  assert.equal(cardio.items[1].doneAt, now.getTime());
});
