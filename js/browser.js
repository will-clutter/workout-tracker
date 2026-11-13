/* ============================================================
   EXERCISE BROWSER
   ============================================================ */

import { $, store, saveState, activeWorkout, getExercise, LISTS, isInList, RESULTS_PAGE_SIZE } from "./store.js";
import { showToast } from "./ui/toast.js";
import { openSheet } from "./ui/sheets.js";
import { enableSwipe, SWIPE_THRESHOLD, hintAdd } from "./ui/swipe.js";
import { openDetail } from "./details.js";
import { thumbHtml } from "./workout.js";

export const filters = { search: "", muscle: "", equipment: "" };
let resultsShown; // how many results are drawn; set in setupBrowserEvents()

export function setupBrowser() {
  // Muscle filter chips
  const chips = ["all", ...ALL_MUSCLES];
  $("muscleChips").innerHTML = chips.map(m =>
    `<button class="chip ${m === "all" ? "on" : ""}" data-muscle="${m === "all" ? "" : m}">${m}</button>`
  ).join("");

  // Equipment dropdown, built from whatever the database contains
  const equipment = [...new Set(store.database.filter(e => !isCardio(e)).map(e => e.equipment).filter(Boolean))].sort();
  $("equipmentSelect").innerHTML += equipment.map(e => `<option value="${e}">${e}</option>`).join("");
}

// A filter changed: go back to showing just the first page of results
function renderFirstPage() {
  resultsShown = RESULTS_PAGE_SIZE;
  renderResults();
}

// Does this exercise match the current filters?
// words = the search split into words; every one has to appear in the name.
function matchesFilters(ex, words) {
  return exerciseMatches(ex, filters, words);
}

export function renderResults() {
  const words = filters.search ? filters.search.split(/\s+/) : []; // split once, not once per exercise
  // Cardio lives in the Cardio tab, so it's left out of this search
  const pool = [...store.state.customExercises, ...store.database].filter(ex => !isCardio(ex));
  const matches = pool.filter(ex => matchesFilters(ex, words));
  const inWorkout = new Set(activeWorkout().items.map(i => i.exId));

  const header = matches.length
    ? `<li class="results-count">${plural(matches.length, "exercise")}</li>`
    : noResultsHtml(pool, words);

  $("resultsList").innerHTML = header + matches.slice(0, resultsShown).map(ex => resultRowHtml(ex, inWorkout.has(ex.id))).join("");

  $("moreResultsBtn").classList.toggle("hidden", matches.length <= resultsShown);
  hintAdd();
}

// Nothing found. If it looks like a typo, offer the corrected search
// (only if that search actually finds something with the current filters).
function noResultsHtml(pool, words) {
  const inFilters = pool.filter(ex => matchesFilters(ex, []));
  const suggestion = words.length ? suggestSearch(words, inFilters.map(ex => ex.name)) : null;
  if (suggestion && inFilters.some(ex => matchesFilters(ex, suggestion.split(" ")))) {
    return `<li class="empty">
      <p>No results for "${escapeHtml(filters.search)}".</p>
      <button class="suggest-btn" data-suggest="${escapeHtml(suggestion)}">Show results for "${escapeHtml(suggestion)}"?</button>
    </li>`;
  }
  return `<li class="empty"><p>No matches.</p><p class="muted">Try another word, or create your own exercise above.</p></li>`;
}

// One row in a list of exercises to add. added = it's already in the list.
export function resultRowHtml(ex, added) {
  const meta = [ex.primaryMuscles.join(", "), ex.equipment, ex.custom ? "custom" : ""].filter(Boolean).join(" · ");
  return `
    <li class="swipe swipe-add">
      <button class="result" data-id="${escapeHtml(ex.id)}">
        ${thumbHtml(ex, "small")}
        <span class="result-text">
          <div class="result-name">${escapeHtml(ex.name)}</div>
          <div class="result-meta">${escapeHtml(meta)}</div>
        </span>
        ${added ? IN_WORKOUT_DOT : `<span class="result-add">›</span>`}
      </button>
    </li>`;
}

// Shown on results that are already in the workout (or cardio)
const IN_WORKOUT_DOT = `<span class="result-dot" title="Already added"></span>`;

// Swipe a result right (at least a third of the way) to add it without opening it
function enableSwipeToAdd(resultsList, list) {
  enableSwipe(resultsList, "li.swipe", 1, SWIPE_THRESHOLD, row => {
    const result = row.querySelector(".result");
    const ex = getExercise(result.dataset.id);
    if (isInList(list, ex.id)) return showToast(`Already in ${list.label()}`);

    list.holder().items.push(list.newItem(ex)); // card starts closed, so quick adds don't pile up open
    saveState();
    list.render();
    result.querySelector(".result-add").outerHTML = IN_WORKOUT_DOT; // update just this row
    showToast(`Added ${ex.name}`);
  });
}

// Wires up the Add exercise sheet (search, filters, results). Called once from app.js when the app starts.
export function setupBrowserEvents() {
  resultsShown = RESULTS_PAGE_SIZE;

  $("addExerciseBtn").addEventListener("click", () => {
    openSheet("browserSheet");
    renderResults();
  });

  $("muscleChips").addEventListener("click", event => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    filters.muscle = chip.dataset.muscle;
    $("muscleChips").querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c === chip));
    renderFirstPage();
  });

  $("equipmentSelect").addEventListener("change", event => {
    filters.equipment = event.target.value;
    renderFirstPage();
  });

  $("searchInput").addEventListener("input", event => {
    filters.search = event.target.value.trim().toLowerCase();
    renderFirstPage();
  });

  $("moreResultsBtn").addEventListener("click", () => {
    resultsShown += RESULTS_PAGE_SIZE;
    renderResults();
  });

  $("resultsList").addEventListener("click", event => {
    const suggest = event.target.closest("[data-suggest]");
    if (suggest) {
      // Use the corrected search
      $("searchInput").value = suggest.dataset.suggest;
      filters.search = suggest.dataset.suggest;
      return renderFirstPage();
    }
    const result = event.target.closest(".result");
    if (result) openDetail(result.dataset.id);
  });

  enableSwipeToAdd($("resultsList"), LISTS.workout);
  enableSwipeToAdd($("cardioResults"), LISTS.cardio);
}
