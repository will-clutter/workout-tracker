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
import { filters, renderResults, setupBrowser, setupBrowserEvents } from "./browser.js";
import { renderCardio, cardioSummaryHtml, renderCardioResults, logCardio, setupCardio } from "./cardio.js";

store.state = loadState();

/* ============================================================
   WORKOUT TAB
   ============================================================ */

let reorderMode = false; // grips only show while the Reorder button is on (not saved)

// Grips are always on the cards; the "reordering" class on the list slides them in (CSS), so
// toggling the mode never redraws the cards.
function syncReorderUi() {
  $("exerciseList").classList.toggle("reordering", reorderMode);
  $("reorderBtn").classList.toggle("active", reorderMode);
  $("reorderBtn").setAttribute("aria-pressed", String(reorderMode));
}

export function renderWorkout() {
  const workout = activeWorkout();
  $("workoutName").textContent = workout.name;
  $("switcherName").textContent = workout.name;

  // Reorder button: only useful with 2+ still-to-do cards; leaving that state ends reorder mode
  const canReorderAny = workout.items.filter(i => !i.doneAt).length >= 2;
  if (!canReorderAny) reorderMode = false;
  $("reorderBtn").classList.toggle("hidden", !canReorderAny);
  syncReorderUi();

  fillCardLists(workout.items, buildExerciseCard, {
    todo: "exerciseList", done: "completedList", todoLabel: "exercisesLabel", doneHead: "completedHead"
  });

  // "Nothing here yet!" only when nothing's been added (not when it's all crossed off)
  const empty = workout.items.length === 0;
  $("emptyState").classList.toggle("hidden", !empty);
  ["logBtn", "summaryMap"].forEach(id => $(id).classList.toggle("hidden", empty));
  renderSummaryMap(workout);
  hintCrossOff();
}

// Still to do (in your order) on top; crossed off below, in the order you finished them.
// ids = the two lists, and the headings above them (hidden when their list is empty).
export function fillCardLists(items, buildCard, ids) {
  const todo = items.filter(i => !i.doneAt);
  const done = items.filter(i => i.doneAt).sort((a, b) => a.doneAt - b.doneAt);
  $(ids.todo).replaceChildren(...todo.map(buildCard));
  $(ids.done).replaceChildren(...done.map(buildCard));
  $(ids.todoLabel).classList.toggle("hidden", todo.length === 0);
  $(ids.doneHead).classList.toggle("hidden", done.length === 0);
  applyCollapsed();
}

// Fold or open each list to match the saved state, and keep the headings' aria-expanded in step
function applyCollapsed() {
  document.querySelectorAll(".collapse-toggle").forEach(button => {
    endFold($(button.dataset.list)); // a redraw (or finished fold) leaves no animation half-done
    const collapsed = Boolean(store.state.collapsed?.[button.dataset.key]);
    button.setAttribute("aria-expanded", String(!collapsed));
    $(button.dataset.list).classList.toggle("collapsed", collapsed);
  });
}

// The floating Add buttons grow to show their label while pressed (phones have no hover).
// Letting go still ends in a normal click, which opens the picker.
document.querySelectorAll(".fab").forEach(fab => {
  fab.addEventListener("pointerdown", () => fab.classList.add("pressed"));
  ["pointerup", "pointercancel", "pointerleave"].forEach(type =>
    fab.addEventListener(type, () => fab.classList.remove("pressed")));
});

// Tap a heading to fold its list away (remembered).
// Each list has one animation set: played forward = fold into a pile, backward = unravel.
// Tapping again mid-flight just reverses it from the current frame, so rapid taps never jump.
document.querySelectorAll(".collapse-toggle").forEach(button => {
  button.addEventListener("click", () => {
    store.state.collapsed = cleanCollapsed(store.state.collapsed);
    const key = button.dataset.key;
    store.state.collapsed[key] = !store.state.collapsed[key];
    saveState();
    button.setAttribute("aria-expanded", String(!store.state.collapsed[key]));
    const list = $(button.dataset.list);
    if (list._fold) return list._fold.forEach(a => a.reverse()); // changed its mind mid-animation

    const cards = [...list.querySelectorAll(".card")];
    if (prefersReducedMotion() || !cards.length) return applyCollapsed();
    if (!store.state.collapsed[key]) { // opening: show the list, then run the fold backwards from the pile
      list.classList.remove("collapsed");
      cards.forEach(card => card.classList.add("settled")); // no fade-in of their own
    }
    list._fold = buildFold(list, cards);
    list._fold.forEach(a => { if (store.state.collapsed[key]) a.play(); else { a.currentTime = FOLD_MS; a.reverse(); } });
  });
});

// The cards slide together into one pile (first card on top), then the pile melts and the list shrinks away
const FOLD_MS = 420, PILE_AT = 0.6;
function pileTransform(card, firstTop, i) {
  const rise = Math.min(i, 3);
  return `translateY(${firstTop - card.getBoundingClientRect().top + rise * 4}px) scale(${1 - rise * 0.02})`;
}
// Measures the fully open list and returns its paused animations (the list's own is last)
function buildFold(list, cards) {
  const firstTop = cards[0].getBoundingClientRect().top;
  const full = list.offsetHeight, one = cards[0].offsetHeight + 10;
  const timing = { duration: FOLD_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "both" };
  list.style.overflow = "hidden";
  const anims = cards.map((card, i) => {
    card.style.zIndex = cards.length - i;
    const pile = pileTransform(card, firstTop, i);
    return card.animate([
      { transform: "none", opacity: 1 },
      { transform: pile, opacity: 1, offset: PILE_AT },
      { transform: pile, opacity: 0 }
    ], timing);
  });
  const listAnim = list.animate([
    { height: `${full}px` },
    { height: `${one}px`, offset: PILE_AT },
    { height: "0px" }
  ], timing);
  anims.push(listAnim);
  anims.forEach(a => a.pause());
  listAnim.onfinish = () => { endFold(list); applyCollapsed(); }; // reached either end: settle on the saved state
  return anims;
}
// Drop any running fold and its temporary styles
function endFold(list) {
  if (!list._fold) return;
  list._fold.forEach(a => a.cancel());
  list._fold = null;
  list.style.overflow = "";
  list.querySelectorAll(".card").forEach(card => { card.style.zIndex = ""; });
}

// Same as list.render(), but cards glide from their old spot to their new one
// (e.g. down into Completed) instead of jumping there.
function renderAnimated(list) {
  const cards = () => [...$(list.container).querySelectorAll(".card")];
  const oldTops = new Map(cards().map(c => [c.dataset.uid, c.getBoundingClientRect().top]));
  list.render();
  if (prefersReducedMotion()) return;

  const moved = cards().filter(c => oldTops.has(c.dataset.uid));
  moved.forEach(card => card.classList.add("settled")); // already on screen, so skip the fade-in
  moved.forEach(card => {
    const distance = oldTops.get(card.dataset.uid) - card.getBoundingClientRect().top;
    if (distance) card.animate(
      [{ transform: `translateY(${distance}px)` }, { transform: "none" }],
      { duration: 450, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
    );
  });
}

/* ============================================================
   REORDER (drag a still-to-do card by its grip, or use the arrow keys on the grip)
   The saved order is just the order of workout.items (see moveTodoItem in logic.js).
   ============================================================ */

function announce(message) {
  $("liveStatus").textContent = message;
}

// Save a new place for a card (index among the still-to-do cards) and redraw with a glide
function reorderCard(uid, toIndex) {
  const workout = activeWorkout();
  const moved = moveTodoItem(workout.items, uid, toIndex);
  if (moved === workout.items) return false;
  workout.items = moved;
  saveState();
  renderAnimated(LISTS.workout);
  return true;
}

function enableReorder(listEl) {
  const OVERSHOOT = 60; // how far (px) a card may be dragged past the first / last card
  let drag = null;

  const cardsNow = () => [...listEl.querySelectorAll(".card")];
  const scroller = () => document.scrollingElement;

  // Move the dragged card with the finger and slide the others out of its way
  function update() {
    const { card, cards, index, rects, startY, startScroll, clientY, shift } = drag;
    // The card can travel the length of its list plus a little past each end (which also stops the page scrolling on forever)
    const rawDy = clientY - startY + (scroller().scrollTop - startScroll);
    const minDy = rects[0].top - rects[index].top, maxDy = rects.at(-1).bottom - rects[index].bottom;
    const dy = Math.max(minDy - OVERSHOOT, Math.min(maxDy + OVERSHOOT, rawDy));
    drag.pinned = rawDy < minDy - OVERSHOOT ? -1 : rawDy > maxDy + OVERSHOOT ? 1 : 0;
    card.style.transform = `translateY(${dy}px)`;
    const center = rects[index].mid + dy;
    // Reaching either end (or going past it) always means first / last, however tall the card is
    drag.target = dy >= maxDy ? rects.length - 1 : dy <= minDy ? 0 : rects.filter((r, i) => i !== index && r.mid < center).length;
    cards.forEach((other, i) => {
      if (i === index) return;
      const up = drag.target > index && i > index && i <= drag.target;
      const down = drag.target < index && i < index && i >= drag.target;
      other.style.transform = up ? `translateY(${-shift}px)` : down ? `translateY(${shift}px)` : "";
    });
  }

  // Near the top or bottom edge of the screen, keep scrolling while you hold the card there
  function autoScroll() {
    if (!drag) return;
    const edge = 90, bottomEdge = window.innerHeight - 120; // the tab bar is at the bottom
    const speed = drag.clientY < edge ? -(edge - drag.clientY) / 5 : drag.clientY > bottomEdge ? (drag.clientY - bottomEdge) / 5 : 0;
    if (speed && Math.sign(speed) !== drag.pinned) { scroller().scrollTop += speed; update(); } // not while the card is stuck at the list's end
    drag.raf = requestAnimationFrame(autoScroll);
  }

  const escapeToCancel = event => { if (event.key === "Escape") finish(false); };

  function finish(save) {
    if (!drag) return;
    const { card, cards, index, target, raf } = drag;
    drag = null;
    cancelAnimationFrame(raf);
    document.removeEventListener("keydown", escapeToCancel);
    if (save && target !== index) {
      const name = card.querySelector(".row-name").textContent;
      reorderCard(card.dataset.uid, target); // redraws from wherever everything is on screen right now
      announce(`Moved ${name} to position ${target + 1} of ${cards.length}`);
      return;
    }
    // Dropped where it started (or cancelled): everything slides back
    cards.forEach(c => { c.style.transform = ""; });
    setTimeout(() => cards.forEach(c => c.classList.remove("dragging", "shifting")), 250);
  }

  listEl.addEventListener("pointerdown", event => {
    const handle = event.target.closest(".drag-handle");
    if (!handle || event.button !== 0 || drag) return;
    event.preventDefault();
    const cards = cardsNow();
    const card = handle.closest(".card");
    const scrollTop = scroller().scrollTop;
    const rects = cards.map(c => {
      const r = c.getBoundingClientRect();
      return { top: r.top + scrollTop, bottom: r.bottom + scrollTop, mid: r.top + scrollTop + r.height / 2 };
    });
    const index = cards.indexOf(card);
    drag = {
      card, cards, index, rects, target: index, pointerId: event.pointerId,
      startY: event.clientY, clientY: event.clientY, startScroll: scrollTop,
      shift: card.getBoundingClientRect().height + 10 // the card's height plus the gap under it
    };
    // "settled" stops the entrance animation from overriding the move
    cards.forEach(c => c.classList.add("settled", c === card ? "dragging" : "shifting"));
    handle.setPointerCapture(event.pointerId);
    document.addEventListener("keydown", escapeToCancel);
    drag.raf = requestAnimationFrame(autoScroll);
  });
  listEl.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.clientY = event.clientY;
    update();
  });
  listEl.addEventListener("pointerup", event => { if (drag && event.pointerId === drag.pointerId) finish(true); });
  listEl.addEventListener("pointercancel", event => { if (drag && event.pointerId === drag.pointerId) finish(false); });

  // Keyboard: arrows on a focused grip move the card one place; Home / End jump to the ends
  listEl.addEventListener("keydown", event => {
    const handle = event.target.closest(".drag-handle");
    if (!handle) return;
    const cards = cardsNow();
    const card = handle.closest(".card");
    const index = cards.indexOf(card);
    const target = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: cards.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const clamped = Math.max(0, Math.min(cards.length - 1, target));
    const uid = card.dataset.uid;
    const name = card.querySelector(".row-name").textContent;
    if (clamped === index) return announce(`${name} is already ${index === 0 ? "first" : "last"}`);
    reorderCard(uid, clamped);
    listEl.querySelector(`.card[data-uid="${uid}"] .drag-handle`)?.focus();
    announce(`Moved ${name} to position ${clamped + 1} of ${cards.length}`);
  });
}
enableReorder($("exerciseList"));

// Which cards are expanded (open for editing). Not saved; resets on reload.
export const openCards = new Set();

// Small square picture for an exercise. Uses its first photo, or the
// first letter of its name if it has no photos (like custom exercises).
export function thumbHtml(ex, size = "") {
  const letter = escapeHtml((ex?.name || "?").charAt(0).toUpperCase());
  const inner = ex?.photos
    ? `<img src="${THUMB_DIR + encodeURIComponent(ex.id)}.webp" alt="" loading="lazy" onerror="this.parentElement.textContent='${letter}'">`
    : letter;
  return `<span class="thumb ${size}">${inner}</span>`;
}

// "3 sets · 10 reps · 60 lb"
export function summaryHtml(item) {
  const parts = [`<b>${escapeHtml(item.sets || "–")}</b> sets`, `<b>${escapeHtml(item.reps || "–")}</b> reps`];
  if (item.weight) parts.push(`<b>${escapeHtml(showWeight(item.weight, units()))}</b> ${unitLabels(units()).weight}`);
  return parts.join(" · ") + (item.notes ? ` · ${ICONS.note}` : "");
}

// The tap version of the cross-off swipe, for anyone who can't (or would rather not) swipe
export function doneButtonHtml(item) {
  return item.doneAt
    ? `<button class="btn small done-btn" data-action="done">Mark not done</button>`
    : `<button class="btn small primary done-btn" data-action="done">✓ Mark done</button>`;
}

// One exercise card in the workout
function buildExerciseCard(item) {
  const exercise = getExercise(item.exId);
  const name = exercise ? exercise.name : "Unknown exercise";
  const isOpen = openCards.has(item.uid);

  // Still-to-do cards get a grip to drag them into your own order (needs 2+ to have anything to reorder)
  const canReorder = !item.doneAt && activeWorkout().items.filter(i => !i.doneAt).length >= 2;

  const li = document.createElement("li");
  // swipe-done = swipe left to cross off; crossed-off cards swipe right to undo
  li.className = "card glass swipe " + (item.doneAt ? "done swipe-undo" : "swipe-done") + (isOpen ? " open" : "") + (canReorder ? " has-handle" : "");
  li.dataset.uid = item.uid;
  li.innerHTML = `
    <button class="row" data-action="toggle" aria-expanded="${isOpen}">
      ${thumbHtml(exercise)}
      <span class="row-text">
        <div class="row-name"><span>${escapeHtml(name)}</span></div>
        <div class="row-summary">${summaryHtml(item)}</div>
      </span>
      <span class="mini-map">${exercise ? renderMiniMap(exercise.primaryMuscles, exercise.secondaryMuscles) : ""}</span>
    </button>
    ${canReorder ? `<button class="drag-handle" aria-label="Reorder ${escapeHtml(name)}. Drag, or use the up and down arrow keys." title="Drag to reorder">${ICONS.grip}</button>` : ""}

    <div class="editor"><div class="editor-inner"><div class="editor-content">
      <div class="stats">
        <div class="stat">
          <label>Sets</label>
          <input type="text" inputmode="numeric" autocomplete="off" data-field="sets" value="${escapeHtml(item.sets)}">
        </div>
        <div class="stat">
          <label>Reps</label>
          <input type="text" inputmode="numeric" autocomplete="off" data-field="reps" value="${escapeHtml(item.reps)}">
        </div>
        <div class="stat">
          <label>Weight</label>
          <div class="weight-wrap">
            <input type="text" inputmode="decimal" autocomplete="off" placeholder="—" data-field="weight" value="${escapeHtml(showWeight(item.weight, units()))}">
            <span class="unit">${unitLabels(units()).weight}</span>
          </div>
        </div>
      </div>
      <textarea class="notes" data-field="notes" placeholder="Notes (e.g. last set felt heavy, try 95 next time)">${escapeHtml(item.notes)}</textarea>
      ${doneButtonHtml(item)}
      <div class="editor-actions">
        <button class="btn small" data-action="info">ⓘ More info</button>
        <button class="btn small danger" data-action="remove">Remove</button>
      </div>
    </div></div></div>
  `;
  return li;
}

// The saved item that a card on screen belongs to
function itemForCard(card) {
  return listForCard(card).holder().items.find(i => i.uid === card.dataset.uid);
}

// One click handler for every card in a tab's lists (this is called "event delegation")
function handleCardClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const card = button.closest(".card");
  const list = listForCard(card);
  const item = itemForCard(card);
  if (!item) return;

  if (button.dataset.action === "toggle") {
    const nowOpen = card.classList.toggle("open");
    button.setAttribute("aria-expanded", nowOpen);
    if (nowOpen) openCards.add(item.uid); else openCards.delete(item.uid);
  }
  if (button.dataset.action === "done") setDone(card, !item.doneAt);
  if (button.dataset.action === "info") openDetail(item.exId, { target: list.name, fromCard: true });
  if (button.dataset.action === "remove") removeItem(item, card);
  if (button.dataset.action === "intensity") {
    // Tap a level to pick it; tap it again to clear it
    const level = button.dataset.level;
    item.intensity = item.intensity === level ? "" : level;
    saveState();
    card.querySelectorAll("[data-action=intensity]").forEach(chip => {
      const on = chip.dataset.level === item.intensity;
      chip.classList.toggle("on", on);
      chip.setAttribute("aria-pressed", on);
    });
    card.querySelector(".row-summary").innerHTML = list.summary(item);
  }
}

// Number boxes only take positive numbers. Anything else is removed as it's typed or pasted.
// (The cursor stays where it was, so fixing a box doesn't make it jump.)
function cleanBox(box) {
  const { field, dur } = box.dataset;
  let clean = box.value;
  if (dur === "m" || dur === "s") clean = sanitizeMinSec(box.value); // minutes and seconds stop at 59
  else if (dur || WHOLE_FIELDS.includes(field)) clean = sanitizeWhole(box.value);
  else if (DECIMAL_FIELDS.includes(field)) clean = sanitizeDecimal(box.value);
  if (clean === box.value) return;
  const cursor = box.selectionStart ?? box.value.length;
  const removed = box.value.length - clean.length;
  box.value = clean;
  const newCursor = Math.max(0, Math.min(clean.length, cursor - removed));
  box.setSelectionRange(newCursor, newCursor);
}

// Save whenever you type in a box (sets / reps / weight / duration / notes...)
function handleCardInput(event) {
  const { field, dur } = event.target.dataset;
  if (!field && !dur) return;
  const card = event.target.closest(".card");
  const item = itemForCard(card);
  if (!item) return;
  cleanBox(event.target);
  if (dur) {
    // One of the hours / minutes / seconds boxes: save the total in seconds
    const box = key => card.querySelector(`[data-dur="${key}"]`).value;
    item.durationSec = joinDuration(box("h"), box("m"), box("s"));
  } else if (DECIMAL_FIELDS.includes(field)) {
    // "0" and "0." are kept in the box while you type, but saved as empty. Always saved in lb / mi.
    item[field] = (field === "weight" ? storeWeight : storeDistance)(event.target.value, units());
  } else {
    item[field] = event.target.value;
  }
  saveState();
  card.querySelector(".row-summary").innerHTML = listForCard(card).summary(item); // keep the summary line up to date
}

// When you leave a weight / distance box, tidy it so what you see is what's saved ("0." becomes empty, "5." becomes 5)
function handleCardChange(event) {
  const box = event.target;
  const field = box.dataset.field;
  if (!DECIMAL_FIELDS.includes(field)) return;
  const item = itemForCard(box.closest(".card"));
  box.value = item ? (field === "weight" ? showWeight : showDistance)(item[field], units()) : savedDecimal(box.value);
}

["cards", "cardioCards"].forEach(id => {
  $(id).addEventListener("click", handleCardClick);
  $(id).addEventListener("input", handleCardInput);
  $(id).addEventListener("change", handleCardChange);
});

function removeItem(item, card) {
  const list = listForCard(card);
  const items = list.holder().items;
  const index = items.indexOf(item);
  card.classList.add("removing");

  // Wait for the slide-out animation, then actually remove it
  setTimeout(() => {
    items.splice(index, 1);
    saveState();
    list.render();
    showToast(`Removed ${getExercise(item.exId)?.name || "exercise"}`, "Undo", () => {
      items.splice(index, 0, item);
      saveState();
      list.render();
    });
  }, 220);
}

/* ---------- Crossing off exercises ----------
   A crossed-off exercise has doneAt = the time you finished it.
   They reset with the Reset button, or on their own on a later day. */

// Swipe a card left (at least a third of the way) to cross it off...
enableSwipe($("exerciseList"), ".card", -1, SWIPE_THRESHOLD, card => setDone(card, true));
// ...and swipe a crossed-off card right to bring it back
enableSwipe($("completedList"), ".card", 1, SWIPE_THRESHOLD, card => setDone(card, false));
// Same for cardio
enableSwipe($("cardioList"), ".card", -1, SWIPE_THRESHOLD, card => setDone(card, true));
enableSwipe($("cardioCompletedList"), ".card", 1, SWIPE_THRESHOLD, card => setDone(card, false));

function setDone(card, isDone) {
  const item = itemForCard(card);
  if (!item) return;
  const list = listForCard(card);
  const holder = list.holder();
  if (isDone) item.doneAt = Date.now(); else delete item.doneAt;
  openCards.delete(item.uid); // moving between lists closes the card
  saveState();

  // Draw (or erase) the line through the name first, then move the card
  card.classList.toggle("done", isDone);
  setTimeout(() => {
    renderAnimated(list);
    if (!isDone) return;
    if (holder.items.every(i => i.doneAt)) {
      // everything's crossed off: log it and celebrate
      if (list === LISTS.cardio) logCardio(); else logSession(holder);
      celebrate(list.done, list.label());
    } else {
      showToast(`Completed ${getExercise(item.exId)?.name || "exercise"}`, "Undo", () => {
        delete item.doneAt;
        saveState();
        renderAnimated(list);
      });
    }
  }, 400);
}

// The Reorder button next to "Exercises" shows or hides the drag grips
$("reorderBtn").innerHTML = ICONS.reorder;
$("reorderBtn").addEventListener("click", () => {
  reorderMode = !reorderMode;
  syncReorderUi();
});

// The Reset buttons next to "Completed"
[["resetDoneBtn", LISTS.workout], ["cardioResetBtn", LISTS.cardio]].forEach(([id, list]) => {
  $(id).addEventListener("click", () => {
    list.holder().items.forEach(i => delete i.doneAt);
    saveState();
    renderAnimated(list);
  });
});

// Uncross anything crossed off on an earlier day. Returns true if anything changed.
function clearOldCrossOffs() {
  const changed = clearCrossOffsFromOtherDays([...store.state.workouts, store.state.cardio]);
  if (changed) saveState();
  return changed;
}

// Phones often keep the app open in the background for days,
// so check again whenever you come back to it
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && clearOldCrossOffs()) {
    renderWorkout();
    renderCardio();
  }
});

// Glow + "Workout complete" message over the screen. name = what was logged.
function celebrate(title, name) {
  if (prefersReducedMotion()) return showToast(`${title}. Logged ${name}`);
  $("celebrationTitle").textContent = title;
  $("celebrationName").textContent = `${name} logged to History`;
  const overlay = $("celebration");
  overlay.classList.remove("play");
  void overlay.offsetWidth; // lets the animation restart if it's already showing
  overlay.classList.add("play");
}

// Body map for every muscle in the whole workout
function renderSummaryMap(workout) {
  const primary = new Set();
  const secondary = new Set();
  workout.items.forEach(item => {
    const ex = getExercise(item.exId);
    if (!ex) return;
    ex.primaryMuscles.forEach(m => primary.add(m));
    ex.secondaryMuscles.forEach(m => secondary.add(m));
  });
  primary.forEach(m => secondary.delete(m)); // primary wins if a muscle is in both
  $("summaryMapBody").innerHTML = renderBodyMap([...primary], [...secondary]) + legendHtml();
}

export function legendHtml() {
  return `<div class="legend">
    <span><i style="background:var(--accent)"></i>Primary</span>
    <span><i style="background:var(--accent-dark)"></i>Secondary</span>
  </div>`;
}

$("renameBtn").addEventListener("click", () => renameWorkout(activeWorkout()));

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
