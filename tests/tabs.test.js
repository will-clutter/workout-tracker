// Tests for gliding across the tab bar (glideTabIndex in js/logic.js). Run them with: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { glideTabIndex, stretchForSpeed } = require("../js/logic.js");

test("stretchForSpeed: round at rest, bad input is round too", () => {
  assert.equal(stretchForSpeed(0), 1);
  assert.equal(stretchForSpeed(-2), 1);
  assert.equal(stretchForSpeed(NaN), 1);
});

test("stretchForSpeed: slow sliding and jitter (dead zone) stay exactly round", () => {
  assert.equal(stretchForSpeed(0.1), 1);
  assert.equal(stretchForSpeed(0.3), 1);
});

test("stretchForSpeed: infinite speed gives the max, not round", () => {
  assert.equal(stretchForSpeed(Infinity), 1.5);
});

test("stretchForSpeed: grows with speed but never passes the max", () => {
  assert.ok(stretchForSpeed(0.5) > 1);
  assert.ok(stretchForSpeed(2) > stretchForSpeed(0.5));
  assert.ok(stretchForSpeed(1000) <= 1.5);
  assert.ok(stretchForSpeed(1000) > 1.49);
  assert.ok(stretchForSpeed(1000, 2) <= 2);
});

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
