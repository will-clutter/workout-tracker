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
    history: [],
    cardio: { items: [] }
  };
}

// A fresh workout entry for an exercise, with the default sets/reps
function newItem(ex) {
  return { uid: makeId(), exId: ex.id, sets: DEFAULT_SETS, reps: DEFAULT_REPS, weight: "", notes: "" };
}

// A fresh cardio entry. Every field starts empty; empty fields aren't shown.
function newCardioItem(ex) {
  return { uid: makeId(), exId: ex.id, duration: "", intensity: "", heartRate: "", calories: "", distance: "", notes: "" };
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
    if (saved && Array.isArray(saved.workouts) && saved.workouts.length > 0) {
      if (!saved.cardio || !Array.isArray(saved.cardio.items)) saved.cardio = { items: [] }; // saved before the Cardio tab existed
      return saved;
    }
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

/* ---------- Cardio ---------- */

const INTENSITIES = ["Low", "Medium", "High"];

// The filled-in cardio fields, ready to show: ["30 min", "High intensity", "145 bpm", "320 cal", "2.5 mi"].
// Anything left empty is skipped, so an untouched entry gives [].
function cardioSummaryParts(item) {
  const has = value => String(value ?? "").trim() !== "";
  const parts = [];
  if (has(item.duration)) parts.push(`${item.duration} min`);
  if (has(item.intensity)) parts.push(`${item.intensity} intensity`);
  if (has(item.heartRate)) parts.push(`${item.heartRate} bpm`);
  if (has(item.calories)) parts.push(`${item.calories} cal`);
  if (has(item.distance)) parts.push(`${item.distance} mi`);
  return parts;
}

// A History entry for your cardio list. findName(exId) gives an exercise's name.
function buildCardioHistoryEntry(items, findName, now = new Date()) {
  return {
    id: makeId(),
    date: now.toISOString(),
    type: "cardio",
    workoutName: "Cardio",
    items: items.map(item => ({
      name: findName(item.exId) || "Unknown exercise",
      duration: item.duration, intensity: item.intensity, heartRate: item.heartRate,
      calories: item.calories, distance: item.distance, notes: item.notes,
      done: Boolean(item.doneAt)
    }))
  };
}

// Is this History entry cardio? (Older entries have no type; they're all workouts.)
function isCardioSession(entry) {
  return entry.type === "cardio";
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

/* ---------- "Did you mean...?" for misspelled searches ---------- */

// How many single-letter changes turn a into b. Adding, removing or changing
// a letter counts as 1, and so does swapping two letters next to each other
// (so "bciep" is just 1 away from "bicep").
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// A corrected search for words (lowercase) that found nothing, using the words
// in names (the exercise names you could be looking for). Words that already
// appear in a name are kept; others become the closest name word, if one is
// close enough. Returns the corrected search, or null if there's nothing to fix.
function suggestSearch(words, names) {
  const counts = new Map(); // each word in the names, and how many names use it
  names.forEach(name => {
    new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)).forEach(w => counts.set(w, (counts.get(w) || 0) + 1));
  });
  const vocab = [...counts.keys()];

  let changed = false;
  const fixed = words.map(word => {
    if (vocab.some(w => w.includes(word))) return word; // spelled fine
    // Two words typed without a space, like "benchpress"
    for (let i = 2; i <= word.length - 2; i++) {
      if (counts.has(word.slice(0, i)) && counts.has(word.slice(i))) {
        changed = true;
        return word.slice(0, i) + " " + word.slice(i);
      }
    }
    const allowed = word.length <= 4 ? 1 : 2;
    let best = null;
    let bestDistance = allowed + 1;
    vocab.forEach(w => {
      const distance = editDistance(word, w);
      if (distance < bestDistance || (distance === bestDistance && best && counts.get(w) > counts.get(best))) {
        best = w;
        bestDistance = distance;
      }
    });
    if (!best) return word;
    changed = true;
    return best;
  });
  return changed ? fixed.join(" ") : null;
}

// Lets the tests load these functions. The browser skips this line.
if (typeof module !== "undefined") {
  module.exports = {
    DEFAULT_SETS, DEFAULT_REPS, makeId, defaultState, newItem, plural, escapeHtml, capitalize,
    parseSavedState, findActiveWorkout, hasExercise, findExercise, buildHistoryEntry, clearCrossOffsFromOtherDays,
    exerciseMatches, isCardio,
    newCardioItem, INTENSITIES, cardioSummaryParts, buildCardioHistoryEntry, isCardioSession,
    editDistance, suggestSearch
  };
}
