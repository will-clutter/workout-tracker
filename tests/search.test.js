// Tests for the exercise search in js/logic.js. Run them with: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { exerciseMatches } = require("../js/logic.js");

const curl = {
  name: "Barbell Curl", equipment: "barbell",
  primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"]
};
const noFilters = { muscle: "", equipment: "" };

test("exerciseMatches: no search and no filters matches everything", () => {
  assert.equal(exerciseMatches(curl, noFilters, []), true);
});

test("exerciseMatches: a word in the name matches, ignoring capitals", () => {
  assert.equal(exerciseMatches(curl, noFilters, ["curl"]), true);
});

test("exerciseMatches: part of a word matches", () => {
  assert.equal(exerciseMatches(curl, noFilters, ["barb"]), true);
});

test("exerciseMatches: every word must be in the name, in any order", () => {
  assert.equal(exerciseMatches(curl, noFilters, ["curl", "barbell"]), true);
  assert.equal(exerciseMatches(curl, noFilters, ["curl", "dumbbell"]), false);
});

test("exerciseMatches: muscle filter matches primary or secondary muscles", () => {
  assert.equal(exerciseMatches(curl, { muscle: "biceps", equipment: "" }, []), true);
  assert.equal(exerciseMatches(curl, { muscle: "forearms", equipment: "" }, []), true);
  assert.equal(exerciseMatches(curl, { muscle: "chest", equipment: "" }, []), false);
});

test("exerciseMatches: equipment filter must match exactly", () => {
  assert.equal(exerciseMatches(curl, { muscle: "", equipment: "barbell" }, []), true);
  assert.equal(exerciseMatches(curl, { muscle: "", equipment: "dumbbell" }, []), false);
});

test("exerciseMatches: search words and filters must all match together", () => {
  const legsAndBarbell = { muscle: "quadriceps", equipment: "barbell" };
  assert.equal(exerciseMatches(curl, legsAndBarbell, ["curl"]), false);
  assert.equal(exerciseMatches(curl, { muscle: "biceps", equipment: "barbell" }, ["curl"]), true);
});
