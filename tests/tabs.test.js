// Tests for gliding across the tab bar (glideTabIndex in js/logic.js). Run them with: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { glideTabIndex } = require("../js/logic.js");

const bar = { top: 700, bottom: 756 };
const boxes = [{ left: 20, right: 120 }, { left: 120, right: 220 }, { left: 220, right: 320 }];

test("glideTabIndex: picks the tab under the finger", () => {
  assert.equal(glideTabIndex(50, 730, bar, boxes), 0);
  assert.equal(glideTabIndex(170, 730, bar, boxes), 1);
  assert.equal(glideTabIndex(300, 730, bar, boxes), 2);
});

test("glideTabIndex: past either end counts as the first or last tab", () => {
  assert.equal(glideTabIndex(-40, 730, bar, boxes), 0);
  assert.equal(glideTabIndex(900, 730, bar, boxes), 2);
});

test("glideTabIndex: a gap between tabs goes to the nearest one", () => {
  const gapped = [{ left: 0, right: 100 }, { left: 140, right: 240 }];
  assert.equal(glideTabIndex(115, 730, bar, gapped), 0);
  assert.equal(glideTabIndex(125, 730, bar, gapped), 1);
});

test("glideTabIndex: a little drift above or below the bar still counts", () => {
  assert.equal(glideTabIndex(170, 650, bar, boxes), 1);
  assert.equal(glideTabIndex(170, 800, bar, boxes), 1);
});

test("glideTabIndex: dragged far above or below the bar cancels (-1)", () => {
  assert.equal(glideTabIndex(170, 400, bar, boxes), -1);
  assert.equal(glideTabIndex(170, 900, bar, boxes), -1);
});

test("glideTabIndex: no tabs means no answer", () => {
  assert.equal(glideTabIndex(170, 730, bar, []), -1);
});
