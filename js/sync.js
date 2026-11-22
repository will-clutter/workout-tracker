/* ============================================================
   SYNC (back up to the cloud in the background)
   Your data stays on this device (store.state + localStorage) and is the main copy.
   This file keeps a copy in Supabase, signed in anonymously (no account needed).
   How it works:
   - After you save, we work out which rows changed since the last sync (the row mapping
     and comparing live in logic.js: stateToRows, diffRows, applyRows) and send only those.
   - We also fetch rows other devices changed and fold them in. A row you changed here
     since the last sync is never overwritten.
   - If anything goes wrong (offline, blocked, a bad row) the app carries on as normal.
   Only the publishable key is used here. It is meant to be public; the database rules
   (row level security) are what keep each person's data private.
   ============================================================ */

import { $, store, STORAGE_KEY } from "./store.js";
import { redrawEverything } from "./backup.js";

const SUPABASE_URL = "https://qjgpcljpjxvfhmiabffn.supabase.co";
const SUPABASE_KEY = "sb_publishable_gMI73N0jNLekzJbj9kXfGg_VToT1bqW";
const META_KEY = STORAGE_KEY + "-sync"; // { userId, cursors, snapshot }: where this device is up to
const SAVE_DELAY_MS = 3000;   // wait a moment after a save, so a burst of edits goes up together
const CHUNK_SIZE = 200;
const PULL_PAGE = 1000;
const PULL_OVERLAP_MS = 5000; // look back a little: a slow save in the cloud can land with an older timestamp
const MAX_RETRY_MS = 5 * 60 * 1000;

let client = null;        // the Supabase client, once it has loaded
let status = "starting";  // starting | syncing | synced | offline | error | unavailable
let lastSyncedAt = null;
let problemCount = 0;     // rows the cloud refused (see markRejected)
let running = false;
let again = false;        // a save came in while a sync was running
let saveTimer = null;
let retryTimer = null;
let retryDelay = 15000;

export function setupSync() {
  store.onSaved = scheduleSync;
  window.addEventListener("online", () => runSync());
  window.addEventListener("offline", () => setStatus("offline"));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") runSync(); });
  renderStatus();
  runSync();
}

/* ---------- what we remember between visits ---------- */

function loadMeta() {
  try {
    const meta = JSON.parse(localStorage.getItem(META_KEY));
    if (meta && typeof meta === "object") return { userId: meta.userId || null, cursors: meta.cursors || {}, snapshot: meta.snapshot || {} };
  } catch (err) { /* nothing saved yet, or unreadable: start over, which just means a full sync */ }
  return { userId: null, cursors: {}, snapshot: {} };
}

function saveMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (err) { /* storage full or blocked: we just redo some work next time */ }
}

/* ---------- running a sync ---------- */

function scheduleSync() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(runSync, SAVE_DELAY_MS);
}

async function runSync() {
  clearTimeout(saveTimer);
  if (running) { again = true; return; }
  running = true;
  try {
    await syncOnce();
    retryDelay = 15000;
  } catch (err) {
    console.warn("Sync problem:", err);
    setStatus(navigator.onLine ? "error" : "offline");
    clearTimeout(retryTimer);
    retryTimer = setTimeout(runSync, retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
  } finally {
    running = false;
    if (again) { again = false; scheduleSync(); }
  }
}

async function syncOnce() {
  if (!navigator.onLine) return setStatus("offline");
  setStatus("syncing");
  const supabase = await getClient();
  if (!supabase) return setStatus("unavailable");

  const userId = await getUserId(supabase);
  let meta = loadMeta();
  if (meta.userId !== userId) meta = { userId, cursors: {}, snapshot: {} }; // someone else's cloud copy: start fresh

  // Receive first, so that a row you haven't touched picks up other devices' changes before we send ours
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
  if (typing) setTimeout(runSync, 5000); // don't redraw the screen under someone's fingers
  else await pull(supabase, meta);
  await push(supabase, meta, userId);

  lastSyncedAt = new Date();
  setStatus("synced");
}

// Signed in already (supabase-js remembers the session), or sign in anonymously
async function getUserId(supabase) {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const result = await supabase.auth.signInAnonymously();
  if (result.error) throw result.error;
  return result.data.session.user.id;
}

async function getClient() {
  if (client) return client;
  if (!(window.supabase && window.supabase.createClient)) {
    const loaded = await new Promise(resolve => {
      const script = document.createElement("script");
      script.src = "js/vendor/supabase.js";
      script.onload = () => resolve(Boolean(window.supabase && window.supabase.createClient));
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
    if (!loaded) return null;
  }
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  return client;
}

/* ---------- receiving ---------- */

async function pull(supabase, meta) {
  const remote = {};
  const newest = {};
  for (const table of SYNC_TABLES) {
    remote[table] = [];
    const cursor = meta.cursors[table];
    const since = cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : "1970-01-01T00:00:00Z";
    for (let from = 0; ; from += PULL_PAGE) {
      const { data, error } = await supabase.from(table).select("*").gt("updated_at", since)
        .order("updated_at", { ascending: true }).order(table === "user_settings" ? "user_id" : "id", { ascending: true })
        .range(from, from + PULL_PAGE - 1);
      if (error) throw error;
      remote[table].push(...data);
      if (data.length < PULL_PAGE) break;
    }
    remote[table].forEach(row => { if (!newest[table] || row.updated_at > newest[table]) newest[table] = row.updated_at; });
  }

  // From here to the end of this function nothing waits, so nothing you do can sneak in between
  const result = applyRows(store.state, remote, meta.snapshot);
  const changed = JSON.stringify(result.state) !== JSON.stringify(store.state);
  if (changed) {
    store.state = result.state;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store.state)); } catch (err) { /* storage full: still shown, saved next time */ }
    redrawEverything();
  }
  meta.snapshot = result.snapshot;
  Object.assign(meta.cursors, newest);
  saveMeta(meta);
}

/* ---------- sending ---------- */

async function push(supabase, meta, userId) {
  const diff = diffRows(stateToRows(store.state), meta.snapshot);
  const nothing = SYNC_TABLES.every(t => diff.upserts[t].length === 0 && diff.deletes[t].length === 0);
  if (nothing) return countProblems(meta);

  for (const table of SYNC_TABLES) await pushRows(supabase, meta, userId, table, diff.upserts[table], diff.hashes[table]);
  for (const table of SYNC_TABLES) await pushDeletes(supabase, meta, table, diff.deletes[table]);
  countProblems(meta);
}

const payloadFor = (table, row, userId) => (table === "user_settings"
  ? { user_id: userId, units: row.units, duration_format: row.duration_format, active_workout_id: row.active_workout_id }
  : { ...row, user_id: userId, deleted_at: null });

async function send(supabase, table, rows, userId) {
  const { error } = await supabase.from(table).upsert(rows.map(r => payloadFor(table, r, userId)), { onConflict: table === "user_settings" ? "user_id" : "user_id,id" });
  return error || null;
}

// A problem with the data in the row (too long, out of range, ...) rather than with the connection.
const isRowProblem = error => /^(22|23)/.test(String(error.code || ""));

async function pushRows(supabase, meta, userId, table, rows, hashes) {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const error = await send(supabase, table, chunk, userId);
    if (!error) { chunk.forEach(row => { meta.snapshot[table] ??= {}; meta.snapshot[table][row.id] = hashes[row.id]; }); saveMeta(meta); continue; }
    if (!isRowProblem(error)) throw error; // connection, sign-in or server trouble: stop and try again later

    // The cloud refused something in this batch: send one by one, so one bad row can't hold up the rest
    for (const row of chunk) {
      const rowError = await send(supabase, table, [row], userId);
      meta.snapshot[table] ??= {};
      if (!rowError) meta.snapshot[table][row.id] = hashes[row.id];
      else if (!isRowProblem(rowError)) throw rowError;
      else if (rowError.code === "23503") continue; // belongs to something not up there yet (maybe a refused row): try again next time
      else {
        console.warn(`Sync skipped a row in ${table}:`, rowError.message, row);
        meta.snapshot[table][row.id] = "!" + hashes[row.id]; // not retried until it changes
      }
    }
    saveMeta(meta);
  }
}

async function pushDeletes(supabase, meta, table, ids) {
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).in("id", chunk);
    if (error) throw error;
    chunk.forEach(id => { delete meta.snapshot[table][id]; });
    saveMeta(meta);
  }
}

function countProblems(meta) {
  problemCount = Object.values(meta.snapshot).reduce((sum, rows) => sum + Object.values(rows).filter(h => String(h).startsWith("!")).length, 0);
}

/* ---------- showing how it's going (in Settings) ---------- */

function setStatus(next) {
  status = next;
  renderStatus();
}

function renderStatus() {
  const element = $("syncStatus");
  if (!element) return;
  const time = lastSyncedAt ? lastSyncedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  const lines = {
    starting: "Connecting…",
    syncing: "Syncing…",
    synced: `Backed up${time ? " at " + time : ""}.`,
    offline: "Offline. Changes will back up when you're back online.",
    error: "Couldn't reach the cloud just now. It will try again.",
    unavailable: "Cloud backup isn't available right now. Your data is still saved on this device."
  };
  let text = lines[status] || "";
  if (problemCount > 0 && status === "synced") text += ` ${plural(problemCount, "item")} couldn't be backed up.`;
  element.textContent = text;
}
