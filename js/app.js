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
const DEFAULT_SETS = "3";
const DEFAULT_REPS = "10";

/* ============================================================
   DATA
   ============================================================ */

// The exercise database (filled in once data/exercises.json loads)
let database = [];
let databaseById = {};

// Your data. This is what gets saved on your phone.
let state = loadState();

function defaultState() {
  const id = makeId();
  return {
    workouts: [{ id, name: "Your Workout", items: [] }],
    activeWorkoutId: id,
    customExercises: [],
    history: []
  };
}

// Read saved data from the browser's storage (localStorage)
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.workouts) && saved.workouts.length > 0) return saved;
  } catch (err) {
    console.warn("Couldn't read saved data, starting fresh.", err);
  }
  return defaultState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    showToast("Couldn't save. Is storage full or blocked?");
  }
}

// A short random ID, used to tell items apart
function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

// The workout currently on screen
function activeWorkout() {
  return state.workouts.find(w => w.id === state.activeWorkoutId) || state.workouts[0];
}

function isInWorkout(exId) {
  return activeWorkout().items.some(i => i.exId === exId);
}

// A fresh workout entry for an exercise, with the default sets/reps
function newItem(ex) {
  return { uid: makeId(), exId: ex.id, sets: DEFAULT_SETS, reps: DEFAULT_REPS, weight: "", notes: "" };
}

// Look up an exercise by id, in the database or your custom ones
function getExercise(exId) {
  return databaseById[exId] || state.customExercises.find(e => e.id === exId);
}

// "1 exercise", "3 exercises"
function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Makes user-typed text safe to put inside HTML
function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

// Shortcut for document.getElementById
const $ = id => document.getElementById(id);

// Has the phone/computer asked for less animation? (an accessibility setting)
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Small SVG icons (Font Awesome Free) used inside the app's HTML
const ICONS = {
  note: `<svg class="icon inline" viewBox="0 0 448 512" role="img" aria-label="Has notes"><path d="M64 480c-35.3 0-64-28.7-64-64L0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 213.5c0 17-6.7 33.3-18.7 45.3L322.7 461.3c-12 12-28.3 18.7-45.3 18.7L64 480zM389.5 304L296 304c-13.3 0-24 10.7-24 24l0 93.5 117.5-117.5z"/></svg>`,
  trash: `<svg class="icon" viewBox="0 0 448 512" aria-hidden="true"><path d="M136.7 5.9L128 32 32 32C14.3 32 0 46.3 0 64S14.3 96 32 96l384 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0-8.7-26.1C306.9-7.2 294.7-16 280.9-16L167.1-16c-13.8 0-26 8.8-30.4 21.9zM416 144L32 144 53.1 467.1C54.7 492.4 75.7 512 101 512L347 512c25.3 0 46.3-19.6 47.9-44.9L416 144z"/></svg>`
};

/* ============================================================
   WORKOUT TAB
   ============================================================ */

function renderWorkout() {
  const workout = activeWorkout();
  $("workoutName").textContent = workout.name;
  $("switcherName").textContent = workout.name;

  // Still to do (in your order) on top; crossed off below, in the order you finished them
  const todo = workout.items.filter(i => !i.doneAt);
  const done = workout.items.filter(i => i.doneAt).sort((a, b) => a.doneAt - b.doneAt);
  $("exerciseList").replaceChildren(...todo.map(buildExerciseCard));
  $("completedList").replaceChildren(...done.map(buildExerciseCard));
  $("exercisesLabel").classList.toggle("hidden", todo.length === 0);
  $("completedHead").classList.toggle("hidden", done.length === 0);

  const empty = workout.items.length === 0;
  $("emptyState").classList.toggle("hidden", !empty);
  ["logBtn", "summaryMap"].forEach(id => $(id).classList.toggle("hidden", empty));
  renderSummaryMap(workout);
  hintCrossOff();
}

// Same as renderWorkout, but cards glide from their old spot to their new one
// (e.g. down into Completed) instead of jumping there.
function renderWorkoutAnimated() {
  const oldTops = new Map([...document.querySelectorAll(".card")].map(c => [c.dataset.uid, c.getBoundingClientRect().top]));
  renderWorkout();
  if (prefersReducedMotion()) return;

  const moved = [...document.querySelectorAll(".card")].filter(c => oldTops.has(c.dataset.uid));
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
  if (item.weight) parts.push(`<b>${escapeHtml(item.weight)}</b> lb`);
  return parts.join(" · ") + (item.notes ? ` · ${ICONS.note}` : "");
}

// One exercise card in the workout
function buildExerciseCard(item) {
  const exercise = getExercise(item.exId);
  const name = exercise ? exercise.name : "Unknown exercise";
  const isOpen = openCards.has(item.uid);

  const li = document.createElement("li");
  // swipe-done = swipe left to cross off; crossed-off cards swipe right to undo
  li.className = "card glass swipe " + (item.doneAt ? "done swipe-undo" : "swipe-done") + (isOpen ? " open" : "");
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

    <div class="editor"><div class="editor-inner"><div class="editor-content">
      <div class="stats">
        <div class="stat">
          <label>Sets</label>
          <input type="number" inputmode="numeric" min="0" data-field="sets" value="${escapeHtml(item.sets)}">
        </div>
        <div class="stat">
          <label>Reps</label>
          <input type="number" inputmode="numeric" min="0" data-field="reps" value="${escapeHtml(item.reps)}">
        </div>
        <div class="stat">
          <label>Weight</label>
          <div class="weight-wrap">
            <input type="number" inputmode="decimal" min="0" step="any" placeholder="—" data-field="weight" value="${escapeHtml(item.weight)}">
            <span class="unit">lbs</span>
          </div>
        </div>
      </div>
      <textarea class="notes" data-field="notes" placeholder="Notes (e.g. last set felt heavy, try 95 next time)">${escapeHtml(item.notes)}</textarea>
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
  return activeWorkout().items.find(i => i.uid === card.dataset.uid);
}

// One click handler for every card in both lists (this is called "event delegation")
$("cards").addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const card = button.closest(".card");
  const item = itemForCard(card);
  if (!item) return;

  if (button.dataset.action === "toggle") {
    const nowOpen = card.classList.toggle("open");
    button.setAttribute("aria-expanded", nowOpen);
    if (nowOpen) openCards.add(item.uid); else openCards.delete(item.uid);
  }
  if (button.dataset.action === "info") openDetail(item.exId, { inWorkout: true });
  if (button.dataset.action === "remove") removeItem(item, card);
});

// Save whenever you type in sets / reps / weight / notes
$("cards").addEventListener("input", event => {
  const field = event.target.dataset.field;
  if (!field) return;
  const card = event.target.closest(".card");
  const item = itemForCard(card);
  if (!item) return;
  item[field] = event.target.value;
  saveState();
  card.querySelector(".row-summary").innerHTML = summaryHtml(item); // keep the summary line up to date
});

function removeItem(item, card) {
  const workout = activeWorkout();
  const index = workout.items.indexOf(item);
  card.classList.add("removing");

  // Wait for the slide-out animation, then actually remove it
  setTimeout(() => {
    workout.items.splice(index, 1);
    saveState();
    renderWorkout();
    showToast(`Removed ${getExercise(item.exId)?.name || "exercise"}`, "Undo", () => {
      workout.items.splice(index, 0, item);
      saveState();
      renderWorkout();
    });
  }, 220);
}

/* ---------- Crossing off exercises ----------
   A crossed-off exercise has doneAt = the time you finished it.
   They reset with the Reset button, or on their own on a later day. */

// Swipe a card left (at least halfway) to cross it off...
enableSwipe($("exerciseList"), ".card", -1, 0.5, card => setDone(card, true));
// ...and swipe a crossed-off card right to bring it back
enableSwipe($("completedList"), ".card", 1, 0.5, card => setDone(card, false));

function setDone(card, isDone) {
  const item = itemForCard(card);
  if (!item) return;
  const workout = activeWorkout();
  if (isDone) item.doneAt = Date.now(); else delete item.doneAt;
  saveState();

  // Draw (or erase) the line through the name first, then move the card
  card.classList.toggle("done", isDone);
  setTimeout(() => {
    renderWorkoutAnimated();
    if (!isDone) return;
    if (workout.items.every(i => i.doneAt)) {
      logSession(workout); // everything's crossed off: log it and celebrate
      celebrate(workout);
    } else {
      showToast(`Completed ${getExercise(item.exId)?.name || "exercise"}`, "Undo", () => {
        delete item.doneAt;
        saveState();
        renderWorkoutAnimated();
      });
    }
  }, 400);
}

$("resetDoneBtn").addEventListener("click", () => {
  activeWorkout().items.forEach(i => delete i.doneAt);
  saveState();
  renderWorkoutAnimated();
});

// Uncross anything crossed off on an earlier day. Returns true if anything changed.
function clearOldCrossOffs() {
  const today = new Date().toDateString();
  let changed = false;
  state.workouts.forEach(w => w.items.forEach(i => {
    if (i.doneAt && new Date(i.doneAt).toDateString() !== today) {
      delete i.doneAt;
      changed = true;
    }
  }));
  if (changed) saveState();
  return changed;
}

// Phones often keep the app open in the background for days,
// so check again whenever you come back to it
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && clearOldCrossOffs()) renderWorkout();
});

// Glow + "Workout complete" message over the screen
function celebrate(workout) {
  if (prefersReducedMotion()) return showToast(`Workout complete. Logged ${workout.name}`);
  $("celebrationName").textContent = `${workout.name} logged to History`;
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
   LOGGING + HISTORY
   ============================================================ */

// Save a copy ("snapshot") of the workout as it is right now,
// including which exercises were crossed off
function logSession(workout) {
  state.history.unshift({
    id: makeId(),
    date: new Date().toISOString(),
    workoutName: workout.name,
    items: workout.items.map(item => ({
      name: getExercise(item.exId)?.name || "Unknown exercise",
      sets: item.sets, reps: item.reps, weight: item.weight, notes: item.notes,
      done: Boolean(item.doneAt)
    }))
  });
  saveState();
  renderHistory();
}

$("logBtn").addEventListener("click", () => {
  const workout = activeWorkout();
  logSession(workout);
  showToast(`Logged ${workout.name}`);
});

function renderHistory() {
  $("historyEmpty").classList.toggle("hidden", state.history.length > 0);

  $("historyList").innerHTML = state.history.map(session => {
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
    return `<li>
      <details class="session glass">
        <summary>
          <div>
            <div class="date">${escapeHtml(date)}</div>
            <div><b>${escapeHtml(session.workoutName)}</b></div>
          </div>
          <div class="count">${count} ▾</div>
        </summary>
        <ul>
          ${session.items.map(i => `
            <li${tracked && !i.done ? ` class="skipped"` : ""}>
              ${tracked && !i.done ? `<span class="skipped-label">Not done</span>` : ""}
              <b>${escapeHtml(i.name)}</b> — ${escapeHtml(i.sets || "?")} × ${escapeHtml(i.reps || "?")}${i.weight ? ` @ ${escapeHtml(i.weight)} lbs` : ""}
              ${i.notes ? `<div class="note">${escapeHtml(i.notes)}</div>` : ""}
            </li>`).join("")}
        </ul>
        <div class="session-actions">
          <button class="btn danger small" data-delete="${session.id}">Delete session</button>
        </div>
      </details>
    </li>`;
  }).join("");
}

$("historyList").addEventListener("click", async event => {
  const id = event.target.dataset.delete;
  if (!id) return;
  const ok = await confirmDialog("Delete this session?", "This can't be undone.", "Delete");
  if (!ok) return;
  state.history = state.history.filter(s => s.id !== id);
  saveState();
  renderHistory();
});

/* ============================================================
   TABS (Workout / History)
   ============================================================ */

const tabButtons = document.querySelectorAll(".tab-btn");
tabButtons.forEach(button => {
  button.addEventListener("click", () => {
    if (button.classList.contains("active")) return; // already on this tab
    tabButtons.forEach(b => b.classList.toggle("active", b === button));
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.id === "tab-" + button.dataset.tab));
    moveTabIndicator(button, true);
    window.scrollTo({ top: 0 });
    hintCrossOff(); // only does anything on the Workout tab
  });
});

/* ---------- The circle behind the selected tab ---------- */

const tabIndicator = $("tabIndicator");
let indicatorPos = null; // where the circle is now

// Middle of a tab's icon, measured from the tab bar's top-left corner
function iconCenter(button) {
  const bar = tabIndicator.parentElement;
  const barBox = bar.getBoundingClientRect();
  const iconBox = button.querySelector(".icon").getBoundingClientRect();
  return {
    x: iconBox.left + iconBox.width / 2 - barBox.left - bar.clientLeft,
    y: iconBox.top + iconBox.height / 2 - barBox.top - bar.clientTop
  };
}

/*
  Moves the circle to a tab. With animate = true it:
  shrinks to nothing on the old tab → jumps → grows on the new tab
  (with a tiny overshoot so it feels springy).
*/
function moveTabIndicator(button, animate) {
  const to = iconCenter(button);
  const from = indicatorPos || to;
  indicatorPos = to;

  // Final resting spot (used once the animation ends)
  tabIndicator.style.setProperty("--x", to.x + "px");
  tabIndicator.style.setProperty("--y", to.y + "px");

  if (!animate || prefersReducedMotion()) return;

  const at = (p, scale) => `translate(${p.x}px, ${p.y}px) scale(${scale})`;
  tabIndicator.animate([
    { transform: at(from, 1), easing: "cubic-bezier(0.55, 0, 1, 0.45)" },  // shrink (quick)
    { transform: at(from, 0), offset: 0.3 },
    { transform: at(to, 0),   offset: 0.32, easing: "cubic-bezier(0.34, 1.3, 0.64, 1)" }, // grow with a soft bounce
    { transform: at(to, 1) }
  ], { duration: 700 });
}

// Put the circle in place when the app opens, and keep it there if the window resizes
const placeTabIndicator = () => moveTabIndicator(document.querySelector(".tab-btn.active"), false);
requestAnimationFrame(placeTabIndicator);
window.addEventListener("resize", placeTabIndicator);

/* ============================================================
   SHEETS (the panels that slide up)
   ============================================================ */

const openSheets = []; // a stack, so a sheet can open on top of another

function openSheet(id) {
  const sheet = $(id);
  if (!openSheets.includes(id)) openSheets.push(id);
  // The newest sheet sits on top
  sheet.style.zIndex = 30 + openSheets.length;
  sheet.scrollTop = 0;
  requestAnimationFrame(() => sheet.classList.add("open"));
  $("backdrop").classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeSheet(id) {
  $(id).classList.remove("open");
  const index = openSheets.indexOf(id);
  if (index !== -1) openSheets.splice(index, 1);
  if (openSheets.length === 0) {
    $("backdrop").classList.remove("show");
    document.body.style.overflow = "";
    hintCrossOff(); // e.g. back from adding your first exercises by swiping
  }
  if (id === "formSheet" && formResolve) { formResolve(null); formResolve = null; }
}

// Tapping the dark background closes the top sheet
$("backdrop").addEventListener("click", () => {
  if (openSheets.length) closeSheet(openSheets[openSheets.length - 1]);
});

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
  threshold   = how far to drag to count, as a share of the row's width (0.5 = half)
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

// Swipe left to cross off: shown on the first exercise card
function hintCrossOff() {
  showHintOnce("crossOff", () =>
    openSheets.length === 0 && $("tab-workout").classList.contains("active") &&
    $("exerciseList").querySelector(".card"), -1);
}

// Swipe right to add: shown on the first search result
function hintAdd() {
  showHintOnce("add", () =>
    openSheets.at(-1) === "browserSheet" && $("resultsList").querySelector("li.swipe"), 1);
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
  const equipment = [...new Set(database.map(e => e.equipment).filter(Boolean))].sort();
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
  if (filters.muscle && !ex.primaryMuscles.includes(filters.muscle) && !ex.secondaryMuscles.includes(filters.muscle)) return false;
  if (filters.equipment && ex.equipment !== filters.equipment) return false;
  const name = ex.name.toLowerCase();
  return words.every(word => name.includes(word));
}

function renderResults() {
  const words = filters.search ? filters.search.split(/\s+/) : []; // split once, not once per exercise
  const matches = [...state.customExercises, ...database].filter(ex => matchesFilters(ex, words));
  const inWorkout = new Set(activeWorkout().items.map(i => i.exId));

  const header = matches.length
    ? `<li class="results-count">${plural(matches.length, "exercise")}</li>`
    : `<li class="empty"><p>No matches.</p><p class="muted">Try another word, or create your own exercise above.</p></li>`;

  $("resultsList").innerHTML = header + matches.slice(0, resultsShown).map(ex => `
    <li class="swipe swipe-add">
      <button class="result" data-id="${escapeHtml(ex.id)}">
        ${thumbHtml(ex, "small")}
        <span class="result-text">
          <div class="result-name">${escapeHtml(ex.name)}</div>
          <div class="result-meta">${escapeHtml(ex.primaryMuscles.join(", "))}${ex.equipment ? " · " + escapeHtml(ex.equipment) : ""}${ex.custom ? " · custom" : ""}</div>
        </span>
        ${inWorkout.has(ex.id) ? IN_WORKOUT_DOT : `<span class="result-add">›</span>`}
      </button>
    </li>`).join("");

  $("moreResultsBtn").classList.toggle("hidden", matches.length <= resultsShown);
  hintAdd();
}

// Shown on results that are already in the workout
const IN_WORKOUT_DOT = `<span class="result-dot" title="In this workout"></span>`;

$("resultsList").addEventListener("click", event => {
  const result = event.target.closest(".result");
  if (result) openDetail(result.dataset.id);
});

// Swipe a result right (at least halfway) to add it without opening it
enableSwipe($("resultsList"), "li.swipe", 1, 0.5, row => {
  const result = row.querySelector(".result");
  const ex = getExercise(result.dataset.id);
  if (isInWorkout(ex.id)) return showToast("Already in your workout");

  activeWorkout().items.push(newItem(ex)); // card starts closed, so quick adds don't pile up open
  saveState();
  renderWorkout();
  result.querySelector(".result-add").outerHTML = IN_WORKOUT_DOT; // update just this row
  showToast(`Added ${ex.name}`);
});

/* ============================================================
   EXERCISE DETAILS ("more info" + body map)
   ============================================================ */

function openDetail(exId, { inWorkout = false } = {}) {
  const ex = getExercise(exId);
  if (!ex) return;
  const workout = activeWorkout();
  const alreadyAdded = isInWorkout(exId);

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
  if (inWorkout) {
    actionButton = `<button class="btn ghost big" data-close>Back to workout</button>`;
  } else if (alreadyAdded) {
    actionButton = `<button class="btn big added" disabled>✓ Already in ${escapeHtml(workout.name)}</button>`;
  } else {
    actionButton = `<button id="addToWorkoutBtn" class="btn primary big">＋ Add to ${escapeHtml(workout.name)}</button>`;
  }

  $("detailBody").innerHTML = `
    <div class="detail-tags">${tags}</div>
    <div class="map-panel glass">
      ${renderBodyMap(ex.primaryMuscles, ex.secondaryMuscles)}
      ${legendHtml()}
    </div>
    ${photos ? `<div class="photos">${photos}</div>` : ""}
    <div id="detailSteps" data-id="${escapeHtml(ex.id)}"></div>
    ${ex.custom ? `<button class="btn danger small" id="deleteCustomBtn">Delete this custom exercise</button>` : ""}
    <div class="detail-actions">${actionButton}</div>
  `;

  // These buttons only exist sometimes; ?. skips the ones that aren't there
  $("addToWorkoutBtn")?.addEventListener("click", event => addToWorkout(ex, event.currentTarget));
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

function addToWorkout(ex, button) {
  const item = newItem(ex);
  activeWorkout().items.push(item);
  openCards.add(item.uid); // open the new card so you can fill in weight right away
  saveState();

  // Button turns into a check mark, then the sheets close
  button.classList.remove("primary");
  button.classList.add("added");
  button.textContent = "✓ Added";
  button.disabled = true;

  setTimeout(() => {
    closeSheet("detailSheet");
    closeSheet("browserSheet");
    renderWorkout();
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
  state.workouts.forEach(w => { w.items = w.items.filter(i => i.exId !== ex.id); });
  saveState();
  closeSheet("detailSheet");
  renderResults();
  renderWorkout();
}

function capitalize(text) {
  return text.replace(/\b\w/g, c => c.toUpperCase());
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

$("settingsBtn").addEventListener("click", () => {
  renderThemeSwatches();
  openSheet("settingsSheet");
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
    btn.style.cssText = "margin-left:12px;background:none;border:none;color:var(--accent-dark);font-weight:800;padding:0";
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
  renderHistory();
  try {
    const response = await fetch("data/exercises.json");
    database = await response.json();
    database.forEach(ex => { databaseById[ex.id] = ex; });
    setupBrowser();
    renderWorkout(); // re-draw now that exercise names/muscles are known
  } catch (err) {
    console.error(err);
    showToast("Couldn't load the exercise list");
  }
}

start();
