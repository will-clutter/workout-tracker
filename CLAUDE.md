## Tests
- Run with `npm test` (Node's built-in test runner, no packages).
- Tests live in `tests/`; code under test lives in `js/logic.js`.
- Only unit-test logic (data, search, formatting). Swipes, animations and layout get checked by hand.

## Code structure
- `index.html` loads `logic.js` and `bodymap.js` as classic scripts (their functions are globals), then `js/main.js` as an ES module.
- Only `main.js` runs code at import time. Every other module exports a `setupX()` for its top-level wiring, and `main.js` calls them in order.
- `state`, `database` and `databaseById` live on one exported `store` object (`js/store.js`). Mutate its properties; an imported binding can't be reassigned.
- Modules import each other in cycles, which is safe only while nothing reads an import while modules are loading. Read imports inside functions, never in a top-level initialiser.
- Every file under `js/` must be listed in `PRECACHE` in `sw.js` (a test checks this).

## Supabase
- `supabase/schema.sql` is the initial schema, run once in the dashboard SQL editor. Never edit it to change tables (`create table if not exists` skips existing ones).
- Every later change is a new numbered file in `supabase/migrations/` (e.g. `002_description.sql`) using `alter table`, run once.
- Front-end code uses only the publishable key. The secret/service-role key never goes in this repo.

## Sync
- `js/sync.js` backs data up to Supabase in the background; localStorage stays the main copy and the app must work with sync absent, offline or failing.
- The row mapping and diffing are pure functions in `js/logic.js` (`stateToRows`, `diffRows`, `applyRows`) and are unit-tested. `sync.js` only does network and wiring, so it isn't unit-tested: check it by hand.
- `store.onSaved` is called at the end of `saveState()`; code that writes localStorage itself (like a pull) must not call `saveState()`, or it triggers another sync.
- Theme, collapsed headings and swipe hints are per-device and never synced. `workout-logbook-v1-sync` holds the sync bookkeeping (snapshot of what the cloud has); never delete it without also expecting a full re-sync.
- `js/vendor/supabase.js` is a pinned copy of supabase-js, not our code: don't edit it.
- `js/account.js` is the email sign-in (code + link). Combining this device's data with an account is the pure `mergeStates` in `logic.js` (unit-tested); `account.js` only does the screens and steps. While it runs, sync is paused (`pauseSync`/`resumeSync`) so nothing is sent to the wrong account.
- There is deliberately no Undo after combining with an account: restoring the old state would delete the account's rows from the cloud. `workout-logbook-v1-premerge` keeps a copy of this device's data from before the first merge.
- `supabase/functions/delete-account/index.ts` is the only code that uses the service-role key (read from the function's own secrets, never from this repo). It is deployed by hand in the dashboard; changing it here does nothing until it is redeployed there.
- After "Delete my cloud data" cloud backup is switched off (`workout-logbook-v1-sync-off`) so the app doesn't quietly upload everything again; `isSyncOff()` in `sync.js` gates every sync.
- `supabase/migrations/002_cleanup_idle_anonymous_users.sql` schedules the weekly cleanup (pg_cron, anonymous users only, 180 days idle). Run once in the SQL editor.
