/* ============================================================
   ACCOUNT (sign in with an email, to recover your data or use another device)
   Everyone starts signed in anonymously (see sync.js). Adding an email to that anonymous
   user keeps the same cloud data. If the email already has an account (say, on a new
   phone), this device signs in to that account and its data is combined with the
   account's. Each email sends a 6-digit code (and a link as a backup).
   The "combine" logic itself is in logic.js (mergeStates); this file is the screens
   and the sign-in steps.
   ============================================================ */

import { $, store, STORAGE_KEY } from "./store.js";
import { showToast } from "./ui/toast.js";
import { confirmDialog, choiceDialog } from "./ui/forms.js";
import {
  getSyncClient, pauseSync, resumeSync, syncNow, setSwitchHandler, fetchAccountRows, adoptAccount,
  saveStash, loadStash, clearStash
} from "./sync.js";

const FLOW_KEY = STORAGE_KEY + "-account-flow";       // { mode, email, at }: a code is on its way (survives the app being closed)
const PREMERGE_KEY = STORAGE_KEY + "-premerge";       // your data on this device as it was before combining it with an account
const FLOW_MAX_AGE_MS = 15 * 60 * 1000;

let flow = null;  // { mode: "upgrade" | "signin", email } while waiting for the code
let user = null;  // the signed-in cloud user (anonymous or with an email), or null

export function setupAccount() {
  setSwitchHandler(reconcile);
  flow = loadFlow();

  $("accountEmailForm").addEventListener("submit", event => {
    event.preventDefault();
    run(event.target, () => startEmail($("accountEmail").value.trim().toLowerCase()));
  });
  $("accountCodeForm").addEventListener("submit", event => {
    event.preventDefault();
    run(event.target, () => confirmCode($("accountCode").value.replace(/\s/g, "")));
  });
  $("accountCodeCancel").addEventListener("click", () => {
    endFlow();
    clearStash(); // the anonymous sign-in was never replaced, so there's nothing to go back to
    say("");
    renderAccount();
  });
  $("signOutBtn").addEventListener("click", signOut);

  refreshAccount();
  watchSignIn();
}

/* ---------- small helpers ---------- */

// Runs one step with the buttons switched off, so a double tap can't send two emails
async function run(form, step) {
  const buttons = [...form.querySelectorAll("button")];
  buttons.forEach(b => { b.disabled = true; });
  try { await step(); } catch (err) {
    console.warn("Account step failed:", err);
    say("Something went wrong. Check your connection and try again.");
  } finally { buttons.forEach(b => { b.disabled = false; }); }
}

function say(text) { $("accountMessage").textContent = text; }

function friendly(error, kind) {
  const code = error && error.code;
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "Too many emails sent. Wait a minute and try again.";
  if (code === "otp_expired") return "That code has expired. Send a new one.";
  if (code === "email_address_invalid" || code === "validation_failed") return "That email address doesn't look right.";
  if (kind === "code") return "That code didn't work. Check it, or cancel and send a new one.";
  return `Couldn't send the code (${error && error.message ? error.message : "unknown problem"}).`;
}

const saveFlow = () => { try { localStorage.setItem(FLOW_KEY, JSON.stringify({ ...flow, at: Date.now() })); } catch (err) { /* only costs a retry */ } };
function loadFlow() {
  try {
    const saved = JSON.parse(localStorage.getItem(FLOW_KEY));
    if (saved && saved.email && Date.now() - saved.at < FLOW_MAX_AGE_MS) return { mode: saved.mode, email: saved.email };
  } catch (err) { /* none */ }
  return null;
}
function endFlow() {
  flow = null;
  try { localStorage.removeItem(FLOW_KEY); } catch (err) { /* nothing to do */ }
}

/* ---------- what the Account block shows ---------- */

async function refreshAccount() {
  const supabase = await getSyncClient();
  if (!supabase) { user = null; return renderAccount("unavailable"); }
  const fresh = await supabase.auth.getUser(); // asks the server, so an email confirmed elsewhere shows up
  if (fresh.error) {
    const { data } = await supabase.auth.getSession();
    user = data.session ? data.session.user : null;
  } else {
    user = fresh.data.user;
  }
  if (user && user.email && !user.is_anonymous && flow) endFlow(); // the link in the email did the job
  renderAccount();
}

function renderAccount(problem) {
  const signedIn = Boolean(user && user.email && !user.is_anonymous);
  const info = $("accountInfo");
  if (problem === "unavailable") info.textContent = "Sign-in isn't available right now. Your data is still saved on this device.";
  else if (signedIn) info.textContent = `Signed in as ${user.email}. Any device you sign in on with this email shares this data.`;
  else if (flow) info.textContent = `We sent a code to ${flow.email}. Enter it below (the link in the email works too).`;
  else info.textContent = "You're backing up without an account. Add your email to get your data back if this device is lost, or to use it on another device.";

  $("accountEmailForm").classList.toggle("hidden", signedIn || Boolean(flow) || problem === "unavailable");
  $("accountCodeForm").classList.toggle("hidden", signedIn || !flow);
  $("accountSignedIn").classList.toggle("hidden", !signedIn);
}

// When an email's link is used (in this browser) or the account changes, update the screen
async function watchSignIn() {
  const supabase = await getSyncClient();
  if (!supabase) return;
  supabase.auth.onAuthStateChange((event, session) => {
    // Keep the saved anonymous sign-in current, in case supabase-js renews it while we wait for a code
    const stash = loadStash();
    if (event === "TOKEN_REFRESHED" && session && stash && stash.userId === session.user.id) saveStash(session);
    // (Calling supabase from inside this callback can deadlock, so hand off first)
    if (event === "USER_UPDATED" || event === "SIGNED_IN") setTimeout(refreshAccount, 0);
  });
}

/* ---------- step 1: ask for a code ---------- */

async function startEmail(email) {
  say("");
  if (!email) return;
  if (!navigator.onLine) return say("You're offline. Try again when you're connected.");
  const supabase = await getSyncClient();
  if (!supabase) return say("Sign-in isn't available right now.");
  const { data: current } = await supabase.auth.getSession();
  if (!current.session) { syncNow(); return say("Still setting up your backup. Try again in a moment."); }

  const redirect = new URL("./", location.href).href; // where the link in the email goes
  // First choice: attach the email to this anonymous user. The cloud data stays exactly where it is.
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: redirect });
  if (!error) return waitForCode("upgrade", email);

  // The email already belongs to an account: sign in to that one instead (checked by error code, never by wording)
  if (error.code === "email_exists") {
    saveStash(current.session); // so Cancel can go back to this anonymous sign-in
    const sent = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirect } });
    if (sent.error) { clearStash(); return say(friendly(sent.error)); }
    return waitForCode("signin", email);
  }
  say(friendly(error));
}

function waitForCode(mode, email) {
  flow = { mode, email };
  saveFlow();
  $("accountCode").value = "";
  renderAccount();
  setTimeout(() => $("accountCode").focus(), 0);
}

/* ---------- step 2: check the code ---------- */

async function confirmCode(token) {
  say("");
  if (!flow || !token) return;
  const supabase = await getSyncClient();
  if (!supabase) return say("Sign-in isn't available right now.");

  if (flow.mode === "upgrade") {
    // A code for adding an email to this user is an "email_change" code; "email" is tried as well in case the email service labelled it differently
    let result = await supabase.auth.verifyOtp({ email: flow.email, token, type: "email_change" });
    if (result.error) {
      const retry = await supabase.auth.verifyOtp({ email: flow.email, token, type: "email" });
      if (!retry.error) result = retry;
    }
    if (result.error) return say(friendly(result.error, "code"));
    endFlow();
    clearStash();
    showToast("Email added. Your data stays backed up.");
    await refreshAccount();
    syncNow();
    return;
  }

  // Signing in to an existing account. Stop syncing first, so nothing is sent to the wrong place while it switches.
  await pauseSync();
  const { data, error } = await supabase.auth.verifyOtp({ email: flow.email, token, type: "email" });
  if (error) { resumeSync(); return say(friendly(error, "code")); }
  await reconcile(data.user || data.session.user);
}

/* ---------- step 3: this device and the account meet ---------- */

// Signed in to an account on a device that may have its own data. Sync is paused while this runs.
async function reconcile(accountUser) {
  const supabase = await getSyncClient();
  try {
    const { remote, newest } = await fetchAccountRows(supabase);
    const local = store.state;

    // A device with nothing on it just takes the account's data. Otherwise ask once.
    let choice = "merge";
    if (!isUntouchedState(local)) {
      const theirs = countRemoteRows(remote);
      choice = await choiceDialog({
        title: "Combine your data?",
        message: `This device has ${plural(local.workouts.length, "workout")} and ${plural(local.history.length, "logged session")}. ` +
          `Your account has ${plural(theirs.workouts, "workout")} and ${plural(theirs.sessions, "logged session")}. ` +
          "Merge keeps both. Using the account's data only replaces what is on this device (a copy is kept first).",
        choices: [
          { label: "Merge both", value: "merge", style: "primary" },
          { label: "Use account data only", value: "account", style: "danger" },
          { label: "Cancel", value: null }
        ]
      });
    }
    if (choice === null) return await cancelSignIn();

    try { // a copy of this device's data as it is now (the first one is kept for good)
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null && localStorage.getItem(PREMERGE_KEY) === null) localStorage.setItem(PREMERGE_KEY, raw);
    } catch (err) { /* storage blocked or full: carry on, the cloud still has the account's data */ }

    const { state, snapshot } = mergeStates(local, remote, choice === "merge");
    adoptAccount(accountUser.id, state, snapshot, newest);
    endFlow();
    clearStash();
    showToast(choice === "merge" ? "Signed in. Your data is combined." : "Signed in. Now using your account's data.");
    await refreshAccount();
    resumeSync(); // sends whatever only exists on this device
  } catch (err) {
    console.warn("Couldn't combine data:", err);
    showToast("Couldn't finish signing in. Nothing was changed on this device.");
    await cancelSignIn();
  }
}

// Goes back to the anonymous sign-in this device had before, and checks that it really is back
async function cancelSignIn() {
  const supabase = await getSyncClient();
  const stash = loadStash();
  let restored = false;
  if (supabase && stash) {
    const { data, error } = await supabase.auth.setSession({ access_token: stash.access_token, refresh_token: stash.refresh_token });
    if (!error && data.session && data.session.user.id === stash.userId) {
      const check = await supabase.auth.getUser();
      restored = !check.error && check.data.user.id === stash.userId;
    }
  }
  if (!restored && supabase) {
    try { await supabase.auth.signOut({ scope: "local" }); } catch (err) { /* it will sign in fresh below */ }
  }
  endFlow();
  clearStash();
  showToast(restored ? "Cancelled. Nothing changed." : "Cancelled. Your data is still on this device and will back up again.");
  await refreshAccount();
  resumeSync();
}

/* ---------- signing out ---------- */

async function signOut() {
  const ok = await confirmDialog("Sign out?", "This device keeps all its data and goes back to backing up on its own, separately from your account. Sign in again any time with your email.", "Sign out");
  if (!ok) return;
  const supabase = await getSyncClient();
  if (!supabase) return;
  await pauseSync();
  await supabase.auth.signOut({ scope: "local" }); // only this device, not your other devices
  user = null;
  await refreshAccount();
  resumeSync(); // signs in anonymously again and backs up what's here
}
