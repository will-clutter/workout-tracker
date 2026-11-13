/* ============================================================
   EXERCISE DETAILS ("more info" + body map)
   ============================================================ */

import { $, store, saveState, getExercise, LISTS, isInList, PHOTO_DIR } from "./store.js";
import { showToast } from "./ui/toast.js";
import { openSheet, closeSheet } from "./ui/sheets.js";
import { deleteCustomExercise } from "./custom-exercises.js";
import { openCards, legendHtml } from "./workout.js";

// target = which list it would be added to ("workout" or "cardio").
// fromCard = opened from a card that's already in that list.
export function openDetail(exId, { target = "workout", fromCard = false } = {}) {
  const ex = getExercise(exId);
  if (!ex) return;
  const list = LISTS[target];
  const alreadyAdded = isInList(list, exId);
  const hasMuscles = ex.primaryMuscles.length || ex.secondaryMuscles.length;

  $("detailName").textContent = ex.name;

  const tags = [
    ...ex.primaryMuscles.map(m => `<span class="tag p">${escapeHtml(m)}</span>`),
    ...ex.secondaryMuscles.map(m => `<span class="tag s">${escapeHtml(m)}</span>`),
    ex.equipment ? `<span class="tag">${escapeHtml(ex.equipment)}</span>` : "",
    ex.level ? `<span class="tag">${escapeHtml(ex.level)}</span>` : ""
  ].join("");

  // ex.photos = how many photos it has (missing = none)
  const photos = Array.from({ length: ex.photos || 0 }, (_, i) =>
    `<img src="${PHOTO_DIR + encodeURIComponent(ex.id)}_${i}.webp" alt="${escapeHtml(ex.name)} demonstration" loading="lazy" onerror="this.remove()">`
  ).join("");

  let actionButton;
  if (fromCard) {
    actionButton = `<button class="btn ghost big" data-close>Back to ${list.name}</button>`;
  } else if (alreadyAdded) {
    actionButton = `<button class="btn big added" disabled>✓ Already in ${escapeHtml(list.label())}</button>`;
  } else {
    actionButton = `<button id="addToWorkoutBtn" class="btn primary big">＋ Add to ${escapeHtml(list.label())}</button>`;
  }

  $("detailBody").innerHTML = `
    <div class="detail-tags">${tags}</div>
    ${hasMuscles ? `<div class="map-panel glass">
      ${renderBodyMap(ex.primaryMuscles, ex.secondaryMuscles)}
      ${legendHtml()}
    </div>` : ""}
    ${photos ? `<div class="photos">${photos}</div>` : ""}
    <div id="detailSteps" data-id="${escapeHtml(ex.id)}"></div>
    ${ex.custom ? `<button class="btn danger small" id="deleteCustomBtn">Delete this custom exercise</button>` : ""}
    <div class="detail-actions">${actionButton}</div>
  `;

  // These buttons only exist sometimes; ?. skips the ones that aren't there
  $("addToWorkoutBtn")?.addEventListener("click", event => addToList(list, ex, event.currentTarget));
  $("detailBody").querySelector("[data-close]")?.addEventListener("click", () => closeSheet("detailSheet"));
  $("deleteCustomBtn")?.addEventListener("click", () => deleteCustomExercise(ex));

  openSheet("detailSheet");
  if (!ex.custom) showSteps(ex.id); // custom exercises have no instructions
}

/* ---------- Step-by-step instructions ----------
   These live in their own file (data/instructions.json) because they're
   most of the exercise data but only needed here. It's downloaded the
   first time you open an exercise's details, then kept in memory. */

let instructionsRequest = null;

function loadInstructions() {
  instructionsRequest ??= fetch("data/instructions.json")
    .then(response => response.json())
    .catch(err => { instructionsRequest = null; throw err; }); // let the next open try again
  return instructionsRequest;
}

async function showSteps(exId) {
  let steps;
  try {
    steps = (await loadInstructions())[exId];
  } catch (err) {
    console.error(err);
    return showToast("Couldn't load the instructions");
  }
  // Skip if it has no steps, or you've already opened a different exercise
  const box = $("detailSteps");
  if (!steps || box.dataset.id !== exId) return;
  box.innerHTML = `<details class="more-info glass"><summary>How to do it</summary>
    <ol>${steps.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ol></details>`;
}

function addToList(list, ex, button) {
  const item = list.newItem(ex);
  list.holder().items.push(item);
  openCards.add(item.uid); // open the new card so you can fill in weight right away
  saveState();

  // Button turns into a check mark, then the sheets close
  button.classList.remove("primary");
  button.classList.add("added");
  button.textContent = "✓ Added";
  button.disabled = true;

  setTimeout(() => {
    closeSheet("detailSheet");
    closeSheet(list.sheet);
    list.render();
    // Briefly glow the new card and scroll to it
    const card = document.querySelector(`.card[data-uid="${item.uid}"]`);
    if (card) {
      card.classList.add("flash");
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    showToast(`Added ${ex.name}`);
  }, 550);
}
