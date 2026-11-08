// Tests for cardio in js/logic.js. Run them with: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  isCardio, newCardioItem, cardioSummaryParts, buildCardioHistoryEntry, isCardioSession,
  clearCrossOffsFromOtherDays
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
  for (const field of ["duration", "intensity", "heartRate", "calories", "distance", "notes"]) {
    assert.equal(item[field], "", field);
  }
});

/* ---------- cardioSummaryParts ---------- */

test("cardioSummaryParts: all fields filled in, in order", () => {
  const item = { duration: "30", intensity: "High", heartRate: "145", calories: "320", distance: "2.5", notes: "hills" };
  assert.deepEqual(cardioSummaryParts(item), ["30 min", "High intensity", "145 bpm", "320 cal", "2.5 mi"]);
});

test("cardioSummaryParts: only what's filled in is shown", () => {
  assert.deepEqual(cardioSummaryParts({ duration: "20", intensity: "", heartRate: "", calories: "180", distance: "" }),
    ["20 min", "180 cal"]);
});

test("cardioSummaryParts: nothing filled in shows nothing", () => {
  assert.deepEqual(cardioSummaryParts(newCardioItem({ id: "Skating" })), []);
  assert.deepEqual(cardioSummaryParts({ duration: "  " }), []); // just spaces counts as empty
  assert.deepEqual(cardioSummaryParts({}), []);                 // older or missing fields
});

/* ---------- History ---------- */

test("buildCardioHistoryEntry: saves the cardio fields and what was done", () => {
  const items = [
    { uid: "1", exId: "Stairmaster", duration: "20", intensity: "Medium", heartRate: "", calories: "", distance: "", notes: "", doneAt: 123 },
    { uid: "2", exId: "gone", duration: "", intensity: "", heartRate: "", calories: "", distance: "", notes: "skipped" }
  ];
  const names = { Stairmaster: "Stairmaster" };
  const now = new Date("2026-11-08T10:00:00Z");
  const entry = buildCardioHistoryEntry(items, exId => names[exId], now);

  assert.equal(entry.type, "cardio");
  assert.equal(entry.workoutName, "Cardio");
  assert.equal(entry.date, now.toISOString());
  assert.deepEqual(entry.items, [
    { name: "Stairmaster", duration: "20", intensity: "Medium", heartRate: "", calories: "", distance: "", notes: "", done: true },
    { name: "Unknown exercise", duration: "", intensity: "", heartRate: "", calories: "", distance: "", notes: "skipped", done: false }
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
