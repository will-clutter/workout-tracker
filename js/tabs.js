/* ============================================================
   TABS (Workout / Cardio / History)
   ============================================================ */

import { $, prefersReducedMotion } from "./store.js";
import { hintCrossOff } from "./ui/swipe.js";

// Looked up from the page in setupTabs()
let tabBar;
let tabButtons;

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
/* ---------- The circle behind the selected tab ---------- */

let tabIndicator; // set in setupTabs()
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

// Wires up the tab bar. Called once from main.js when the app starts.
export function setupTabs() {
  tabBar = document.querySelector(".tabbar");
  tabButtons = [...document.querySelectorAll(".tab-btn")];
  tabIndicator = $("tabIndicator");

  // Keyboard / screen reader activation (detail is 0 for those). Touch and mouse go through gliding below.
  tabButtons.forEach(button => {
    button.addEventListener("click", event => {
      if (event.detail !== 0 || button.classList.contains("active")) return;
      moveTabIndicator(button, true);
      showTab(button);
    });
  });

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

  tabBar.addEventListener("pointerup", endGlide);
  tabBar.addEventListener("pointercancel", endGlide);

  // Put the circle in place when the app opens, and keep it there if the window resizes
  const placeTabIndicator = () => moveTabIndicator(document.querySelector(".tab-btn.active"), false);
  requestAnimationFrame(placeTabIndicator);
  window.addEventListener("resize", placeTabIndicator);
}
