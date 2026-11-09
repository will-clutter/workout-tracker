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
  return { uid: makeId(), exId: ex.id, durationSec: "", intensity: "", heartRate: "", calories: "", distance: "", notes: "" };
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
  return String(text ?? "").replace(/\b\w/g, c => c.toUpperCase());
}

/* ---------- Number boxes: what you're allowed to type ---------- */

/*
  Rules: sets, reps, heart rate, calories and the hr / min / sec boxes take whole
  numbers above 0. Weight and distance take whole or decimal numbers above 0.
  An empty box is always fine. Nothing can be negative.
  The "sanitize" functions clean what's in a box while you type (so they keep
  half-typed things like "0." that you need to get to "0.5"). The "saved" and
  "clean" functions decide what actually gets stored.
*/

const WHOLE_FIELDS = ["sets", "reps", "heartRate", "calories"];
const DECIMAL_FIELDS = ["weight", "distance"];
const MAX_WHOLE_DIGITS = 6;     // 999999 is plenty for sets, reps, heart rate, calories or hours
const MAX_DECIMAL_LENGTH = 8;   // like 1234.567
const MAX_SECONDS = 3599999999; // 999999 hours

// While typing, whole-number boxes: digits only. Anything from a "." on is dropped; a lone 0 is not allowed.
function sanitizeWhole(text) {
  const digits = String(typeof text === "string" || typeof text === "number" ? text : "").split(".")[0].replace(/[^0-9]/g, "");
  return digits.replace(/^0+/, "").slice(0, MAX_WHOLE_DIGITS);
}

// While typing, the minutes and seconds boxes: whole numbers up to 59. A key that would make 60+ is ignored.
function sanitizeMinSec(text) {
  let clean = sanitizeWhole(text);
  while (Number(clean) > 59) clean = clean.slice(0, -1);
  return clean;
}

// While typing, decimal boxes: digits and one ".". Keeps "0" and "0." so you can type "0.5".
function sanitizeDecimal(text) {
  let clean = String(typeof text === "string" || typeof text === "number" ? text : "").replace(/[^0-9.]/g, "");
  const dot = clean.indexOf(".");
  if (dot !== -1) clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, "");
  if (clean.startsWith(".")) clean = "0" + clean;
  return clean.replace(/^0+(?=[0-9])/, "").slice(0, MAX_DECIMAL_LENGTH);
}

// What gets saved from a weight or distance box: "" unless it's more than 0
function savedDecimal(text) {
  const clean = sanitizeDecimal(text).replace(/\.$/, "");
  return Number(clean) > 0 ? clean : "";
}

// Fixes a saved whole number: negative, zero, text and nonsense become "". Decimals round down.
function cleanWhole(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n < 1) return "";
  return String(Math.min(Math.floor(n), 10 ** MAX_WHOLE_DIGITS - 1));
}

// Fixes a saved weight or distance the same way, but decimals stay
function cleanDecimal(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const text = String(value).trim();
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 10 ** MAX_WHOLE_DIGITS) return String(10 ** MAX_WHOLE_DIGITS - 1);
  // Plain numbers keep exactly what was typed; "1e3" and the like are written out
  return savedDecimal(/^[0-9]*\.?[0-9]*$/.test(text) ? text : String(Number(n.toFixed(2))));
}

// Fixes every number on a saved item (workout item, cardio item or History entry), in place.
// Only fields that are there are touched; notes and other text are left alone.
function cleanNumbers(item) {
  WHOLE_FIELDS.forEach(field => { if (field in item) item[field] = cleanWhole(item[field]); });
  DECIMAL_FIELDS.forEach(field => { if (field in item) item[field] = cleanDecimal(item[field]); });
  if ("durationSec" in item) {
    const n = typeof item.durationSec === "number" || typeof item.durationSec === "string" ? Number(item.durationSec) : NaN;
    item.durationSec = Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), MAX_SECONDS) : "";
  }
  return item;
}

/* ---------- Your data ---------- */

// Is this a plain object (not null, a list, or text)? Saved data can't be trusted to be one.
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const records = list => (Array.isArray(list) ? list.filter(isRecord) : []);

// Turns saved text back into your data. Missing or unreadable data means a fresh start.
// A damaged piece inside otherwise good data (one bad History entry, say) is repaired or
// skipped, so it can't throw away everything else.
function parseSavedState(text) {
  try {
    const saved = JSON.parse(text);
    if (isRecord(saved)) {
      saved.workouts = records(saved.workouts);
      if (saved.workouts.length > 0) {
        saved.workouts.forEach(workout => { workout.items = records(workout.items); });
        saved.customExercises = records(saved.customExercises);
        saved.history = records(saved.history);
        saved.history.forEach(entry => { entry.items = records(entry.items); });
        if (!isRecord(saved.cardio)) saved.cardio = {}; // saved before the Cardio tab existed
        saved.cardio.items = records(saved.cardio.items);

        // Duration used to be whole minutes; now it's seconds
        const cardioLists = [saved.cardio, ...saved.history.filter(isCardioSession)];
        cardioLists.forEach(list => list.items.forEach(minutesToSeconds));

        // Fix numbers that shouldn't be there (negative, zero, text)
        const allItems = [...saved.workouts.flatMap(w => w.items), ...saved.cardio.items, ...saved.history.flatMap(e => e.items)];
        allItems.forEach(cleanNumbers);
        return saved;
      }
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
    items: (workout.items || []).map(item => ({
      name: findName(item.exId) || "Unknown exercise",
      sets: item.sets, reps: item.reps, weight: item.weight, notes: item.notes,
      done: Boolean(item.doneAt)
    }))
  };
}

/* ---------- Cardio ---------- */

const INTENSITIES = ["Low", "Medium", "High"];

// The filled-in cardio fields, ready to show: ["30 min", "High intensity", "145 bpm", "320 cal", "2.5 mi"].
// Anything left empty or set to 0 is skipped, so an untouched entry gives [].
function cardioSummaryParts(item) {
  const positive = value => Number.isFinite(Number(value)) && Number(value) > 0; // blank, 0, negative and nonsense are all "not filled in"
  const parts = [];
  const seconds = item.durationSec ?? (positive(item.duration) ? item.duration * 60 : ""); // older entries had minutes
  if (positive(seconds)) parts.push(formatDuration(seconds));
  if (String(item.intensity ?? "").trim() !== "") parts.push(`${item.intensity} intensity`);
  if (positive(item.heartRate)) parts.push(`${item.heartRate} bpm`);
  if (positive(item.calories)) parts.push(`${item.calories} cal`);
  if (positive(item.distance)) parts.push(`${item.distance} mi`);
  return parts;
}

/* ---------- Duration (stored as seconds) ---------- */

// The three boxes on a card → total seconds. Blank boxes count as 0; a total of 0 is "" (not filled in).
function joinDuration(h, m, s) {
  const n = value => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0); // negative and nonsense count as 0
  const total = Math.min(Math.round(n(h) * 3600 + n(m) * 60 + n(s)), MAX_SECONDS);
  return total > 0 ? total : "";
}

// Total seconds → the three boxes. Empty, 0, negative or nonsense gives three blank boxes.
function splitDuration(sec) {
  const total = Math.round(Number(sec));
  if (!Number.isFinite(total) || total <= 0) return { h: "", m: "", s: "" };
  return { h: Math.floor(total / 3600), m: Math.floor(total / 60) % 60, s: total % 60 };
}

// "25 min", "45 sec", "25m 30s", "1h 5m", "1h 5m 30s". Zero parts are left out; 0 or blank gives "".
function formatDuration(sec) {
  const { h, m, s } = splitDuration(sec);
  if (h === "") return "";
  if (!h && !s) return `${m} min`;
  if (!h && !m) return `${s} sec`;
  return [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(" ");
}

// Converts an entry saved with whole minutes (duration) to seconds (durationSec)
function minutesToSeconds(item) {
  if (!("duration" in item)) return;
  if (item.durationSec === undefined) item.durationSec = joinDuration(0, item.duration, 0);
  delete item.duration;
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
      durationSec: item.durationSec, intensity: item.intensity, heartRate: item.heartRate,
      calories: item.calories, distance: item.distance, notes: item.notes,
      done: Boolean(item.doneAt)
    }))
  };
}

// Is this History entry cardio? (Older entries have no type; they're all workouts.)
function isCardioSession(entry) {
  return isRecord(entry) && entry.type === "cardio";
}

// Un-crosses exercises that were crossed off on an earlier day.
// Returns true if anything changed.
function clearCrossOffsFromOtherDays(workouts, now = new Date()) {
  const today = now.toDateString();
  let changed = false;
  workouts.forEach(w => (w.items || []).forEach(i => {
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
  const primary = ex.primaryMuscles || [];
  const secondary = ex.secondaryMuscles || [];
  if (filters.muscle && !primary.includes(filters.muscle) && !secondary.includes(filters.muscle)) return false;
  if (filters.equipment && ex.equipment !== filters.equipment) return false;
  const name = String(ex.name ?? "").toLowerCase();
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
    WHOLE_FIELDS, DECIMAL_FIELDS, sanitizeWhole, sanitizeMinSec, sanitizeDecimal, savedDecimal, cleanNumbers,
    exerciseMatches, isCardio,
    newCardioItem, INTENSITIES, cardioSummaryParts, joinDuration, splitDuration, formatDuration, buildCardioHistoryEntry, isCardioSession,
    editDistance, suggestSearch
  };
}
