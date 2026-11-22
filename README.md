![Tests](https://github.com/will-clutter/workout-tracker/actions/workflows/test.yml/badge.svg)

# Workout Tracker

A mobile-first workout tracker built with vanilla JavaScript, designed with
low-glare themes to reduce eye strain. Your progress is saved on your device
and backed up to the cloud in the background, with no account needed.

**Live app:** https://will-clutter.github.io/workout-tracker/

Built with JavaScript, HTML, and CSS (no frameworks), hosted on GitHub Pages, with Supabase for the optional cloud backup. Developed with AI assistance.

<!-- Add screenshots here -->

## Features

- Searchable exercise database with typo suggestions
- Muscle map (front and back body diagram) for every exercise
- Swipe right to add an exercise, swipe left to cross it off, which logs it automatically
- Cardio tab with hours / minutes / seconds duration tracking and custom activities
- History of logged workouts and cardio sessions
- Four color themes with soft, low-glare surfaces designed to reduce eye strain
- Input validation on every number field (whole numbers or decimals, no zeros)
- Progress saved on your device (localStorage), which stays the main copy
- Automatic cloud backup with Supabase, anonymous by default, so no sign-up is needed
- Optional email sign-in (a 6-digit code) to recover your data or use it on another device
- Delete your cloud data any time from Settings
- Mobile-first layout with a swipeable, hold-and-glide tab bar
- Installable and works offline (service worker and web manifest)
- Export and import your data as a file to back it up or move devices
- Remembers the last tab you had open
- Drag a slide-up panel down to close it

## Roadmap

Checked items are implemented. Unchecked items are planned.

- [x] Exercise search and custom exercises
- [x] Muscle map for each exercise
- [x] Swipe gestures to add and cross off exercises
- [x] Cardio tracking
- [x] Workout and cardio history
- [x] Multiple low-glare color themes
- [x] Local storage persistence
- [x] Offline support (service worker and web manifest)
- [x] Always-visible Add button and collapsible sections
- [x] Settings: color scheme, Imperial / Metric units, duration display format
- [x] Drag to reorder exercises
- [x] History polish: swipe to delete with Undo, animated Workouts / Cardio switch
- [x] Export and import backup
- [x] Unique IDs for every workout and cardio entry (with migration for existing data)
- [x] Cloud sync with Supabase (PostgreSQL + Row Level Security)
- [x] Passwordless anonymous identity (UUID per user)
- [x] Optional email sign-in (code or magic link) for account recovery and multi-device sync
- [x] Delete account and cloud data, privacy note, and automatic cleanup of long-unused anonymous users
- [x] Accessibility pass targeting WCAG 2.2 AA

## Cloud sync and privacy

Your data lives on your device and keeps working offline. In the background the app
also keeps a copy in Supabase (PostgreSQL), so you can get it back or use it on
another device.

- **No account needed.** The first time it backs up, the app signs in anonymously and
  gets a random ID. Nothing about you is collected.
- **Optional email.** Add an email in Settings and you get a 6-digit code (the email
  also has a link). The same data is kept, and signing in with that email on another
  device brings it along. On a device that already has data, you choose to merge both
  or use the account's data only, and Cancel puts things back as they were.
- **What is backed up:** workouts, cardio, logged history, custom exercises, notes and
  your unit and duration settings. **What stays on the device:** color theme, folded
  headings and tips already shown.
- **Who can see it:** only you. Every table has Row Level Security so each row is only
  visible to the user who owns it. The app only ever contains Supabase's publishable
  key, which is meant to be public.
- **Deleting it:** Settings > Delete my cloud data permanently removes your account and
  every backed-up copy (this device keeps its own data, and cloud backup turns off).
  Anonymous accounts unused for about six months are deleted automatically by a weekly
  database job.
- **How it syncs:** after you save, the app works out which rows changed and sends only
  those. It also picks up changes from other devices. A row you changed on this device
  since the last sync is never overwritten, and a row the cloud refuses is skipped
  rather than blocking the rest. If the same row is edited on two devices at once,
  whichever device syncs last wins, which is fine for one person with a couple of devices.
- **Email sending:** sign-in emails go out through a personal Gmail account, which is
  fine for one person but not meant for many users.

### Setting up your own Supabase project

1. Create a project, then run `supabase/schema.sql` once in the SQL editor. It creates the
   tables, Row Level Security policies and grants. Never edit it afterwards: later changes
   go in numbered files in `supabase/migrations/`.
2. Run `supabase/migrations/002_cleanup_idle_anonymous_users.sql` (needs the `pg_cron`
   extension) for the weekly cleanup.
3. Auth settings: turn on anonymous sign-ins and keep CAPTCHA off (an anonymous sign-in
   can't send a CAPTCHA token). Connect your own SMTP sender and add `{{ .Token }}` to the
   Magic Link and Change Email Address templates so the email shows the 6-digit code.
4. Deploy `supabase/functions/delete-account/index.ts` as an Edge Function named
   `delete-account` with Verify JWT off (the code checks the sign-in itself). It is the only
   place the service-role key is used, and it reads it from the function's own secrets.
5. Put your project URL and publishable key at the top of `js/sync.js`.

## Future plans

This version is intentionally built with vanilla HTML, CSS, and JavaScript, and is now
considered complete. I plan to rebuild it later with React and a custom Kotlin/Ktor API as
a separate project.

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
| `sw.js` | The service worker: caches the app files (`PRECACHE`) so it works offline |
| `manifest.webmanifest` | Makes the app installable (name, colors, icons) |
| `icons/` | App icons for install and the home screen |
| `js/main.js` | Where the app starts: loads your data, switches on each part, starts it |
| `js/store.js` | Shared data (`store.state`, the exercise list) and small helpers |
| `js/workout.js` | The Workout tab: cards, crossing off, folding the lists |
| `js/cardio.js` | The Cardio tab |
| `js/history.js` | Logging sessions and the History tab (groups, search, delete) |
| `js/browser.js` | The Add exercise search and filters |
| `js/details.js` | The "more info" screen (body map, photos, steps) |
| `js/custom-exercises.js` | Creating and deleting your own exercises |
| `js/workouts.js` | Switching, creating, renaming and deleting workouts |
| `js/reorder.js` | Dragging cards into your own order |
| `js/tabs.js` | The tab bar and its moving circle |
| `js/themes.js` | Color themes and the Settings sheet |
| `js/backup.js` | Export and import your data as a file |
| `js/sync.js` | Background cloud backup: signs in anonymously, sends changes, receives other devices' changes |
| `js/account.js` | The Account block in Settings: email sign-in, combining data, sign out, delete cloud data |
| `js/vendor/supabase.js` | A pinned copy of supabase-js (not our code, don't edit) |
| `js/ui/` | Shared pieces: `sheets.js` (slide-up panels), `forms.js` (pop-up questions), `toast.js` (bottom messages), `swipe.js` (swipe gesture and first-time hints) |
| `js/logic.js` | Pure logic (data cleaning, search, formatting, turning your data into cloud rows and merging it) covered by the tests |
| `js/bodymap.js` | Draws the front/back body diagram |
| `data/exercises.json` | The exercise database |
| `data/instructions.json` | Step-by-step exercise instructions |
| `images/thumbs/` | Small square pictures for cards and search results |
| `images/photos/` | Bigger photos for the "more info" screen |
| `fonts/` | Self-hosted heading font |
| `supabase/` | `schema.sql` (the tables and security rules), `migrations/` (later database changes), `functions/delete-account/` (the Edge Function that deletes an account) |
| `tests/` | Unit tests, run with `npm test` |

## Credits
Icons: Font Awesome Free (fontawesome.com), CC BY 4.0.

Heading font: [Outfit](https://fonts.google.com/specimen/Outfit) by the Outfit Project Authors,
via Google Fonts, licensed under the [SIL Open Font License 1.1](https://openfontlicense.org).

Exercise data and photos (resized and converted to WebP): [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
by yuhonas, released into the public domain (Unlicense).
