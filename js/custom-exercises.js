/* ============================================================
   CUSTOM EXERCISES
   ============================================================ */

import { $, store, saveState } from "./store.js";
import { showForm, confirmDialog } from "./ui/forms.js";
import { closeSheet } from "./ui/sheets.js";
import { filters, renderResults } from "./browser.js";
import { openDetail } from "./details.js";
import { renderCardio, renderCardioResults } from "./cardio.js";
import { renderWorkout } from "./workout.js";

export async function deleteCustomExercise(ex) {
  const ok = await confirmDialog(`Delete "${ex.name}"?`, "It will also be removed from any workouts.", "Delete");
  if (!ok) return;
  store.state.customExercises = store.state.customExercises.filter(e => e.id !== ex.id);
  [...store.state.workouts, store.state.cardio].forEach(w => { w.items = w.items.filter(i => i.exId !== ex.id); });
  saveState();
  closeSheet("detailSheet");
  renderResults();
  renderCardioResults();
  renderWorkout();
  renderCardio();
}

// Wires up the "Create your own exercise" button. Called once from app.js when the app starts.
export function setupCustomExercises() {
  $("customBtn").addEventListener("click", async () => {
    const result = await showForm({
      title: "Create your own exercise",
      submitLabel: "Create",
      fields: [{ name: "name", label: "Exercise name", value: filters.search ? capitalize(filters.search) : "" }],
      musclePicker: true
    });
    if (!result || !result.name) return;

    const ex = {
      id: "custom_" + makeId(),
      name: result.name,
      equipment: "",
      primaryMuscles: result.primary,
      secondaryMuscles: result.secondary,
      custom: true
    };
    store.state.customExercises.push(ex);
    saveState();
    renderResults();
    openDetail(ex.id);
  });
}
