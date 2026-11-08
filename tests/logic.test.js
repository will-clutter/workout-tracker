// Tests for js/logic.js. Run them with: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { plural, escapeHtml, capitalize, defaultState, newItem } = require("../js/logic.js");

test("plural: 1 has no s", () => {
  assert.equal(plural(1, "exercise"), "1 exercise");
});

test("plural: 0 and 3 add an s", () => {
  assert.equal(plural(0, "exercise"), "0 exercises");
  assert.equal(plural(3, "exercise"), "3 exercises");
});

test("escapeHtml: turns HTML characters into safe text", () => {
  assert.equal(
    escapeHtml(`<b>"Tom" & 'Jo'</b>`),
    "&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jo&#39;&lt;/b&gt;"
  );
});

test("escapeHtml: empty or missing input gives an empty string", () => {
  assert.equal(escapeHtml(""), "");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("capitalize: capitalizes each word", () => {
  assert.equal(capitalize("barbell curl"), "Barbell Curl");
});

test("capitalize: empty string stays empty", () => {
  assert.equal(capitalize(""), "");
});

test("defaultState: one empty workout that is the active one", () => {
  const state = defaultState();
  assert.equal(state.workouts.length, 1);
  assert.equal(state.workouts[0].name, "Your Workout");
  assert.deepEqual(state.workouts[0].items, []);
  assert.equal(state.activeWorkoutId, state.workouts[0].id);
});

test("defaultState: no custom exercises or history yet", () => {
  const state = defaultState();
  assert.deepEqual(state.customExercises, []);
  assert.deepEqual(state.history, []);
});

test("newItem: uses the exercise id and 3 sets x 10 reps", () => {
  const item = newItem({ id: "Barbell_Deadlift" });
  assert.equal(item.exId, "Barbell_Deadlift");
  assert.equal(item.sets, "3");
  assert.equal(item.reps, "10");
  assert.equal(item.weight, "");
  assert.equal(item.notes, "");
});

test("newItem: each new item gets a different id", () => {
  const ex = { id: "Barbell_Deadlift" };
  assert.notEqual(newItem(ex).uid, newItem(ex).uid);
});
