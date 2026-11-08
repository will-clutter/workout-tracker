// Tests for "Show results for ...?" on misspelled searches (js/logic.js). Run them with: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { editDistance, suggestSearch, isCardio } = require("../js/logic.js");
const database = require("../data/exercises.json");

const words = text => text.split(" ");
// The names you can search in the Workout tab (cardio is left out there)
const names = database.filter(ex => !isCardio(ex)).map(ex => ex.name);

/* ---------- editDistance ---------- */

test("editDistance: the same word is 0 apart", () => {
  assert.equal(editDistance("curl", "curl"), 0);
});

test("editDistance: one letter added, missing or changed is 1", () => {
  assert.equal(editDistance("cur", "curl"), 1);
  assert.equal(editDistance("curls", "curl"), 1);
  assert.equal(editDistance("carl", "curl"), 1);
});

test("editDistance: two letters swapped is 1", () => {
  assert.equal(editDistance("bciep", "bicep"), 1);
});

test("editDistance: from nothing is the word's length", () => {
  assert.equal(editDistance("", "row"), 3);
});

/* ---------- suggestSearch ---------- */

test("suggestSearch: fixes a typo", () => {
  assert.equal(suggestSearch(words("bciep curl"), names), "bicep curl");
});

test("suggestSearch: fixes each misspelled word and keeps the good ones", () => {
  assert.equal(suggestSearch(words("dumbel row"), names), "dumbbell row");
  assert.equal(suggestSearch(words("barbell squaat"), names), "barbell squat");
});

test("suggestSearch: splits two words typed without a space", () => {
  assert.equal(suggestSearch(words("benchpress"), names), "bench press");
});

test("suggestSearch: nothing to fix gives null", () => {
  assert.equal(suggestSearch(words("barbell curl"), names), null);
  assert.equal(suggestSearch(words("cur"), names), null); // part of a word is fine
});

test("suggestSearch: gibberish gives null", () => {
  assert.equal(suggestSearch(words("xqzzv"), names), null);
});

test("suggestSearch: short words need to be very close", () => {
  // "rwo" is a swap away from "row", but "zzw" is too far from anything
  assert.equal(suggestSearch(words("rwo"), ["Seated Row"]), "row");
  assert.equal(suggestSearch(words("zzw"), ["Seated Row"]), null);
});
