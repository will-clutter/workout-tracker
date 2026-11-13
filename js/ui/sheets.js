/* ============================================================
   SHEETS (the panels that slide up)
   ============================================================ */

import { $ } from "../store.js";
import { hintCrossOff } from "./swipe.js";
// TEMP: cancelPendingForm moves to ui/forms.js in the next step
import { cancelPendingForm } from "../app.js";

export const openSheets = []; // a stack, so a sheet can open on top of another
const sheetOpeners = {}; // which element had focus before each sheet opened, so focus can go back

// While any sheet is open, the page and tab bar can't be reached with Tab or a screen reader
function setPageInert(inert) {
  document.querySelector("main").inert = inert;
  document.querySelector(".tabbar").inert = inert;
}

export function openSheet(id) {
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

export function closeSheet(id) {
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

// Wires up all the sheets. Called once from app.js when the app starts.
export function setupSheets() {
  // Screen readers: each sheet is a modal dialog, and can take focus itself when it opens
  document.querySelectorAll(".sheet").forEach(sheet => {
    sheet.setAttribute("aria-modal", "true");
    sheet.tabIndex = -1;
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
