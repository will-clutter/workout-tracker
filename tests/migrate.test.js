const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  defaultState, makeId, isUuid, migrateState, parseSavedState, buildExport, parseImport, SCHEMA_VERSION
} = require("../js/logic.js");

// What the app saved before UUIDs: short ids, no schemaVersion
function oldState() {
  return {
    workouts: [
      { id: "w1", name: "Push", items: [
        { uid: "u1", exId: "Barbell_Bench_Press", sets: "3", reps: "10", weight: "135", notes: "heavy" },
        { uid: "u2", exId: "custom_a", sets: "3", reps: "12", weight: "", notes: "" }
      ] },
      { id: "w2", name: "Pull", items: [{ uid: "u3", exId: "Pullups", sets: "3", reps: "8", weight: "", notes: "" }] }
    ],
    activeWorkoutId: "w2",
    customExercises: [
      { id: "custom_a", name: "Mine", equipment: "", primaryMuscles: [], secondaryMuscles: [], custom: true },
      { id: "custom_b", name: "Other", equipment: "", primaryMuscles: [], secondaryMuscles: [], custom: true }
    ],
    history: [
      { id: "h1", date: "2026-11-01T10:00:00.000Z", workoutName: "Push", items: [{ name: "Bench", sets: "3", reps: "10", weight: "135", notes: "", done: true }] },
      { id: "h2", date: "2026-11-02T10:00:00.000Z", type: "cardio", workoutName: "Cardio", items: [{ name: "Mine", durationSec: 1200, done: true }] }
    ],
    cardio: { items: [
      { uid: "c1", exId: "custom_b", durationSec: 600, intensity: "", heartRate: "", calories: "", distance: "", notes: "" },
      { uid: "c2", exId: "Stairmaster", durationSec: "", intensity: "", heartRate: "", calories: "", distance: "", notes: "" }
    ] },
    collapsed: { exercises: false, completed: true, activities: false, cardioCompleted: false },
    settings: { units: "metric", durationFormat: "words" },
    theme: "violet"
  };
}

test("makeId: makes a UUID each time", () => {
  assert.ok(isUuid(makeId()));
  assert.notEqual(makeId(), makeId());
});

test("isUuid: accepts UUIDs, rejects short ids and non-text", () => {
  assert.equal(isUuid("8a4cc732-f46a-428f-a666-752466e15d70"), true);
  assert.equal(isUuid("k3j9x2ab"), false);
  assert.equal(isUuid("custom_8a4cc732"), false);
  assert.equal(isUuid(""), false);
  assert.equal(isUuid(undefined), false);
  assert.equal(isUuid(42), false);
});

test("defaultState: a fresh install is already on the new format", () => {
  const s = defaultState();
  assert.equal(s.schemaVersion, SCHEMA_VERSION);
  assert.ok(isUuid(s.workouts[0].id));
  assert.equal(s.activeWorkoutId, s.workouts[0].id);
  const { changed } = migrateState(s);
  assert.equal(changed, false);
});

test("migrateState: every id becomes a UUID and the version is stamped", () => {
  const { state, changed } = migrateState(oldState());
  assert.equal(changed, true);
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  state.workouts.forEach(w => { assert.ok(isUuid(w.id)); w.items.forEach(i => assert.ok(isUuid(i.uid))); });
  state.customExercises.forEach(e => assert.ok(isUuid(e.id)));
  state.cardio.items.forEach(i => assert.ok(isUuid(i.uid)));
  state.history.forEach(h => assert.ok(isUuid(h.id)));
});

test("migrateState: references follow the new ids", () => {
  const { state } = migrateState(oldState());
  // The active workout is still the "Pull" one
  assert.equal(state.workouts.find(w => w.id === state.activeWorkoutId).name, "Pull");
  // A workout entry and a cardio entry still point at the right custom exercise
  const mine = state.customExercises.find(e => e.name === "Mine");
  const other = state.customExercises.find(e => e.name === "Other");
  assert.equal(state.workouts[0].items[1].exId, mine.id);
  assert.equal(state.cardio.items[0].exId, other.id);
});

test("migrateState: built-in exercise ids are left alone", () => {
  const { state } = migrateState(oldState());
  assert.equal(state.workouts[0].items[0].exId, "Barbell_Bench_Press");
  assert.equal(state.workouts[1].items[0].exId, "Pullups");
  assert.equal(state.cardio.items[1].exId, "Stairmaster");
});

test("migrateState: an exId that points at nothing is left alone", () => {
  const s = oldState();
  s.workouts[0].items[0].exId = "custom_gone";
  const { state } = migrateState(s);
  assert.equal(state.workouts[0].items[0].exId, "custom_gone");
});

test("migrateState: nothing is lost, only ids change", () => {
  const before = oldState();
  const { state } = migrateState(before);
  // Strip every id, uid, exId that was remapped, then the rest must be identical
  const strip = s => {
    const c = JSON.parse(JSON.stringify(s));
    delete c.schemaVersion;
    delete c.activeWorkoutId;
    c.workouts.forEach(w => { delete w.id; w.items.forEach(i => { delete i.uid; if (String(i.exId).startsWith("custom_") || isUuid(i.exId)) delete i.exId; }); });
    c.customExercises.forEach(e => delete e.id);
    c.cardio.items.forEach(i => { delete i.uid; if (String(i.exId).startsWith("custom_") || isUuid(i.exId)) delete i.exId; });
    c.history.forEach(h => delete h.id);
    return c;
  };
  assert.deepEqual(strip(state), strip(before));
});

test("migrateState: does not change the object it is given", () => {
  const before = oldState();
  const snapshot = JSON.stringify(before);
  migrateState(before);
  assert.equal(JSON.stringify(before), snapshot);
});

test("migrateState: running it again changes nothing", () => {
  const first = migrateState(oldState());
  const second = migrateState(first.state);
  assert.equal(second.changed, false);
  assert.deepEqual(second.state, first.state);
});

test("migrateState: ids that are already UUIDs are untouched", () => {
  const id = makeId(), uid = makeId(), hid = makeId(), cid = makeId();
  const s = {
    ...oldState(), schemaVersion: SCHEMA_VERSION,
    workouts: [{ id, name: "A", items: [{ uid, exId: cid, sets: "3", reps: "10", weight: "", notes: "" }] }],
    activeWorkoutId: id,
    customExercises: [{ id: cid, name: "C", custom: true }],
    history: [{ id: hid, workoutName: "A", items: [] }],
    cardio: { items: [] }
  };
  const { state, changed } = migrateState(s);
  assert.equal(changed, false);
  assert.deepEqual(state, s);
});

test("migrateState: half-migrated data only has its old ids replaced", () => {
  const s = oldState();
  const once = migrateState(s).state;
  once.workouts.push({ id: "late", name: "Late", items: [] });
  const { state, changed } = migrateState(once);
  assert.equal(changed, true);
  assert.deepEqual(state.workouts.slice(0, 2), once.workouts.slice(0, 2)); // already-new ones kept
  assert.ok(isUuid(state.workouts[2].id));
});

test("migrateState: duplicate old ids each get their own UUID; the first one wins for references", () => {
  const s = oldState();
  s.workouts[1].id = "w1"; // two workouts share an id
  s.activeWorkoutId = "w1";
  const { state } = migrateState(s);
  assert.notEqual(state.workouts[0].id, state.workouts[1].id);
  assert.equal(state.activeWorkoutId, state.workouts[0].id);
});

test("migrateState: an old backup is upgraded (the import path)", () => {
  const text = JSON.stringify({ app: "workout-logbook", version: 1, exportedAt: "2026-11-01T00:00:00.000Z", state: oldState() });
  const result = parseImport(text);
  assert.equal(result.ok, true);
  const { state } = migrateState(result.state);
  assert.ok(isUuid(state.workouts[0].id));
  assert.equal(state.customExercises.length, 2);
});

test("migrateState: copes with missing parts, as if the data was never cleaned", () => {
  assert.doesNotThrow(() => migrateState({}));
  assert.doesNotThrow(() => migrateState({ workouts: [null, { id: "x", items: "oops" }], cardio: null, history: [7] }));
  assert.equal(migrateState({}).state.schemaVersion, SCHEMA_VERSION);
});

test("a state saved by the new code survives a save, load and export round trip", () => {
  const { state } = migrateState(oldState());
  const loaded = parseSavedState(JSON.stringify(state));
  assert.equal(loaded.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrateState(loaded).changed, false);
  assert.equal(buildExport(loaded).state.schemaVersion, SCHEMA_VERSION);
});
