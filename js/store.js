/* ============================================================
   store.js: the app's shared data and small helpers
   Everything that more than one file needs lives here: the saved
   data (`store.state`), the exercise list, and handy shortcuts.
   ============================================================ */

import { showToast } from "./ui/toast.js";
import { summaryHtml, renderWorkout } from "./workout.js";
import { renderResults } from "./browser.js";
import { cardioSummaryHtml, renderCardio, renderCardioResults } from "./cardio.js";

export const STORAGE_KEY = "workout-logbook-v1";
const PREMIGRATION_KEY = STORAGE_KEY + "-premigration"; // your data as it was before the UUID upgrade
// Exercise pictures are stored in the project (images/ folder), so ad blockers
// can't block them and they load fast. thumbs = small squares, photos = bigger.
export const THUMB_DIR = "images/thumbs/";
export const PHOTO_DIR = "images/photos/";
export const RESULTS_PAGE_SIZE = 10;
// DEFAULT_SETS and DEFAULT_REPS are in logic.js

/* ============================================================
   DATA
   ============================================================ */

// state = your data (this is what gets saved on your phone).
// database = the exercise list (filled in once data/exercises.json loads), databaseById = the same list by id.
// They all live on one object, because other files can't reassign an imported variable.
export const store = { state: null, database: [], databaseById: {} };

// Read saved data from the browser's storage (localStorage)
export function loadState() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    return defaultState(); // storage blocked
  }
  // Data saved before UUIDs gets upgraded here. Keep a copy of the original text first, and
  // never overwrite that copy. (If storage is full the upgrade just isn't saved yet; it simply
  // runs again next time, with the same data under new ids, which is harmless.)
  const { state, changed } = migrateState(parseSavedState(raw));
  if (changed && raw !== null) {
    try {
      if (localStorage.getItem(PREMIGRATION_KEY) === null) localStorage.setItem(PREMIGRATION_KEY, raw);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) { /* see above */ }
  }
  return state;
}

export function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.state));
  } catch (err) {
    showToast("Couldn't save. Is storage full or blocked?");
  }
}

// "imperial" or "metric" (weights and distances are always saved in lb / mi)
export function units() {
  return store.state.settings.units;
}

// The workout currently on screen
export function activeWorkout() {
  return findActiveWorkout(store.state);
}

/*
  The two lists of cards: your workout, and your cardio.
  Most of the card code (crossing off, removing, adding) works on either one,
  and looks up what's different here.
*/
export const LISTS = {
  workout: {
    name: "workout",
    holder: () => activeWorkout(),        // the thing with .items
    label: () => activeWorkout().name,     // "Add to ___"
    container: "cards",
    sheet: "browserSheet",
    newItem: ex => newItem(ex),
    summary: item => summaryHtml(item),
    render: () => renderWorkout(),
    renderPicker: () => renderResults(),
    done: "Workout complete"
  },
  cardio: {
    name: "cardio",
    holder: () => store.state.cardio,
    label: () => "Cardio",
    container: "cardioCards",
    sheet: "cardioSheet",
    newItem: ex => newCardioItem(ex),
    summary: item => cardioSummaryHtml(item),
    render: () => renderCardio(),
    renderPicker: () => renderCardioResults(),
    done: "Cardio complete"
  }
};

// Which list a card on screen is in
export function listForCard(card) {
  return card.closest("#cardioCards") ? LISTS.cardio : LISTS.workout;
}

export function isInList(list, exId) {
  return hasExercise(list.holder(), exId);
}

// Look up an exercise by id, in the database or your custom ones
export function getExercise(exId) {
  return findExercise(exId, store.databaseById, store.state.customExercises);
}

// makeId, defaultState, newItem, plural, escapeHtml and capitalize are in logic.js

// Shortcut for document.getElementById
export const $ = id => document.getElementById(id);

// Has the phone/computer asked for less animation? (an accessibility setting)
export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Small SVG icons (Font Awesome Free) used inside the app's HTML
export const ICONS = {
  note: `<svg class="icon inline" viewBox="0 0 448 512" role="img" aria-label="Has notes"><path d="M64 480c-35.3 0-64-28.7-64-64L0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 213.5c0 17-6.7 33.3-18.7 45.3L322.7 461.3c-12 12-28.3 18.7-45.3 18.7L64 480zM389.5 304L296 304c-13.3 0-24 10.7-24 24l0 93.5 117.5-117.5z"/></svg>`,
  grip: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/></svg>`,
  reorder: `<svg class="icon outline" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20V4M3 8l4-4 4 4"/><path d="M17 4v16M13 16l4 4 4-4"/></svg>`,
  trash: `<svg class="icon" viewBox="0 0 448 512" aria-hidden="true"><path d="M136.7 5.9L128 32 32 32C14.3 32 0 46.3 0 64S14.3 96 32 96l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0-8.7-26.1C306.9-7.2 294.7-16 280.9-16L167.1-16c-13.8 0-26 8.8-30.4 21.9zM416 144L32 144 53.1 467.1C54.7 492.4 75.7 512 101 512L347 512c25.3 0 46.3-19.6 47.9-44.9L416 144z"/></svg>`
};