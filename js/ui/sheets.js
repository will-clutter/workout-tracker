/* ============================================================
   SHEETS (the panels that slide up)
   ============================================================ */

import { $ } from "../store.js";
import { hintCrossOff } from "./swipe.js";
import { cancelPendingForm } from "./forms.js";

export const openSheets = []; // a stack, so a sheet can open on top of another
const sheetOpeners = {}; // which element had focus before each sheet opened, so focus can go back

// While any sheet is open, the page and tab bar can't be reached with Tab or a screen reader.
// With sheets stacked, only the top one is live: every sheet underneath is inert too.
function updateInert() {
  const anyOpen = openSheets.length > 0;
  document.querySelector("main").inert = anyOpen;
  document.querySelector(".tabbar").inert = anyOpen;
  const top = openSheets[openSheets.length - 1];
  document.querySelectorAll(".sheet").forEach(sheet => {
    sheet.inert = openSheets.includes(sheet.id) && sheet.id !== top;
  });
}

export function openSheet(id) {
  const sheet = $(id);
  if (!openSheets.includes(id)) {
    sheetOpeners[id] = document.activeElement;
    openSheets.push(id);
  }
  updateInert();
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

export function closeSheet(id) {
  $(id).classList.remove("open");
  const index = openSheets.indexOf(id);
  if (index !== -1) openSheets.splice(index, 1);
  const opener = sheetOpeners[id];
  delete sheetOpeners[id];
  updateInert(); // the sheet underneath (if any) becomes live again
  if (opener && opener.isConnected) opener.focus({ preventScroll: true });
  if (openSheets.length === 0) {
    $("backdrop").classList.remove("show");
    document.body.style.overflow = "";
    hintCrossOff(); // e.g. back from adding your first exercises by swiping
  }
  if (id === "formSheet") cancelPendingForm();
}

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

// Drag a sheet down to close it (like iOS sheets). Starts from the grab bar / header area at
// the top, or from anywhere once the sheet is scrolled to the top. Touch uses touch events (so the
// page scroll can be cancelled once we take over); a mouse can drag from the top area only.
const DRAG_ZONE = 64;       // px from the sheet's top edge that always count as the handle
const CLOSE_DISTANCE = 100; // dragged further than this closes
const CLOSE_VELOCITY = 0.5; // px per ms; a quick flick closes even when short
const START_SLOP = 6;       // px of movement before deciding what the gesture is

function setupSheetDrag(sheet) {
  let startX = 0, startY = 0, lastY = 0, lastTime = 0, velocity = 0;
  let state = "idle"; // idle -> pending (finger down) -> dragging, or -> ignored
  let zoneStart = false;

  function begin(x, y, target) {
    state = "idle";
    // Only the top sheet, once it's fully open, and not on controls that use their own gestures
    if (openSheets[openSheets.length - 1] !== sheet.id || !sheet.classList.contains("open")) return;
    if (target.closest("input[type=range], .drag-handle")) return;
    const inZone = y - sheet.getBoundingClientRect().top < DRAG_ZONE && !sheet.classList.contains("head-hidden");
    zoneStart = inZone;
    if (!inZone && sheet.scrollTop > 0) return; // lower down, a scrolled sheet just scrolls
    state = "pending";
    startX = x; startY = y; lastY = y; lastTime = performance.now(); velocity = 0;
  }

  // Returns true when the sheet is being dragged (so the caller cancels the page scroll)
  function move(x, y) {
    if (state === "idle" || state === "ignored") return false;
    const dx = x - startX, dy = y - startY;
    if (state === "pending") {
      if (Math.abs(dx) < START_SLOP && Math.abs(dy) < START_SLOP) return false;
      // Sideways (chip row, swipe rows), upward, or scrolled since we started: not ours
      if (Math.abs(dx) > Math.abs(dy) || dy < 0 || (!zoneStart && sheet.scrollTop > 0)) {
        state = "ignored";
        return false;
      }
      state = "dragging";
      sheet.style.transition = "none";
    }
    const now = performance.now();
    if (now > lastTime) velocity = (y - lastY) / (now - lastTime);
    lastY = y; lastTime = now;
    sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
    return true;
  }

  function end(y) {
    const wasDragging = state === "dragging";
    state = "idle";
    if (!wasDragging) return;
    const dy = y - startY;
    const shouldClose = dy > CLOSE_DISTANCE || (velocity > CLOSE_VELOCITY && dy > 20);
    // Clearing the inline styles lets the CSS transition carry it from where it is, either
    // down off-screen (the "open" class goes) or back up into place
    sheet.style.transition = "";
    sheet.style.transform = "";
    if (shouldClose) closeSheet(sheet.id);
  }

  sheet.addEventListener("touchstart", event => {
    if (event.touches.length !== 1) { state = "idle"; return; }
    begin(event.touches[0].clientX, event.touches[0].clientY, event.target);
  }, { passive: true });
  sheet.addEventListener("touchmove", event => {
    // Not passive: once we're dragging, the page must not scroll too
    if (move(event.touches[0].clientX, event.touches[0].clientY) && event.cancelable) event.preventDefault();
  }, { passive: false });
  sheet.addEventListener("touchend", event => end(event.changedTouches[0].clientY));
  sheet.addEventListener("touchcancel", () => end(startY)); // dy 0, so it springs back

  // Mouse (desktop): the top area only, so selecting text further down still works
  sheet.addEventListener("pointerdown", event => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    begin(event.clientX, event.clientY, event.target);
    if (state !== "pending" || !zoneStart) state = "idle";
  });
  sheet.addEventListener("pointermove", event => {
    if (event.pointerType !== "mouse") return;
    // Capture only once a drag really starts, so a plain click on the close button still works
    if (move(event.clientX, event.clientY) && !sheet.hasPointerCapture(event.pointerId)) {
      sheet.setPointerCapture(event.pointerId);
    }
  });
  sheet.addEventListener("pointerup", event => {
    if (event.pointerType === "mouse") end(event.clientY);
  });
  sheet.addEventListener("pointercancel", event => {
    if (event.pointerType === "mouse") end(startY);
  });
}

// Wires up all the sheets. Called once from main.js when the app starts.
export function setupSheets() {
  // Screen readers: each sheet is a modal dialog, and can take focus itself when it opens
  document.querySelectorAll(".sheet").forEach(sheet => {
    sheet.setAttribute("aria-modal", "true");
    sheet.tabIndex = -1;
    setupSheetDrag(sheet);
  });

  // Escape closes the top sheet
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && openSheets.length) closeSheet(openSheets[openSheets.length - 1]);
  });

  // Tapping the dark background closes the top sheet
  $("backdrop").addEventListener("click", () => {
    if (openSheets.length) closeSheet(openSheets[openSheets.length - 1]);
  });

  autoHideHeader($("browserSheet"));

  document.querySelectorAll(".close-sheet").forEach(button => {
    button.addEventListener("click", () => closeSheet(button.closest(".sheet").id));
  });
}
