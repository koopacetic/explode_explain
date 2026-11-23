# Visual framework

The current visual rules for all explainers. Follow these so that pages look
and behave alike. The pin tumbler lock (`explainers/pin-tumbler-lock/`) is the
reference implementation; when this document and that page disagree, update
this document.

## 1. Principles

- **One idea per step.** Each `<section data-step>` introduces one concept, and
  the drawing shows exactly that concept while the text is active.
- **The drawing is a function of scroll.** Everything visible is computed from
  `t` (step index + progress through the step). Scrolling back reverses it.
  The only exception is a looping hero animation, such as a spin, which runs on
  time and eases to a fixed pose as scrolling begins.
- **Carry objects between steps.** Transitions move, zoom, split or morph a
  part into the next view. Avoid hard cuts and avoid fading everything out.
- **Light on the subject, dark around it.** Slate background, soft spotlight
  behind the stage, bright materials for the parts that matter.
- **Simplify honestly.** Exaggerate sizes and gaps when it helps, and say so
  in a caption.

## 2. Page layout

| | Wide screens (> 800 px) | Narrow screens (≤ 800 px) |
|---|---|---|
| Structure | Text column on the left (max 30rem), sticky stage on the right | Sticky stage in the top 50% of the screen, text below |
| Step height | 60% of the screen height (hero: full screen) | 50% of the screen height (hero: 50%) |
| Reading line | Middle of the screen | Middle of the lower half (75% down) |
| Inactive text | 25% opacity | 15% opacity, and slides under the opaque stage |
| Chapter rail | Dots on the right edge | Hidden |

- The active step switches slightly before its animation starts
  (`floor(t + 0.15)`), so the highlighted text always describes what is moving.
- The first step (`.step.hero`) holds the title, a two to four sentence
  definition, an optional infobox (hidden on phones) and a `.scroll-cue`.
- Notes that are not part of the scroll sequence (planned sections, caveats)
  go in `.after` below the steps, using `.note` boxes.

## 3. Colour

### Interface (CSS variables in `shared/explainer.css`)

| Variable | Value | Use |
|---|---|---|
| `--bg-deep` | `#1c2026` | Page edges, bottom of gradient |
| `--bg-mid` | `#2e353e` | Top of gradient, phone stage background |
| `--text` | `#e4e8ec` | Body text, drawing labels |
| `--muted` | `#9aa4af` | Captions, secondary text |
| `--rule` | `rgba(255,255,255,0.12)` | Heading underlines, table borders |
| `--accent` | `#e2b955` | Key concept line, highlights, active rail dot, scroll cue |
| `--ok` | `#7fd49b` | A condition is met (aligned, open, correct) |
| `--bad` | `#ee6b6b` | A condition fails (blocked, wrong) |
| `--link` | `#9cc3ef` | Links |

The background is a fixed linear gradient (`--bg-mid` to `--bg-deep`) with two
soft radial pools of light: a larger one behind the stage, a smaller one behind
the text.

### Materials in drawings

Colour encodes behaviour, not just material. Say what each colour means in a
small `.legend` in a corner of the stage.

| Material | Colours | Meaning in the lock page |
|---|---|---|
| Brass | `#cfa651` → `#9c7a34`; pins `#b58a2e` / `#ecc86d` / `#a87f2a` | Moves (turns with the plug) |
| Steel | `#dde4ea` highlight on `#8e99a5`; housing `#7d8896` → `#5b6572` | Fixed (stays in the housing) |
| Pale nickel | `#e6dcb6` → `#b9ad84` | The thing the reader brings in (the key) |
| Void | `#262c33`, `#343a42` | Holes, channels, empty space |
| Spring wire | `#a9b4bf`, 2.5 px | Springs, thin connecting parts |

For a new subject, keep the same roles: one warm material for what moves or
changes, one cool material for what stays fixed, a pale accent for the input,
dark grey for empty space. Status colours (`--ok`, `--bad`, `--accent`) are
reserved for the concept being tested and should not be used for materials.

## 4. Typography

- Headings: serif (`--serif`: Linux Libertine, Georgia), normal weight, thin
  rule underneath. `h1` 2.4rem, `h2` 1.55rem.
- Body: system sans (`--sans`), 17px, line height 1.65.
- Drawing labels: sans 17px in `--text`; small labels 13px; captions under
  drawings 15px in `--muted`; the concept label (here "Shear line") in `--accent`.
- 3D labels: 15px with a small accent dot before the text and a dark text shadow.

## 5. Writing

- Plain encyclopedic language, like a good Wikipedia article. Short sentences.
  No marketing tone, no rhetorical questions, no "imagine...".
- Define each term the first time it appears with `<dfn>`. If the term names a
  part of the drawing, add `data-part="name"` so it lights up on hover.
- Use `.caption` for notes about how to read the drawing ("Left: ... Right: ...").
- End with a summary step that returns to the opening image.

## 6. Drawing methods

| Method | Use for | Notes |
|---|---|---|
| Inline SVG | Cross-sections, diagrams, graphs, anything with labels | Default choice. Set one `viewBox` and animate it for zoom. |
| CSS 3D layers | Objects that spin, explode or are seen at an angle | Flat `div`s placed with `translate3d` and `rotate`. Stack several discs or plates to suggest thickness. |
| Canvas | Many moving particles | Only when SVG would need hundreds of elements. |

### SVG conventions

- **Cut surfaces are hatched**: a `<pattern>` of thin lines laid over the fill.
  Different parts use different angles (housing 45°, plug −45°). The hatching
  goes inside any group that rotates, so it shows the rotation.
- **Two views beat one** when a motion is hard to read: the lock uses a
  lengthwise section (where pin heights are clear) and an end section (where
  rotation is clear), driven by the same values.
- **Rotation seen side-on** is drawn as a projection: scale the moving contents
  vertically by `cos(angle)` around the axis.
- **Status outlines**: a part that causes a failure gets a red stroke (3px at
  full strength); the concept line turns green or red segment by segment.
- **Glow** (`filter="url(#glow)"`) on the concept line only. The hover glow
  (`#glow-lit`) is applied automatically to `.is-lit` elements.
- **Labels** sit outside the object with short leader lines in `--muted`,
  in a column that does not overlap the drawing.

### CSS 3D conventions

- Do not put inline SVG inside a 3D scene; it does not render reliably in
  every browser. Build shapes from `div`s (borders, gradients, radial-gradient
  rings for arcs).
- **Lighting**: give each face an outward direction and set `--shade` per frame
  from the angle to a fixed light (from the front left, −35°). Faces darken
  through a `::after` overlay. The top face stays light and the bottom dark.
- **Floor shadow**: a blurred ellipse under the object, outside the 3D scene,
  fading out when the object is exploded or zoomed.
- **Labels face the viewer**: undo the camera rotation on each label
  (`rotateY(-ry) rotateX(-rx)`). Put labels outside walls that would hide them.
- **Mechanical links must be visible**: when one part drives another (the key
  turns a cam that moves the latch), draw the link and compute the driven part's
  position from the driver, so the two cannot drift apart.
- Remember that CSS `scale()` does not scale depth when working out perspective.

## 7. Motion

- **Timing inside step `i`**: start the scene's main animation around
  `t = i − 0.15` and finish by `t = i + 0.6`, leaving the finished state on
  screen while the text is read.
- **Easing**: `ease` (cubic in-out) for camera moves and slides;
  `easeOutBack` for physical settling (pins dropping, a shackle popping), with
  a small overshoot (`k` about 0.9 to 1.6).
- **Crossfades** between views take about 0.25 of a step.
- **Camera zoom**: use `E.keyframes(t, [[t, viewBox], ...])` with hold frames
  between moves. Provide a separate keyframe list for narrow screens that shows
  one view at a time.
- **Handover from 3D to 2D**: move and scale the 3D part until it lies exactly
  over its 2D drawing (measure the SVG element with `getBoundingClientRect`),
  fade the rest of the 3D scene, then crossfade.
- **Failure demonstrations**: a blocked motion is a short jitter (±3°, a few
  cycles) with the blocking parts outlined in red.
- **Reduced motion**: the engine shows each step's finished state; hero loops stop.

## 8. Gallery card

Each explainer provides `hero.js`, which registers
`ExplainerHeroes["<folder-name>"] = function (container) { ...; return update(dt, hover); }`.
The card shows the same object as the page's first screen, spinning slowly. On
hover it speeds up and shows a small hint of the mechanism (the lock turns and
opens). Keep it recognisable at about 250 px. Cards carry a title, one
sentence, and tags (subject type, number of steps).

## 9. Checklist for a new explainer

- [ ] Copied from `_template/`; links point to `../../index.html` explicitly.
- [ ] Hero step with definition and `.scroll-cue`; summary step at the end.
- [ ] Every scene animated within its step's timing window; reversible by scrolling.
- [ ] Materials follow the colour roles; `.legend` explains them.
- [ ] Cut surfaces hatched; labels outside the object.
- [ ] Defined terms use `<dfn>`, with `data-part` where they name a drawn part.
- [ ] Narrow-screen camera keyframes checked at 400 px wide.
- [ ] `hero.js` and a gallery card added.
- [ ] Checked frozen frames with `#t=<value>` at the start, middle and end of each step.
