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

/* ---------- Your data ---------- */

// Turns saved text back into your data. Missing or broken data means a fresh start.
function parseSavedState(text) {
  try {
    const saved = JSON.parse(text);
    if (saved && Array.isArray(saved.workouts) && saved.workouts.length > 0) return saved;
  } catch (err) {
    console.warn("Couldn't read saved data, starting fresh.", err);
  }
  return defaultState();
}

// The workout currently on screen (or the first one, if that one's gone)
function findActiveWorkout(state) {
  return state.workouts.find(w => w.id === state.activeWorkoutId) || state.workouts[0];
}

function hasExercise(workout, exId) {
  return workout.items.some(i => i.exId === exId);
}

// Look up an exercise by id, in the database or your custom ones
function findExercise(exId, databaseById, customExercises) {
  return databaseById[exId] || customExercises.find(e => e.id === exId);
}

// A History entry for a workout. findName(exId) gives an exercise's name.
function buildHistoryEntry(workout, findName, now = new Date()) {
  return {
    id: makeId(),
    date: now.toISOString(),
    workoutName: workout.name,
    items: workout.items.map(item => ({
      name: findName(item.exId) || "Unknown exercise",
      sets: item.sets, reps: item.reps, weight: item.weight, notes: item.notes,
      done: Boolean(item.doneAt)
    }))
  };
}

// Un-crosses exercises that were crossed off on an earlier day.
// Returns true if anything changed.
function clearCrossOffsFromOtherDays(workouts, now = new Date()) {
  const today = now.toDateString();
  let changed = false;
  workouts.forEach(w => w.items.forEach(i => {
    if (i.doneAt && new Date(i.doneAt).toDateString() !== today) {
      delete i.doneAt;
      changed = true;
    }
  }));
  return changed;
}

/* ---------- Search ---------- */

// Does this exercise match the search? filters = { muscle, equipment }
// (empty means "any"); words = the lowercase search words, all must be in the name.
function exerciseMatches(ex, filters, words) {
  if (filters.muscle && !ex.primaryMuscles.includes(filters.muscle) && !ex.secondaryMuscles.includes(filters.muscle)) return false;
  if (filters.equipment && ex.equipment !== filters.equipment) return false;
  const name = ex.name.toLowerCase();
  return words.every(word => name.includes(word));
}

// Cardio exercises are tagged with category: "cardio" in data/exercises.json
function isCardio(ex) {
  return ex.category === "cardio";
}

// Lets the tests load these functions. The browser skips this line.
if (typeof module !== "undefined") {
  module.exports = {
    DEFAULT_SETS, DEFAULT_REPS, makeId, defaultState, newItem, plural, escapeHtml, capitalize,
    parseSavedState, findActiveWorkout, hasExercise, findExercise, buildHistoryEntry, clearCrossOffsFromOtherDays,
    exerciseMatches, isCardio
  };
}
