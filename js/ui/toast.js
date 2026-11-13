/* ============================================================
   TOAST (little message at the bottom)
   ============================================================ */

import { $ } from "../store.js";

let toastTimer;
export function showToast(message, actionLabel, onAction) {
  const toast = $("toast");
  toast.innerHTML = escapeHtml(message);
  toast.style.pointerEvents = actionLabel ? "auto" : "none"; // only clickable when it has a button

  if (actionLabel) {
    const btn = document.createElement("button");
    btn.textContent = actionLabel;
    btn.style.cssText = "margin-left:12px;background:none;border:none;color:var(--accent-soft);font-weight:800;padding:10px 8px;margin:-10px -8px -10px 4px"; // big tap area, same look
    btn.onclick = () => { onAction(); toast.classList.remove("show"); };
    toast.appendChild(btn);
  }

  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), actionLabel ? 4000 : 2200);
}
