/* ============================================================
   CARDIO TAB
   One list (no switcher). Works like the Workout tab, but each card
   has duration, intensity, heart rate, calories, distance and notes.
   Anything left empty isn't shown on the card or in History.
   ============================================================ */

import { $, store, saveState, units, getExercise, ICONS } from "./store.js";
import { showToast } from "./ui/toast.js";
import { openSheet } from "./ui/sheets.js";
import { showForm } from "./ui/forms.js";
import { hintCrossOff, hintAdd } from "./ui/swipe.js";
import { renderHistory } from "./history.js";
// TEMP: these move out of app.js in later steps
import { fillCardLists, openCards, thumbHtml, doneButtonHtml, resultRowHtml, openDetail } from "./app.js";

export function renderCardio() {
  const items = store.state.cardio.items;
  fillCardLists(items, buildCardioCard, {
    todo: "cardioList", done: "cardioCompletedList", todoLabel: "cardioLabel", doneHead: "cardioCompletedHead"
  });
  const empty = items.length === 0;
  $("cardioEmpty").classList.toggle("hidden", !empty);
  $("logCardioBtn").classList.toggle("hidden", empty);
  hintCrossOff();
}

// "1h 30m · High intensity · 145 bpm" with the numbers (or the intensity) in bold. Empty if nothing's filled in.
export function cardioSummaryHtml(item) {
  const bold = part => /\d/.test(part)
    ? part.replace(/(\d[\d.,:]*)/g, "<b>$1</b>")
    : part.replace(/^(\S+)/, "<b>$1</b>");
  const parts = cardioSummaryParts(item, store.state.settings).map(part => bold(escapeHtml(part)));
  if (item.notes) parts.push(ICONS.note);
  return parts.join(" · ");
}

// One number box on a cardio card
function cardioStatHtml(label, field, value, unit, inputmode = "decimal") {
  return `<div class="stat">
    <label>${label}</label>
    <div class="weight-wrap">
      <input type="text" inputmode="${inputmode}" autocomplete="off" placeholder="—" data-field="${field}" value="${escapeHtml(value)}">
      <span class="unit">${unit}</span>
    </div>
  </div>`;
}

// The Duration box: hours : minutes : seconds. Any of them can be left blank.
function durationStatHtml(durationSec) {
  const parts = splitDuration(durationSec);
  const box = (key, unit) => `<div class="dur-part">
      <input type="text" inputmode="numeric" autocomplete="off" placeholder="0" data-dur="${key}" value="${parts[key]}" aria-label="${unit}">
      <span class="unit">${unit}</span>
    </div>`;
  return `<div class="stat duration-stat">
    <label>Duration</label>
    <div class="dur-wrap">
      ${box("h", "hr")}<span class="dur-sep">:</span>${box("m", "min")}<span class="dur-sep">:</span>${box("s", "sec")}
    </div>
  </div>`;
}

// One cardio card
function buildCardioCard(item) {
  const exercise = getExercise(item.exId);
  const name = exercise ? exercise.name : "Unknown exercise";
  const isOpen = openCards.has(item.uid);
  const hasMuscles = exercise && (exercise.primaryMuscles.length || exercise.secondaryMuscles.length);

  const li = document.createElement("li");
  li.className = "card glass swipe " + (item.doneAt ? "done swipe-undo" : "swipe-done") + (isOpen ? " open" : "");
  li.dataset.uid = item.uid;
  li.innerHTML = `
    <button class="row" data-action="toggle" aria-expanded="${isOpen}">
      ${thumbHtml(exercise)}
      <span class="row-text">
        <div class="row-name"><span>${escapeHtml(name)}</span></div>
        <div class="row-summary">${cardioSummaryHtml(item)}</div>
      </span>
      ${hasMuscles ? `<span class="mini-map">${renderMiniMap(exercise.primaryMuscles, exercise.secondaryMuscles)}</span>` : ""}
    </button>

    <div class="editor"><div class="editor-inner"><div class="editor-content">
      <div class="stats cardio-stats">
        ${durationStatHtml(item.durationSec)}
        ${cardioStatHtml("Heart rate", "heartRate", item.heartRate, "bpm", "numeric")}
        ${cardioStatHtml("Calories", "calories", item.calories, "cal", "numeric")}
        ${cardioStatHtml("Distance", "distance", showDistance(item.distance, units()), unitLabels(units()).distance)}
      </div>
      <div class="intensity">
        <span class="intensity-label">Intensity</span>
        ${INTENSITIES.map(level => `<button type="button" class="chip ${item.intensity === level ? "on" : ""}" data-action="intensity" data-level="${level}" aria-pressed="${item.intensity === level}">${level}</button>`).join("")}
      </div>
      <textarea class="notes" data-field="notes" placeholder="Notes (e.g. intervals, incline 8)">${escapeHtml(item.notes)}</textarea>
      ${doneButtonHtml(item)}
      <div class="editor-actions">
        <button class="btn small" data-action="info">ⓘ More info</button>
        <button class="btn small danger" data-action="remove">Remove</button>
      </div>
    </div></div></div>
  `;
  return li;
}

export function logCardio() {
  store.state.history.unshift(buildCardioHistoryEntry(store.state.cardio.items, exId => getExercise(exId)?.name));
  saveState();
  renderHistory();
}

/* ---------- Picking cardio: the cardio exercises + your own ---------- */

export function renderCardioResults() {
  const options = [...store.state.customExercises, ...store.database].filter(isCardio);
  const added = new Set(store.state.cardio.items.map(i => i.exId));
  $("cardioResults").innerHTML = options.map(ex => resultRowHtml(ex, added.has(ex.id))).join("");
  hintAdd();
}

// Wires up the Cardio tab and its picker. Called once from app.js when the app starts.
export function setupCardio() {
  $("logCardioBtn").addEventListener("click", () => {
    logCardio();
    showToast("Logged cardio");
  });

  $("addCardioBtn").addEventListener("click", () => {
    openSheet("cardioSheet");
    renderCardioResults();
  });

  $("cardioResults").addEventListener("click", event => {
    const result = event.target.closest(".result");
    if (result) openDetail(result.dataset.id, { target: "cardio" });
  });

  $("customCardioBtn").addEventListener("click", async () => {
    const result = await showForm({
      title: "Create your own cardio",
      submitLabel: "Create",
      fields: [{ name: "name", label: "Name (e.g. Swimming, Hiking)", value: "" }]
    });
    if (!result || !result.name) return;

    const ex = {
      id: "custom_" + makeId(),
      name: result.name,
      equipment: "",
      primaryMuscles: [],
      secondaryMuscles: [],
      category: "cardio",
      custom: true
    };
    store.state.customExercises.push(ex);
    saveState();
    renderCardioResults();
    openDetail(ex.id, { target: "cardio" });
  });
}
