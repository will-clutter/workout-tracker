// Tests for the cardio tag. Run them with: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isCardio } = require("../js/logic.js");
const database = require("../data/exercises.json");

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
