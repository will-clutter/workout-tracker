# Workout Tracker

A mobile-first workout tracker built with vanilla JavaScript, designed with low-glare themes to reduce eye strain and local storage so your progress is saved in the browser.

**Live app:** https://will-clutter.github.io/workout-tracker/

Built with JavaScript, HTML, and CSS (no frameworks), hosted on GitHub Pages. Developed with AI assistance.

<!-- Add screenshots here -->

## Features

- Searchable exercise database with typo suggestions
- Muscle map (front and back body diagram) for every exercise
- Swipe right to add an exercise, swipe left to cross it off, which logs it automatically
- Cardio tab with hours / minutes / seconds duration tracking and custom activities
- History of logged workouts and cardio sessions
- Four color themes with soft, low-glare surfaces designed to reduce eye strain
- Input validation on every number field (whole numbers or decimals, no zeros)
- Progress saved in the browser with localStorage
- Mobile-first layout with a swipeable, hold-and-glide tab bar

## Roadmap

Checked items are implemented. Unchecked items are planned.

- [x] Exercise search and custom exercises
- [x] Muscle map for each exercise
- [x] Swipe gestures to add and cross off exercises
- [x] Cardio tracking
- [x] Workout and cardio history
- [x] Multiple low-glare color themes
- [x] Local storage persistence
- [ ] Offline support (service worker and web manifest)
- [ ] Always-visible Add button and collapsible sections
- [ ] Settings: color scheme, Imperial / Metric units, duration display format
- [ ] Drag to reorder exercises
- [ ] History polish: swipe to delete with Undo, animated Workouts / Cardio switch
- [ ] Export and import backup
- [ ] Backend persistence
- [ ] Decentralized UUID identity
- [x] Accessibility pass targeting WCAG 2.2 AA

## Accessibility

The app is designed to be easy on the eyes and usable without a mouse or touch gestures. It targets WCAG 2.2 Level AA.

- Dark, softly lit themes with no pure black or white. Text and interface colors meet AA contrast (4.5:1 for text) on every surface in all four themes.
- Visible keyboard focus rings, and Escape closes any open panel.
- Panels are announced as dialogs to screen readers, keep keyboard focus inside while open, and return focus to where you were when they close.
- Icon-only buttons have text labels, the tab bar marks the current page, and pop-up messages are announced.
- Every swipe has a tap alternative: crossing off an exercise has a "Mark done" button, and adding one is available from its details screen.
- Animations respect the system "reduce motion" setting.
- Touch targets are at least 24px.
- Lighthouse Accessibility score of 100 in all four themes. Lighthouse is an automated check and does not cover everything in WCAG, so this is a target, not a certified conformance claim.

## Files

| File | What it does |
|---|---|
| `index.html` | The page layout |
| `css/style.css` | Colors, spacing, animations. Theme colors are at the top. |
| `js/app.js` | The app's behavior and screen rendering |
| `js/logic.js` | Pure logic (data cleaning, search, formatting) covered by the tests |
| `js/bodymap.js` | Draws the front/back body diagram |
| `data/exercises.json` | The exercise database |
| `data/instructions.json` | Step-by-step exercise instructions |
| `images/thumbs/` | Small square pictures for cards and search results |
| `images/photos/` | Bigger photos for the "more info" screen |
| `fonts/` | Self-hosted heading font |
| `tests/` | Unit tests, run with `npm test` |

## Credits
Icons: Font Awesome Free (fontawesome.com), CC BY 4.0.

Heading font: [Outfit](https://fonts.google.com/specimen/Outfit) by the Outfit Project Authors,
via Google Fonts, licensed under the [SIL Open Font License 1.1](https://openfontlicense.org).

Exercise data and photos (resized and converted to WebP): [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
by yuhonas, released into the public domain (Unlicense).
