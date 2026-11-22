/* ============================================================
   FORMS + CONFIRM (small pop-up questions)
   ============================================================ */

import { $ } from "../store.js";
import { openSheet, closeSheet } from "./sheets.js";

let formResolve = null;

// If a form is still waiting for an answer when its sheet closes, answer "closed" (null)
export function cancelPendingForm() {
  if (formResolve) { formResolve(null); formResolve = null; }
}

/*
  Shows a small form in a sheet and waits for an answer.
  Returns the values typed in, or null if the user closes it.
  (A "Promise" is how JavaScript waits for something to happen later.)
*/
export function showForm({ title, fields = [], submitLabel = "Save", musclePicker = false, message = "", danger = false }) {
  $("formTitle").textContent = title;
  const form = $("form");
  form.onclick = null;

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

/*
  A question with several buttons, like "Merge / Use account data / Cancel".
  choices = [{ label, value, style }] (style is "primary" or "danger", or leave it out).
  Returns the value of the button pressed, or null if the sheet is closed instead.
*/
export function choiceDialog({ title, message, choices }) {
  $("formTitle").textContent = title;
  const form = $("form");
  form.onsubmit = event => event.preventDefault();
  form.innerHTML = `
    <p class="muted" style="margin:0">${escapeHtml(message)}</p>
    ${choices.map((choice, i) => `<button type="button" class="btn ${choice.style || ""} big" data-choice="${i}">${escapeHtml(choice.label)}</button>`).join("")}
  `;
  openSheet("formSheet");
  return new Promise(resolve => {
    formResolve = resolve;
    form.onclick = event => {
      const button = event.target.closest("[data-choice]");
      if (!button) return;
      form.onclick = null;
      formResolve = null;
      closeSheet("formSheet");
      resolve(choices[Number(button.dataset.choice)].value);
    };
  });
}

// "Are you sure?" question. Returns true or false.
export async function confirmDialog(title, message, confirmLabel) {
  return (await showForm({ title, message, submitLabel: confirmLabel, danger: true })) !== null;
}
