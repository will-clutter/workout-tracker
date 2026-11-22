// Tests for turning your data into cloud rows and back (js/logic.js). Run them with: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  defaultState, makeId, migrateState, SYNC_TABLES, stateToRows, rowHash, diffRows, applyRows, cleanRemoteRow
} = require("../js/logic.js");

// A realistic, fully migrated state with a bit of everything
function sampleState() {
  const s = defaultState();
  const custom = makeId();
  s.workouts[0].name = "Push";
  s.workouts[0].items = [
    { uid: makeId(), exId: "Barbell_Bench_Press", sets: "3", reps: "10", weight: "135.5", notes: "heavy", doneAt: 1763800000000 },
    { uid: makeId(), exId: custom, sets: "4", reps: "12", weight: "", notes: "" }
  ];
  s.workouts.push({ id: makeId(), name: "Pull", items: [{ uid: makeId(), exId: "Pullups", sets: "3", reps: "8", weight: "", notes: "" }] });
  s.customExercises = [
    { id: custom, name: "Mine", equipment: "", primaryMuscles: ["chest"], secondaryMuscles: ["triceps"], custom: true },
    { id: makeId(), name: "Swimming", equipment: "", primaryMuscles: [], secondaryMuscles: [], category: "cardio", custom: true }
  ];
  s.cardio.items = [
    { uid: makeId(), exId: "Stairmaster", durationSec: 1200, intensity: "High", heartRate: "150", calories: "300", distance: "1.5", notes: "", doneAt: 1763800001000 },
    { uid: makeId(), exId: "Rowing", durationSec: "", intensity: "", heartRate: "", calories: "", distance: "", notes: "n" }
  ];
  s.history = [
    { id: makeId(), date: "2026-11-20T10:00:00.000Z", workoutName: "Push", items: [
      { id: makeId(), name: "Bench", sets: "3", reps: "10", weight: "135.5", notes: "", done: true },
      { id: makeId(), name: "Fly", sets: "3", reps: "12", weight: "", notes: "x", done: false }] },
    { id: makeId(), date: "2026-11-18T10:00:00.000Z", type: "cardio", workoutName: "Cardio", items: [
      { id: makeId(), name: "Stairmaster", durationSec: 1200, intensity: "Low", heartRate: "", calories: "", distance: "2", notes: "", done: true }] }
  ];
  s.settings = { units: "metric", durationFormat: "clock" };
  s.activeWorkoutId = s.workouts[1].id;
  s.theme = "violet";
  s.hintsSeen = { crossOff: true };
  s.collapsed = { exercises: true, completed: false, activities: false, cardioCompleted: false };
  return migrateState(s).state;
}

// What the cloud would send back for these rows
const asRemote = rows => Object.fromEntries(SYNC_TABLES.map(t => [t, rows[t].map(r => (t === "user_settings" ? { ...r, user_id: "u" } : { ...r }))]));
const snapshotOf = state => diffRows(stateToRows(state), {}).hashes;

test("stateToRows: one row per workout, card, session and exercise, with the right shape", () => {
  const s = sampleState();
  const rows = stateToRows(s);
  assert.equal(rows.workouts.length, 2);
  assert.equal(rows.workout_items.length, 3);
  assert.equal(rows.cardio_items.length, 2);
  assert.equal(rows.custom_exercises.length, 2);
  assert.equal(rows.sessions.length, 2);
  assert.equal(rows.session_items.length, 3);
  assert.equal(rows.user_settings.length, 1);
  const bench = rows.workout_items[0];
  assert.deepEqual(
    { sets: bench.sets, weight: bench.weight, done_at: bench.done_at, position: bench.position, workout_id: bench.workout_id },
    { sets: 3, weight: 135.5, done_at: new Date(1763800000000).toISOString(), position: 0, workout_id: s.workouts[0].id });
  assert.equal(rows.workout_items[1].weight, null); // "" becomes null
  assert.equal(rows.sessions[1].kind, "cardio");
  assert.equal(rows.session_items[2].duration_sec, 1200);
  assert.equal(rows.session_items[0].duration_sec, null); // workout exercises have no cardio fields
  assert.deepEqual(rows.user_settings[0], { id: "settings", units: "metric", duration_format: "clock", active_workout_id: s.activeWorkoutId });
});

test("stateToRows: leaves out what stays on the device, and anything without a proper id", () => {
  const s = sampleState();
  s.workouts[0].items.push({ uid: "short", exId: "A" });
  s.history[0].items.push({ name: "no id" });
  const json = JSON.stringify(stateToRows(s));
  assert.ok(!json.includes("violet") && !json.includes("hintsSeen") && !json.includes("crossOff"));
  assert.equal(stateToRows(s).workout_items.length, 3);
  assert.equal(stateToRows(s).session_items.length, 3);
});

test("stateToRows: copes with an empty or damaged state", () => {
  assert.doesNotThrow(() => stateToRows({}));
  assert.doesNotThrow(() => stateToRows({ workouts: [null, 5], history: [{ id: makeId(), items: "x" }], cardio: null }));
  assert.equal(stateToRows({}).user_settings[0].units, "imperial");
});

test("round trip: data to rows and back is the same data", () => {
  const s = sampleState();
  const blank = defaultState(); // a device that has already synced its blank start
  const { state } = applyRows(blank, asRemote(stateToRows(s)), snapshotOf(blank));
  // The blank start's default workout is still there, so compare the synced parts
  assert.deepEqual(state.workouts.filter(w => w.name !== "Your Workout"), s.workouts);
  assert.deepEqual(state.customExercises.map(e => e.id).sort(), s.customExercises.map(e => e.id).sort());
  assert.deepEqual(state.cardio, s.cardio);
  assert.deepEqual(state.history, s.history);
  assert.deepEqual(state.settings, s.settings);
  assert.equal(state.theme, blank.theme); // device-only values are not touched
});

test("round trip: applying your own rows to your own data changes nothing", () => {
  const s = sampleState();
  const snap = snapshotOf(s);
  const result = applyRows(s, asRemote(stateToRows(s)), snap);
  assert.deepEqual(result.state, s);
  assert.deepEqual(result.snapshot, snap);
});

test("applyRows: theme, collapsed headings and hints stay as they are on this device", () => {
  const s = sampleState();
  const other = sampleState();
  const { state } = applyRows(s, asRemote(stateToRows(other)), snapshotOf(s));
  assert.equal(state.theme, "violet");
  assert.deepEqual(state.hintsSeen, { crossOff: true });
  assert.equal(state.collapsed.exercises, true);
});

test("applyRows: does not change the objects it is given", () => {
  const s = sampleState();
  const remote = asRemote(stateToRows(sampleState()));
  const before = JSON.stringify([s, remote]);
  applyRows(s, remote, {});
  assert.equal(JSON.stringify([s, remote]), before);
});

/* ---------- what changed ---------- */

test("diffRows: a first sync sends everything and deletes nothing", () => {
  const rows = stateToRows(sampleState());
  const d = diffRows(rows, {});
  SYNC_TABLES.forEach(t => { assert.equal(d.upserts[t].length, rows[t].length); assert.deepEqual(d.deletes[t], []); });
});

test("diffRows: nothing changed means nothing to send", () => {
  const s = sampleState();
  const d = diffRows(stateToRows(s), snapshotOf(s));
  SYNC_TABLES.forEach(t => { assert.deepEqual(d.upserts[t], []); assert.deepEqual(d.deletes[t], []); });
});

test("diffRows: an edited, an added and a removed row are each found", () => {
  const s = sampleState();
  const snap = snapshotOf(s);
  s.workouts[0].items[0].reps = "12";                       // edited
  const added = { uid: makeId(), exId: "Squat", sets: "5", reps: "5", weight: "", notes: "" };
  s.workouts[1].items.push(added);                          // added
  const removed = s.cardio.items.pop();                     // removed
  const d = diffRows(stateToRows(s), snap);
  assert.deepEqual(d.upserts.workout_items.map(r => r.id).sort(), [s.workouts[0].items[0].uid, added.uid].sort());
  assert.deepEqual(d.deletes.cardio_items, [removed.uid]);
});

test("diffRows: deleting a workout deletes its exercises too, and an undo sends them again", () => {
  const s = sampleState();
  const snap = snapshotOf(s);
  const [gone] = s.workouts.splice(0, 1);
  const d = diffRows(stateToRows(s), snap);
  assert.deepEqual(d.deletes.workouts, [gone.id]);
  assert.deepEqual(d.deletes.workout_items.sort(), gone.items.map(i => i.uid).sort());
  s.workouts.unshift(gone); // Undo
  const again = diffRows(stateToRows(s), snap);
  assert.deepEqual(again.deletes.workouts, []);
  assert.equal(again.upserts.workouts.length, 0); // unchanged from the snapshot's point of view
});

test("diffRows: moving an exercise changes the positions that moved", () => {
  const s = sampleState();
  const snap = snapshotOf(s);
  s.workouts[0].items.reverse();
  assert.equal(diffRows(stateToRows(s), snap).upserts.workout_items.length, 2);
});

test("diffRows: a row the cloud refused is not sent again until it changes", () => {
  const s = sampleState();
  const snap = snapshotOf(s);
  const bad = stateToRows(s).workouts[0];
  snap.workouts[bad.id] = "!" + rowHash(bad);
  assert.equal(diffRows(stateToRows(s), snap).upserts.workouts.length, 0);
  s.workouts[0].name = "Renamed";
  assert.equal(diffRows(stateToRows(s), snap).upserts.workouts.length, 1);
});

test("diffRows: settings are sent when they change and are never deleted", () => {
  const s = sampleState();
  const snap = snapshotOf(s);
  s.settings.units = "imperial";
  const d = diffRows(stateToRows(s), snap);
  assert.equal(d.upserts.user_settings.length, 1);
  assert.deepEqual(d.deletes.user_settings, []);
});

/* ---------- folding in what the cloud sends ---------- */

test("applyRows: a new workout from another device appears, in order", () => {
  const s = sampleState();
  const snap = snapshotOf(s);
  const remoteWorkout = { id: makeId(), name: "Legs", position: 2, deleted_at: null };
  const remoteItem = { id: makeId(), workout_id: remoteWorkout.id, ex_id: "Squat", sets: 5, reps: 5, weight: 225, notes: "", done_at: null, position: 0, deleted_at: null };
  const { state, snapshot } = applyRows(s, { workouts: [remoteWorkout], workout_items: [remoteItem] }, snap);
  assert.deepEqual(state.workouts.map(w => w.name), ["Push", "Pull", "Legs"]);
  assert.deepEqual(state.workouts[2].items, [{ uid: remoteItem.id, exId: "Squat", sets: "5", reps: "5", weight: "225", notes: "" }]);
  assert.ok(snapshot.workouts[remoteWorkout.id]); // remembered as synced, so it won't be sent back
  const again = diffRows(stateToRows(state), snapshot); // nothing from the cloud is sent back
  assert.deepEqual(again.upserts.workouts, []);
  assert.deepEqual(again.upserts.workout_items, []);
});

test("applyRows: an edit from another device replaces a row you haven't touched", () => {
  const s = sampleState();
  const snap = snapshotOf(s);
  const row = { ...stateToRows(s).workout_items[0], reps: 20, deleted_at: null };
  const { state } = applyRows(s, { workout_items: [row] }, snap);
  assert.equal(state.workouts[0].items[0].reps, "20");
});

test("applyRows: a row you edited since the last sync is not overwritten", () => {
  const s = sampleState();
  const snap = snapshotOf(s);
  const row = { ...stateToRows(s).workout_items[0], reps: 20, deleted_at: null };
  s.workouts[0].items[0].reps = "15"; // edited here after the last sync
  const { state } = applyRows(s, { workout_items: [row] }, snap);
  assert.equal(state.workouts[0].items[0].reps, "15");
  assert.equal(diffRows(stateToRows(state), snap).upserts.workout_items.length, 1); // and it will be sent
});

test("applyRows: a deletion from another device removes the row, unless you edited it since", () => {
  const s = sampleState();
  const snap = snapshotOf(s);
  const rows = stateToRows(s);
  const tomb = id => ({ id, deleted_at: "2026-11-21T00:00:00Z" });
  const { state } = applyRows(s, { cardio_items: [tomb(rows.cardio_items[0].id)] }, snap);
  assert.equal(state.cardio.items.length, 1);

  const s2 = sampleState();
  const snap2 = snapshotOf(s2);
  s2.cardio.items[0].notes = "edited after";
  const kept = applyRows(s2, { cardio_items: [tomb(s2.cardio.items[0].uid)] }, snap2).state;
  assert.equal(kept.cardio.items.length, 2);
});

test("applyRows: deleting a workout elsewhere takes its exercises with it", () => {
  const s = sampleState();
  const snap = snapshotOf(s);
  const target = s.workouts[1];
  const { state, snapshot } = applyRows(s, { workouts: [{ id: target.id, deleted_at: "2026-11-21T00:00:00Z" }] }, snap);
  assert.deepEqual(state.workouts.map(w => w.name), ["Push"]);
  assert.equal(state.activeWorkoutId, state.workouts[0].id); // the active one was deleted
  assert.equal(snapshot.workout_items[target.items[0].uid], undefined);
});

test("applyRows: there is always at least one workout", () => {
  const s = defaultState();
  const { state } = applyRows(s, { workouts: [{ id: s.workouts[0].id, deleted_at: "2026-11-21T00:00:00Z" }] }, snapshotOf(s));
  assert.equal(state.workouts.length, 1);
  assert.equal(state.activeWorkoutId, state.workouts[0].id);
});

test("applyRows: exercises that arrive without their workout are ignored", () => {
  const s = sampleState();
  const orphan = { id: makeId(), workout_id: makeId(), ex_id: "A", sets: 1, reps: 1, weight: null, notes: "", done_at: null, position: 0, deleted_at: null };
  const { state, snapshot } = applyRows(s, { workout_items: [orphan] }, snapshotOf(s));
  assert.equal(state.workouts.flatMap(w => w.items).length, 3);
  assert.equal(snapshot.workout_items[orphan.id], undefined);
});

test("applyRows: crossed-off times, numbers and dates from the cloud come back in the app's own formats", () => {
  const s = sampleState();
  const row = { ...stateToRows(s).workout_items[1], weight: "45.250", done_at: "2026-11-21T10:00:00+00:00", deleted_at: null };
  const { state } = applyRows(s, { workout_items: [row] }, snapshotOf(s));
  const item = state.workouts[0].items[1];
  assert.equal(item.weight, "45.25");
  assert.equal(item.doneAt, Date.parse("2026-11-21T10:00:00Z"));
});

test("applyRows: a cardio session and its exercises keep their kind", () => {
  const s = sampleState();
  const blank = defaultState();
  const { state } = applyRows(blank, asRemote(stateToRows(s)), {});
  const cardio = state.history.find(h => h.type === "cardio");
  assert.equal(cardio.items[0].durationSec, 1200);
  assert.equal(state.history.find(h => h.type !== "cardio").items[0].reps, "10");
  assert.deepEqual(state.history.map(h => h.date), ["2026-11-20T10:00:00.000Z", "2026-11-18T10:00:00.000Z"]); // newest first
});

test("applyRows: settings and the active workout come from the cloud when you haven't changed them", () => {
  const s = defaultState();
  const snap = snapshotOf(s);
  const remote = { user_settings: [{ user_id: "u", units: "metric", duration_format: "clock", active_workout_id: s.workouts[0].id, deleted_at: null }] };
  const { state } = applyRows(s, remote, snap);
  assert.deepEqual(state.settings, { units: "metric", durationFormat: "clock" });
});

test("cleanRemoteRow: unknown columns are dropped and missing ones filled in", () => {
  const row = cleanRemoteRow("workouts", { id: "a", name: "x", position: "2", user_id: "u", created_at: "z" });
  assert.deepEqual(row, { id: "a", name: "x", position: 2 });
  assert.deepEqual(cleanRemoteRow("custom_exercises", { id: "a", name: "x" }).primary_muscles, []);
});

test("rowHash: same content gives the same fingerprint, any change gives another", () => {
  const row = stateToRows(sampleState()).workouts[0];
  assert.equal(rowHash(row), rowHash({ ...row }));
  assert.notEqual(rowHash(row), rowHash({ ...row, name: "other" }));
});

/* ---------- signing in on a device that already has data ---------- */

const { isUntouchedState, countRemoteRows, mergeStates } = require("../js/logic.js");

// The account's rows as the cloud would send them
function accountRows() {
  const acct = sampleState();
  return { acct, remote: asRemote(stateToRows(acct)) };
}

test("isUntouchedState: only the blank starting state counts", () => {
  assert.equal(isUntouchedState(defaultState()), true);
  const withItem = defaultState();
  withItem.workouts[0].items.push({ uid: makeId(), exId: "A" });
  assert.equal(isUntouchedState(withItem), false);
  const renamed = defaultState();
  renamed.workouts[0].name = "Push";
  assert.equal(isUntouchedState(renamed), false);
  const logged = defaultState();
  logged.history.push({ id: makeId(), items: [] });
  assert.equal(isUntouchedState(logged), false);
  assert.equal(isUntouchedState(sampleState()), false);
});

test("countRemoteRows: counts the account's workouts, sessions and custom exercises, not deleted ones", () => {
  const { remote } = accountRows();
  remote.workouts[1].deleted_at = "2026-11-21T00:00:00Z";
  assert.deepEqual(countRemoteRows(remote), { workouts: 1, sessions: 2, customExercises: 2 });
  assert.deepEqual(countRemoteRows({}), { workouts: 0, sessions: 0, customExercises: 0 });
});

test("mergeStates: a blank device just takes the account's data", () => {
  const { acct, remote } = accountRows();
  const { state, snapshot } = mergeStates(defaultState(), remote);
  assert.deepEqual(state.workouts, acct.workouts); // the empty default workout is dropped
  assert.deepEqual(state.history, acct.history);
  assert.deepEqual(state.settings, acct.settings);
  assert.equal(state.activeWorkoutId, acct.activeWorkoutId);
  const d = diffRows(stateToRows(state), snapshot);
  SYNC_TABLES.forEach(t => { assert.deepEqual(d.upserts[t], []); assert.deepEqual(d.deletes[t], []); }); // nothing to send
});

test("mergeStates: what only exists here is kept and will be sent; what only exists in the account is added", () => {
  const { acct, remote } = accountRows();
  const mine = defaultState();
  mine.workouts[0].name = "Mine only";
  mine.workouts[0].items.push({ uid: makeId(), exId: "Squat", sets: "5", reps: "5", weight: "", notes: "" });
  const { state, snapshot } = mergeStates(mine, remote);
  assert.deepEqual(state.workouts.map(w => w.name).sort(), ["Mine only", "Pull", "Push"]);
  const d = diffRows(stateToRows(state), snapshot);
  assert.deepEqual(d.upserts.workouts.map(r => r.name), ["Mine only"]);
  assert.equal(d.upserts.workout_items.length, 1);
  assert.equal(d.upserts.sessions.length, 0);
  assert.equal(state.history.length, acct.history.length);
});

test("mergeStates: where both sides have the same row, the account's version wins", () => {
  const { acct, remote } = accountRows();
  const mine = JSON.parse(JSON.stringify(acct));
  mine.workouts[0].name = "Edited here";
  mine.workouts[0].items[0].reps = "99";
  const { state } = mergeStates(mine, remote);
  assert.equal(state.workouts[0].name, "Push");
  assert.equal(state.workouts[0].items[0].reps, "10");
});

test("mergeStates: the account's settings win, and this device's are kept if the account has none", () => {
  const { remote } = accountRows();
  const mine = defaultState();
  assert.deepEqual(mergeStates(mine, remote).state.settings, { units: "metric", durationFormat: "clock" });
  remote.user_settings = [];
  mine.settings = { units: "metric", durationFormat: "words" };
  assert.deepEqual(mergeStates(mine, remote).state.settings, { units: "metric", durationFormat: "words" });
});

test("mergeStates: the blank default workout is kept when the account has no workouts", () => {
  const mine = defaultState();
  const { state } = mergeStates(mine, {});
  assert.deepEqual(state.workouts, mine.workouts);
});

test("mergeStates: something the account deleted is removed here", () => {
  const { acct, remote } = accountRows();
  remote.workouts[1].deleted_at = "2026-11-21T00:00:00Z";
  const { state } = mergeStates(JSON.parse(JSON.stringify(acct)), remote);
  assert.deepEqual(state.workouts.map(w => w.name), ["Push"]);
});

test("mergeStates: account data only drops this device's own data but keeps its theme and hints", () => {
  const { acct, remote } = accountRows();
  const mine = defaultState();
  mine.workouts[0].name = "Mine only";
  mine.workouts[0].items.push({ uid: makeId(), exId: "Squat", sets: "5", reps: "5", weight: "", notes: "" });
  mine.theme = "emerald";
  mine.hintsSeen = { crossOff: true };
  const { state } = mergeStates(mine, remote, false);
  assert.deepEqual(state.workouts, acct.workouts);
  assert.equal(state.theme, "emerald");
  assert.deepEqual(state.hintsSeen, { crossOff: true });
});

test("mergeStates: does not change what it is given", () => {
  const { acct, remote } = accountRows();
  const mine = sampleState();
  const before = JSON.stringify([mine, remote, acct]);
  mergeStates(mine, remote);
  mergeStates(mine, remote, false);
  assert.equal(JSON.stringify([mine, remote, acct]), before);
});
