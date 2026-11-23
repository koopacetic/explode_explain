---
name: propose-explainer
description: Propose a new scroll-driven explainer page for a given subject (a mechanism, process, idea or concept). Presents basic information about the subject, a through-line of about a dozen concepts from first principles to solid understanding with the visual and transitions for each, alternative visual formats if a linear "explode" page is not the best fit, and expansion or branching topics. Use when the user asks to propose, plan or outline an explainer, or types /propose-explainer <subject>.
---

# Propose an explainer

Produce a proposal for one explainer page in this repository. The subject is
given as the argument (for example `/propose-explainer compound interest`). If
no subject is given, ask for one.

This is a proposal only. Do not create files or write page code unless the user
asks for it afterwards.

## Context: what an explainer is here

- One static HTML page per subject under `explainers/<slug>/`, hosted on GitHub
  Pages. No build step, no server, minimal or no libraries.
- Text on the left, a sticky drawing on the right. Each `<section data-step>` is
  one scene. `shared/explainer.js` converts the scroll position into a number `t`
  (step index + progress through the step), and the page draws everything as a
  function of `t`, so scrolling back up reverses the animation.
- Drawing tools available: inline SVG (preferred for diagrams, labels, graphs),
  CSS 3D transforms on flat layers (for objects that spin or come apart), and
  canvas only when there are many moving particles.
- The first screen gives a short definition and a "hero" image that
  is animated in a loop (the same hero appears on the gallery card).
- Subjects can be concepts, not only physical mechanisms: a mathematical idea,
  an algorithm, an economic effect, a biological process, a historical change.
- Read `STYLE.md` first: proposed visuals must follow its colour roles, drawing
  conventions and motion timing. Read `explainers/pin-tumbler-lock/` for a
  working example if the format is unclear.

## Writing style

Plain encyclopedic language, similar to a good Wikipedia article: short
sentences, defined terms in bold on first use, no marketing tone, no
exclamation, no rhetorical questions, no "imagine..." openings. Do not refer to
the author as "I". Every scene description should say concretely what is drawn
and what moves.

## Output structure

Present the proposal in the chat using these sections, in this order.

### 1. Subject summary

- A two to four sentence definition, as it would open an encyclopedia article.
- A small infobox-style table of key facts (for example type or field, origin or
  discoverer, where it is used, related subjects). Mark any fact that is
  uncertain and should be checked before publishing.
- One sentence on the core idea the page must leave the reader with.
- The intended reader and assumed prior knowledge.

### 2. Hero image

What the looping first-screen image is, and why it represents the subject. It
must work as a small gallery card too (recognisable at about 250 px).

### 3. Through-line (about 12 scenes)

A table with one row per scene, ordered from first principles to solid
understanding. Each scene introduces exactly one new idea and builds on the
ones before it. Columns:

| # | Concept (one sentence of what the text says) | Main visual | Transition in | Transition out |

Guidelines:
- Start from something the reader already knows or can see.
- Introduce vocabulary only when the visual needs a name for something.
- Include at least one "failure" or counter-example scene (what happens when a
  condition is not met), since contrast is often where understanding forms.
- End with a recap scene that returns to the hero image, now understood.
- Transitions should carry an object from one scene into the next (zoom into a
  part, a value becomes an axis, a shape splits) rather than cutting.
- Note which scenes reuse the same drawing, to keep the build manageable.

### 4. Visual format assessment

State whether the linear "take it apart" format suits the subject. Then
propose two or three alternative formats that would suit it, each with
a short description, what it shows better, what it costs to build, and a
recommendation. Choose from, or go beyond, this list:

- **Exploded view / cross-section**: physical objects with hidden internals.
- **Zoom levels** (powers of ten): subjects that span scales, such as cells to
  organs, or bits to network packets.
- **Build-up diagram**: start from one element and add one piece per scene
  (graphs, circuits, proofs, data structures).
- **Parameter scrub**: scroll drives one variable and the drawing shows its
  effect (interest rate, temperature, frequency, sample size).
- **Timeline / sequence**: processes in time, historical change, algorithms
  stepping through.
- **Side-by-side comparison**: two systems or two states run in parallel
  (correct vs incorrect key, with vs without friction).
- **State machine / flow**: systems with distinct states and transitions
  (protocols, life cycles, traffic lights).
- **Map or spatial walk**: geography, anatomy, architecture, a circuit board.
- **Small interactive sandbox at the end**: a slider or a few inputs the reader
  can change once they understand the idea. Static-hosting compatible.
- **Branching page**: a shared trunk of scenes, then the reader picks a branch.

### 5. Technical notes

- Which drawing method each part uses (SVG, CSS 3D layers, canvas) and why.
- Anything that is hard to show truthfully in 2D or with faked 3D, and how to
  handle it (simplify, exaggerate with a caption, use two views).
- Accessibility: what the reduced-motion version shows; text must make sense
  without the visuals.

### 6. Expansion and branching topics

- **Continue downwards**: three to six follow-on sections that extend the same
  page, each with a one-line description.
- **Branch out**: three to six related subjects that could become their own
  explainers using this page as a base, noting which drawings could be reused.
- **Common misconceptions** the page could address.

### 7. Next step

One line suggesting what to build first (usually the hero and the first three
scenes, to test the visual approach).
