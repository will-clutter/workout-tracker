/* ============================================================
   LOGGING + HISTORY
   ============================================================ */

import { $, store, saveState, units, activeWorkout, getExercise } from "./store.js";
import { showToast } from "./ui/toast.js";
import { enableSwipe } from "./ui/swipe.js";

// Save a copy ("snapshot") of the workout as it is right now,
// including which exercises were crossed off
export function logSession(workout) {
  store.state.history.unshift(buildHistoryEntry(workout, exId => getExercise(exId)?.name));
  saveState();
  renderHistory();
}

// Which half of History is showing: "workouts" or "cardio". Not saved; resets on reload.
let historyView = "workouts";

// One exercise line in a History session (words = the search words to highlight)
function historyLineHtml(item, isCardio, words = []) {
  const name = `<b>${highlightText(item.name, words)}</b>`;
  if (isCardio) {
    const parts = cardioSummaryParts(item, store.state.settings);
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

export function renderHistory() {
  const showCardio = historyView === "cardio";
  const all = sortSessionsNewestFirst(store.state.history.filter(s => isCardioSession(s) === showCardio));
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

// Delete a session right away; the toast's Undo puts it back where it was
function deleteSession(id) {
  const index = store.state.history.findIndex(s => s.id === id);
  if (index < 0) return;
  const [session] = store.state.history.splice(index, 1);
  saveState();
  renderHistory();
  showToast("Deleted session", "Undo", () => {
    store.state.history.splice(Math.min(index, store.state.history.length), 0, session);
    saveState();
    renderHistory();
  });
}

// Wires up the Log button and the History tab. Called once from app.js when the app starts.
export function setupHistory() {
  $("logBtn").addEventListener("click", () => {
    const workout = activeWorkout();
    logSession(workout);
    showToast(`Logged ${workout.name}`);
  });

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
}
