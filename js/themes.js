/* ============================================================
   COLOR THEMES
   The colors live only in css/style.css. To add a theme, add a
   [data-theme="..."] block there and its name here.
   applyTheme() is in index.html, so the theme is set before the page draws.
   ============================================================ */

import { $, store, saveState } from "./store.js";
import { openSheet } from "./ui/sheets.js";
import { renderHistory } from "./history.js";
import { renderCardio } from "./cardio.js";
// TEMP: these move out of app.js in later steps
import { renderWorkout } from "./app.js";

const THEMES = [
  { id: "crimson", name: "Crimson" },
  { id: "violet",  name: "Violet" },
  { id: "frost",   name: "Frost" },
  { id: "emerald", name: "Emerald" }
];

export function renderThemeSwatches() {
  const current = document.documentElement.dataset.theme;
  // data-theme on the color dots makes them use that theme's colors from style.css
  $("themeSwatches").innerHTML = THEMES.map(t => `
    <button class="swatch ${t.id === current ? "on" : ""}" data-theme-id="${t.id}">
      <div class="swatch-colors" data-theme="${t.id}"><i></i><i></i><i></i></div>
      <div class="swatch-name">${t.name}</div>
    </button>`).join("");
}

// Units and duration display: two-choice switches that reuse the History toggle's sliding pill
export function renderSettingPicks() {
  document.querySelectorAll("#settingsSheet .segmented").forEach(group => {
    const current = store.state.settings[group.dataset.setting];
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

function chooseSetting(group, button) {
  store.state.settings[group.dataset.setting] = button.dataset.value;
  saveState();
  renderSettingPicks();
  renderWorkout();
  renderCardio();
  renderHistory();
}

// Wires up the Settings sheet. Called once from app.js when the app starts.
export function setupThemes() {
  $("settingsBtn").addEventListener("click", () => {
    renderThemeSwatches();
    renderSettingPicks();
    openSheet("settingsSheet");
  });

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
    store.state.theme = swatch.dataset.themeId;
    saveState();
    applyTheme(store.state.theme);
    renderThemeSwatches();
  });
}
