/*
  bodymap.js
  Draws a front + back body diagram as an SVG and colors the muscles
  an exercise works.

  How it works:
  - Each muscle is one or more SVG shapes ("paths").
  - Shapes in LEFT are drawn on the left side of the body, then
    automatically mirrored to the right side, so we only draw half.
  - Shapes in CENTER sit on the middle line and are drawn once.
  - The muscle names match the names used in the exercise database
    (free-exercise-db), e.g. "chest", "lats", "quadriceps".
*/

const BODY_MAP = {
  front: {
    // Grey body outline drawn underneath the muscles
    silhouette: [
      "M100 8 C88 8 81 18 81 32 C81 46 89 56 100 56 C111 56 119 46 119 32 C119 18 112 8 100 8 Z",
      // torso + arms + legs (left half, mirrored)
      "M100 56 L86 58 L70 68 C58 70 52 80 51 96 L49 136 L42 184 L41 198 L50 200 L56 184 L66 140 L69 112 L71 120 L70 170 L68 196 L69 262 L71 300 L74 344 L72 360 L90 360 L88 344 L92 300 L96 262 L99 200 L100 200 Z"
    ],
    left: {
      traps:       ["M88 60 L73 69 L89 70 Z"],
      shoulders:   ["M71 70 C59 72 54 82 54 96 C59 99 64 99 68 96 C69 85 73 77 79 72 Z"],
      chest:       ["M98 74 L81 73 C74 80 71 88 71 100 C79 110 89 112 98 108 Z"],
      biceps:      ["M56 101 C53 114 53 125 55 134 C60 137 64 134 66 129 C67 118 67 108 66 100 Z"],
      forearms:    ["M53 139 C48 156 45 170 44 182 C48 185 52 185 55 182 C60 166 63 152 64 139 Z"],
      abdominals:  ["M84 113 L74 106 C72 128 74 148 78 162 L86 167 Z"],
      abductors:   ["M73 168 L84 172 L80 196 L71 189 Z"],
      quadriceps:  ["M72 186 C68 214 71 238 75 254 C83 263 91 260 95 252 C96 240 95 230 94 222 C90 208 86 196 82 184 Z"],
      adductors:   ["M86 178 L99 181 L98 228 C94 214 90 198 86 178 Z"],
      calves:      ["M73 272 C69 292 71 312 76 330 L80 330 C79 310 79 290 80 272 Z",
                    "M86 272 C92 292 91 312 87 330 L84 330 C85 310 85 290 84 272 Z"]
    },
    center: {
      neck:        ["M92 52 L108 52 L110 64 L90 64 Z"],
      abdominals:  ["M88 113 L112 113 L111 168 C104 175 96 175 89 168 Z"]
    }
  },

  back: {
    silhouette: [
      "M100 8 C88 8 81 18 81 32 C81 46 89 56 100 56 C111 56 119 46 119 32 C119 18 112 8 100 8 Z",
      "M100 56 L86 58 L70 68 C58 70 52 80 51 96 L49 136 L42 184 L41 198 L50 200 L56 184 L66 140 L69 112 L71 120 L70 170 L68 196 L69 262 L71 300 L74 344 L72 360 L90 360 L88 344 L92 300 L96 262 L99 200 L100 200 Z"
    ],
    left: {
      shoulders:   ["M71 70 C59 72 54 82 54 96 C59 98 64 97 69 93 C70 84 72 77 76 72 Z"],
      triceps:     ["M56 101 C53 114 53 125 56 135 C61 137 64 134 66 129 C67 118 67 108 66 99 Z"],
      forearms:    ["M53 139 C48 156 45 170 44 182 C48 185 52 185 55 182 C60 166 63 152 64 139 Z"],
      "middle back": ["M88 80 L96 106 L86 118 L79 92 Z"],
      lats:        ["M75 92 L84 121 L96 133 L90 158 C80 151 74 138 72 124 C71 110 72 100 75 92 Z"],
      abductors:   ["M73 164 L89 168 L76 182 Z"],
      glutes:      ["M76 174 C73 192 79 204 90 206 C96 206 99 202 99 194 L99 172 L90 170 Z"],
      hamstrings:  ["M73 212 C69 232 71 248 75 258 L84 258 L85 214 Z",
                    "M88 214 L89 258 L96 258 C98 244 98 228 97 212 Z"],
      calves:      ["M73 270 C67 290 70 308 78 320 C83 322 86 318 87 312 C89 296 89 282 87 268 Z",
                    "M89 268 C93 282 95 300 92 316 L88 318 C90 300 90 284 89 268 Z"]
    },
    center: {
      neck:        ["M92 52 L108 52 L110 62 L90 62 Z"],
      traps:       ["M100 58 L86 63 L74 70 L88 76 L100 110 L112 76 L126 70 L114 63 Z"],
      "lower back":["M90 136 L99 120 L101 120 L110 136 L112 166 L101 170 L99 170 L88 166 Z"]
    }
  }
};

/* Turn a list of path strings into SVG <path> tags.
   mirror = true flips the shape to the other side of the body (x -> 200 - x). */
function pathsToSvg(paths, muscle, mirror) {
  const transform = mirror ? ' transform="translate(200,0) scale(-1,1)"' : "";
  return paths
    .map(d => `<path class="muscle" data-muscle="${muscle}" d="${d}"${transform}></path>`)
    .join("");
}

/* Build the SVG markup for one view ("front" or "back"). */
function buildView(viewName, offsetX) {
  const view = BODY_MAP[viewName];
  let svg = `<g transform="translate(${offsetX},0)">`;

  // Body outline (left half + mirrored right half; head is drawn twice, harmless)
  view.silhouette.forEach(d => {
    svg += `<path class="silhouette" d="${d}"></path>`;
    svg += `<path class="silhouette" d="${d}" transform="translate(200,0) scale(-1,1)"></path>`;
  });

  // Muscles on both sides
  for (const [muscle, paths] of Object.entries(view.left)) {
    svg += pathsToSvg(paths, muscle, false);
    svg += pathsToSvg(paths, muscle, true);
  }
  // Muscles in the middle
  for (const [muscle, paths] of Object.entries(view.center)) {
    svg += pathsToSvg(paths, muscle, false);
  }

  svg += `<text class="view-label" x="100" y="384" text-anchor="middle">${viewName.toUpperCase()}</text>`;
  svg += `</g>`;
  return svg;
}

/*
  Main function used by the app.
  primary   = array of muscle names worked the most (bright red)
  secondary = array of muscle names that help out (dark red)
  Returns an HTML string containing the SVG.
*/
function renderBodyMap(primary = [], secondary = []) {
  const svg = `
    <svg class="bodymap" viewBox="0 0 400 392" role="img"
         aria-label="Muscles worked: ${[...primary, ...secondary].join(", ") || "none"}">
      ${buildView("front", 0)}
      ${buildView("back", 200)}
    </svg>`;

  // Use a temporary element so we can add classes to the matching muscles
  const wrapper = document.createElement("div");
  wrapper.innerHTML = svg;
  wrapper.querySelectorAll(".muscle").forEach(el => {
    const name = el.dataset.muscle;
    if (primary.includes(name)) el.classList.add("primary");
    else if (secondary.includes(name)) el.classList.add("secondary");
  });
  return wrapper.innerHTML;
}

/*
  Small single-view map for exercise cards.
  Picks whichever side (front or back) shows more of the primary muscles.
*/
const FRONT_ONLY = ["chest", "biceps", "abdominals", "quadriceps", "adductors", "neck"];
const BACK_ONLY = ["triceps", "lats", "middle back", "lower back", "glutes", "hamstrings"];

function renderMiniMap(primary = [], secondary = []) {
  const score = list => muscles => list.filter(m => muscles.includes(m)).length;
  const front = score(FRONT_ONLY)(primary) * 2 + score(FRONT_ONLY)(secondary);
  const back = score(BACK_ONLY)(primary) * 2 + score(BACK_ONLY)(secondary);
  const view = back > front ? "back" : "front";

  // Zoom in on the part of the body being worked, so the small picture is readable:
  // all upper-body muscles → show torso + arms, all lower-body → show legs, mixed → whole body
  const LOWER = ["quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors"];
  const lowerCount = primary.filter(m => LOWER.includes(m)).length;
  let viewBox = "38 4 124 360";                                         // whole body
  if (primary.length && lowerCount === 0) viewBox = "40 46 120 156";      // upper body
  else if (primary.length && lowerCount === primary.length) viewBox = "58 158 84 190"; // legs

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <svg class="bodymap mini" viewBox="${viewBox}" aria-hidden="true">
      ${buildView(view, 0).replace(/<text[\s\S]*?<\/text>/, "")}
    </svg>`;
  wrapper.querySelectorAll(".muscle").forEach(el => {
    const name = el.dataset.muscle;
    if (primary.includes(name)) el.classList.add("primary");
    else if (secondary.includes(name)) el.classList.add("secondary");
  });
  return wrapper.innerHTML;
}

// Every muscle name the database uses, for filters and custom exercises
const ALL_MUSCLES = [
  "chest", "shoulders", "triceps", "biceps", "forearms",
  "lats", "middle back", "lower back", "traps", "neck",
  "abdominals", "quadriceps", "hamstrings", "glutes",
  "calves", "adductors", "abductors"
];
