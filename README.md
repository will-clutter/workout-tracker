# Workout Logbook

A mobile-first web app for planning and logging gym workouts, with a muscle map for every exercise.

**Live app:** https://will-clutter.github.io/workout-tracker/

Built with JavaScript, HTML, and CSS (no frameworks), hosted on GitHub Pages. Developed with AI assistance.

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
Icons: Font Awesome Free (fontawesome.com), CC BY 4.0.

Heading font: [Outfit](https://fonts.google.com/specimen/Outfit) by the Outfit Project Authors,
via Google Fonts, licensed under the [SIL Open Font License 1.1](https://openfontlicense.org).

Exercise data and photos (resized and converted to WebP): [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
by yuhonas, released into the public domain (Unlicense).

