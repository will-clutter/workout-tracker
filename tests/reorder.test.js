// Tests for reordering still-to-do exercises (moveTodoItem in js/logic.js). Run them with: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { moveTodoItem } = require("../js/logic.js");

const make = (...specs) => specs.map(s => (s.endsWith("*") ? { uid: s.slice(0, -1), doneAt: 1 } : { uid: s }));
const uids = items => items.map(i => i.uid);

test("moves an item down and up", () => {
  const items = make("a", "b", "c", "d");
  assert.deepEqual(uids(moveTodoItem(items, "a", 2)), ["b", "c", "a", "d"]);
  assert.deepEqual(uids(moveTodoItem(items, "d", 1)), ["a", "d", "b", "c"]);
});

test("to the very first or last place, and out-of-range places are clamped", () => {
  const items = make("a", "b", "c");
  assert.deepEqual(uids(moveTodoItem(items, "c", 0)), ["c", "a", "b"]);
  assert.deepEqual(uids(moveTodoItem(items, "a", 99)), ["b", "c", "a"]);
  assert.deepEqual(uids(moveTodoItem(items, "c", -5)), ["c", "a", "b"]);
});

test("crossed-off items keep their slots; only to-do items shuffle around them", () => {
  const items = make("a", "x*", "b", "y*", "c");
  assert.deepEqual(uids(moveTodoItem(items, "a", 2)), ["b", "x", "c", "y", "a"]);
  assert.deepEqual(uids(moveTodoItem(items, "c", 0)), ["c", "x", "a", "y", "b"]);
});

test("un-crossing an item later puts it back in its old slot", () => {
  const items = make("a", "x*", "b");
  const moved = moveTodoItem(items, "a", 1);
  assert.deepEqual(uids(moved), ["b", "x", "a"]);
  delete moved[1].doneAt; // un-cross x
  assert.deepEqual(uids(moved), ["b", "x", "a"]);
});

test("no-ops return the same items", () => {
  const items = make("a", "b", "x*");
  assert.equal(moveTodoItem(items, "a", 0), items);        // already there
  assert.equal(moveTodoItem(items, "zzz", 1), items);      // unknown
  assert.equal(moveTodoItem(items, "x", 0), items);        // crossed off
  assert.equal(moveTodoItem(items, "a", NaN), items);      // junk place
  assert.equal(moveTodoItem([], "a", 0).length, 0);
  const one = make("a");
  assert.equal(moveTodoItem(one, "a", 3), one);
});

test("doesn't change the array it was given", () => {
  const items = make("a", "b", "c");
  moveTodoItem(items, "a", 2);
  assert.deepEqual(uids(items), ["a", "b", "c"]);
});
