/* ============================================================
   REORDER (drag a still-to-do card by its grip, or use the arrow keys on the grip)
   The saved order is just the order of workout.items (see moveTodoItem in logic.js).
   ============================================================ */

import { $, saveState, activeWorkout, LISTS } from "./store.js";
import { renderAnimated } from "./workout.js";

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

// Turns on drag and keyboard reordering for the Workout list. Called once from main.js when the app starts.
export function setupReorder() {
  enableReorder($("exerciseList"));
}
