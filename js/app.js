/* ============================================================
   app.js — Workout Logbook
   Everything the app does lives in this file. It's split into
   sections with big comment headers so it's easy to find things.

   The big idea:
   1. All your data lives in one object called `state`.
   2. Whenever something changes, we update `state`, save it,
      and re-draw the part of the screen that changed.
   ============================================================ */

/* ---------- Settings ---------- */
const STORAGE_KEY = "workout-logbook-v1";
// Exercise pictures are stored in the project (images/ folder), so ad blockers
// can't block them and they load fast. thumbs = small squares, photos = bigger.
const THUMB_DIR = "images/thumbs/";
const PHOTO_DIR = "images/photos/";
const RESULTS_PAGE_SIZE = 10;
// DEFAULT_SETS and DEFAULT_REPS are in logic.js

/* ============================================================
   DATA
   ============================================================ */

// The exercise database (filled in once data/exercises.json loads)
let database = [];
let databaseById = {};

// Your data. This is what gets saved on your phone.
let state = loadState();

// Read saved data from the browser's storage (localStorage)
function loadState() {
  try {
    return parseSavedState(localStorage.getItem(STORAGE_KEY));
  } catch (err) {
    return defaultState(); // storage blocked
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    showToast("Couldn't save. Is storage full or blocked?");
  }
}

// "imperial" or "metric" (weights and distances are always saved in lb / mi)
function units() {
  return state.settings.units;
}

// The workout currently on screen
function activeWorkout() {
  return findActiveWorkout(state);
}

/*
  The two lists of cards: your workout, and your cardio.
  Most of the card code (crossing off, removing, adding) works on either one,
  and looks up what's different here.
*/
const LISTS = {
  workout: {
    name: "workout",
    holder: () => activeWorkout(),        // the thing with .items
    label: () => activeWorkout().name,     // "Add to ___"
    container: "cards",
    sheet: "browserSheet",
    newItem: ex => newItem(ex),
    summary: item => summaryHtml(item),
    render: () => renderWorkout(),
    renderPicker: () => renderResults(),
    done: "Workout complete"
  },
  cardio: {
    name: "cardio",
    holder: () => state.cardio,
    label: () => "Cardio",
    container: "cardioCards",
    sheet: "cardioSheet",
    newItem: ex => newCardioItem(ex),
    summary: item => cardioSummaryHtml(item),
    render: () => renderCardio(),
    renderPicker: () => renderCardioResults(),
    done: "Cardio complete"
  }
};

// Which list a card on screen is in
function listForCard(card) {
  return card.closest("#cardioCards") ? LISTS.cardio : LISTS.workout;
}

function isInList(list, exId) {
  return hasExercise(list.holder(), exId);
}

// Look up an exercise by id, in the database or your custom ones
function getExercise(exId) {
  return findExercise(exId, databaseById, state.customExercises);
}

// makeId, defaultState, newItem, plural, escapeHtml and capitalize are in logic.js

// Shortcut for document.getElementById
const $ = id => document.getElementById(id);

// Has the phone/computer asked for less animation? (an accessibility setting)
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Small SVG icons (Font Awesome Free) used inside the app's HTML
const ICONS = {
  note: `<svg class="icon inline" viewBox="0 0 448 512" role="img" aria-label="Has notes"><path d="M64 480c-35.3 0-64-28.7-64-64L0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 213.5c0 17-6.7 33.3-18.7 45.3L322.7 461.3c-12 12-28.3 18.7-45.3 18.7L64 480zM389.5 304L296 304c-13.3 0-24 10.7-24 24l0 93.5 117.5-117.5z"/></svg>`,
  grip: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/></svg>`,
  reorder: `<svg class="icon outline" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20V4M3 8l4-4 4 4"/><path d="M17 4v16M13 16l4 4 4-4"/></svg>`,
  trash: `<svg class="icon" viewBox="0 0 448 512" aria-hidden="true"><path d="M136.7 5.9L128 32 32 32C14.3 32 0 46.3 0 64S14.3 96 32 96l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0-8.7-26.1C306.9-7.2 294.7-16 280.9-16L167.1-16c-13.8 0-26 8.8-30.4 21.9zM416 144L32 144 53.1 467.1C54.7 492.4 75.7 512 101 512L347 512c25.3 0 46.3-19.6 47.9-44.9L416 144z"/></svg>`
};

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

function renderWorkout() {
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
function fillCardLists(items, buildCard, ids) {
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
    const collapsed = Boolean(state.collapsed?.[button.dataset.key]);
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
    state.collapsed = cleanCollapsed(state.collapsed);
    const key = button.dataset.key;
    state.collapsed[key] = !state.collapsed[key];
    saveState();
    button.setAttribute("aria-expanded", String(!state.collapsed[key]));
    const list = $(button.dataset.list);
    if (list._fold) return list._fold.forEach(a => a.reverse()); // changed its mind mid-animation

    const cards = [...list.querySelectorAll(".card")];
    if (prefersReducedMotion() || !cards.length) return applyCollapsed();
    if (!state.collapsed[key]) { // opening: show the list, then run the fold backwards from the pile
      list.classList.remove("collapsed");
      cards.forEach(card => card.classList.add("settled")); // no fade-in of their own
    }
    list._fold = buildFold(list, cards);
    list._fold.forEach(a => { if (state.collapsed[key]) a.play(); else { a.currentTime = FOLD_MS; a.reverse(); } });
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
const openCards = new Set();

// Small square picture for an exercise. Uses its first photo, or the
// first letter of its name if it has no photos (like custom exercises).
function thumbHtml(ex, size = "") {
  const letter = escapeHtml((ex?.name || "?").charAt(0).toUpperCase());
  const inner = ex?.photos
    ? `<img src="${THUMB_DIR + encodeURIComponent(ex.id)}.webp" alt="" loading="lazy" onerror="this.parentElement.textContent='${letter}'">`
    : letter;
  return `<span class="thumb ${size}">${inner}</span>`;
}

// "3 sets · 10 reps · 60 lb"
function summaryHtml(item) {
  const parts = [`<b>${escapeHtml(item.sets || "–")}</b> sets`, `<b>${escapeHtml(item.reps || "–")}</b> reps`];
  if (item.weight) parts.push(`<b>${escapeHtml(showWeight(item.weight, units()))}</b> ${unitLabels(units()).weight}`);
  return parts.join(" · ") + (item.notes ? ` · ${ICONS.note}` : "");
}

// The tap version of the cross-off swipe, for anyone who can't (or would rather not) swipe
function doneButtonHtml(item) {
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

// How far a swipe has to go to count, as a share of the row's width (a third)
const SWIPE_THRESHOLD = 1 / 3;

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
  const changed = clearCrossOffsFromOtherDays([...state.workouts, state.cardio]);
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

function legendHtml() {
  return `<div class="legend">
    <span><i style="background:var(--accent)"></i>Primary</span>
    <span><i style="background:var(--accent-dark)"></i>Secondary</span>
  </div>`;
}

$("renameBtn").addEventListener("click", () => renameWorkout(activeWorkout()));

/* ============================================================
   CARDIO TAB
   One list (no switcher). Works like the Workout tab, but each card
   has duration, intensity, heart rate, calories, distance and notes.
   Anything left empty isn't shown on the card or in History.
   ============================================================ */

function renderCardio() {
  const items = state.cardio.items;
  fillCardLists(items, buildCardioCard, {
    todo: "cardioList", done: "cardioCompletedList", todoLabel: "cardioLabel", doneHead: "cardioCompletedHead"
  });
  const empty = items.length === 0;
  $("cardioEmpty").classList.toggle("hidden", !empty);
  $("logCardioBtn").classList.toggle("hidden", empty);
  hintCrossOff();
}

// "1h 30m · High intensity · 145 bpm" with the numbers (or the intensity) in bold. Empty if nothing's filled in.
function cardioSummaryHtml(item) {
  const bold = part => /\d/.test(part)
    ? part.replace(/(\d[\d.,:]*)/g, "<b>$1</b>")
    : part.replace(/^(\S+)/, "<b>$1</b>");
  const parts = cardioSummaryParts(item, state.settings).map(part => bold(escapeHtml(part)));
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

function logCardio() {
  state.history.unshift(buildCardioHistoryEntry(state.cardio.items, exId => getExercise(exId)?.name));
  saveState();
  renderHistory();
}

$("logCardioBtn").addEventListener("click", () => {
  logCardio();
  showToast("Logged cardio");
});

/* ---------- Picking cardio: the cardio exercises + your own ---------- */

$("addCardioBtn").addEventListener("click", () => {
  openSheet("cardioSheet");
  renderCardioResults();
});

function renderCardioResults() {
  const options = [...state.customExercises, ...database].filter(isCardio);
  const added = new Set(state.cardio.items.map(i => i.exId));
  $("cardioResults").innerHTML = options.map(ex => resultRowHtml(ex, added.has(ex.id))).join("");
  hintAdd();
}

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
  state.customExercises.push(ex);
  saveState();
  renderCardioResults();
  openDetail(ex.id, { target: "cardio" });
});

/* ============================================================
   LOGGING + HISTORY
   ============================================================ */

// Save a copy ("snapshot") of the workout as it is right now,
// including which exercises were crossed off
function logSession(workout) {
  state.history.unshift(buildHistoryEntry(workout, exId => getExercise(exId)?.name));
  saveState();
  renderHistory();
}

$("logBtn").addEventListener("click", () => {
  const workout = activeWorkout();
  logSession(workout);
  showToast(`Logged ${workout.name}`);
});

// Which half of History is showing: "workouts" or "cardio". Not saved; resets on reload.
let historyView = "workouts";

$("historyToggle").addEventListener("click", event => {
  const seg = event.target.closest(".seg");
  if (!seg || seg.dataset.view === historyView) return;
  historyView = seg.dataset.view;
  $("historyToggle").dataset.view = historyView; // slides the highlighted pill across
  $("historyToggle").querySelectorAll(".seg").forEach(s => {
    s.classList.toggle("on", s === seg);
    s.setAttribute("aria-selected", s === seg);
  });

  renderHistory();
});

// One exercise line in a History session (words = the search words to highlight)
function historyLineHtml(item, isCardio, words = []) {
  const name = `<b>${highlightText(item.name, words)}</b>`;
  if (isCardio) {
    const parts = cardioSummaryParts(item, state.settings);
    return `${name}${parts.length ? ` — ${escapeHtml(parts.join(" · "))}` : ""}`;
  }
  return `${name} — ${escapeHtml(item.sets || "?")} × ${escapeHtml(item.reps || "?")}${item.weight ? ` @ ${escapeHtml(showWeight(item.weight, units()))} ${unitLabels(units()).weight}` : ""}`;
}

// One logged session (a swipe-to-delete card). open = start with its exercises showing.
function sessionHtml(session, showCardio, words = [], open = false) {
  const date = new Date(session.date).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric"
  });
  // Only mark completed/not completed if you crossed anything off that session
  // (older sessions, and ones logged without crossing off, show as before)
  const doneCount = session.items.filter(i => i.done).length;
  const tracked = doneCount > 0;
  const count = tracked && doneCount < session.items.length
    ? `${doneCount} of ${plural(session.items.length, "exercise")} done`
    : plural(session.items.length, "exercise");
  return `<li class="swipe swipe-delete glass">
      <details class="session"${open ? " open" : ""}>
        <summary>
          <div>
            <div class="date">${escapeHtml(date)}</div>
            <div><b>${highlightText(session.workoutName, words)}</b></div>
          </div>
          <div class="count">${count} ▾</div>
        </summary>
        <ul>
          ${session.items.map(i => `
            <li${tracked && !i.done ? ` class="skipped"` : ""}>
              ${tracked && !i.done ? `<span class="skipped-label">Not done</span>` : ""}
              ${historyLineHtml(i, showCardio, words)}
              ${i.notes ? `<div class="note">${highlightText(i.notes, words)}</div>` : ""}
            </li>`).join("")}
        </ul>
        <div class="session-actions">
          <button class="btn danger small" data-delete="${session.id}">Delete session</button>
        </div>
      </details>
    </li>`;
}

/* ---------- Long histories: Year > Month groups, and search ----------
   Without a search, sessions sit under month headings (and year headings once there's
   more than one year). Only the newest year and month start open, and only open groups
   are drawn, so a lifetime of sessions stays quick. Which groups you opened isn't saved.
   With a search, you get a flat list of the matching sessions instead. */

let historyQuery = "";
const HISTORY_PAGE = 50;       // search results drawn at a time
let historyShown = HISTORY_PAGE;
const groupOpen = new Map();   // group key -> true / false, once you've tapped it
let historyNodes = new Map();  // group key -> its data, from the last time History was drawn

// The headings and their sessions, newest first: [{ key, level, label, count, defaultOpen, sessions | children }]
function buildHistoryTree(sessions, view) {
  const monthNode = (m, defaultOpen) => ({
    key: `${view}:m:${m.key}`, level: "month", sessions: m.sessions, count: m.sessions.length, defaultOpen,
    label: m.year === null ? "Unknown date"
      : new Date(m.year, m.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })
  });
  const years = groupMonthsByYear(groupSessionsByMonth(sessions));
  const dated = years.filter(y => y.year !== null);
  if (dated.length <= 1) return years.flatMap(y => y.months).map((m, i) => monthNode(m, i === 0));
  return years.flatMap((y, yi) => y.year === null
    ? y.months.map(m => monthNode(m, false))
    : [{
        key: `${view}:y:${y.year}`, level: "year", label: String(y.year), count: y.count, defaultOpen: yi === 0,
        children: y.months.map((m, mi) => monthNode(m, yi === 0 && mi === 0))
      }]);
}

const isGroupOpen = node => (groupOpen.has(node.key) ? groupOpen.get(node.key) : node.defaultOpen);

function groupHtml(node, showCardio, opening = false) {
  historyNodes.set(node.key, node);
  const open = isGroupOpen(node);
  const body = !open ? "" : `<ul class="group-body history-list${opening ? " opening" : ""}">${
    node.children ? node.children.map(child => groupHtml(child, showCardio)).join("")
      : node.sessions.map(session => sessionHtml(session, showCardio)).join("")}</ul>`;
  return `<li class="history-group ${node.level}" data-key="${node.key}">
    <button class="group-head" data-group="${node.key}" aria-expanded="${open}"><span>${escapeHtml(node.label)}</span><span class="group-count">${plural(node.count, "session")}</span></button>${body}</li>`;
}

// Tap a heading: open or close just that group (the rest of the list stays as it is)
function toggleGroup(key) {
  const node = historyNodes.get(key);
  const li = $("historyList").querySelector(`li.history-group[data-key="${key}"]`);
  if (!node || !li) return;
  groupOpen.set(key, !isGroupOpen(node));
  li.outerHTML = groupHtml(node, historyView === "cardio", isGroupOpen(node));
  $("historyList").querySelector(`[data-group="${key}"]`)?.focus();
}

function renderHistory() {
  const showCardio = historyView === "cardio";
  const all = sortSessionsNewestFirst(state.history.filter(s => isCardioSession(s) === showCardio));
  const words = searchWords(historyQuery);
  const searching = words.length > 0;
  historyNodes = new Map();

  $("historyEmpty").classList.toggle("hidden", all.length > 0);
  $("historySearch").classList.toggle("hidden", all.length < 5 && !searching); // not worth having until there's a few
  $("historyOrder").classList.toggle("hidden", all.length < 2 || searching); // order only matters with 2+
  $("historyEmptyTitle").textContent = showCardio ? "No cardio logged yet." : "No sessions logged yet.";
  $("historyEmptyHint").innerHTML = showCardio
    ? "After cardio, tap <b>Log today's cardio</b> to save it here."
    : "After a workout, tap <b>Log today's session</b> to save it here.";

  if (!searching) {
    $("historyMatches").classList.add("hidden");
    $("historyMore").classList.add("hidden");
    $("historyList").innerHTML = buildHistoryTree(all, historyView).map(node => groupHtml(node, showCardio)).join("");
    return;
  }
  const found = searchSessions(all, historyQuery);
  const shown = found.slice(0, historyShown);
  $("historyMatches").textContent = found.length ? `${plural(found.length, "session")} match` : `No sessions match "${historyQuery.trim()}".`;
  $("historyMatches").classList.remove("hidden");
  // With only a few results, open them so the matching lines are right there
  $("historyList").innerHTML = shown.map(session => sessionHtml(session, showCardio, words, found.length <= 10)).join("");
  $("historyMore").classList.toggle("hidden", found.length <= shown.length);
}

let historySearchTimer;
$("historySearch").addEventListener("input", event => {
  clearTimeout(historySearchTimer);
  historySearchTimer = setTimeout(() => {
    historyQuery = event.target.value;
    historyShown = HISTORY_PAGE;
    renderHistory();
  }, 150); // wait for a pause in typing
});

$("historyMore").addEventListener("click", () => {
  historyShown += HISTORY_PAGE;
  renderHistory();
});

// Delete a session right away; the toast's Undo puts it back where it was
function deleteSession(id) {
  const index = state.history.findIndex(s => s.id === id);
  if (index < 0) return;
  const [session] = state.history.splice(index, 1);
  saveState();
  renderHistory();
  showToast("Deleted session", "Undo", () => {
    state.history.splice(Math.min(index, state.history.length), 0, session);
    saveState();
    renderHistory();
  });
}

$("historyList").addEventListener("click", event => {
  const head = event.target.closest("[data-group]");
  if (head) return toggleGroup(head.dataset.group);
  const id = event.target.dataset.delete;
  if (id) deleteSession(id);
});

// Swipe a session left (at least a third of the way) to delete it
enableSwipe($("historyList"), "li.swipe", -1, 0.35, row => {
  deleteSession(row.querySelector("[data-delete]").dataset.delete);
});

/* ============================================================
   TABS (Workout / Cardio / History)
   ============================================================ */

const tabBar = document.querySelector(".tabbar");
const tabButtons = [...document.querySelectorAll(".tab-btn")];

// Show a tab's screen. The circle is moved separately, so gliding can move it early.
function showTab(button) {
  if (button.classList.contains("active")) return; // already on this tab
  tabButtons.forEach(b => {
    b.classList.toggle("active", b === button);
    if (b === button) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.id === "tab-" + button.dataset.tab));
  document.body.dataset.tab = button.dataset.tab; // shows the matching floating Add button
  window.scrollTo({ top: 0 });
  hintCrossOff(); // only does anything on the Workout and Cardio tabs
}

// Keyboard / screen reader activation (detail is 0 for those). Touch and mouse go through gliding below.
tabButtons.forEach(button => {
  button.addEventListener("click", event => {
    if (event.detail !== 0 || button.classList.contains("active")) return;
    moveTabIndicator(button, true);
    showTab(button);
  });
});

/*
  Hold and glide: press on the bar and slide sideways. The tab under your finger
  lights up and the circle follows, but the screen only changes when you let go.
  A plain tap is the same thing with no sliding. Letting go well above or below
  the bar (or the browser cancelling the touch) leaves you on the current tab.
*/
let glide = null; // { id, target } while a finger is down on the bar

function glideTo(button) {
  if (glide.target === button) return;
  glide.target = button;
  tabButtons.forEach(b => b.classList.toggle("lit", b === button));
  // No tab under the finger: the circle goes back to the current tab
  moveTabIndicator(button || document.querySelector(".tab-btn.active"), true, 220, true);
}

function glideTabAt(event) {
  const bar = tabBar.getBoundingClientRect();
  const i = glideTabIndex(event.clientX, event.clientY, bar, tabButtons.map(b => b.getBoundingClientRect()));
  return tabButtons[i] || null;
}

// The circle stretches sideways with finger speed (smoothed so it doesn't flicker)
let stretchResetTimer = null;
function setStretch(value) {
  tabIndicator.style.setProperty("--stretch", prefersReducedMotion() ? 1 : value.toFixed(3));
}
function updateStretch(event) {
  const now = event.timeStamp;
  const dt = now - glide.lastTime;
  if (dt < 16) return; // measure over at least ~one frame so tiny time gaps can't fake a high speed
  const dx = Math.abs(event.clientX - glide.lastX);
  glide.lastX = event.clientX;
  glide.lastTime = now;
  if (dx < 2) { // a held finger jitters a pixel or so: that's not movement
    glide.speed = 0;
    setStretch(1);
    return; // and it must not keep the relax timer from firing
  }
  glide.speed = glide.speed * 0.7 + (dx / dt) * 0.3; // px per ms, smoothed
  setStretch(stretchForSpeed(glide.speed));
  // Relax back to round if real movement stops
  clearTimeout(stretchResetTimer);
  stretchResetTimer = setTimeout(() => { if (glide) glide.speed = 0; setStretch(1); }, 90);
}

tabBar.addEventListener("pointerdown", event => {
  if (glide || (event.pointerType === "mouse" && event.button !== 0)) return;
  glide = { id: event.pointerId, target: undefined, lastX: event.clientX, lastTime: event.timeStamp, speed: 0 };
  tabBar.setPointerCapture(event.pointerId);
  tabBar.classList.add("gliding");
  glideTo(glideTabAt(event));
});

tabBar.addEventListener("pointermove", event => {
  if (!glide || event.pointerId !== glide.id) return;
  updateStretch(event);
  glideTo(glideTabAt(event));
});

function endGlide(event) {
  if (!glide || event.pointerId !== glide.id) return;
  // Only a real let-go on a tab switches (the browser can cancel the touch)
  const target = event.type === "pointerup" ? glideTabAt(event) : null;
  glide = null;
  clearTimeout(stretchResetTimer);
  setStretch(1);
  tabBar.classList.remove("gliding");
  tabButtons.forEach(b => b.classList.remove("lit"));
  if (target) showTab(target);
  // Make sure the circle ends up on the tab we're actually on
  moveTabIndicator(document.querySelector(".tab-btn.active"), true, 220, true);
}
tabBar.addEventListener("pointerup", endGlide);
tabBar.addEventListener("pointercancel", endGlide);

/* ---------- The circle behind the selected tab ---------- */

const tabIndicator = $("tabIndicator");
let indicatorPos = null; // where the circle is now

// Middle of a tab's icon, measured from the tab bar's top-left corner
// The bar can be mid-way through its press-in scale, so screen distances are divided
// by that scale to get back to the bar's own (unscaled) coordinates.
function iconCenter(button) {
  const bar = tabIndicator.parentElement;
  const barBox = bar.getBoundingClientRect();
  const iconBox = button.querySelector(".icon").getBoundingClientRect();
  const sx = barBox.width / bar.offsetWidth || 1;
  const sy = barBox.height / bar.offsetHeight || 1;
  return {
    x: (iconBox.left + iconBox.width / 2 - barBox.left) / sx - bar.clientLeft,
    y: (iconBox.top + iconBox.height / 2 - barBox.top) / sy - bar.clientTop
  };
}

/*
  Moves the circle to a tab. With animate = true it:
  shrinks to nothing on the old tab → jumps → grows on the new tab
  (with a tiny overshoot so it feels springy).
*/
let indicatorAnim = null;
// slide = true: glide straight across at full size (used while a finger is on the bar)
function moveTabIndicator(button, animate, duration = 700, slide = false) {
  const to = iconCenter(button);
  const from = indicatorPos || to;
  if (animate && from.x === to.x && from.y === to.y) return; // already there
  indicatorPos = to;
  if (indicatorAnim) indicatorAnim.cancel(); // sliding quickly: drop the old one

  // Final resting spot (used once the animation ends)
  tabIndicator.style.setProperty("--x", to.x + "px");
  tabIndicator.style.setProperty("--y", to.y + "px");

  if (!animate || prefersReducedMotion()) return;

  const at = (p, scale) => `translate(${p.x}px, ${p.y}px) scale(${scale})`;
  if (slide) {
    indicatorAnim = tabIndicator.animate([
      { transform: at(from, 1) },
      { transform: at(to, 1) }
    ], { duration, easing: "cubic-bezier(0.34, 1.3, 0.64, 1)" });
    return;
  }
  indicatorAnim = tabIndicator.animate([
    { transform: at(from, 1), easing: "cubic-bezier(0.55, 0, 1, 0.45)" },  // shrink (quick)
    { transform: at(from, 0), offset: 0.3 },
    { transform: at(to, 0),   offset: 0.32, easing: "cubic-bezier(0.34, 1.3, 0.64, 1)" }, // grow with a soft bounce
    { transform: at(to, 1) }
  ], { duration });
}

// Put the circle in place when the app opens, and keep it there if the window resizes
const placeTabIndicator = () => moveTabIndicator(document.querySelector(".tab-btn.active"), false);
requestAnimationFrame(placeTabIndicator);
window.addEventListener("resize", placeTabIndicator);

/* ============================================================
   SHEETS (the panels that slide up)
   ============================================================ */

const openSheets = []; // a stack, so a sheet can open on top of another
const sheetOpeners = {}; // which element had focus before each sheet opened, so focus can go back

// Screen readers: each sheet is a modal dialog, and can take focus itself when it opens
document.querySelectorAll(".sheet").forEach(sheet => {
  sheet.setAttribute("aria-modal", "true");
  sheet.tabIndex = -1;
});

// While any sheet is open, the page and tab bar can't be reached with Tab or a screen reader
function setPageInert(inert) {
  document.querySelector("main").inert = inert;
  document.querySelector(".tabbar").inert = inert;
}

function openSheet(id) {
  const sheet = $(id);
  if (!openSheets.includes(id)) {
    sheetOpeners[id] = document.activeElement;
    openSheets.push(id);
  }
  setPageInert(true);
  // The newest sheet sits on top
  sheet.style.zIndex = 30 + openSheets.length;
  sheet.scrollTop = 0;
  sheet.classList.remove("head-hidden"); // always open with the header showing
  requestAnimationFrame(() => {
    sheet.classList.add("open");
    // Focus the panel itself (not a field) so phones don't pop the keyboard. It has to be
    // visible first, which is why this happens after the "open" class goes on.
    sheet.focus({ preventScroll: true });
  });
  $("backdrop").classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeSheet(id) {
  $(id).classList.remove("open");
  const index = openSheets.indexOf(id);
  if (index !== -1) openSheets.splice(index, 1);
  const opener = sheetOpeners[id];
  delete sheetOpeners[id];
  if (openSheets.length === 0) {
    setPageInert(false);
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    $("backdrop").classList.remove("show");
    document.body.style.overflow = "";
    hintCrossOff(); // e.g. back from adding your first exercises by swiping
  }
  if (id === "formSheet" && formResolve) { formResolve(null); formResolve = null; }
}

// Escape closes the top sheet
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && openSheets.length) closeSheet(openSheets[openSheets.length - 1]);
});

// Tapping the dark background closes the top sheet
$("backdrop").addEventListener("click", () => {
  if (openSheets.length) closeSheet(openSheets[openSheets.length - 1]);
});

// In the exercise search: hide the header (title + close button) while scrolling
// down the results, and bring it back as soon as you scroll up
function autoHideHeader(sheet) {
  let lastTop = 0;
  sheet.addEventListener("scroll", () => {
    const top = sheet.scrollTop;
    if (Math.abs(top - lastTop) < 6) return; // ignore tiny jitters
    sheet.classList.toggle("head-hidden", top > lastTop && top > 80); // down, and past the top area
    lastTop = top;
  }, { passive: true });
}
autoHideHeader($("browserSheet"));

document.querySelectorAll(".close-sheet").forEach(button => {
  button.addEventListener("click", () => closeSheet(button.closest(".sheet").id));
});

/* ============================================================
   SWIPE GESTURE (shared by any list with swipeable rows)
   ============================================================ */

/*
  Lets you drag rows in `list` sideways.
  rowSelector = which rows can be swiped
  direction   = 1 for right, -1 for left
  threshold   = how far to drag to count, as a share of the row's width (0.5 = half; see SWIPE_THRESHOLD)
  onSwipe(row) runs if you let go past the threshold; otherwise the row snaps back.

  Up/down drags are ignored, so the list still scrolls normally.
  CSS variables tell style.css where to draw the row:
  --swipe = how far it's moved (negative = left), --swipe-w = the same distance, always positive.
*/
function enableSwipe(list, rowSelector, direction, threshold, onSwipe) {
  let drag = null;
  let swipedAt = 0;

  list.addEventListener("pointerdown", event => {
    const row = event.target.closest(rowSelector);
    if (!row || event.button !== 0) return;
    if (event.target.closest("input, textarea")) return; // dragging in a text box selects text instead
    if (event.target.closest(".drag-handle")) return;    // that's for reordering, not swiping
    drag = { row, x: event.clientX, y: event.clientY, distance: 0, active: false };
  });

  list.addEventListener("pointermove", event => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;

    // Wait until it's clear whether this is a sideways swipe or a scroll
    if (!drag.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // scrolling
      if (Math.abs(dx) < 10) return;
      drag.active = true;
      drag.row.setPointerCapture(event.pointerId); // keep getting moves even off the row
      drag.row.classList.add("swiping");
    }

    drag.distance = Math.max(0, dx * direction); // can't drag the wrong way
    drag.row.style.setProperty("--swipe", drag.distance * direction + "px");
    drag.row.style.setProperty("--swipe-w", drag.distance + "px");
    drag.row.classList.toggle("swipe-ready", drag.distance > drag.row.offsetWidth * threshold);
  });

  const endDrag = event => {
    if (!drag) return;
    const { row, active, distance } = drag;
    drag = null;
    if (!active) return; // it was a tap; let the click through

    swipedAt = performance.now();
    row.classList.remove("swiping", "swipe-ready");
    row.style.removeProperty("--swipe"); // snaps back with the CSS transition
    row.style.removeProperty("--swipe-w");
    // Only a real let-go counts (the browser can cancel a drag, e.g. to scroll)
    if (event.type === "pointerup" && distance > row.offsetWidth * threshold) onSwipe(row);
  };
  list.addEventListener("pointerup", endDrag);
  list.addEventListener("pointercancel", endDrag);

  // Letting go after a swipe also fires a click; swallow it so the row doesn't open too
  list.addEventListener("click", event => {
    if (performance.now() - swipedAt < 400) event.stopPropagation();
  }, true);
}

/* ---------- First-time swipe hints ----------
   The first time a swipeable row is on screen, it slides partway open by
   itself and back, to show it can be swiped. Each hint plays once, ever
   (remembered in state.hintsSeen). */

const hintWaiting = {};

// findRow() returns the row to animate, or nothing if it isn't on screen right now.
// It's checked again just before playing, in case the list was redrawn meanwhile.
function showHintOnce(name, findRow, direction) {
  state.hintsSeen ??= {};
  if (state.hintsSeen[name] || hintWaiting[name] || prefersReducedMotion() || !findRow()) return;
  hintWaiting[name] = true;
  setTimeout(() => {
    hintWaiting[name] = false;
    const row = findRow();
    if (!row) return; // gone now; try again next time
    state.hintsSeen[name] = true;
    saveState();

    const set = px => {
      row.style.setProperty("--swipe", direction * px + "px");
      row.style.setProperty("--swipe-w", px + "px");
    };
    row.classList.add("peek");
    set(90);                                   // slide partway open...
    setTimeout(() => set(0), 1000);            // ...hold a moment, then close
    setTimeout(() => {
      row.classList.remove("peek");
      row.style.removeProperty("--swipe");
      row.style.removeProperty("--swipe-w");
    }, 1600);
  }, 700); // wait for the cards / sheet to finish appearing
}

// Swipe left to cross off: shown on the first exercise (or cardio) card
function hintCrossOff() {
  showHintOnce("crossOff", () => {
    if (openSheets.length) return null;
    if ($("tab-workout").classList.contains("active")) return $("exerciseList").querySelector(".card");
    if ($("tab-cardio").classList.contains("active")) return $("cardioList").querySelector(".card");
  }, -1);
}

// Swipe right to add: shown on the first search result
function hintAdd() {
  showHintOnce("add", () => {
    const top = openSheets.at(-1);
    if (top === "browserSheet") return $("resultsList").querySelector("li.swipe");
    if (top === "cardioSheet") return $("cardioResults").querySelector("li.swipe");
  }, 1);
}

/* ============================================================
   EXERCISE BROWSER
   ============================================================ */

const filters = { search: "", muscle: "", equipment: "" };
let resultsShown = RESULTS_PAGE_SIZE;

$("addExerciseBtn").addEventListener("click", () => {
  openSheet("browserSheet");
  renderResults();
});

function setupBrowser() {
  // Muscle filter chips
  const chips = ["all", ...ALL_MUSCLES];
  $("muscleChips").innerHTML = chips.map(m =>
    `<button class="chip ${m === "all" ? "on" : ""}" data-muscle="${m === "all" ? "" : m}">${m}</button>`
  ).join("");

  // Equipment dropdown, built from whatever the database contains
  const equipment = [...new Set(database.filter(e => !isCardio(e)).map(e => e.equipment).filter(Boolean))].sort();
  $("equipmentSelect").innerHTML += equipment.map(e => `<option value="${e}">${e}</option>`).join("");
}

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

// A filter changed: go back to showing just the first page of results
function renderFirstPage() {
  resultsShown = RESULTS_PAGE_SIZE;
  renderResults();
}

$("moreResultsBtn").addEventListener("click", () => {
  resultsShown += RESULTS_PAGE_SIZE;
  renderResults();
});

// Does this exercise match the current filters?
// words = the search split into words; every one has to appear in the name.
function matchesFilters(ex, words) {
  return exerciseMatches(ex, filters, words);
}

function renderResults() {
  const words = filters.search ? filters.search.split(/\s+/) : []; // split once, not once per exercise
  // Cardio lives in the Cardio tab, so it's left out of this search
  const pool = [...state.customExercises, ...database].filter(ex => !isCardio(ex));
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
function resultRowHtml(ex, added) {
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
enableSwipeToAdd($("resultsList"), LISTS.workout);
enableSwipeToAdd($("cardioResults"), LISTS.cardio);

/* ============================================================
   EXERCISE DETAILS ("more info" + body map)
   ============================================================ */

// target = which list it would be added to ("workout" or "cardio").
// fromCard = opened from a card that's already in that list.
function openDetail(exId, { target = "workout", fromCard = false } = {}) {
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

/* ============================================================
   CUSTOM EXERCISES
   ============================================================ */

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
  state.customExercises.push(ex);
  saveState();
  renderResults();
  openDetail(ex.id);
});

async function deleteCustomExercise(ex) {
  const ok = await confirmDialog(`Delete "${ex.name}"?`, "It will also be removed from any workouts.", "Delete");
  if (!ok) return;
  state.customExercises = state.customExercises.filter(e => e.id !== ex.id);
  [...state.workouts, state.cardio].forEach(w => { w.items = w.items.filter(i => i.exId !== ex.id); });
  saveState();
  closeSheet("detailSheet");
  renderResults();
  renderCardioResults();
  renderWorkout();
  renderCardio();
}

/* ============================================================
   WORKOUTS (switch / new / rename / delete)
   ============================================================ */

$("workoutSwitcher").addEventListener("click", () => {
  renderWorkoutsList();
  openSheet("workoutsSheet");
});

function renderWorkoutsList() {
  $("workoutsList").innerHTML = state.workouts.map(w => `
    <li class="${w.id === state.activeWorkoutId ? "current" : ""}" data-id="${w.id}">
      <button class="pick" data-action="pick">
        ${escapeHtml(w.name)}
        <small>${plural(w.items.length, "exercise")}</small>
      </button>
      <button class="icon-btn" data-action="rename" aria-label="Rename">✎</button>
      <button class="icon-btn" data-action="delete" aria-label="Delete">${ICONS.trash}</button>
    </li>`).join("");
}

$("workoutsList").addEventListener("click", async event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const workout = state.workouts.find(w => w.id === button.closest("li").dataset.id);

  if (button.dataset.action === "pick") {
    state.activeWorkoutId = workout.id;
    saveState();
    renderWorkout();
    closeSheet("workoutsSheet");
  }
  if (button.dataset.action === "rename") {
    await renameWorkout(workout);
    renderWorkoutsList();
  }
  if (button.dataset.action === "delete") {
    if (state.workouts.length === 1) return showToast("You need at least one workout");
    const ok = await confirmDialog(`Delete "${workout.name}"?`, "Your logged history stays.", "Delete");
    if (!ok) return;
    state.workouts = state.workouts.filter(w => w.id !== workout.id);
    if (state.activeWorkoutId === workout.id) state.activeWorkoutId = state.workouts[0].id;
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
  state.workouts.push(workout);
  state.activeWorkoutId = workout.id;
  saveState();
  renderWorkout();
  closeSheet("workoutsSheet");
  showToast(`Created ${workout.name}`);
});

async function renameWorkout(workout) {
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

/* ============================================================
   COLOR THEMES
   The colors live only in css/style.css. To add a theme, add a
   [data-theme="..."] block there and its name here.
   applyTheme() is in index.html, so the theme is set before the page draws.
   ============================================================ */

const THEMES = [
  { id: "crimson", name: "Crimson" },
  { id: "violet",  name: "Violet" },
  { id: "frost",   name: "Frost" },
  { id: "emerald", name: "Emerald" }
];

function renderThemeSwatches() {
  const current = document.documentElement.dataset.theme;
  // data-theme on the color dots makes them use that theme's colors from style.css
  $("themeSwatches").innerHTML = THEMES.map(t => `
    <button class="swatch ${t.id === current ? "on" : ""}" data-theme-id="${t.id}">
      <div class="swatch-colors" data-theme="${t.id}"><i></i><i></i><i></i></div>
      <div class="swatch-name">${t.name}</div>
    </button>`).join("");
}

// Units and duration display: two-choice switches that reuse the History toggle's sliding pill
function renderSettingPicks() {
  document.querySelectorAll("#settingsSheet .segmented").forEach(group => {
    const current = state.settings[group.dataset.setting];
    const buttons = [...group.querySelectorAll(".seg")];
    group.dataset.pick = buttons.findIndex(b => b.dataset.value === current);
    buttons.forEach(b => {
      const on = b.dataset.value === current;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1; // radio group: one tab stop, arrows move within it
    });
  });
}

$("settingsBtn").addEventListener("click", () => {
  renderThemeSwatches();
  renderSettingPicks();
  openSheet("settingsSheet");
});

function chooseSetting(group, button) {
  state.settings[group.dataset.setting] = button.dataset.value;
  saveState();
  renderSettingPicks();
  renderWorkout();
  renderCardio();
  renderHistory();
}

document.querySelectorAll("#settingsSheet .segmented").forEach(group => {
  group.addEventListener("click", event => {
    const button = event.target.closest(".seg");
    if (button) chooseSetting(group, button);
  });
  group.addEventListener("keydown", event => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const buttons = [...group.querySelectorAll(".seg")];
    const next = buttons[(buttons.indexOf(document.activeElement) + step + buttons.length) % buttons.length];
    chooseSetting(group, next);
    next.focus();
  });
});

$("themeSwatches").addEventListener("click", event => {
  const swatch = event.target.closest(".swatch");
  if (!swatch) return;
  state.theme = swatch.dataset.themeId;
  saveState();
  applyTheme(state.theme);
  renderThemeSwatches();
});

/* ============================================================
   BACKUP (export / import your data as a file)
   The file format and checks are in logic.js (buildExport, parseImport).
   ============================================================ */

const PREIMPORT_KEY = STORAGE_KEY + "-preimport"; // safety copy of what was here before an import

// Swap in new data. Everything else (saving, redrawing) is up to the caller.
function replaceState(newState) {
  state = newState;
}

function redrawEverything() {
  applyTheme(state.theme);
  renderWorkout();
  renderCardio();
  renderHistory();
  renderThemeSwatches();
  renderSettingPicks();
}

$("exportBtn").addEventListener("click", () => {
  const text = JSON.stringify(buildExport(state), null, 2);
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

  const before = state;
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
   FORMS + CONFIRM (small pop-up questions)
   ============================================================ */

let formResolve = null;

/*
  Shows a small form in a sheet and waits for an answer.
  Returns the values typed in, or null if the user closes it.
  (A "Promise" is how JavaScript waits for something to happen later.)
*/
function showForm({ title, fields = [], submitLabel = "Save", musclePicker = false, message = "", danger = false }) {
  $("formTitle").textContent = title;
  const form = $("form");

  form.innerHTML = `
    ${message ? `<p class="muted" style="margin:0">${escapeHtml(message)}</p>` : ""}
    ${fields.map(f => `
      <label class="field-label" for="field-${f.name}">${escapeHtml(f.label)}</label>
      <input class="text-input" id="field-${f.name}" name="${f.name}" value="${escapeHtml(f.value)}" maxlength="60" autocomplete="off" required>
    `).join("")}
    ${musclePicker ? `
      <label class="field-label">Muscles worked — tap once for <b style="color:var(--accent)">primary</b>, twice for <b style="color:var(--accent-soft)">secondary</b></label>
      <div class="chip-row wrap" id="customMuscles">
        ${ALL_MUSCLES.map(m => `<button type="button" class="chip" data-muscle="${m}" data-level="0">${m}</button>`).join("")}
      </div>` : ""}
    <button type="submit" class="btn ${danger ? "danger" : "primary"} big">${escapeHtml(submitLabel)}</button>
  `;

  if (musclePicker) {
    // Each tap cycles: off → primary → secondary → off
    $("customMuscles").addEventListener("click", event => {
      const chip = event.target.closest(".chip");
      if (!chip) return;
      const level = (Number(chip.dataset.level) + 1) % 3;
      chip.dataset.level = level;
      chip.classList.toggle("on", level === 1);
      chip.classList.toggle("on-secondary", level === 2);
    });
  }

  openSheet("formSheet");
  const firstInput = form.querySelector("input");
  if (firstInput) setTimeout(() => { firstInput.focus(); firstInput.select(); }, 350);

  return new Promise(resolve => {
    formResolve = resolve;
    form.onsubmit = event => {
      event.preventDefault();
      const values = {};
      fields.forEach(f => { values[f.name] = form.elements[f.name].value.trim(); });
      if (musclePicker) {
        const chips = [...form.querySelectorAll("#customMuscles .chip")];
        values.primary = chips.filter(c => c.dataset.level === "1").map(c => c.dataset.muscle);
        values.secondary = chips.filter(c => c.dataset.level === "2").map(c => c.dataset.muscle);
      }
      formResolve = null;
      closeSheet("formSheet");
      resolve(values);
    };
  });
}

// "Are you sure?" question. Returns true or false.
async function confirmDialog(title, message, confirmLabel) {
  return (await showForm({ title, message, submitLabel: confirmLabel, danger: true })) !== null;
}

/* ============================================================
   TOAST (little message at the bottom)
   ============================================================ */

let toastTimer;
function showToast(message, actionLabel, onAction) {
  const toast = $("toast");
  toast.innerHTML = escapeHtml(message);
  toast.style.pointerEvents = actionLabel ? "auto" : "none"; // only clickable when it has a button

  if (actionLabel) {
    const btn = document.createElement("button");
    btn.textContent = actionLabel;
    btn.style.cssText = "margin-left:12px;background:none;border:none;color:var(--accent-soft);font-weight:800;padding:10px 8px;margin:-10px -8px -10px 4px"; // big tap area, same look
    btn.onclick = () => { onAction(); toast.classList.remove("show"); };
    toast.appendChild(btn);
  }

  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), actionLabel ? 4000 : 2200);
}

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
    database = await response.json();
    database.forEach(ex => { databaseById[ex.id] = ex; });
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
