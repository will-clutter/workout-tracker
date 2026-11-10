// Tests for the saved "folded headings" state (cleanCollapsed in js/logic.js). Run them with: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { cleanCollapsed, COLLAPSE_KEYS, defaultState, parseSavedState } = require("../js/logic.js");

const allOpen = Object.fromEntries(COLLAPSE_KEYS.map(k => [k, false]));

test("cleanCollapsed: keeps real saved values", () => {
  assert.deepEqual(cleanCollapsed({ exercises: true, completed: false, activities: true, cardioCompleted: false }),
    { exercises: true, completed: false, activities: true, cardioCompleted: false });
});

test("cleanCollapsed: missing or broken values mean open", () => {
  for (const bad of [undefined, null, [], "yes", 5, true]) assert.deepEqual(cleanCollapsed(bad), allOpen);
  assert.deepEqual(cleanCollapsed({ exercises: true }), { ...allOpen, exercises: true }); // partial
  assert.deepEqual(cleanCollapsed({ exercises: "true", completed: 1, activities: null }), allOpen); // only real booleans count
});

test("cleanCollapsed: drops keys it doesn't know", () => {
  assert.deepEqual(Object.keys(cleanCollapsed({ junk: true })).sort(), [...COLLAPSE_KEYS].sort());
});

test("collapsed state: new data starts open, and old saved data without it loads open", () => {
  assert.deepEqual(defaultState().collapsed, allOpen);
  const old = JSON.stringify({ workouts: [{ id: "w", name: "A", items: [] }], activeWorkoutId: "w" });
  assert.deepEqual(parseSavedState(old).collapsed, allOpen);
  const saved = JSON.stringify({ workouts: [{ id: "w", name: "A", items: [] }], activeWorkoutId: "w", collapsed: { completed: true } });
  assert.equal(parseSavedState(saved).collapsed.completed, true);
});
