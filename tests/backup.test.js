const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  defaultState, buildExport, exportFileName, parseImport, BACKUP_APP, BACKUP_VERSION
} = require("../js/logic.js");

const NOW = new Date(2026, 10, 12, 19, 5); // 12 Nov 2026, local time

function sampleState() {
  const s = defaultState();
  s.workouts[0].items.push({ uid: "u1", exId: "squat", sets: "3", reps: "10", weight: "135", notes: "heavy" });
  s.history.push({ id: "h1", date: "2026-11-01T10:00:00.000Z", workoutName: "Your Workout", items: [{ name: "Squat", sets: "3", reps: "10", weight: "135", notes: "", done: true }] });
  s.customExercises.push({ id: "custom_a", name: "Mine", equipment: "", primaryMuscles: [], secondaryMuscles: [], custom: true });
  s.theme = "violet";
  s.settings.units = "metric";
  s.hintsSeen = { crossOff: true };
  return s;
}

test("buildExport: labels the file and leaves out hintsSeen", () => {
  const out = buildExport(sampleState(), NOW);
  assert.equal(out.app, BACKUP_APP);
  assert.equal(out.version, BACKUP_VERSION);
  assert.equal(out.exportedAt, NOW.toISOString());
  assert.equal("hintsSeen" in out.state, false);
  assert.equal(out.state.theme, "violet");
  assert.equal(out.state.settings.units, "metric");
  assert.equal(out.state.history.length, 1);
});

test("buildExport: doesn't change the state it was given", () => {
  const s = sampleState();
  buildExport(s, NOW);
  assert.deepEqual(s.hintsSeen, { crossOff: true });
});

test("exportFileName: uses the local date", () => {
  assert.equal(exportFileName(NOW), "workout-logbook-2026-11-12.json");
  assert.equal(exportFileName(new Date(2026, 0, 5)), "workout-logbook-2026-01-05.json");
});

test("parseImport: a backup round-trips", () => {
  const s = sampleState();
  const result = parseImport(JSON.stringify(buildExport(s, NOW)));
  assert.equal(result.ok, true);
  const expected = { ...s };
  delete expected.hintsSeen;
  assert.deepEqual(result.state, expected);
});

test("parseImport: cleans old-format data inside a file", () => {
  const s = sampleState();
  s.cardio.items.push({ uid: "c1", exId: "run", duration: "30", intensity: "", heartRate: "", calories: "", distance: "", notes: "" });
  const result = parseImport(JSON.stringify(buildExport(s, NOW)));
  assert.equal(result.ok, true);
  assert.equal(result.state.cardio.items[0].durationSec, 1800);
});

test("parseImport: drops hintsSeen even if the file has it", () => {
  const file = buildExport(sampleState(), NOW);
  file.state.hintsSeen = { add: true };
  assert.equal("hintsSeen" in parseImport(JSON.stringify(file)).state, false);
});

test("parseImport: rejects things that aren't a usable backup", () => {
  const good = buildExport(sampleState(), NOW);
  const bad = text => parseImport(typeof text === "string" ? text : JSON.stringify(text));
  const cases = {
    "not JSON": bad("{nope"),
    "empty text": bad(""),
    "an array": bad([]),
    "null": bad("null"),
    "wrong app": bad({ ...good, app: "other" }),
    "no app": bad({ version: 1, state: good.state }),
    "no version": bad({ app: BACKUP_APP, state: good.state }),
    "version 0": bad({ ...good, version: 0 }),
    "text version": bad({ ...good, version: "1" }),
    "newer version": bad({ ...good, version: BACKUP_VERSION + 1 }),
    "no state": bad({ app: BACKUP_APP, version: 1 }),
    "state is a list": bad({ ...good, state: [] }),
    "no workouts": bad({ ...good, state: { ...good.state, workouts: [] } }),
    "workouts not records": bad({ ...good, state: { ...good.state, workouts: ["x", 3] } }),
    "a raw saved state (not a backup)": bad(good.state)
  };
  for (const [name, result] of Object.entries(cases)) {
    assert.equal(result.ok, false, name);
    assert.equal(typeof result.error, "string", name);
  }
});
