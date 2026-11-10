// Tests for History order (sortSessionsNewestFirst in js/logic.js). Run them with: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sortSessionsNewestFirst } = require("../js/logic.js");

const s = (id, date) => ({ id, date });

test("sortSessionsNewestFirst: newest first, input not changed", () => {
  const input = [s("a", "2026-01-01T10:00:00Z"), s("c", "2026-03-01T10:00:00Z"), s("b", "2026-02-01T10:00:00Z")];
  assert.deepEqual(sortSessionsNewestFirst(input).map(x => x.id), ["c", "b", "a"]);
  assert.deepEqual(input.map(x => x.id), ["a", "c", "b"]);
});

test("sortSessionsNewestFirst: empty list, and a missing entry, don't crash", () => {
  assert.deepEqual(sortSessionsNewestFirst([]), []);
  const out = sortSessionsNewestFirst([null, s("a", "2026-01-01T10:00:00Z")]);
  assert.equal(out[0].id, "a");
  assert.equal(out.length, 2);
});

test("sortSessionsNewestFirst: same time keeps its order, bad dates go last", () => {
  const input = [s("x", "nope"), s("a", "2026-01-01T10:00:00Z"), s("b", "2026-01-01T10:00:00Z"), s("y", undefined)];
  assert.deepEqual(sortSessionsNewestFirst(input).map(x => x.id), ["a", "b", "x", "y"]);
});
