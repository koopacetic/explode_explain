# Explainers

Long-form, single-topic pages with diagrams that animate as the reader scrolls.
Plain HTML, CSS and JavaScript. No build step and no dependencies, so the folder
can be served directly by GitHub Pages.

See [STYLE.md](STYLE.md) for the visual framework (layout, colour, drawing
conventions, motion) that all explainers follow.

## Layout

```
index.html                 list of explainers
shared/explainer.css       theme (slate background) and scroll layout
shared/explainer.js        scroll engine and small math helpers
explainers/<topic>/        one folder per explainer
_template/                 starting point for a new explainer
STYLE.md                   visual framework shared by all explainers
.nojekyll                  tells GitHub Pages to serve files as-is
```

## How it works

Each `<section data-step>` is one scene. `shared/explainer.js` turns the scroll
position into a single number `t`: the step index plus how far the reading line
is through that step (so `t = 4.5` is halfway through step 4). The explainer
provides a `render(t)` function that draws everything from `t`. Because the
drawing depends only on `t`, scrolling back up plays the animation in reverse.

Helpers: `range(t, a, b)` (0 to 1 between a and b), `ease(p)`, `lerp(a, b, p)`,
`window(t, a, b, c, d)` (fade in then out).

Built into the engine, no setup needed:

- **Chapter rail**: dots on the right edge, one per step, labelled with the
  step heading. Click to jump.
- **Hover highlighting**: mark a term in the text with
  `<dfn data-part="driver">driver pin</dfn>` and give the matching drawing
  elements the class `part-driver`. Hovering (or tapping) the term adds the
  class `is-lit` to those elements.
- **Scroll cue**: any `.scroll-cue` element fades out once scrolling starts.
- **Phone layout**: the drawing stays in the top half and the text slides
  under it, so only the current text is visible. `render` receives
  `info.narrow` so scenes can frame the drawing differently on phones.

Debugging: add `#t=5.5` to a page URL to freeze it at that point.

## Adding an explainer

1. Copy `_template/` to `explainers/<topic-name>/`.
2. Write one `<section data-step>` per idea.
3. Draw in the stage (SVG is recommended) and animate it in `render(t)`.
4. Add a `hero.js` that draws the gallery card's looping image (see
   `explainers/pin-tumbler-lock/hero.js`), and add a card to the top-level
   `index.html` with `data-hero="<topic-name>"`.

To plan a new explainer, run `/propose-explainer <subject>` in Claude Code.

## Local preview

Pages use plain `<script>` tags, so they open directly from disk. A local server
also works: `python3 -m http.server` then visit http://localhost:8000.

## Planned expansion

### Pin tumbler lock: basic lockpicking principles

Continue the page downwards from the shear line model:

- Manufacturing tolerances: pin chambers are not perfectly aligned.
- Tension and binding: light turning pressure makes one driver pin bind first.
- Setting pins: lifting the binding pin to the shear line lets the plug turn
  slightly, and the next pin binds.
- Raking: moving many pins quickly instead of one at a time.
- Security pins: spool and serrated drivers, false sets.
- Keyspace: number of possible keys, and practical limits.

### Other ideas

- Other lock types: wafer, disc detainer, lever tumbler.
- Master keying (master wafers create two shear points per chamber).
- A key-cutting sandbox at the end of the page: set cut depths and test the lock.
- Chapter navigation dots and links to individual scenes.
