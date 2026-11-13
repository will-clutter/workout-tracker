/* ============================================================
   WORKOUT TAB
   ============================================================ */

import {
  THUMB_DIR, store, saveState, units, activeWorkout,
  LISTS, listForCard, getExercise,
  $, prefersReducedMotion, ICONS
} from "./store.js";
import { showToast } from "./ui/toast.js";
import { enableSwipe, SWIPE_THRESHOLD, hintCrossOff } from "./ui/swipe.js";
import { logSession } from "./history.js";
import { renderCardio, logCardio } from "./cardio.js";
import { openDetail } from "./details.js";
import { renameWorkout } from "./workouts.js";

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
export function renderAnimated(list) {
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

// Uncross anything crossed off on an earlier day. Returns true if anything changed.
export function clearOldCrossOffs() {
  const changed = clearCrossOffsFromOtherDays([...store.state.workouts, store.state.cardio]);
  if (changed) saveState();
  return changed;
}

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

// Wires up the Workout tab (and the card behaviour shared with Cardio). Called once from main.js when the app starts.
export function setupWorkout() {
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

  ["cards", "cardioCards"].forEach(id => {
    $(id).addEventListener("click", handleCardClick);
    $(id).addEventListener("input", handleCardInput);
    $(id).addEventListener("change", handleCardChange);
  });

  // Swipe a card left (at least a third of the way) to cross it off...
  enableSwipe($("exerciseList"), ".card", -1, SWIPE_THRESHOLD, card => setDone(card, true));
  // ...and swipe a crossed-off card right to bring it back
  enableSwipe($("completedList"), ".card", 1, SWIPE_THRESHOLD, card => setDone(card, false));
  // Same for cardio
  enableSwipe($("cardioList"), ".card", -1, SWIPE_THRESHOLD, card => setDone(card, true));
  enableSwipe($("cardioCompletedList"), ".card", 1, SWIPE_THRESHOLD, card => setDone(card, false));

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

  // Phones often keep the app open in the background for days,
  // so check again whenever you come back to it
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && clearOldCrossOffs()) {
      renderWorkout();
      renderCardio();
    }
  });

  $("renameBtn").addEventListener("click", () => renameWorkout(activeWorkout()));
}
