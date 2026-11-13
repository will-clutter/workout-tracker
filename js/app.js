/* ============================================================
   app.js — Workout Logbook
   Everything the app does lives in this file. It's split into
   sections with big comment headers so it's easy to find things.

   The big idea:
   1. All your data lives in one object, `store.state` (see store.js).
   2. Whenever something changes, we update `store.state`, save it,
      and re-draw the part of the screen that changed.
   ============================================================ */

import {
  STORAGE_KEY, THUMB_DIR, PHOTO_DIR, RESULTS_PAGE_SIZE,
  store, loadState, saveState, units, activeWorkout,
  LISTS, listForCard, isInList, getExercise,
  $, prefersReducedMotion, ICONS
} from "./store.js";
import { showToast } from "./ui/toast.js";
import { enableSwipe, SWIPE_THRESHOLD, hintCrossOff, hintAdd } from "./ui/swipe.js";
import { openSheet, closeSheet, setupSheets } from "./ui/sheets.js";
import { showForm, confirmDialog } from "./ui/forms.js";
import { renderThemeSwatches, renderSettingPicks, setupThemes } from "./themes.js";
import { setupTabs } from "./tabs.js";
import { logSession, renderHistory, setupHistory } from "./history.js";
import { openDetail } from "./details.js";
import { setupCustomExercises } from "./custom-exercises.js";
import { renameWorkout, setupWorkouts } from "./workouts.js";
import { setupReorder } from "./reorder.js";
import { renderWorkout, clearOldCrossOffs, setupWorkout } from "./workout.js";
import { filters, renderResults, setupBrowser, setupBrowserEvents } from "./browser.js";
import { renderCardio, cardioSummaryHtml, renderCardioResults, logCardio, setupCardio } from "./cardio.js";

store.state = loadState();

setupReorder();
setupWorkout();

setupCardio();

setupHistory();

setupTabs();

setupSheets();

setupBrowserEvents();

setupCustomExercises();

setupWorkouts();

setupThemes();

/* ============================================================
   BACKUP (export / import your data as a file)
   The file format and checks are in logic.js (buildExport, parseImport).
   ============================================================ */

const PREIMPORT_KEY = STORAGE_KEY + "-preimport"; // safety copy of what was here before an import

// Swap in new data. Everything else (saving, redrawing) is up to the caller.
function replaceState(newState) {
  store.state = newState;
}

function redrawEverything() {
  applyTheme(store.state.theme);
  renderWorkout();
  renderCardio();
  renderHistory();
  renderThemeSwatches();
  renderSettingPicks();
}

$("exportBtn").addEventListener("click", () => {
  const text = JSON.stringify(buildExport(store.state), null, 2);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = exportFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast("Backup saved");
});

$("importBtn").addEventListener("click", () => $("importFile").click());

$("importFile").addEventListener("change", async event => {
  const file = event.target.files[0];
  event.target.value = ""; // so choosing the same file again still fires
  if (!file) return;

  const result = parseImport(await file.text());
  if (!result.ok) return showToast(result.error);

  const incoming = result.state;
  const summary = `${plural(incoming.workouts.length, "workout")}, ${plural(incoming.history.length, "logged session")} and ${plural(incoming.customExercises.length, "custom exercise")}`;
  const ok = await confirmDialog("Replace all your data?", `${summary} from this file will replace everything on this device.`, "Replace");
  if (!ok) return;

  const before = store.state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) localStorage.setItem(PREIMPORT_KEY, raw);
  } catch (err) { /* storage blocked or full; the Undo below still works */ }

  incoming.hintsSeen = before.hintsSeen; // swipe hints are per device
  replaceState(incoming);
  saveState();
  redrawEverything();
  showToast("Imported your backup", "Undo", () => {
    replaceState(before);
    saveState();
    redrawEverything();
  });
});

/* ============================================================
   START THE APP
   ============================================================ */

async function start() {
  clearOldCrossOffs(); // a new day: uncross yesterday's exercises
  renderWorkout();
  renderCardio();
  renderHistory();
  try {
    const response = await fetch("data/exercises.json");
    store.database = await response.json();
    store.database.forEach(ex => { store.databaseById[ex.id] = ex; });
    setupBrowser();
    renderWorkout(); // re-draw now that exercise names/muscles are known
    renderCardio();
  } catch (err) {
    console.error(err);
    showToast("Couldn't load the exercise list");
  }
}

start();

// Offline support: sw.js caches the app so it opens without a connection.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err => console.warn("Service worker failed", err));
  });
}
