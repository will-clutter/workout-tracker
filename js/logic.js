/* ============================================================
   logic.js — small helpers with no screen code
   These live in their own file so they can be tested
   (see tests/). The browser loads this before app.js.
   ============================================================ */

const DEFAULT_SETS = "3";
const DEFAULT_REPS = "10";

// A short random ID, used to tell items apart
function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function defaultState() {
  const id = makeId();
  return {
    workouts: [{ id, name: "Your Workout", items: [] }],
    activeWorkoutId: id,
    customExercises: [],
    history: []
  };
}

// A fresh workout entry for an exercise, with the default sets/reps
function newItem(ex) {
  return { uid: makeId(), exId: ex.id, sets: DEFAULT_SETS, reps: DEFAULT_REPS, weight: "", notes: "" };
}

// "1 exercise", "3 exercises"
function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Makes user-typed text safe to put inside HTML
function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function capitalize(text) {
  return text.replace(/\b\w/g, c => c.toUpperCase());
}

// Lets the tests load these functions. The browser skips this line.
if (typeof module !== "undefined") {
  module.exports = { DEFAULT_SETS, DEFAULT_REPS, makeId, defaultState, newItem, plural, escapeHtml, capitalize };
}
