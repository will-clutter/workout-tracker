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
