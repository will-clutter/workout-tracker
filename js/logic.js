/* ============================================================
   logic.js — small helpers with no screen code
   These live in their own file so they can be tested
   (see tests/). The browser loads this before main.js.
   ============================================================ */

const DEFAULT_WORKOUT_NAME = "Your Workout";
const DEFAULT_SETS = "3";
const DEFAULT_REPS = "10";

// Which shape the saved data is in. 1 = short random ids (the original), 2 = UUIDs,
// 3 = every History exercise also has its own id (needed to sync them).
const SCHEMA_VERSION = 3;

// A random UUID like "8a4cc732-f46a-428f-a666-752466e15d70", used to tell items apart.
// Phones and computers can each make these on their own, offline, without ever clashing,
// which is what lets your data sync later. (Needs https or localhost; GitHub Pages is https.)
function makeId() {
  return crypto.randomUUID();
}

function defaultState() {
  const id = makeId();
  return {
    schemaVersion: SCHEMA_VERSION,
    workouts: [{ id, name: DEFAULT_WORKOUT_NAME, items: [] }],
    activeWorkoutId: id,
    customExercises: [],
    history: [],
    cardio: { items: [] },
    collapsed: cleanCollapsed(),
    settings: cleanSettings()
  };
}

// Settings (saved). Weight and distance are always stored in lb and mi; "metric" only changes what's shown and typed.
const DEFAULT_SETTINGS = { units: "imperial", durationFormat: "words" };
const SETTING_CHOICES = { units: ["imperial", "metric"], durationFormat: ["words", "clock"] };
function cleanSettings(value) {
  const saved = isRecord(value) ? value : {};
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(key =>
    [key, SETTING_CHOICES[key].includes(saved[key]) ? saved[key] : DEFAULT_SETTINGS[key]]));
}

/* ---------- Units (stored in lb / mi) ---------- */

const KG_PER_LB = 0.45359237;
const KM_PER_MI = 1.609344;

function unitLabels(units) {
  return units === "metric" ? { weight: "kg", distance: "km" } : { weight: "lb", distance: "mi" };
}

// Stored number (text) -> what to show. Metric: 1 decimal, ".0" dropped; tiny values get more decimals so they never read as 0.
function showConverted(stored, factor, units) {
  const n = Number(stored);
  if (units !== "metric" || stored === "" || !Number.isFinite(n) || n <= 0) return stored ?? "";
  const metric = n * factor;
  for (const decimals of [1, 2, 3]) {
    const text = String(Number(metric.toFixed(decimals)));
    if (Number(text) > 0) return text;
  }
  return "0.001";
}
const showWeight = (storedLb, units) => showConverted(storedLb, KG_PER_LB, units);
const showDistance = (storedMi, units) => showConverted(storedMi, KM_PER_MI, units);

// What was typed in a box -> what to save (always lb / mi). Same rules as savedDecimal; "" if not more than 0.
function storeConverted(typed, factor, units) {
  const clean = savedDecimal(typed);
  if (units !== "metric" || clean === "") return clean;
  return cleanDecimal(String(Number((Number(clean) / factor).toFixed(3))));
}
const storeWeight = (typed, units) => storeConverted(typed, KG_PER_LB, units);
const storeDistance = (typed, units) => storeConverted(typed, KM_PER_MI, units);

// Which headings are folded away (saved). Anything missing or odd counts as open.
const COLLAPSE_KEYS = ["exercises", "completed", "activities", "cardioCompleted"];
function cleanCollapsed(value) {
  const saved = isRecord(value) ? value : {};
  return Object.fromEntries(COLLAPSE_KEYS.map(key => [key, saved[key] === true]));
}

// Moves one still-to-do item to a new place among the to-do items (toIndex counts only to-do items).
// Crossed-off items keep their exact slots, so un-crossing one later puts it back where it was.
// Returns a new array; unknown or crossed-off items, or no change, return the items as they were.
function moveTodoItem(items, uid, toIndex) {
  const slots = items.map((item, i) => (item.doneAt ? -1 : i)).filter(i => i >= 0);
  const todo = slots.map(i => items[i]);
  const from = todo.findIndex(item => item.uid === uid);
  if (from < 0 || !Number.isFinite(toIndex)) return items;
  const to = Math.max(0, Math.min(todo.length - 1, Math.trunc(toIndex)));
  if (to === from) return items;
  const [moved] = todo.splice(from, 1);
  todo.splice(to, 0, moved);
  const result = [...items];
  slots.forEach((slot, i) => { result[slot] = todo[i]; });
  return result;
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
        saved.collapsed = cleanCollapsed(saved.collapsed); // saved before collapsing existed
        saved.settings = cleanSettings(saved.settings); // saved before settings existed

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

/* ---------- Upgrading old data to UUID ids ----------
   Data saved before UUIDs has short ids like "k3j9x2ab". migrateState gives each of
   those a fresh UUID and updates everything that points at it. It runs after
   parseSavedState (which only cleans up damage). It is safe to run any number of
   times: an id that is already a UUID is left alone, so a second run changes nothing.
   Built-in exercises keep their own ids (e.g. "Barbell_Deadlift"). */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = value => typeof value === "string" && UUID_PATTERN.test(value);

// A UUID worked out from some text, so the same text always gives the same id. Used for History
// exercises that were saved before they had ids: two devices that hold the same session end up
// with the same ids, instead of each inventing its own. (Not secret or random; just a stable label.)
function stableId(text) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0x9e3779b9, h4 = 0x85ebca6b;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
    h3 = Math.imul(h3 ^ c, 2246822519);
    h4 = Math.imul(h4 ^ c, 3266489917);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = [h1, h2, h3, h4].map(n => (n >>> 0).toString(16).padStart(8, "0")).join("");
  // Version 4 / variant bits, so it looks like any other UUID
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${"89ab"[parseInt(hex[16], 16) & 3]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Returns { state, changed } with a new object; the one passed in is not touched.
// "changed" says whether anything was remapped, so the caller knows to keep a safety copy and save.
function migrateState(state) {
  const next = JSON.parse(JSON.stringify(state));
  let changed = false;

  // Gives obj[key] a new UUID unless it already is one. Returns [old, new] when it changed it.
  const renew = (obj, key) => {
    if (isUuid(obj[key])) return null;
    const old = obj[key];
    obj[key] = makeId();
    changed = true;
    return [old, obj[key]];
  };
  // old id -> new id for things other data points at. With duplicate old ids, the first one wins.
  const remember = (map, pair) => {
    if (pair && typeof pair[0] === "string" && !map.has(pair[0])) map.set(pair[0], pair[1]);
  };

  const workoutIds = new Map();
  records(next.workouts).forEach(workout => {
    remember(workoutIds, renew(workout, "id"));
    records(workout.items).forEach(item => renew(item, "uid"));
  });
  if (workoutIds.has(next.activeWorkoutId)) next.activeWorkoutId = workoutIds.get(next.activeWorkoutId);

  const customIds = new Map();
  records(next.customExercises).forEach(ex => remember(customIds, renew(ex, "id")));

  // Entries (workout and cardio) that used one of your custom exercises follow it to its new id
  const cardioItems = isRecord(next.cardio) ? records(next.cardio.items) : [];
  cardioItems.forEach(item => renew(item, "uid"));
  const entries = [...records(next.workouts).flatMap(w => records(w.items)), ...cardioItems];
  entries.forEach(item => {
    if (customIds.has(item.exId)) item.exId = customIds.get(item.exId);
  });

  // History entries only store exercise names, so nothing points into them
  records(next.history).forEach(entry => {
    renew(entry, "id");
    // Each exercise inside gets its own id too, worked out from the session's id and its place in
    // the list. This runs here (and is saved) before anything is ever sent to the cloud, so a
    // retried upload can never create the same row twice.
    records(entry.items).forEach((item, position) => {
      if (isUuid(item.id)) return;
      item.id = stableId(`${entry.id}:${position}`);
      changed = true;
    });
  });

  if (!(next.schemaVersion >= SCHEMA_VERSION)) {
    next.schemaVersion = SCHEMA_VERSION;
    changed = true;
  }
  return { state: next, changed };
}

/* ---------- Backup file (export / import) ----------
   A backup is your saved data wrapped in a small label, so we can tell
   it's ours and which format it's in. hintsSeen is left out: it only
   records which swipe hints this device has already shown. */

const BACKUP_APP = "workout-logbook";
const BACKUP_VERSION = 1; // the file format (not the data's own version)

function buildExport(state, now = new Date()) {
  const copy = JSON.parse(JSON.stringify(state));
  delete copy.hintsSeen;
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), state: copy };
}

// workout-logbook-2026-11-12.json (local date)
function exportFileName(now = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${BACKUP_APP}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

// Checks a chosen file's text. Returns { ok: true, state } (cleaned like saved data) or { ok: false, error }.
// parseSavedState alone isn't enough here: it turns anything unreadable into a fresh empty state,
// and for an import that would quietly wipe your data.
function parseImport(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  if (!isRecord(file) || file.app !== BACKUP_APP) return { ok: false, error: "That isn't a Workout Logbook backup." };
  if (!Number.isInteger(file.version) || file.version < 1) return { ok: false, error: "That backup has no readable version." };
  if (file.version > BACKUP_VERSION) return { ok: false, error: "That backup is from a newer version of the app." };
  if (!isRecord(file.state) || records(file.state.workouts).length === 0) {
    return { ok: false, error: "That backup has no workouts in it." };
  }
  const state = parseSavedState(JSON.stringify(file.state));
  delete state.hintsSeen;
  return { ok: true, state };
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
      id: makeId(),
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
function cardioSummaryParts(item, settings = DEFAULT_SETTINGS) {
  const positive = value => Number.isFinite(Number(value)) && Number(value) > 0; // blank, 0, negative and nonsense are all "not filled in"
  const parts = [];
  const seconds = item.durationSec ?? (positive(item.duration) ? item.duration * 60 : ""); // older entries had minutes
  if (positive(seconds)) parts.push(formatDuration(seconds, settings.durationFormat));
  if (String(item.intensity ?? "").trim() !== "") parts.push(`${item.intensity} intensity`);
  if (positive(item.heartRate)) parts.push(`${item.heartRate} bpm`);
  if (positive(item.calories)) parts.push(`${item.calories} cal`);
  if (positive(item.distance)) parts.push(`${showDistance(item.distance, settings.units)} ${unitLabels(settings.units).distance}`);
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
// style "clock" gives "1:05:30", or "5:30" / "0:45" under an hour.
function formatDuration(sec, style = "words") {
  const { h, m, s } = splitDuration(sec);
  if (h === "") return "";
  if (style === "clock") {
    const two = n => String(n).padStart(2, "0");
    return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
  }
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
      id: makeId(),
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

/* ---------- Gliding across the tab bar ---------- */

/*
  Which tab is under the finger while sliding along the tab bar?
  boxes = each tab's { left, right }; bar = the bar's { top, bottom }.
  Sideways, a finger past either end counts as the first/last tab.
  If it's dragged too far above or below the bar (more than `slack` px) it's
  not on any tab, so letting go there cancels. Returns the tab's index, or -1.
*/
function glideTabIndex(x, y, bar, boxes, slack = 60) {
  if (!boxes.length) return -1;
  if (y < bar.top - slack || y > bar.bottom + slack) return -1;
  let best = 0;
  let bestDistance = Infinity;
  boxes.forEach((box, i) => {
    const distance = x < box.left ? box.left - x : x > box.right ? x - box.right : 0;
    if (distance < bestDistance) { best = i; bestDistance = distance; }
  });
  return best;
}

/*
  How much the glide circle stretches sideways for a given finger speed (px per ms).
  1 = round (at rest). Below the dead zone (a slow slide, or a finger jittering while
  held) it stays exactly 1. Above it, it rises smoothly and levels off at `max`, never past it.
*/
const STRETCH_DEAD_ZONE = 0.3;    // px/ms under which there is no stretch at all
const STRETCH_SPEED_SCALE = 1.5;  // px/ms past the dead zone for ~63% of the way to max (tune by feel)
function stretchForSpeed(pxPerMs, max = 1.5) {
  if (!(pxPerMs > STRETCH_DEAD_ZONE)) return 1; // also catches NaN and negatives
  return 1 + (max - 1) * (1 - Math.exp(-(pxPerMs - STRETCH_DEAD_ZONE) / STRETCH_SPEED_SCALE));
}

/* ---------- History order ---------- */

// Newest session first. Returns a new list; sessions with unreadable dates go last.
function sortSessionsNewestFirst(sessions) {
  const time = s => { const t = new Date(s && s.date).getTime(); return Number.isNaN(t) ? -Infinity : t; };
  return sessions.map((s, i) => ({ s, i, t: time(s) }))
    .sort((a, b) => (b.t === a.t ? a.i - b.i : b.t > a.t ? 1 : -1))
    .map(x => x.s);
}

/* ---------- History: grouping and search ---------- */

// The local year and month (0-11) of a session, or null if its date can't be read
function sessionMonth(session) {
  const date = new Date(session && session.date);
  return Number.isNaN(date.getTime()) ? null : { year: date.getFullYear(), month: date.getMonth() };
}

// Groups sessions (already newest first) by month: [{ key: "2026-11", year, month, sessions }].
// Sessions with an unreadable date go in a final { key: "unknown" } group.
function groupSessionsByMonth(sessions) {
  const groups = [];
  const byKey = new Map();
  for (const session of sessions) {
    const when = sessionMonth(session);
    const key = when ? `${when.year}-${String(when.month + 1).padStart(2, "0")}` : "unknown";
    if (!byKey.has(key)) {
      const group = { key, year: when ? when.year : null, month: when ? when.month : null, sessions: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).sessions.push(session);
  }
  return groups.filter(g => g.key !== "unknown").concat(groups.filter(g => g.key === "unknown"));
}

// Groups month groups by year: [{ year, months, count }]. The unknown-date group stays alone at the end (year: null).
function groupMonthsByYear(months) {
  const years = [];
  for (const month of months) {
    let entry = years.find(y => y.year === month.year);
    if (!entry) { entry = { year: month.year, months: [], count: 0 }; years.push(entry); }
    entry.months.push(month);
    entry.count += month.sessions.length;
  }
  return years;
}

// What you typed in the History search box -> lowercase words (extra spaces ignored)
function searchWords(query) {
  return String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
}

// A session matches when every word is somewhere in its workout name, an exercise name, or a note
function sessionMatches(session, query) {
  const words = searchWords(query);
  if (!words.length) return true;
  const text = [session.workoutName, ...(session.items || []).flatMap(i => [i.name, i.notes])]
    .filter(part => typeof part === "string").join("\n").toLowerCase();
  return words.every(word => text.includes(word));
}

// The sessions that match, in the same order
function searchSessions(sessions, query) {
  return sessions.filter(session => sessionMatches(session, query));
}

// Safe HTML for some text, with every search word wrapped in <mark>
function highlightText(text, words) {
  const raw = String(text ?? "");
  if (!words || !words.length) return escapeHtml(raw);
  const pattern = [...words].sort((a, b) => b.length - a.length)
    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return raw.split(new RegExp(`(${pattern})`, "gi"))
    .map((part, i) => (i % 2 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part))).join("");
}

/* ---------- Cloud sync: your data as table rows ----------
   The cloud stores your data in tables (see supabase/schema.sql), one row per workout,
   exercise card, session and so on. These pure functions turn your saved data into those
   rows and back, and work out what changed since the last sync. They never touch the
   network, which is what lets them be tested. Left out on purpose (they stay on each
   device): theme, collapsed headings and swipe hints. */

const SYNC_TABLES = ["workouts", "custom_exercises", "workout_items", "cardio_items", "sessions", "session_items", "user_settings"];
const SYNC_COLUMNS = {
  workouts: ["id", "name", "position"],
  custom_exercises: ["id", "name", "equipment", "primary_muscles", "secondary_muscles", "category"],
  workout_items: ["id", "workout_id", "ex_id", "sets", "reps", "weight", "notes", "done_at", "position"],
  cardio_items: ["id", "ex_id", "duration_sec", "intensity", "heart_rate", "calories", "distance", "notes", "done_at", "position"],
  sessions: ["id", "performed_at", "kind", "workout_name"],
  session_items: ["id", "session_id", "name", "sets", "reps", "weight", "duration_sec", "intensity", "heart_rate", "calories", "distance", "notes", "done", "position"],
  user_settings: ["id", "units", "duration_format", "active_workout_id"]
};
const SYNC_NUMBER_COLUMNS = ["position", "sets", "reps", "weight", "duration_sec", "heart_rate", "calories", "distance"];
const SYNC_TIME_COLUMNS = ["done_at", "performed_at"];
const SYNC_LIST_COLUMNS = ["primary_muscles", "secondary_muscles"];
const SYNC_SETTINGS_ID = "settings"; // user_settings has one row per person; this is its key in the snapshot

// "" or missing -> null, otherwise the number (null if it isn't one)
const syncNumber = value => {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
// A time in milliseconds (how a crossed-off exercise remembers when) -> an ISO date, or null
const syncTime = ms => {
  const n = typeof ms === "number" || typeof ms === "string" ? Number(ms) : NaN;
  return Number.isFinite(n) && !Number.isNaN(new Date(n).getTime()) ? new Date(n).toISOString() : null;
};
const syncText = value => (typeof value === "string" ? value : "");
const syncIntensity = value => (INTENSITIES.includes(value) ? value : null);
// A number from the cloud -> the text the app stores ("" when empty)
const syncStored = value => (value === null || value === undefined ? "" : String(value));

// Your data -> { tableName: [rows] }. Anything without a proper id is left out (it can't be synced).
function stateToRows(state) {
  const rows = Object.fromEntries(SYNC_TABLES.map(table => [table, []]));

  records(state.workouts).forEach((workout, position) => {
    if (!isUuid(workout.id)) return;
    rows.workouts.push({ id: workout.id, name: syncText(workout.name), position });
    records(workout.items).forEach((item, itemPosition) => {
      if (!isUuid(item.uid)) return;
      rows.workout_items.push({
        id: item.uid, workout_id: workout.id, ex_id: syncText(item.exId),
        sets: syncNumber(item.sets), reps: syncNumber(item.reps), weight: syncNumber(item.weight),
        notes: syncText(item.notes), done_at: syncTime(item.doneAt), position: itemPosition
      });
    });
  });

  records(state.customExercises).forEach(ex => {
    if (!isUuid(ex.id)) return;
    rows.custom_exercises.push({
      id: ex.id, name: syncText(ex.name), equipment: syncText(ex.equipment),
      primary_muscles: Array.isArray(ex.primaryMuscles) ? ex.primaryMuscles.filter(m => typeof m === "string") : [],
      secondary_muscles: Array.isArray(ex.secondaryMuscles) ? ex.secondaryMuscles.filter(m => typeof m === "string") : [],
      category: ex.category === "cardio" ? "cardio" : null
    });
  });

  const cardio = isRecord(state.cardio) ? state.cardio : {};
  records(cardio.items).forEach((item, position) => {
    if (!isUuid(item.uid)) return;
    rows.cardio_items.push({
      id: item.uid, ex_id: syncText(item.exId), duration_sec: syncNumber(item.durationSec),
      intensity: syncIntensity(item.intensity), heart_rate: syncNumber(item.heartRate),
      calories: syncNumber(item.calories), distance: syncNumber(item.distance),
      notes: syncText(item.notes), done_at: syncTime(item.doneAt), position
    });
  });

  records(state.history).forEach(entry => {
    if (!isUuid(entry.id)) return;
    const kind = isCardioSession(entry) ? "cardio" : "workout";
    rows.sessions.push({ id: entry.id, performed_at: syncTime(Date.parse(entry.date)), kind, workout_name: syncText(entry.workoutName) });
    records(entry.items).forEach((item, position) => {
      if (!isUuid(item.id)) return;
      const cardioItem = kind === "cardio";
      rows.session_items.push({
        id: item.id, session_id: entry.id, name: syncText(item.name),
        sets: cardioItem ? null : syncNumber(item.sets), reps: cardioItem ? null : syncNumber(item.reps),
        weight: cardioItem ? null : syncNumber(item.weight),
        duration_sec: cardioItem ? syncNumber(item.durationSec) : null,
        intensity: cardioItem ? syncIntensity(item.intensity) : null,
        heart_rate: cardioItem ? syncNumber(item.heartRate) : null,
        calories: cardioItem ? syncNumber(item.calories) : null,
        distance: cardioItem ? syncNumber(item.distance) : null,
        notes: syncText(item.notes), done: Boolean(item.done), position
      });
    });
  });

  const settings = cleanSettings(state.settings);
  rows.user_settings.push({
    id: SYNC_SETTINGS_ID, units: settings.units, duration_format: settings.durationFormat,
    active_workout_id: isUuid(state.activeWorkoutId) ? state.activeWorkoutId : null
  });
  return rows;
}

// A short fingerprint of some text (cyrb53), so a snapshot can stay small
function hashText(text) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// The fingerprint of one row. Rows are always built by stateToRows or cleanRemoteRow, so their keys
// come in a fixed order and the same content always gives the same fingerprint.
const rowHash = row => hashText(JSON.stringify(row));

// A row from the cloud, tidied to look exactly like one stateToRows makes (numbers as numbers, dates in one format)
function cleanRemoteRow(table, remote) {
  const row = {};
  SYNC_COLUMNS[table].forEach(column => {
    let value = table === "user_settings" && column === "id" ? SYNC_SETTINGS_ID : remote[column];
    if (value === undefined) value = null;
    if (SYNC_NUMBER_COLUMNS.includes(column)) value = syncNumber(value);
    else if (SYNC_TIME_COLUMNS.includes(column)) value = value === null ? null : syncTime(Date.parse(value));
    else if (SYNC_LIST_COLUMNS.includes(column)) value = Array.isArray(value) ? value : [];
    else if (column === "notes" || column === "equipment") value = syncText(value);
    else if (column === "done") value = Boolean(value);
    row[column] = value;
  });
  return row;
}

// What needs sending. snapshot = { table: { id: fingerprint } } as of the last successful sync.
// A row whose fingerprint is "!" + its current one was refused by the cloud before; it isn't retried until it changes.
// Returns { upserts: {table: [rows]}, deletes: {table: [ids]}, hashes: {table: {id: fingerprint}} }.
function diffRows(rows, snapshot = {}) {
  const upserts = {}, deletes = {}, hashes = {};
  SYNC_TABLES.forEach(table => {
    const before = isRecord(snapshot[table]) ? snapshot[table] : {};
    upserts[table] = [];
    deletes[table] = [];
    hashes[table] = {};
    rows[table].forEach(row => {
      const hash = rowHash(row);
      hashes[table][row.id] = hash;
      if (before[row.id] !== hash && before[row.id] !== "!" + hash) upserts[table].push(row);
    });
    if (table !== "user_settings") {
      Object.keys(before).forEach(id => { if (!(id in hashes[table])) deletes[table].push(id); });
    }
  });
  return { upserts, deletes, hashes };
}

// Your data with rows from the cloud folded in.
// remote = { table: [rows from the cloud, oldest change first] }; a row with deleted_at set means "deleted".
// A row you changed since the last sync (dirty) is never overwritten: yours wins and gets sent on the next sync.
// Returns { state, snapshot } as new objects; the ones passed in are not touched.
function applyRows(state, remote, snapshot = {}) {
  const local = stateToRows(state);
  const nextSnapshot = JSON.parse(JSON.stringify(isRecord(snapshot) ? snapshot : {}));
  const maps = {}, localHash = {};
  SYNC_TABLES.forEach(table => {
    maps[table] = new Map(local[table].map(row => [row.id, row]));
    localHash[table] = new Map(local[table].map(row => [row.id, rowHash(row)]));
    nextSnapshot[table] = isRecord(nextSnapshot[table]) ? nextSnapshot[table] : {};
  });
  const isDirty = (table, id) => localHash[table].get(id) !== nextSnapshot[table][id];

  SYNC_TABLES.forEach(table => {
    (Array.isArray(remote[table]) ? remote[table] : []).forEach(raw => {
      if (!isRecord(raw)) return;
      const row = cleanRemoteRow(table, raw);
      const id = row.id;
      if (typeof id !== "string") return;
      const has = maps[table].has(id);
      if (raw.deleted_at) {
        if (has && isDirty(table, id)) return; // edited since: keep it, it will be sent again
        maps[table].delete(id);
        delete nextSnapshot[table][id];
        return;
      }
      if (has && isDirty(table, id)) return;
      const hash = rowHash(row);
      nextSnapshot[table][id] = hash;
      if (!has || localHash[table].get(id) !== hash) maps[table].set(id, row);
    });
  });

  // Things inside a workout or session that is gone go with it
  const workoutIds = new Set(maps.workouts.keys());
  const sessionIds = new Set(maps.sessions.keys());
  for (const [id, row] of maps.workout_items) if (!workoutIds.has(row.workout_id)) { maps.workout_items.delete(id); delete nextSnapshot.workout_items[id]; }
  for (const [id, row] of maps.session_items) if (!sessionIds.has(row.session_id)) { maps.session_items.delete(id); delete nextSnapshot.session_items[id]; }

  return { state: rowsToState(state, maps), snapshot: nextSnapshot };
}

// Builds your data back from rows (kept in lists by id). Everything the cloud doesn't hold (theme, collapsed headings, hints) is kept from `state`.
function rowsToState(state, maps) {
  const byPosition = (a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const group = (table, key) => {
    const groups = new Map();
    [...maps[table].values()].sort(byPosition).forEach(row => {
      if (!groups.has(row[key])) groups.set(row[key], []);
      groups.get(row[key]).push(row);
    });
    return groups;
  };
  const withDone = (item, row) => { if (row.done_at) item.doneAt = Date.parse(row.done_at); return item; };

  const itemsOf = group("workout_items", "workout_id");
  const workouts = [...maps.workouts.values()].sort(byPosition).map(row => ({
    id: row.id, name: row.name,
    items: (itemsOf.get(row.id) || []).map(item => withDone({
      uid: item.id, exId: item.ex_id, sets: syncStored(item.sets), reps: syncStored(item.reps),
      weight: syncStored(item.weight), notes: item.notes
    }, item))
  }));
  if (workouts.length === 0) workouts.push({ id: makeId(), name: DEFAULT_WORKOUT_NAME, items: [] }); // there is always at least one

  const cardioItems = [...maps.cardio_items.values()].sort(byPosition).map(row => withDone({
    uid: row.id, exId: row.ex_id, durationSec: row.duration_sec === null ? "" : row.duration_sec,
    intensity: row.intensity || "", heartRate: syncStored(row.heart_rate), calories: syncStored(row.calories),
    distance: syncStored(row.distance), notes: row.notes
  }, row));

  const sessionItemsOf = group("session_items", "session_id");
  const history = [...maps.sessions.values()]
    .sort((a, b) => (a.performed_at < b.performed_at ? 1 : a.performed_at > b.performed_at ? -1 : a.id < b.id ? -1 : 1))
    .map(row => {
      const cardio = row.kind === "cardio";
      const entry = { id: row.id, date: row.performed_at, workoutName: row.workout_name };
      if (cardio) entry.type = "cardio";
      entry.items = (sessionItemsOf.get(row.id) || []).map(item => (cardio
        ? { id: item.id, name: item.name, durationSec: item.duration_sec === null ? "" : item.duration_sec,
            intensity: item.intensity || "", heartRate: syncStored(item.heart_rate), calories: syncStored(item.calories),
            distance: syncStored(item.distance), notes: item.notes, done: item.done }
        : { id: item.id, name: item.name, sets: syncStored(item.sets), reps: syncStored(item.reps),
            weight: syncStored(item.weight), notes: item.notes, done: item.done }));
      return entry;
    });

  // Custom exercises have no position: yours stay in the order you have them, new ones go on the end
  const customExercises = [...maps.custom_exercises.values()].map(row => {
    const ex = { id: row.id, name: row.name, equipment: row.equipment, primaryMuscles: row.primary_muscles, secondaryMuscles: row.secondary_muscles };
    if (row.category === "cardio") ex.category = "cardio";
    ex.custom = true;
    return ex;
  });

  const settingsRow = maps.user_settings.get(SYNC_SETTINGS_ID);
  const next = JSON.parse(JSON.stringify(state));
  next.workouts = workouts;
  next.customExercises = customExercises;
  next.cardio = { ...(isRecord(next.cardio) ? next.cardio : {}), items: cardioItems };
  next.history = history;
  if (settingsRow) {
    next.settings = cleanSettings({ units: settingsRow.units, durationFormat: settingsRow.duration_format });
    if (workouts.some(w => w.id === settingsRow.active_workout_id)) next.activeWorkoutId = settingsRow.active_workout_id;
  }
  if (!workouts.some(w => w.id === next.activeWorkoutId)) next.activeWorkoutId = workouts[0].id;
  return next;
}

/* ---------- Cloud sync: signing in on a device that already has data ----------
   When you sign in with an email that already has an account, this device may hold its own
   data and the account holds its own. These pure functions decide what is on each side and
   combine them. Rows are matched by id (ids are random UUIDs made on each device, so two
   devices almost never share one); where both sides have the same id, the account's
   version wins. */

// Is this just the blank starting state (one empty default workout, nothing logged)? Then there is nothing to ask about.
function isUntouchedState(state) {
  const workouts = records(state.workouts);
  const cardio = isRecord(state.cardio) ? records(state.cardio.items) : [];
  return workouts.length <= 1
    && workouts.every(w => w.name === DEFAULT_WORKOUT_NAME && records(w.items).length === 0)
    && records(state.customExercises).length === 0
    && cardio.length === 0
    && records(state.history).length === 0;
}

// How much is in a set of rows from the cloud (rows marked deleted don't count)
function countRemoteRows(remote) {
  const live = table => (Array.isArray(remote[table]) ? remote[table] : []).filter(r => isRecord(r) && !r.deleted_at);
  return { workouts: live("workouts").length, sessions: live("sessions").length, customExercises: live("custom_exercises").length };
}

// Combines this device's data with the account's rows. Returns { state, snapshot } as new objects.
// keepLocal = false gives the account's data only (this device's own is dropped, except its theme and other device-only settings).
// The snapshot says "these rows are already in the cloud", so whatever exists only here is sent on the next sync.
function mergeStates(local, remote, keepLocal = true) {
  let base;
  if (keepLocal) {
    base = JSON.parse(JSON.stringify(local));
  } else {
    base = defaultState();
    ["theme", "collapsed", "hintsSeen"].forEach(key => { if (local[key] !== undefined) base[key] = JSON.parse(JSON.stringify(local[key])); });
  }
  // The blank default workout isn't worth keeping next to real ones
  if (countRemoteRows(remote).workouts > 0) {
    base.workouts = records(base.workouts).filter(w => !(w.name === DEFAULT_WORKOUT_NAME && records(w.items).length === 0));
  }
  // Pretend this device's copy of every shared row is already up to date, so the account's version replaces it
  const localRows = stateToRows(base);
  const seed = {};
  SYNC_TABLES.forEach(table => {
    const here = new Map(localRows[table].map(row => [row.id, rowHash(row)]));
    seed[table] = {};
    (Array.isArray(remote[table]) ? remote[table] : []).forEach(raw => {
      const id = table === "user_settings" ? SYNC_SETTINGS_ID : (isRecord(raw) ? raw.id : undefined);
      if (here.has(id)) seed[table][id] = here.get(id);
    });
  });
  const result = applyRows(base, remote, seed);

  // Lists keep the account's order, with what only exists here added on the end (so the account's rows keep their places)
  const inAccount = table => new Set((Array.isArray(remote[table]) ? remote[table] : []).filter(r => isRecord(r) && !r.deleted_at).map(r => r.id));
  const accountFirst = (list, ids, idOf) => [...list.filter(x => ids.has(idOf(x))), ...list.filter(x => !ids.has(idOf(x)))];
  const workoutIds = inAccount("workouts"), itemIds = inAccount("workout_items"), cardioIds = inAccount("cardio_items");
  result.state.workouts = accountFirst(result.state.workouts, workoutIds, w => w.id);
  result.state.workouts.forEach(w => { w.items = accountFirst(w.items, itemIds, i => i.uid); });
  result.state.cardio.items = accountFirst(result.state.cardio.items, cardioIds, i => i.uid);
  return result;
}

// Lets the tests load these functions. The browser skips this line.
if (typeof module !== "undefined") {
  module.exports = {
    DEFAULT_SETS, DEFAULT_REPS, makeId, defaultState, newItem, plural, escapeHtml, capitalize,
    SCHEMA_VERSION, isUuid, stableId, migrateState,
    parseSavedState, findActiveWorkout, hasExercise, findExercise, buildHistoryEntry, clearCrossOffsFromOtherDays,
    WHOLE_FIELDS, DECIMAL_FIELDS, sanitizeWhole, sanitizeMinSec, sanitizeDecimal, savedDecimal, cleanNumbers,
    exerciseMatches, isCardio,
    newCardioItem, INTENSITIES, cardioSummaryParts, joinDuration, splitDuration, formatDuration, buildCardioHistoryEntry, isCardioSession,
    editDistance, suggestSearch, glideTabIndex,
    stretchForSpeed, sortSessionsNewestFirst, cleanCollapsed, COLLAPSE_KEYS,
    groupSessionsByMonth, groupMonthsByYear, searchWords, sessionMatches, searchSessions, highlightText,
    moveTodoItem, DEFAULT_SETTINGS, cleanSettings, unitLabels, showWeight, showDistance, storeWeight, storeDistance,
    BACKUP_APP, BACKUP_VERSION, buildExport, exportFileName, parseImport,
    SYNC_TABLES, stateToRows, rowHash, diffRows, applyRows, cleanRemoteRow,
    isUntouchedState, countRemoteRows, mergeStates
  };
}
