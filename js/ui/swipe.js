/* ============================================================
   SWIPE GESTURE (shared by any list with swipeable rows)
   ============================================================ */

import { $, store, saveState, prefersReducedMotion } from "../store.js";
// TEMP: openSheets moves to ui/sheets.js in the next step
import { openSheets } from "../app.js";

// How far a swipe has to go to count, as a share of the row's width (a third)
export const SWIPE_THRESHOLD = 1 / 3;

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
export function enableSwipe(list, rowSelector, direction, threshold, onSwipe) {
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
   (remembered in store.state.hintsSeen). */

const hintWaiting = {};

// findRow() returns the row to animate, or nothing if it isn't on screen right now.
// It's checked again just before playing, in case the list was redrawn meanwhile.
function showHintOnce(name, findRow, direction) {
  store.state.hintsSeen ??= {};
  if (store.state.hintsSeen[name] || hintWaiting[name] || prefersReducedMotion() || !findRow()) return;
  hintWaiting[name] = true;
  setTimeout(() => {
    hintWaiting[name] = false;
    const row = findRow();
    if (!row) return; // gone now; try again next time
    store.state.hintsSeen[name] = true;
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
export function hintCrossOff() {
  showHintOnce("crossOff", () => {
    if (openSheets.length) return null;
    if ($("tab-workout").classList.contains("active")) return $("exerciseList").querySelector(".card");
    if ($("tab-cardio").classList.contains("active")) return $("cardioList").querySelector(".card");
  }, -1);
}

// Swipe right to add: shown on the first search result
export function hintAdd() {
  showHintOnce("add", () => {
    const top = openSheets.at(-1);
    if (top === "browserSheet") return $("resultsList").querySelector("li.swipe");
    if (top === "cardioSheet") return $("cardioResults").querySelector("li.swipe");
  }, 1);
}
