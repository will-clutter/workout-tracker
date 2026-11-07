# Changelog

What changed in Workout Logbook, newest first.

## 2026-11-07

### Added

- **Swipe right to add an exercise.** In the exercise search, drag a result to the right, past halfway, to add it to your workout without opening it. The search stays open, so you can add several in a row. An exercise that's already in your workout snaps back with a short message. Tapping a result still opens its details, as before.
- **Swipe left to cross off an exercise.** In your workout, drag an exercise to the left to mark it done. A line draws through its name, the card dims, and it moves down into a new **Completed** section. Drag a completed exercise to the right to bring it back.
- **Finishing a workout logs it automatically.** When every exercise is crossed off, the session is saved to History and the screen glows with a "Workout complete" message. Finishing the same workout again later that day logs another session.
- **Crossed-off exercises reset.** Use the **Reset** button next to "Completed", or come back on a later day and they reset on their own.
- **History shows what you finished.** If you log a session with the button before crossing everything off, the exercises you skipped are dimmed and marked "Not done", and the count reads like "3 of 4 exercises done".
- **First-time swipe hints.** The first time you see a workout card or a search result, it slides partway open by itself and back, to show that it can be swiped. Each hint only plays once.
- **Sliding tab indicator.** A glowing circle moves between the Workout and History tabs when you switch.
- **The search header gets out of the way.** In the exercise search, the "Add Exercise" title and close button slide away while you scroll down the results, and come back as soon as you scroll up.

### Changed

- **Search shows 10 results at a time**, down from 50. "Show more" adds 10 more each time.
- **The app starts faster.** Exercise instructions moved into their own file, which is only downloaded the first time you open an exercise's details. The file the app loads at startup went from 850 KB to 162 KB.
- **The heading font is now part of the app** instead of coming from Google Fonts, so the page no longer waits on Google before it can appear.
- **Emojis are replaced with icons.** The color theme, note and delete buttons now use the same style of icons as the rest of the app.
- **Theme colors are defined in one place** (`css/style.css`), so adding or changing a theme only means editing that file plus one line in `js/app.js`.

### Fixed

- In the exercise search, results scrolled over the top of the panel's header, which made the close button hard to tap.
- The phone's status bar now matches your color theme right away when the app opens, instead of briefly showing the wrong color.
- The color theme button in the theme panel did nothing when tapped. It was a duplicate of the one in the top bar and has been removed.
- Mini body maps on exercise cards now pick the front or back view correctly for neck exercises that also work back muscles.

### Behind the scenes

- Removed unused and repeated code from the stylesheet, page and scripts, and made the body diagrams quicker to draw.
- Removed unused fields from the exercise database.
- Credited the Cinzel font in the README and included its license (`fonts/OFL.txt`).
- Removed the outdated screenshots.

## 2026-11-06

### Added

- **First version of Workout Logbook**: build workouts from 870+ exercises with photos and instructions, log sessions to History, and see which muscles each exercise works on a front and back body map.
- Four color themes: Crimson, Violet, Frost and Emerald.
- SVG icons in the bottom navigation.
- A README with how to run the app and put it online with GitHub Pages.
