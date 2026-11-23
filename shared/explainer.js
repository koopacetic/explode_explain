/* Shared scroll engine for all explainers. No dependencies.
 *
 * Every element marked [data-step] is one scene. The engine turns the scroll
 * position into a single number, t:
 *   t = 0.0  the top of step 0 is at the reading line
 *   t = 2.5  the reading line is halfway through step 2
 * Each explainer supplies render(t, dt, info). Drawing everything as a function
 * of t means scrolling backwards plays the animation in reverse automatically.
 *
 * Also provided, with no extra setup:
 *   - a chapter rail (dots on the right, one per step, click to jump)
 *   - hover highlighting: text like <dfn data-part="driver"> adds the class
 *     "is-lit" to every element with class "part-driver" inside the stage
 *   - .scroll-cue elements fade out once the reader starts scrolling
 *
 * Debugging: add #t=4.5 to the URL to freeze the scene at that time.
 */
(function () {
  "use strict";

  var E = (window.Explainer = {});

  // ---------- Small math helpers ----------

  E.clamp = function (v, lo, hi) {
    if (lo === undefined) lo = 0;
    if (hi === undefined) hi = 1;
    return Math.min(hi, Math.max(lo, v));
  };

  // 0 before a, 1 after b, linear in between.
  E.range = function (t, a, b) {
    return E.clamp((t - a) / (b - a));
  };

  E.lerp = function (a, b, p) {
    return a + (b - a) * p;
  };

  // Smooth start and end (cubic ease-in-out).
  E.ease = function (p) {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  };

  // Ends with a small overshoot and settle, like a spring. k sets the overshoot.
  E.easeOutBack = function (p, k) {
    if (k === undefined) k = 1.2;
    var q = p - 1;
    return 1 + (k + 1) * q * q * q + k * q * q;
  };

  // Rises 0 -> 1 between a and b, falls back to 0 between c and d.
  E.window = function (t, a, b, c, d) {
    return E.range(t, a, b) * (1 - E.range(t, c, d));
  };

  // Interpolate between keyframes [[t, [values...]], ...] with easing.
  E.keyframes = function (t, keys) {
    if (t <= keys[0][0]) return keys[0][1].slice();
    for (var i = 0; i < keys.length - 1; i++) {
      var a = keys[i], b = keys[i + 1];
      if (t < b[0]) {
        var p = E.ease((t - a[0]) / (b[0] - a[0]));
        return a[1].map(function (v, j) { return E.lerp(v, b[1][j], p); });
      }
    }
    return keys[keys.length - 1][1].slice();
  };

  // ---------- DOM helpers ----------

  var SVGNS = "http://www.w3.org/2000/svg";

  E.svg = function (tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };

  E.$ = function (sel) {
    return document.querySelector(sel);
  };

  E.isNarrow = function () {
    return window.innerWidth <= 800;
  };

  // ---------- Hover highlighting ----------

  function setupHighlights(stage) {
    var lit = null;
    function light(name) {
      if (lit === name) return;
      stage.querySelectorAll(".is-lit").forEach(function (el) { el.classList.remove("is-lit"); });
      lit = name;
      if (name) stage.querySelectorAll(".part-" + name).forEach(function (el) { el.classList.add("is-lit"); });
    }
    document.querySelectorAll("[data-part]").forEach(function (term) {
      var name = term.getAttribute("data-part");
      term.setAttribute("tabindex", "0");
      term.addEventListener("mouseenter", function () { light(name); });
      term.addEventListener("mouseleave", function () { light(null); });
      term.addEventListener("focus", function () { light(name); });
      term.addEventListener("blur", function () { light(null); });
      // Touch: tap to light briefly.
      term.addEventListener("click", function () {
        light(name);
        setTimeout(function () { if (lit === name) light(null); }, 1800);
      });
    });
  }

  // ---------- Chapter rail ----------

  function setupRail(steps, scrollToStep) {
    var rail = document.createElement("nav");
    rail.className = "rail";
    rail.setAttribute("aria-label", "Sections");
    var dots = steps.map(function (step, i) {
      var heading = step.querySelector("h1, h2");
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-label", heading ? heading.textContent : "Step " + (i + 1));
      b.setAttribute("aria-label", b.getAttribute("data-label"));
      b.addEventListener("click", function () { scrollToStep(i); });
      rail.appendChild(b);
      return b;
    });
    document.body.appendChild(rail);
    return dots;
  }

  // ---------- Scroll engine ----------

  E.start = function (render) {
    var steps = Array.prototype.slice.call(document.querySelectorAll("[data-step]"));
    var stage = document.querySelector(".stage");
    var bar = document.querySelector(".progress");
    var cues = document.querySelectorAll(".scroll-cue");
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var active = -1;
    var last = performance.now();

    // The "reading line" sits mid-screen on wide screens. On narrow screens the
    // stage covers the top half, so the line sits in the middle of the lower half.
    function readingLine() {
      return window.innerHeight * (E.isNarrow() ? 0.75 : 0.5);
    }

    function debugT() {
      var m = location.hash.match(/t=([\d.]+)/);
      return m ? parseFloat(m[1]) : null;
    }

    function scrollT() {
      var line = readingLine();
      for (var i = 0; i < steps.length; i++) {
        var r = steps[i].getBoundingClientRect();
        if (line < r.bottom) return i + E.clamp((line - r.top) / r.height);
      }
      return steps.length;
    }

    function scrollToStep(i) {
      var r = steps[i].getBoundingClientRect();
      window.scrollTo({
        top: window.scrollY + r.top + r.height * 0.45 - readingLine(),
        behavior: reduceMotion ? "auto" : "smooth"
      });
    }

    if (stage) setupHighlights(stage);
    var dots = setupRail(steps, scrollToStep);

    function frame(now) {
      var dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      var t = debugT();
      if (t === null) t = scrollT();

      // With reduced motion, show each scene's finished state instead of scrubbing.
      if (reduceMotion) t = Math.floor(t) + 0.9;

      // The text switches slightly before the scene's animation starts, so the
      // highlighted text always describes what is moving.
      var idx = E.clamp(Math.floor(t + 0.15), 0, steps.length - 1);
      if (idx !== active) {
        if (steps[active]) steps[active].classList.remove("is-active");
        if (dots[active]) dots[active].classList.remove("is-active");
        steps[idx].classList.add("is-active");
        dots[idx].classList.add("is-active");
        active = idx;
      }

      if (bar) bar.style.width = (100 * E.clamp(t / steps.length)) + "%";
      var cueOpacity = 1 - E.range(t, 0.55, 0.8);
      for (var c = 0; c < cues.length; c++) cues[c].style.opacity = cueOpacity;

      render(t, dt, { reduceMotion: reduceMotion, narrow: E.isNarrow() });
      requestAnimationFrame(frame);
    }

    frame(performance.now()); // draw immediately, then keep going each frame
  };
})();
