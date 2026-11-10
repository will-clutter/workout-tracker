// Tests for History grouping and search (js/logic.js). Run them with: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  groupSessionsByMonth, groupMonthsByYear, searchWords, sessionMatches, searchSessions, highlightText
} = require("../js/logic.js");

// Local noon, so the month is the same in any time zone
const at = (y, m, d) => new Date(y, m - 1, d, 12).toISOString();
const session = (id, date, workoutName = "Push Day", items = [{ name: "Bench Press", notes: "" }]) => ({ id, date, workoutName, items });

test("groupSessionsByMonth: groups newest-first sessions by local month, across year boundaries", () => {
  const list = [session("a", at(2026, 11, 20)), session("b", at(2026, 11, 2)), session("c", at(2026, 1, 5)), session("d", at(2025, 12, 31))];
  const months = groupSessionsByMonth(list);
  assert.deepEqual(months.map(m => m.key), ["2026-11", "2026-01", "2025-12"]);
  assert.deepEqual(months[0].sessions.map(s => s.id), ["a", "b"]);
  assert.equal(months[0].month, 10); // 0-based, like Date
  assert.equal(months[2].year, 2025);
});

test("groupSessionsByMonth: unreadable dates go last in their own group", () => {
  const months = groupSessionsByMonth([session("x", "junk"), session("a", at(2026, 3, 1)), session("y", undefined)]);
  assert.deepEqual(months.map(m => m.key), ["2026-03", "unknown"]);
  assert.deepEqual(months[1].sessions.map(s => s.id), ["x", "y"]);
  assert.equal(months[1].year, null);
  assert.deepEqual(groupSessionsByMonth([]), []);
});

test("groupMonthsByYear: counts sessions per year and keeps order", () => {
  const months = groupSessionsByMonth([session("a", at(2026, 2, 1)), session("b", at(2026, 2, 3)), session("c", at(2026, 1, 3)), session("d", at(2024, 6, 1)), session("e", "bad")]);
  const years = groupMonthsByYear(months);
  assert.deepEqual(years.map(y => [y.year, y.count, y.months.length]), [[2026, 3, 2], [2024, 1, 1], [null, 1, 1]]);
});

test("searchWords: lowercase, extra spaces ignored, junk gives none", () => {
  assert.deepEqual(searchWords("  Bench   PRESS "), ["bench", "press"]);
  for (const empty of ["", "   ", null, undefined]) assert.deepEqual(searchWords(empty), []);
});

test("sessionMatches: workout name, exercise names and notes; every word must match", () => {
  const s = session("a", at(2026, 1, 1), "Push Day", [{ name: "Bench Press", notes: "felt heavy" }, { name: "Dips", notes: "" }]);
  assert.ok(sessionMatches(s, "push"));
  assert.ok(sessionMatches(s, "BENCH"));
  assert.ok(sessionMatches(s, "heavy"));
  assert.ok(sessionMatches(s, "dips push"));       // words can come from different places
  assert.ok(!sessionMatches(s, "squat"));
  assert.ok(!sessionMatches(s, "dips squat"));     // all words needed
  assert.ok(sessionMatches(s, ""));                // nothing typed = everything
});

test("sessionMatches: copes with damaged sessions", () => {
  assert.ok(!sessionMatches({}, "bench"));
  assert.ok(!sessionMatches({ workoutName: 5, items: [{ name: null, notes: 3 }] }, "bench"));
  assert.ok(sessionMatches({ workoutName: "Legs", items: null }, "legs"));
});

test("searchSessions keeps the order", () => {
  const list = [session("a", at(2026, 3, 1), "Legs", []), session("b", at(2026, 2, 1), "Push", []), session("c", at(2026, 1, 1), "Legs", [])];
  assert.deepEqual(searchSessions(list, "legs").map(s => s.id), ["a", "c"]);
});

test("highlightText: wraps matches, any case, and escapes everything else", () => {
  assert.equal(highlightText("Bench Press", ["bench"]), "<mark>Bench</mark> Press");
  assert.equal(highlightText("bench bench", ["bench"]), "<mark>bench</mark> <mark>bench</mark>");
  assert.equal(highlightText("Squat", []), "Squat");
  assert.equal(highlightText("<b>a</b> & b", ["a"]), "&lt;b&gt;<mark>a</mark>&lt;/b&gt; &amp; b");
  assert.equal(highlightText(null, ["a"]), "");
});

test("highlightText: search words with regex characters are taken literally", () => {
  assert.equal(highlightText("3x10 (heavy)", ["(heavy)"]), "3x10 <mark>(heavy)</mark>");
  assert.equal(highlightText("a.b axb", ["a.b"]), "<mark>a.b</mark> axb");
  assert.equal(highlightText("a+b", ["+"]), "a<mark>+</mark>b");
});
