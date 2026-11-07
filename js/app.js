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
const RESULTS_PAGE_SIZE = 50;
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

// Look up an exercise by id, in the database or your custom ones
function getExercise(exId) {
  return databaseById[exId] || state.customExercises.find(e => e.id === exId) || null;
}

// Makes user-typed text safe to put inside HTML
function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

// Shortcut for document.getElementById
const $ = id => document.getElementById(id);

/* ============================================================
   WORKOUT TAB
   ============================================================ */

function renderWorkout() {
  const workout = activeWorkout();
  $("workoutName").textContent = workout.name;
  $("switcherName").textContent = workout.name;

  const list = $("exerciseList");
  list.innerHTML = "";
  workout.items.forEach(item => list.appendChild(buildExerciseCard(item)));

  $("emptyState").classList.toggle("hidden", workout.items.length > 0);
  $("exercisesLabel").classList.toggle("hidden", workout.items.length === 0);
  $("logBtn").classList.toggle("hidden", workout.items.length === 0);
  renderSummaryMap();
}

// Which cards are expanded (open for editing). Not saved; resets on reload.
const openCards = new Set();

// Small square picture for an exercise. Uses its first photo, or the
// first letter of its name if it has no photos (like custom exercises).
function thumbHtml(ex, size = "") {
  const photo = ex && ex.images && ex.images[0];
  const letter = escapeHtml((ex?.name || "?").charAt(0).toUpperCase());
  if (!photo) return `<span class="thumb ${size}">${letter}</span>`;
  return `<span class="thumb ${size}">
    <img src="${THUMB_DIR + encodeURIComponent(ex.id)}.webp" alt="" loading="lazy"
         onerror="this.parentElement.textContent='${letter}'">
  </span>`;
}

// "3 sets · 10 reps · 60 lb"
function summaryHtml(item) {
  const parts = [`<b>${escapeHtml(item.sets || "–")}</b> sets`, `<b>${escapeHtml(item.reps || "–")}</b> reps`];
  if (item.weight) parts.push(`<b>${escapeHtml(item.weight)}</b> lb`);
  return parts.join(" · ") + (item.notes ? " · 📝" : "");
}

// One exercise card in the workout
function buildExerciseCard(item) {
  const exercise = getExercise(item.exId);
  const name = exercise ? exercise.name : item.name || "Unknown exercise";
  const isOpen = openCards.has(item.uid);

  const li = document.createElement("li");
  li.className = "card glass" + (isOpen ? " open" : "");
  li.dataset.uid = item.uid;
  li.innerHTML = `
    <button class="row" data-action="toggle" aria-expanded="${isOpen}">
      ${thumbHtml(exercise)}
      <span class="row-text">
        <div class="row-name">${escapeHtml(name)}</div>
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

// One click handler for every card (this is called "event delegation")
$("exerciseList").addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const card = button.closest(".card");
  const item = activeWorkout().items.find(i => i.uid === card.dataset.uid);
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
$("exerciseList").addEventListener("input", event => {
  const field = event.target.dataset.field;
  if (!field) return;
  const card = event.target.closest(".card");
  const item = activeWorkout().items.find(i => i.uid === card.dataset.uid);
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

// Body map for every muscle in the whole workout
function renderSummaryMap() {
  const primary = new Set();
  const secondary = new Set();
  activeWorkout().items.forEach(item => {
    const ex = getExercise(item.exId);
    if (!ex) return;
    ex.primaryMuscles.forEach(m => primary.add(m));
    ex.secondaryMuscles.forEach(m => secondary.add(m));
  });
  primary.forEach(m => secondary.delete(m)); // primary wins if a muscle is in both
  $("summaryMap").classList.toggle("hidden", activeWorkout().items.length === 0);
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

$("logBtn").addEventListener("click", () => {
  const workout = activeWorkout();
  if (workout.items.length === 0) return;

  // Save a copy ("snapshot") of the workout as it is right now
  state.history.unshift({
    id: makeId(),
    date: new Date().toISOString(),
    workoutName: workout.name,
    items: workout.items.map(item => ({
      name: getExercise(item.exId)?.name || "Unknown exercise",
      sets: item.sets, reps: item.reps, weight: item.weight, notes: item.notes
    }))
  });
  saveState();
  renderHistory();
  showToast(`Logged ${workout.name} 💪`);
});

function renderHistory() {
  const list = $("historyList");
  list.innerHTML = "";
  $("historyEmpty").classList.toggle("hidden", state.history.length > 0);

  state.history.forEach(session => {
    const date = new Date(session.date).toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric", year: "numeric"
    });
    const li = document.createElement("li");
    li.innerHTML = `
      <details class="session glass">
        <summary>
          <div>
            <div class="date">${escapeHtml(date)}</div>
            <div><b>${escapeHtml(session.workoutName)}</b></div>
          </div>
          <div class="count">${session.items.length} exercise${session.items.length === 1 ? "" : "s"} ▾</div>
        </summary>
        <ul>
          ${session.items.map(i => `
            <li>
              <b>${escapeHtml(i.name)}</b> — ${escapeHtml(i.sets || "?")} × ${escapeHtml(i.reps || "?")}${i.weight ? ` @ ${escapeHtml(i.weight)} lbs` : ""}
              ${i.notes ? `<div class="note">${escapeHtml(i.notes)}</div>` : ""}
            </li>`).join("")}
        </ul>
        <div class="session-actions">
          <button class="btn danger small" data-delete="${session.id}">Delete session</button>
        </div>
      </details>`;
    list.appendChild(li);
  });
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

document.querySelectorAll(".tab-btn").forEach(button => {
  button.addEventListener("click", () => {
    if (button.classList.contains("active")) return; // already on this tab
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b === button));
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.id === "tab-" + button.dataset.tab));
    moveTabIndicator(button, true);
    window.scrollTo({ top: 0 });
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

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!animate || reduceMotion) return;

  const at = (p, scale) => `translate(${p.x}px, ${p.y}px) scale(${scale})`;
  tabIndicator.animate([
    { transform: at(from, 1),  easing: "cubic-bezier(0.5, 0, 0.75, 0)" }, // start shrinking
    { transform: at(from, 0),  offset: 0.4 },                              // gone
    { transform: at(to, 0),    offset: 0.42, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }, // jump while invisible
    { transform: at(to, 1.15), offset: 0.85 },                             // grow, slightly too big
    { transform: at(to, 1) }                                               // settle
  ], { duration: 1200 });
}

// Put the circle in place when the app opens, and keep it there if the window resizes
requestAnimationFrame(() => moveTabIndicator(document.querySelector(".tab-btn.active"), false));
window.addEventListener("resize", () => moveTabIndicator(document.querySelector(".tab-btn.active"), false));

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
  resultsShown = RESULTS_PAGE_SIZE;
  renderResults();
});

$("equipmentSelect").addEventListener("change", event => {
  filters.equipment = event.target.value;
  resultsShown = RESULTS_PAGE_SIZE;
  renderResults();
});

$("searchInput").addEventListener("input", event => {
  filters.search = event.target.value.trim().toLowerCase();
  resultsShown = RESULTS_PAGE_SIZE;
  renderResults();
});

$("moreResultsBtn").addEventListener("click", () => {
  resultsShown += RESULTS_PAGE_SIZE;
  renderResults();
});

// Does this exercise match the current search + filters?
function matchesFilters(ex) {
  if (filters.muscle && !ex.primaryMuscles.includes(filters.muscle) && !ex.secondaryMuscles.includes(filters.muscle)) return false;
  if (filters.equipment && ex.equipment !== filters.equipment) return false;
  if (filters.search) {
    // Every word you type has to appear somewhere in the name
    const name = ex.name.toLowerCase();
    return filters.search.split(/\s+/).every(word => name.includes(word));
  }
  return true;
}

function renderResults() {
  const all = [...state.customExercises, ...database];
  const matches = all.filter(matchesFilters);
  const inWorkout = new Set(activeWorkout().items.map(i => i.exId));

  const list = $("resultsList");
  list.innerHTML = matches.length
    ? `<li class="results-count">${matches.length} exercise${matches.length === 1 ? "" : "s"}</li>`
    : `<li class="empty"><p>No matches.</p><p class="muted">Try another word, or create your own exercise above.</p></li>`;

  matches.slice(0, resultsShown).forEach(ex => {
    const li = document.createElement("li");
    li.innerHTML = `
      <button class="result" data-id="${escapeHtml(ex.id)}">
        ${thumbHtml(ex, "small")}
        <span class="result-text">
          <div class="result-name">${escapeHtml(ex.name)}</div>
          <div class="result-meta">${escapeHtml(ex.primaryMuscles.join(", "))}${ex.equipment ? " · " + escapeHtml(ex.equipment) : ""}${ex.custom ? " · custom" : ""}</div>
        </span>
        ${inWorkout.has(ex.id) ? `<span class="result-dot" title="In this workout"></span>` : `<span class="result-add">›</span>`}
      </button>`;
    list.appendChild(li);
  });

  $("moreResultsBtn").classList.toggle("hidden", matches.length <= resultsShown);
}

$("resultsList").addEventListener("click", event => {
  const result = event.target.closest(".result");
  if (result) openDetail(result.dataset.id);
});

/* ============================================================
   EXERCISE DETAILS ("more info" + body map)
   ============================================================ */

function openDetail(exId, { inWorkout = false } = {}) {
  const ex = getExercise(exId);
  if (!ex) return;
  const workout = activeWorkout();
  const alreadyAdded = workout.items.some(i => i.exId === exId);

  $("detailName").textContent = ex.name;

  const tags = [
    ...ex.primaryMuscles.map(m => `<span class="tag p">${escapeHtml(m)}</span>`),
    ...ex.secondaryMuscles.map(m => `<span class="tag s">${escapeHtml(m)}</span>`),
    ex.equipment ? `<span class="tag">${escapeHtml(ex.equipment)}</span>` : "",
    ex.level ? `<span class="tag">${escapeHtml(ex.level)}</span>` : ""
  ].join("");

  const photos = (ex.images || []).map((src, i) =>
    `<img src="${PHOTO_DIR + encodeURIComponent(ex.id)}_${i}.webp" alt="${escapeHtml(ex.name)} demonstration" loading="lazy" onerror="this.remove()">`
  ).join("");

  const steps = (ex.instructions || []).map(s => `<li>${escapeHtml(s)}</li>`).join("");

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
    ${steps ? `<details class="more-info glass"><summary>How to do it</summary><ol>${steps}</ol></details>` : ""}
    ${ex.custom ? `<button class="btn danger small" id="deleteCustomBtn">Delete this custom exercise</button>` : ""}
    <div class="detail-actions">${actionButton}</div>
  `;

  const addBtn = $("addToWorkoutBtn");
  if (addBtn) addBtn.addEventListener("click", () => addToWorkout(ex, addBtn));
  const closeBtn = $("detailBody").querySelector("[data-close]");
  if (closeBtn) closeBtn.addEventListener("click", () => closeSheet("detailSheet"));
  const delBtn = $("deleteCustomBtn");
  if (delBtn) delBtn.addEventListener("click", () => deleteCustomExercise(ex));

  openSheet("detailSheet");
}

function addToWorkout(ex, button) {
  const workout = activeWorkout();
  const item = { uid: makeId(), exId: ex.id, sets: DEFAULT_SETS, reps: DEFAULT_REPS, weight: "", notes: "" };
  workout.items.push(item);
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
    instructions: [],
    images: [],
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
        <small>${w.items.length} exercise${w.items.length === 1 ? "" : "s"}</small>
      </button>
      <button class="icon-btn" data-action="rename" aria-label="Rename">✎</button>
      <button class="icon-btn" data-action="delete" aria-label="Delete">🗑</button>
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
   The colors themselves live in css/style.css. To add a theme,
   add a [data-theme="..."] block there and an entry here.
   ============================================================ */

const THEMES = [
  { id: "crimson", name: "Crimson", colors: ["#08070a", "#ff2a44", "#8a1426"] },
  { id: "violet",  name: "Violet",  colors: ["#0d0a16", "#b388ff", "#5b3a99"] },
  { id: "frost",   name: "Frost",   colors: ["#060b14", "#4cc3ff", "#1f5f8f"] },
  { id: "emerald", name: "Emerald", colors: ["#050b09", "#2ee59d", "#146b4b"] }
];

function applyTheme(themeId) {
  document.documentElement.dataset.theme = themeId;
  // Also color the phone's status bar area to match
  const bg = THEMES.find(t => t.id === themeId)?.colors[0];
  if (bg) document.querySelector('meta[name="theme-color"]').content = bg;
}

function renderThemeSwatches() {
  const current = state.theme || "crimson";
  $("themeSwatches").innerHTML = THEMES.map(t => `
    <button class="swatch ${t.id === current ? "on" : ""}" data-theme-id="${t.id}">
      <div class="swatch-colors">${t.colors.map(c => `<i style="background:${c}"></i>`).join("")}</div>
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
  const result = await showForm({ title, message, submitLabel: confirmLabel, danger: true });
  return result !== null;
}

/* ============================================================
   TOAST (little message at the bottom)
   ============================================================ */

let toastTimer;
function showToast(message, actionLabel, onAction) {
  const toast = $("toast");
  toast.innerHTML = escapeHtml(message);
  toast.style.pointerEvents = "none";

  if (actionLabel) {
    const btn = document.createElement("button");
    btn.textContent = actionLabel;
    btn.style.cssText = "margin-left:12px;background:none;border:none;color:var(--accent-dark);font-weight:800;padding:0";
    btn.onclick = () => { onAction(); toast.classList.remove("show"); };
    toast.appendChild(btn);
    toast.style.pointerEvents = "auto";
  }

  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), actionLabel ? 4000 : 2200);
}

/* ============================================================
   START THE APP
   ============================================================ */

async function start() {
  applyTheme(state.theme || "crimson");
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
