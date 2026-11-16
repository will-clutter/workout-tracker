/* ============================================================
   BACKUP (export / import your data as a file)
   The file format and checks are in logic.js (buildExport, parseImport).
   ============================================================ */

import { $, store, saveState, STORAGE_KEY } from "./store.js";
import { showToast } from "./ui/toast.js";
import { confirmDialog } from "./ui/forms.js";
import { renderWorkout } from "./workout.js";
import { renderCardio } from "./cardio.js";
import { renderHistory } from "./history.js";
import { renderThemeSwatches, renderSettingPicks } from "./themes.js";

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

// Wires up the Export and Import buttons in Settings. Called once from main.js when the app starts.
export function setupBackup() {
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

    const incoming = migrateState(result.state).state; // an older backup still has short ids
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
}
