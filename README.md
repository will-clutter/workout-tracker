# Workout Logbook

A phone-friendly web app for planning and logging workouts.

- Multiple workouts (e.g. "Full Body", "Upper", "Lower"), each renamable
- Add exercises from a database of 870+ exercises, or create your own
- Body map showing primary (bright red) and secondary (dark red) muscles
- Edit sets, reps, weight and notes for each exercise
- Log a session to save a dated record in History

Your data is saved in your browser on that device (`localStorage`).
Clearing your browser data will erase it.

## Files

| File | What it does |
|---|---|
| `index.html` | The page layout |
| `css/style.css` | Colors, spacing, animations. Theme colors are at the top. |
| `js/app.js` | Everything the app does |
| `js/bodymap.js` | Draws the front/back body diagram |
| `data/exercises.json` | The exercise database |
| `images/thumbs/` | Small square pictures for cards and search results |
| `images/photos/` | Bigger photos for the "more info" screen |

## Run it on your computer

The app loads `data/exercises.json`, which browsers block when you just
double-click `index.html`. Run a tiny local server instead. In the VS Code
terminal, from this folder:

```
python -m http.server
```

Then open http://localhost:8000 in your browser. Press `Ctrl+C` to stop.

## Put it online (GitHub Pages)

1. Push this folder to a GitHub repository. On a free GitHub account,
   Pages only works for **public** repositories.
2. On GitHub: **Settings → Pages**.
3. Under "Build and deployment", set **Source** to *Deploy from a branch*,
   branch **main**, folder **/ (root)**, and click **Save**.
4. After a minute or two the page shows your link, like
   `https://your-username.github.io/Workout-tracker/`.

Open that link on your phone and use **Add to Home Screen** to get an app icon.

## Credits

Exercise data and photos (resized and converted to WebP): [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
by yuhonas, released into the public domain (Unlicense).
