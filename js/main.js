/* ============================================================
   main.js: Workout Logbook starts here
   The app is split into small files (see the Files table in README.md).
   This one loads your saved data, switches on each part of the app,
   and starts it.

   The big idea:
   1. All your data lives in one object, `store.state` (see store.js).
   2. Whenever something changes, we update `store.state`, save it,
      and re-draw the part of the screen that changed.
   ============================================================ */

import { store, loadState } from "./store.js";
import { showToast } from "./ui/toast.js";
import { setupSheets } from "./ui/sheets.js";
import { setupThemes } from "./themes.js";
import { setupTabs } from "./tabs.js";
import { renderHistory, setupHistory } from "./history.js";
import { setupCustomExercises } from "./custom-exercises.js";
import { setupWorkouts } from "./workouts.js";
import { setupReorder } from "./reorder.js";
import { renderWorkout, clearOldCrossOffs, setupWorkout } from "./workout.js";
import { setupBrowser, setupBrowserEvents } from "./browser.js";
import { renderCardio, setupCardio } from "./cardio.js";
import { setupBackup } from "./backup.js";
import { setupSync } from "./sync.js";
import { setupAccount } from "./account.js";

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
setupBackup();
setupSync();
setupAccount();

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
