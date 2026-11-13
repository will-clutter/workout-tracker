const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const { VERSION, PRECACHE } = require("../sw.js");

test("every precached file exists on disk", () => {
  for (const entry of PRECACHE) {
    const file = entry === "./" ? "index.html" : entry;
    assert.ok(fs.existsSync(path.join(root, file)), `missing: ${entry}`);
  }
});

test("service worker VERSION matches package.json", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(VERSION, pkg.version);
});
