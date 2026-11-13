/* ============================================================
   WORKOUTS (switch / new / rename / delete)
   ============================================================ */

import { $, store, saveState, ICONS } from "./store.js";
import { showToast } from "./ui/toast.js";
import { openSheet, closeSheet } from "./ui/sheets.js";
import { showForm, confirmDialog } from "./ui/forms.js";
import { renderWorkout } from "./workout.js";

function renderWorkoutsList() {
  $("workoutsList").innerHTML = store.state.workouts.map(w => `
    <li class="${w.id === store.state.activeWorkoutId ? "current" : ""}" data-id="${w.id}">
      <button class="pick" data-action="pick">
        ${escapeHtml(w.name)}
        <small>${plural(w.items.length, "exercise")}</small>
      </button>
      <button class="icon-btn" data-action="rename" aria-label="Rename">✎</button>
      <button class="icon-btn" data-action="delete" aria-label="Delete">${ICONS.trash}</button>
    </li>`).join("");
}

export async function renameWorkout(workout) {
  const result = await showForm({
    title: "Rename workout",
    submitLabel: "Save",
    fields: [{ name: "name", label: "Workout name", value: workout.name }]
  });
  if (!result || !result.name) return;
  workout.name = result.name;
  saveState();
  renderWorkout();
}

// Wires up the workout switcher sheet. Called once from app.js when the app starts.
export function setupWorkouts() {
  $("workoutSwitcher").addEventListener("click", () => {
    renderWorkoutsList();
    openSheet("workoutsSheet");
  });

  $("workoutsList").addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const workout = store.state.workouts.find(w => w.id === button.closest("li").dataset.id);

    if (button.dataset.action === "pick") {
      store.state.activeWorkoutId = workout.id;
      saveState();
      renderWorkout();
      closeSheet("workoutsSheet");
    }
    if (button.dataset.action === "rename") {
      await renameWorkout(workout);
      renderWorkoutsList();
    }
    if (button.dataset.action === "delete") {
      if (store.state.workouts.length === 1) return showToast("You need at least one workout");
      const ok = await confirmDialog(`Delete "${workout.name}"?`, "Your logged history stays.", "Delete");
      if (!ok) return;
      store.state.workouts = store.state.workouts.filter(w => w.id !== workout.id);
      if (store.state.activeWorkoutId === workout.id) store.state.activeWorkoutId = store.state.workouts[0].id;
      saveState();
      renderWorkout();
      renderWorkoutsList();
    }
  });

  $("newWorkoutBtn").addEventListener("click", async () => {
    const result = await showForm({
      title: "New workout",
      submitLabel: "Create",
      fields: [{ name: "name", label: "Name (e.g. Upper, Lower, Push Day)", value: "" }]
    });
    if (!result || !result.name) return;
    const workout = { id: makeId(), name: result.name, items: [] };
    store.state.workouts.push(workout);
    store.state.activeWorkoutId = workout.id;
    saveState();
    renderWorkout();
    closeSheet("workoutsSheet");
    showToast(`Created ${workout.name}`);
  });
}
