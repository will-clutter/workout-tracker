// Tests that try to break the helpers in js/logic.js with odd, wrong or hostile input.
// Run them with: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  sanitizeWhole, sanitizeMinSec, sanitizeDecimal, savedDecimal, cleanNumbers,
  parseSavedState, findActiveWorkout, buildHistoryEntry, clearCrossOffsFromOtherDays,
  joinDuration, splitDuration, formatDuration, cardioSummaryParts,
  escapeHtml, capitalize, newItem, newCardioItem, isCardioSession,
  exerciseMatches, editDistance, suggestSearch
} = require("../js/logic.js");

console.warn = () => {}; // keep the "Couldn't read saved data" warning out of the test output

/* ---------- sanitizeWhole: what you can type in sets, reps, heart rate, calories, hr/min/sec ---------- */

test("sanitizeWhole: normal numbers are left alone", () => {
  assert.equal(sanitizeWhole("3"), "3");
  assert.equal(sanitizeWhole("10"), "10");
  assert.equal(sanitizeWhole("145"), "145");
});

test("sanitizeWhole: minus, plus, e, spaces and letters can't be typed", () => {
  assert.equal(sanitizeWhole("-5"), "5");
  assert.equal(sanitizeWhole("+5"), "5");
  assert.equal(sanitizeWhole("1e3"), "13");
  assert.equal(sanitizeWhole(" 4 2 "), "42");
  assert.equal(sanitizeWhole("abc"), "");
  assert.equal(sanitizeWhole("-"), "");
});

test("sanitizeWhole: zero isn't allowed, and leading zeros are dropped", () => {
  assert.equal(sanitizeWhole("0"), "");
  assert.equal(sanitizeWhole("00"), "");
  assert.equal(sanitizeWhole("-0"), "");
  assert.equal(sanitizeWhole("007"), "7");
  assert.equal(sanitizeWhole("10"), "10"); // a zero in the middle or end is fine
});

test("sanitizeWhole: a decimal point cuts the number off there", () => {
  assert.equal(sanitizeWhole("12."), "12");
  assert.equal(sanitizeWhole("1.5"), "1");
  assert.equal(sanitizeWhole("."), "");
  assert.equal(sanitizeWhole("1.2.3"), "1");
});

test("sanitizeWhole: pasted text with commas and other digit systems", () => {
  assert.equal(sanitizeWhole("1,000"), "1000");
  assert.equal(sanitizeWhole("٣٤"), ""); // Arabic-Indic digits aren't accepted
  assert.equal(sanitizeWhole("３"), ""); // full-width digit isn't accepted
});

test("sanitizeWhole: very long numbers are cut off at 6 digits", () => {
  assert.equal(sanitizeWhole("1234567890"), "123456");
  assert.equal(sanitizeWhole("9".repeat(500)), "999999");
});

test("sanitizeWhole: missing or non-text input gives an empty box", () => {
  assert.equal(sanitizeWhole(null), "");
  assert.equal(sanitizeWhole(undefined), "");
  assert.equal(sanitizeWhole(""), "");
  assert.equal(sanitizeWhole(12), "12");
  assert.equal(sanitizeWhole({}), "");
});

/* ---------- sanitizeMinSec: the minutes and seconds boxes stop at 59 ---------- */

test("sanitizeMinSec: 1 to 59 are left alone", () => {
  ["1", "5", "30", "45", "59"].forEach(v => assert.equal(sanitizeMinSec(v), v));
});

test("sanitizeMinSec: a key that would make 60 or more is ignored", () => {
  assert.equal(sanitizeMinSec("60"), "6");
  assert.equal(sanitizeMinSec("75"), "7");
  assert.equal(sanitizeMinSec("99"), "9");
  assert.equal(sanitizeMinSec("600"), "6");
});

test("sanitizeMinSec: pasting a long number keeps the part that fits", () => {
  assert.equal(sanitizeMinSec("123"), "12");
  assert.equal(sanitizeMinSec("9".repeat(500)), "9");
});

test("sanitizeMinSec: still no zero, negatives, decimals or letters", () => {
  assert.equal(sanitizeMinSec("0"), "");
  assert.equal(sanitizeMinSec("00"), "");
  assert.equal(sanitizeMinSec("06"), "6");
  assert.equal(sanitizeMinSec("-30"), "30");
  assert.equal(sanitizeMinSec("1.5"), "1");
  assert.equal(sanitizeMinSec("abc"), "");
  assert.equal(sanitizeMinSec(null), "");
  assert.equal(sanitizeMinSec(undefined), "");
});

/* ---------- sanitizeDecimal: weight and distance while you type ---------- */

test("sanitizeDecimal: whole and decimal numbers are left alone", () => {
  assert.equal(sanitizeDecimal("135"), "135");
  assert.equal(sanitizeDecimal("2.5"), "2.5");
  assert.equal(sanitizeDecimal("0.5"), "0.5");
});

test("sanitizeDecimal: in-progress typing is kept so 0.5 can be typed", () => {
  assert.equal(sanitizeDecimal("0"), "0");
  assert.equal(sanitizeDecimal("0."), "0.");
  assert.equal(sanitizeDecimal("12."), "12.");
});

test("sanitizeDecimal: a leading point gets a zero in front", () => {
  assert.equal(sanitizeDecimal("."), "0.");
  assert.equal(sanitizeDecimal(".5"), "0.5");
});

test("sanitizeDecimal: only one decimal point", () => {
  assert.equal(sanitizeDecimal("1.2.3"), "1.23");
  assert.equal(sanitizeDecimal(".."), "0.");
});

test("sanitizeDecimal: negatives, e, plus and letters can't be typed", () => {
  assert.equal(sanitizeDecimal("-1"), "1");
  assert.equal(sanitizeDecimal("-0.5"), "0.5");
  assert.equal(sanitizeDecimal("1e5"), "15");
  assert.equal(sanitizeDecimal("+2"), "2");
  assert.equal(sanitizeDecimal("lbs"), "");
});

test("sanitizeDecimal: extra leading zeros are dropped", () => {
  assert.equal(sanitizeDecimal("00"), "0");
  assert.equal(sanitizeDecimal("007"), "7");
  assert.equal(sanitizeDecimal("00.5"), "0.5");
});

test("sanitizeDecimal: pasted commas, very long text and non-text input", () => {
  assert.equal(sanitizeDecimal("1,000.5"), "1000.5");
  assert.ok(sanitizeDecimal("1".repeat(500)).length <= 8);
  assert.equal(sanitizeDecimal(null), "");
  assert.equal(sanitizeDecimal(undefined), "");
  assert.equal(sanitizeDecimal(2.5), "2.5");
});

/* ---------- savedDecimal: what actually gets saved for weight and distance ---------- */

test("savedDecimal: positive numbers are saved", () => {
  assert.equal(savedDecimal("135"), "135");
  assert.equal(savedDecimal("0.5"), "0.5");
  assert.equal(savedDecimal("2.50"), "2.50"); // keeps what you typed
});

test("savedDecimal: zero and half-typed numbers save as empty", () => {
  assert.equal(savedDecimal("0"), "");
  assert.equal(savedDecimal("0."), "");
  assert.equal(savedDecimal("0.0"), "");
  assert.equal(savedDecimal("."), "");
  assert.equal(savedDecimal(""), "");
  assert.equal(savedDecimal(null), "");
});

test("savedDecimal: a trailing point is dropped", () => {
  assert.equal(savedDecimal("5."), "5");
});

test("savedDecimal: negatives and junk never get saved as negative", () => {
  assert.equal(savedDecimal("-5"), "5");
  assert.equal(savedDecimal("abc"), "");
});

/* ---------- cleanNumbers: fixes saved items ---------- */

test("cleanNumbers: valid numbers are left alone", () => {
  const item = { sets: "3", reps: "10", weight: "135.5", notes: "-5 lbs?", done: true, durationSec: 1500, heartRate: "145", calories: "320", distance: "2.5" };
  assert.deepEqual(cleanNumbers({ ...item }), item);
});

test("cleanNumbers: negative numbers are cleared", () => {
  const item = cleanNumbers({ sets: "-3", reps: -10, weight: "-135", heartRate: "-1", calories: -50, distance: "-2.5", durationSec: -60 });
  assert.deepEqual(item, { sets: "", reps: "", weight: "", heartRate: "", calories: "", distance: "", durationSec: "" });
});

test("cleanNumbers: zero, text and nonsense are cleared", () => {
  const item = cleanNumbers({ sets: "0", reps: "abc", weight: "0.0", heartRate: null, calories: NaN, distance: "Infinity", durationSec: "x" });
  assert.deepEqual(item, { sets: "", reps: "", weight: "", heartRate: "", calories: "", distance: "", durationSec: "" });
});

test("cleanNumbers: decimals in a whole-number field round down", () => {
  assert.equal(cleanNumbers({ sets: "2.5" }).sets, "2");
  assert.equal(cleanNumbers({ durationSec: 90.7 }).durationSec, 90);
});

test("cleanNumbers: scientific notation and huge values are tamed", () => {
  assert.equal(cleanNumbers({ reps: "1e3" }).reps, "1000");
  assert.equal(cleanNumbers({ reps: "99999999999" }).reps, "999999");
  assert.equal(cleanNumbers({ weight: 1e-7 }).weight, "");
  assert.equal(cleanNumbers({ weight: 1e21 }).weight, "999999");
});

test("cleanNumbers: fields that aren't there aren't added", () => {
  assert.deepEqual(cleanNumbers({ uid: "x", exId: "Squat" }), { uid: "x", exId: "Squat" });
  assert.deepEqual(cleanNumbers({}), {});
});

test("cleanNumbers: notes and other text are never touched", () => {
  const item = cleanNumbers({ notes: "-5 lbs, e.g. 1e3\n", intensity: "High" });
  assert.deepEqual(item, { notes: "-5 lbs, e.g. 1e3\n", intensity: "High" });
});

/* ---------- parseSavedState: damaged saved data ---------- */

const base = () => ({ workouts: [{ id: "a", name: "Legs", items: [] }], activeWorkoutId: "a", customExercises: [], history: [], cardio: { items: [] } });
const load = saved => parseSavedState(JSON.stringify(saved));
const isFresh = state => state.workouts.length === 1 && state.workouts[0].name === "Your Workout" && state.history.length === 0;

test("parseSavedState: wrong kinds of saved data give a fresh start", () => {
  ["null", "42", '"hello"', "[]", "true", "{}", "", "undefined"].forEach(text => {
    assert.ok(isFresh(parseSavedState(text)), `should start fresh for: ${text}`);
  });
  assert.ok(isFresh(parseSavedState(undefined)));
});

test("parseSavedState: workouts that aren't a list give a fresh start", () => {
  assert.ok(isFresh(load({ workouts: "Legs" })));
  assert.ok(isFresh(load({ workouts: { id: "a" } })));
  assert.ok(isFresh(load({ workouts: [null, 5, "x"] })));
});

test("parseSavedState: a workout with missing or broken items is repaired, not lost", () => {
  const saved = base();
  saved.workouts = [{ id: "a", name: "Legs" }, { id: "b", name: "Arms", items: "oops" }];
  const loaded = load(saved);
  assert.deepEqual(loaded.workouts.map(w => w.items), [[], []]);
  assert.deepEqual(loaded.workouts.map(w => w.name), ["Legs", "Arms"]);
});

test("parseSavedState: junk inside a workout's items is dropped", () => {
  const saved = base();
  saved.workouts[0].items = [null, 7, "x", { uid: "u1", exId: "Squat", sets: "3" }];
  assert.deepEqual(load(saved).workouts[0].items, [{ uid: "u1", exId: "Squat", sets: "3" }]);
});

test("parseSavedState: one broken History entry doesn't wipe everything", () => {
  const saved = base();
  saved.history = [
    null,
    { id: "h1", workoutName: "Legs", items: [{ name: "Squat", sets: "3", reps: "10", done: true }] },
    { id: "h2", type: "cardio", workoutName: "Cardio" }, // no items at all
    { id: "h3", workoutName: "Arms", items: "nope" }
  ];
  const loaded = load(saved);
  assert.ok(!isFresh(loaded));
  assert.equal(loaded.workouts[0].name, "Legs");
  assert.deepEqual(loaded.history.map(h => h.id), ["h1", "h2", "h3"]);
  assert.deepEqual(loaded.history.map(h => h.items.length), [1, 0, 0]);
});

test("parseSavedState: history that isn't a list becomes an empty one", () => {
  assert.deepEqual(load({ ...base(), history: "lots" }).history, []);
  assert.deepEqual(load({ ...base(), history: { a: 1 } }).history, []);
  assert.deepEqual(load({ ...base(), history: null }).history, []);
});

test("parseSavedState: customExercises that isn't a list becomes an empty one", () => {
  assert.deepEqual(load({ ...base(), customExercises: "x" }).customExercises, []);
  const { customExercises, ...withoutCustom } = base();
  assert.deepEqual(load(withoutCustom).customExercises, []);
});

test("parseSavedState: broken cardio data is repaired", () => {
  assert.deepEqual(load({ ...base(), cardio: "x" }).cardio, { items: [] });
  assert.deepEqual(load({ ...base(), cardio: { items: "x" } }).cardio, { items: [] });
  assert.deepEqual(load({ ...base(), cardio: { items: [null, { uid: "c1", exId: "Skating" }] } }).cardio.items, [{ uid: "c1", exId: "Skating" }]);
});

test("parseSavedState: negative and junk numbers already saved are cleaned up", () => {
  const saved = base();
  saved.workouts[0].items = [{ uid: "u1", exId: "Squat", sets: "-3", reps: "10", weight: "-45" }];
  saved.cardio.items = [{ uid: "c1", exId: "Skating", durationSec: -60, heartRate: "-1", calories: "320", distance: "-2" }];
  saved.history = [
    { id: "h1", workoutName: "Legs", items: [{ name: "Squat", sets: "-3", reps: "10", weight: "-45", done: true }] },
    { id: "h2", type: "cardio", workoutName: "Cardio", items: [{ name: "Skating", durationSec: -5, distance: "-1", done: false }] }
  ];
  const loaded = load(saved);
  assert.deepEqual(loaded.workouts[0].items[0], { uid: "u1", exId: "Squat", sets: "", reps: "10", weight: "" });
  assert.deepEqual(loaded.cardio.items[0], { uid: "c1", exId: "Skating", durationSec: "", heartRate: "", calories: "320", distance: "" });
  assert.deepEqual(loaded.history[0].items[0], { name: "Squat", sets: "", reps: "10", weight: "", done: true });
  assert.deepEqual(loaded.history[1].items[0], { name: "Skating", durationSec: "", distance: "", done: false });
});

test("parseSavedState: an old cardio entry with a bad duration doesn't crash", () => {
  const saved = base();
  saved.cardio.items = [{ uid: "c1", exId: "Skating", duration: "-20" }, { uid: "c2", exId: "Skating", duration: "abc" }];
  assert.deepEqual(load(saved).cardio.items.map(i => i.durationSec), ["", ""]);
});

test("parseSavedState: two workouts with the same id still load", () => {
  const saved = base();
  saved.workouts = [{ id: "a", name: "One", items: [] }, { id: "a", name: "Two", items: [] }];
  const loaded = load(saved);
  assert.equal(loaded.workouts.length, 2);
  assert.equal(findActiveWorkout(loaded).name, "One"); // the first one wins
});

test("isCardioSession: broken entries are just 'not cardio'", () => {
  assert.equal(isCardioSession(null), false);
  assert.equal(isCardioSession(undefined), false);
  assert.equal(isCardioSession({}), false);
});

/* ---------- Duration helpers with odd input ---------- */

test("joinDuration: negative, nonsense and infinite boxes count as 0", () => {
  assert.equal(joinDuration("-1", "30", "0"), 1800);
  assert.equal(joinDuration("abc", "", null), "");
  assert.equal(joinDuration(NaN, NaN, NaN), "");
  assert.equal(joinDuration("-5", "-5", "-5"), "");
  assert.equal(joinDuration(Infinity, 0, 0), "");
  assert.equal(joinDuration(undefined, undefined, undefined), "");
});

test("joinDuration: decimals round to the nearest second and big numbers are capped", () => {
  assert.equal(joinDuration(0, 1.5, 0), 90);
  assert.equal(joinDuration(0, 0, 0.4), "");
  assert.equal(joinDuration(1e300, 1e300, 1e300), 3599999999); // capped at 999999 hours
});

test("splitDuration: negative, nonsense and infinite totals give blank boxes", () => {
  const blank = { h: "", m: "", s: "" };
  assert.deepEqual(splitDuration(-60), blank);
  assert.deepEqual(splitDuration("abc"), blank);
  assert.deepEqual(splitDuration(NaN), blank);
  assert.deepEqual(splitDuration(Infinity), blank);
  assert.deepEqual(splitDuration(null), blank);
  assert.deepEqual(splitDuration(undefined), blank);
});

test("formatDuration: negative, nonsense and infinite give nothing", () => {
  ["-60", -60, "abc", NaN, Infinity, null, undefined, {}].forEach(value => {
    assert.equal(formatDuration(value), "", `should be empty for: ${String(value)}`);
  });
});

test("formatDuration: big totals and numbers typed as text", () => {
  assert.equal(formatDuration("3930"), "1h 5m 30s");
  assert.equal(formatDuration(360000), "100h");
  assert.equal(formatDuration(59.6), "1 min"); // rounds to 60 seconds
});

/* ---------- cardioSummaryParts with odd input ---------- */

test("cardioSummaryParts: negative, nonsense and infinite numbers aren't shown", () => {
  const item = { durationSec: -60, heartRate: "-5", calories: "abc", distance: Infinity, intensity: "" };
  assert.deepEqual(cardioSummaryParts(item), []);
});

test("cardioSummaryParts: an old entry with a bad duration doesn't crash", () => {
  assert.deepEqual(cardioSummaryParts({ duration: "-20" }), []);
  assert.deepEqual(cardioSummaryParts({ duration: "abc" }), []);
});

test("cardioSummaryParts: an intensity of only spaces isn't shown", () => {
  assert.deepEqual(cardioSummaryParts({ intensity: "   " }), []);
});

/* ---------- escapeHtml ---------- */

test("escapeHtml: text that is already escaped gets escaped again", () => {
  assert.equal(escapeHtml("&amp;"), "&amp;amp;");
});

test("escapeHtml: numbers, zero and false are shown, not dropped", () => {
  assert.equal(escapeHtml(0), "0");
  assert.equal(escapeHtml(42), "42");
  assert.equal(escapeHtml(false), "false");
});

/* ---------- Small helpers ---------- */

test("capitalize: missing or non-text input doesn't crash", () => {
  assert.equal(capitalize(null), "");
  assert.equal(capitalize(undefined), "");
  assert.equal(capitalize("  bench   press "), "  Bench   Press ");
  assert.equal(capitalize("o'neil"), "O'Neil");
});

test("newItem and newCardioItem: every new item gets its own id", () => {
  const ids = new Set();
  for (let i = 0; i < 500; i++) {
    ids.add(newItem({ id: "Squat" }).uid);
    ids.add(newCardioItem({ id: "Skating" }).uid);
  }
  assert.equal(ids.size, 1000);
});

/* ---------- History and cross-offs with odd data ---------- */

test("buildHistoryEntry: a workout with no items list gives an empty entry", () => {
  const entry = buildHistoryEntry({ name: "Legs" }, () => "x");
  assert.deepEqual(entry.items, []);
});

test("clearCrossOffsFromOtherDays: an unreadable doneAt date is cleared", () => {
  const workouts = [{ id: "a", items: [{ uid: "u", doneAt: "garbage" }] }];
  assert.equal(clearCrossOffsFromOtherDays(workouts), true);
  assert.equal("doneAt" in workouts[0].items[0], false);
});

test("clearCrossOffsFromOtherDays: a workout with no items list doesn't crash", () => {
  assert.equal(clearCrossOffsFromOtherDays([{ id: "a" }, { id: "b", items: [] }]), false);
});

/* ---------- Search with odd input ---------- */

const bench = { name: "Bench Press (Wide)", equipment: "barbell", primaryMuscles: ["chest"], secondaryMuscles: ["triceps"] };

test("exerciseMatches: brackets, stars and other symbols are plain text, not patterns", () => {
  assert.equal(exerciseMatches(bench, {}, ["("]), true);
  assert.equal(exerciseMatches(bench, {}, ["*"]), false);
  assert.equal(exerciseMatches(bench, {}, ["["]), false);
  assert.equal(exerciseMatches(bench, {}, ["(wide)"]), true);
});

test("exerciseMatches: an empty search word matches everything", () => {
  assert.equal(exerciseMatches(bench, {}, [""]), true);
});

test("exerciseMatches: accented and non-English letters", () => {
  assert.equal(exerciseMatches({ ...bench, name: "Crème Squat" }, {}, ["crème"]), true);
  assert.equal(exerciseMatches(bench, {}, ["é"]), false);
  assert.equal(exerciseMatches(bench, {}, ["💪"]), false);
});

test("exerciseMatches: an exercise missing its muscle or equipment lists doesn't crash", () => {
  const bare = { name: "Mystery Move" };
  assert.equal(exerciseMatches(bare, {}, ["mystery"]), true);
  assert.equal(exerciseMatches(bare, { muscle: "chest" }, []), false);
  assert.equal(exerciseMatches(bare, { equipment: "barbell" }, []), false);
});

test("exerciseMatches: an exercise with no name matches only an empty search", () => {
  assert.equal(exerciseMatches({ primaryMuscles: [], secondaryMuscles: [] }, {}, []), true);
  assert.equal(exerciseMatches({ primaryMuscles: [], secondaryMuscles: [] }, {}, ["x"]), false);
});

/* ---------- Typo suggestions with odd input ---------- */

test("editDistance: empty strings", () => {
  assert.equal(editDistance("", ""), 0);
  assert.equal(editDistance("", "abc"), 3);
  assert.equal(editDistance("abc", ""), 3);
});

test("suggestSearch: no words, or no exercise names, gives nothing to suggest", () => {
  assert.equal(suggestSearch([], ["Bicep Curl"]), null);
  assert.equal(suggestSearch(["bicep"], []), null);
  assert.equal(suggestSearch([], []), null);
});

test("suggestSearch: a 4-letter word can be 1 letter off but not 2", () => {
  assert.equal(suggestSearch(["curk"], ["Curl"]), "curl");
  assert.equal(suggestSearch(["cxxl"], ["Curl"]), null);
});

test("suggestSearch: a 5-letter word can be 2 letters off but not 3", () => {
  assert.equal(suggestSearch(["sqxxt"], ["Squat"]), "squat");
  assert.equal(suggestSearch(["sxxxt"], ["Squat"]), null);
});

test("suggestSearch: digits and symbols in names and searches don't crash", () => {
  assert.equal(suggestSearch(["5x5"], ["Bench 5x5"]), null);
  assert.equal(suggestSearch(["(*"], ["Bench Press"]), null);
  assert.equal(suggestSearch(["curk"], ["Curl (Cable)", "", "   "]), "curl");
});
