// Tests for the data helpers in js/logic.js. Run them with: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseSavedState, findActiveWorkout, hasExercise, findExercise,
  buildHistoryEntry, clearCrossOffsFromOtherDays, cleanCollapsed
} = require("../js/logic.js");

// Keep the "Couldn't read saved data" warning out of the test output
console.warn = () => {};

const isFreshState = state =>
  state.workouts.length === 1 && state.workouts[0].name === "Your Workout" && state.history.length === 0;

/* ---------- parseSavedState ---------- */

test("parseSavedState: valid saved data comes back as-is", () => {
  const saved = {
    workouts: [{ id: "a", name: "Legs", items: [] }], activeWorkoutId: "a", customExercises: [], history: [],
    cardio: { items: [{ uid: "c1", exId: "Stairmaster", durationSec: 1200 }] }
  };
  // Everything comes back as saved, plus the folded-headings list (all open) that older saves lack
  assert.deepEqual(parseSavedState(JSON.stringify(saved)), { ...saved, collapsed: cleanCollapsed() });
});

test("parseSavedState: cardio saved with whole minutes is changed to seconds", () => {
  const saved = {
    workouts: [{ id: "a", name: "Legs", items: [] }], activeWorkoutId: "a", customExercises: [],
    cardio: { items: [{ uid: "c1", exId: "Stairmaster", duration: "25" }, { uid: "c2", exId: "Skating", duration: "" }] },
    history: [
      { id: "h1", type: "cardio", workoutName: "Cardio", items: [{ name: "Stairmaster", duration: "25", done: true }] },
      { id: "h2", workoutName: "Legs", items: [{ name: "Squat", sets: "3", reps: "10", done: true }] }
    ]
  };
  const loaded = parseSavedState(JSON.stringify(saved));
  assert.deepEqual(loaded.cardio.items, [
    { uid: "c1", exId: "Stairmaster", durationSec: 1500 },
    { uid: "c2", exId: "Skating", durationSec: "" }
  ]);
  assert.deepEqual(loaded.history[0].items[0], { name: "Stairmaster", durationSec: 1500, done: true });
  assert.deepEqual(loaded.history[1], saved.history[1]); // workout sessions are left alone
});

test("parseSavedState: data saved before the Cardio tab gets an empty cardio list", () => {
  const saved = { workouts: [{ id: "a", name: "Legs", items: [] }], activeWorkoutId: "a", customExercises: [], history: [] };
  assert.deepEqual(parseSavedState(JSON.stringify(saved)), { ...saved, cardio: { items: [] }, collapsed: cleanCollapsed() });
});

test("parseSavedState: a fresh start includes an empty cardio list", () => {
  assert.deepEqual(parseSavedState(null).cardio, { items: [] });
});

test("parseSavedState: missing data gives a fresh start", () => {
  assert.ok(isFreshState(parseSavedState(null)));
});

test("parseSavedState: garbled text gives a fresh start", () => {
  assert.ok(isFreshState(parseSavedState("{not json")));
});

test("parseSavedState: data with no workouts gives a fresh start", () => {
  assert.ok(isFreshState(parseSavedState(JSON.stringify({ history: [] }))));
  assert.ok(isFreshState(parseSavedState(JSON.stringify({ workouts: [] }))));
});

/* ---------- findActiveWorkout ---------- */

const twoWorkouts = activeWorkoutId => ({
  workouts: [{ id: "a", name: "Push", items: [] }, { id: "b", name: "Pull", items: [] }],
  activeWorkoutId
});

test("findActiveWorkout: returns the active workout", () => {
  assert.equal(findActiveWorkout(twoWorkouts("b")).name, "Pull");
});

test("findActiveWorkout: falls back to the first workout if the id is gone", () => {
  assert.equal(findActiveWorkout(twoWorkouts("deleted")).name, "Push");
});

/* ---------- hasExercise ---------- */

test("hasExercise: true when the exercise is in the workout", () => {
  assert.equal(hasExercise({ items: [{ exId: "Squat" }] }, "Squat"), true);
});

test("hasExercise: false when it isn't, or the workout is empty", () => {
  assert.equal(hasExercise({ items: [{ exId: "Squat" }] }, "Deadlift"), false);
  assert.equal(hasExercise({ items: [] }, "Squat"), false);
});

/* ---------- findExercise ---------- */

const databaseById = { Squat: { id: "Squat", name: "Squat" } };
const customExercises = [{ id: "custom_1", name: "My Curl" }];

test("findExercise: finds database exercises", () => {
  assert.equal(findExercise("Squat", databaseById, customExercises).name, "Squat");
});

test("findExercise: finds custom exercises", () => {
  assert.equal(findExercise("custom_1", databaseById, customExercises).name, "My Curl");
});

test("findExercise: unknown id finds nothing", () => {
  assert.equal(findExercise("nope", databaseById, customExercises), undefined);
});

/* ---------- buildHistoryEntry ---------- */

test("buildHistoryEntry: records the workout, date and each exercise", () => {
  const workout = {
    name: "Legs",
    items: [{ exId: "Squat", sets: "5", reps: "5", weight: "225", notes: "felt good", doneAt: 1 }]
  };
  const now = new Date("2026-11-08T12:00:00Z");
  const entry = buildHistoryEntry(workout, () => "Squat", now);
  assert.equal(entry.workoutName, "Legs");
  assert.equal(entry.date, "2026-11-08T12:00:00.000Z");
  assert.deepEqual(entry.items, [{ name: "Squat", sets: "5", reps: "5", weight: "225", notes: "felt good", done: true }]);
});

test("buildHistoryEntry: marks crossed-off exercises done and the rest not done", () => {
  const workout = { name: "Legs", items: [{ exId: "A", doneAt: 1 }, { exId: "B" }] };
  const entry = buildHistoryEntry(workout, id => id);
  assert.deepEqual(entry.items.map(i => i.done), [true, false]);
});

test("buildHistoryEntry: deleted exercises show as Unknown exercise", () => {
  const entry = buildHistoryEntry({ name: "Legs", items: [{ exId: "gone" }] }, () => undefined);
  assert.equal(entry.items[0].name, "Unknown exercise");
});

/* ---------- clearCrossOffsFromOtherDays ---------- */

const now = new Date(2026, 10, 8, 15, 0);           // Nov 8, 3pm
const earlierToday = new Date(2026, 10, 8, 9, 0).getTime();
const yesterday = new Date(2026, 10, 7, 20, 0).getTime();

test("clearCrossOffsFromOtherDays: leaves today's cross-offs alone", () => {
  const workouts = [{ items: [{ doneAt: earlierToday }] }];
  assert.equal(clearCrossOffsFromOtherDays(workouts, now), false);
  assert.equal(workouts[0].items[0].doneAt, earlierToday);
});

test("clearCrossOffsFromOtherDays: clears cross-offs from an earlier day", () => {
  const workouts = [{ items: [{ doneAt: yesterday }, { doneAt: earlierToday }] }];
  assert.equal(clearCrossOffsFromOtherDays(workouts, now), true);
  assert.equal(workouts[0].items[0].doneAt, undefined);
  assert.equal(workouts[0].items[1].doneAt, earlierToday);
});

test("clearCrossOffsFromOtherDays: checks every workout, not just one", () => {
  const workouts = [{ items: [] }, { items: [{ doneAt: yesterday }] }];
  assert.equal(clearCrossOffsFromOtherDays(workouts, now), true);
  assert.equal(workouts[1].items[0].doneAt, undefined);
});

test("clearCrossOffsFromOtherDays: nothing crossed off means nothing changed", () => {
  assert.equal(clearCrossOffsFromOtherDays([{ items: [{}] }], now), false);
});
