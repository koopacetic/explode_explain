/* Protein folding: the shared model of the protein chain.
 *
 * Used by the page (scenes.js) and by the gallery card (hero.js).
 *
 * The protein is a chain of 48 beads (amino acids). Its shapes are stored as
 * layouts, one [x, y] point per bead, in a 1000 x 560 drawing space:
 *   LINE  stretched out, as made by the ribosome
 *   COIL  a loose random tangle (unfolded in water)
 *   COLL  collapsed but irregular (after hydrophobic collapse)
 *   NAT   the native fold: two helices, a two-strand sheet and a pocket
 * Every drawing of the chain is computed from a layout, so the bead view, the
 * ribbon cartoon and the small chain inside the funnel ball always agree.
 */
(function () {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Small seeded random generator, so every visit draws the same shapes.
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lerp(a, b, p) { return a + (b - a) * p; }
  function ease(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function clamp(v) { return Math.min(1, Math.max(0, v)); }
  function bez(p0, c, p2, u) {
    var a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, d = u * u;
    return [a * p0[0] + b * c[0] + d * p2[0], a * p0[1] + b * c[1] + d * p2[1]];
  }

  /* ---------- Native fold ---------- */

  var NAT = [];
  function push(p) { NAT.push(p); }
  [[372, 138], [388, 158], [404, 176]].forEach(push);                       // 0-2   N-terminal tail
  for (var k = 0; k < 10; k++) push([425 + (k % 2 ? 9 : -9), 195 + 11 * k]); // 3-12  helix 1
  [0.25, 0.5, 0.75].forEach(function (u) { push(bez(NAT[12], [400, 345], [445, 349], u)); }); // 13-15 loop
  for (k = 0; k < 6; k++) push([445 + 21 * k, 352 + (k % 2 ? 3 : -3)]);     // 16-21 strand 1
  push([572, 346]); push([573, 326]);                                        // 22-23 turn
  for (k = 0; k < 6; k++) push([550 - 21 * k, 324 + (k % 2 ? 3 : -3)]);     // 24-29 strand 2
  [1, 2, 3, 4, 5].forEach(function (j) { push(bez(NAT[29], [510, 250], [584, 294], j / 6)); }); // 30-34 loop (pocket floor)
  for (k = 0; k < 10; k++) push([575 + (k % 2 ? -9 : 9), 294 - 11 * k]);    // 35-44 helix 2
  [[590, 178], [606, 160], [622, 142]].forEach(push);                       // 45-47 C-terminal tail
  var N = NAT.length; // 48

  var SEG = {
    helix: [[3, 12], [35, 44]],
    strand: [[16, 21], [24, 29]],
    loop: [[0, 3], [12, 16], [21, 24], [29, 35], [44, 47]]
  };

  // Water-avoiding beads: the inward-facing side of each helix, alternate
  // beads of the sheet, and one bead in the pocket floor.
  var PHOB = {};
  [4, 6, 8, 10, 12, 36, 38, 40, 42, 44, 16, 18, 20, 25, 27, 29, 32].forEach(function (i) { PHOB[i] = true; });

  var CENTER = [500, 265];

  /* ---------- Other layouts ---------- */

  var LINE = [];
  for (var i = 0; i < N; i++) LINE.push([124 + i * 16, 280 + 12 * Math.sin(i * 0.55)]);

  // Collapsed: a compact, irregular ball. Water-avoiding beads are pulled
  // close to the centre, water-loving beads stay further out.
  var r1 = rng(7), CC = [500, 290];
  var COLL = NAT.map(function (p, j) {
    var f = PHOB[j] ? 0.5 : (j < 3 || j > 44) ? 0.62 : 0.74;
    return [CC[0] + (p[0] - CC[0]) * f + (r1() - 0.5) * 18,
            CC[1] + (p[1] - CC[1]) * f + (r1() - 0.5) * 18];
  });

  // Random coil: a walk with fixed step length that turns randomly.
  var r2 = rng(31), COIL = [], ang = 0.4, pos = [372, 170];
  for (i = 0; i < N; i++) {
    COIL.push([pos[0], pos[1]]);
    ang += (r2() - 0.5) * 2.0;
    var nx = pos[0] + 19 * Math.cos(ang), ny = pos[1] + 19 * Math.sin(ang);
    if (nx < 330 || nx > 670) { ang = Math.PI - ang; nx = pos[0] + 19 * Math.cos(ang); }
    if (ny < 110 || ny > 420) { ang = -ang; ny = pos[1] + 19 * Math.sin(ang); }
    pos = [nx, ny];
  }

  /* ---------- Sequence ---------- */

  var AA = "ACDEFGHIKLMNPQRSTVWY";
  var r3 = rng(99), SEQ = "M";
  for (i = 1; i < N; i++) {
    var set = PHOB[i] ? "AVLIFMW" : "STNQDEKRHGYP";
    SEQ += set.charAt(Math.floor(r3() * set.length));
  }

  function hsl(h, s, l) {
    s /= 100; l /= 100;
    var f = function (n) {
      var kk = (n + h / 30) % 12;
      return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(kk - 3, 9 - kk, 1));
    };
    return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
  }
  var AA_COLOR = SEQ.split("").map(function (c) { return hsl(AA.indexOf(c) * 18, 42, 64); });
  var PHOB_RGB = [214, 164, 78], PHIL_RGB = [124, 164, 200], GHOST_RGB = [170, 180, 190];
  var TONE = NAT.map(function (p, j) { return PHOB[j] ? PHOB_RGB : PHIL_RGB; });

  function mixRGB(a, b, p) {
    return [lerp(a[0], b[0], p), lerp(a[1], b[1], p), lerp(a[2], b[2], p)];
  }
  function rgb(c) { return "rgb(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + ")"; }

  /* ---------- Geometry helpers ---------- */

  function mix(A, B, p) {
    return A.map(function (a, j) { return [lerp(a[0], B[j][0], p), lerp(a[1], B[j][1], p)]; });
  }

  // Smooth curve through points (Catmull-Rom converted to cubic Beziers).
  function smoothPath(pts) {
    var d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
    for (var j = 0; j < pts.length - 1; j++) {
      var p0 = pts[j - 1] || pts[j], p1 = pts[j], p2 = pts[j + 1], p3 = pts[j + 2] || p2;
      d += " C" + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + " " + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) +
        " " + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + " " + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) +
        " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
    }
    return d;
  }

  // Axis of a helix or strand: midpoints of neighbouring beads, extended half
  // a step at each end. Returned resampled by arc length.
  function axis(P, a, b, samples) {
    var m = [];
    for (var j = a; j < b; j++) m.push([(P[j][0] + P[j + 1][0]) / 2, (P[j][1] + P[j + 1][1]) / 2]);
    var f = m[0], s = m[1], l = m[m.length - 1], q = m[m.length - 2];
    m.unshift([f[0] - (s[0] - f[0]) * 0.5, f[1] - (s[1] - f[1]) * 0.5]);
    m.push([l[0] + (l[0] - q[0]) * 0.5, l[1] + (l[1] - q[1]) * 0.5]);
    // smooth once (removes the strand zigzag)
    var sm = m.map(function (p, j) {
      if (j === 0 || j === m.length - 1) return p;
      return [(m[j - 1][0] + 2 * p[0] + m[j + 1][0]) / 4, (m[j - 1][1] + 2 * p[1] + m[j + 1][1]) / 4];
    });
    var cum = [0];
    for (j = 1; j < sm.length; j++) cum.push(cum[j - 1] + Math.hypot(sm[j][0] - sm[j - 1][0], sm[j][1] - sm[j - 1][1]));
    var L = cum[cum.length - 1], out = [], seg = 0;
    for (var n = 0; n < samples; n++) {
      var d = L * n / (samples - 1);
      while (seg < sm.length - 2 && cum[seg + 1] < d) seg++;
      var u = (d - cum[seg]) / ((cum[seg + 1] - cum[seg]) || 1);
      var x = lerp(sm[seg][0], sm[seg + 1][0], u), y = lerp(sm[seg][1], sm[seg + 1][1], u);
      var tx = sm[seg + 1][0] - sm[seg][0], ty = sm[seg + 1][1] - sm[seg][1], tl = Math.hypot(tx, ty) || 1;
      out.push({ x: x, y: y, nx: -ty / tl, ny: tx / tl, s: d });
    }
    out.L = L;
    return out;
  }

  function fmt(p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }

  // Helix ribbon: a sine wave around the axis. Half-waves alternate between
  // the front (light, wide) and the back (dark, narrow) of the coil.
  function helixPaths(P, a, b) {
    var ax = axis(P, a, b, 70), A = 14, lambda = 38;
    var front = "", back = "", prev = null, piece = -1;
    ax.forEach(function (q) {
      var phi = 2 * Math.PI * q.s / lambda;
      var off = A * Math.sin(phi);
      var pt = [q.x + q.nx * off, q.y + q.ny * off];
      var pc = Math.floor(phi / Math.PI);
      if (pc !== piece) {
        var start = prev ? "M" + fmt(prev) + " L" : "M";
        if (pc % 2 === 0) front += start + fmt(pt) + " "; else back += start + fmt(pt) + " ";
        piece = pc;
      } else {
        if (pc % 2 === 0) front += "L" + fmt(pt) + " "; else back += "L" + fmt(pt) + " ";
      }
      prev = pt;
    });
    return { front: front, back: back };
  }

  // Strand: a flat arrow pointing from the first bead to the last.
  function strandPath(P, a, b) {
    var ax = axis(P, a, b, 30), head = 17, w = 8, hw = 15, L = ax.L;
    var left = [], right = [], base = null;
    ax.forEach(function (q) {
      if (q.s <= L - head) {
        left.push([q.x + q.nx * w, q.y + q.ny * w]);
        right.push([q.x - q.nx * w, q.y - q.ny * w]);
        base = q;
      }
    });
    var tip = ax[ax.length - 1];
    var pts = left.concat([[base.x + base.nx * hw, base.y + base.ny * hw], [tip.x, tip.y],
      [base.x - base.nx * hw, base.y - base.ny * hw]], right.reverse());
    return "M" + pts.map(fmt).join(" L") + " Z";
  }

  /* ---------- Builders ---------- */

  // Ribbon cartoon. style "solid" for the protein, "outline" for a prediction.
  function buildCartoon(parent, style) {
    var g = el("g", {}, parent);
    var solid = style !== "outline";
    var dash = solid ? {} : { "stroke-dasharray": "5 4" };
    function a(base, extra) { for (var kk in extra) base[kk] = extra[kk]; return base; }
    var loops = SEG.loop.map(function () {
      return el("path", a({ fill: "none", stroke: solid ? "#a9b4bf" : "#e4e8ec", "stroke-width": solid ? 4 : 1.6,
        "stroke-linecap": "round", class: "part-loop" }, dash), g);
    });
    var strands = SEG.strand.map(function () {
      return el("path", a(solid
        ? { fill: "url(#g-strand)", stroke: "#4f6f8e", "stroke-width": 1.2, "stroke-linejoin": "round", class: "part-sheet" }
        : { fill: "none", stroke: "#e4e8ec", "stroke-width": 1.6, class: "part-sheet" }, dash), g);
    });
    var helices = SEG.helix.map(function () {
      var hb = el("path", a({ fill: "none", stroke: solid ? "#8a6a2c" : "#e4e8ec", "stroke-width": solid ? 7 : 1.4,
        "stroke-linecap": "round", "stroke-linejoin": "round", class: "part-helix", opacity: solid ? 1 : 0.6 }, dash), g);
      var hf = el("path", a({ fill: "none", stroke: solid ? "#e3b862" : "#e4e8ec", "stroke-width": solid ? 10 : 1.8,
        "stroke-linecap": "round", "stroke-linejoin": "round", class: "part-helix" }, dash), g);
      return [hb, hf];
    });
    return {
      g: g,
      update: function (P) {
        SEG.loop.forEach(function (s, j) { loops[j].setAttribute("d", smoothPath(P.slice(s[0], s[1] + 1))); });
        SEG.strand.forEach(function (s, j) { strands[j].setAttribute("d", strandPath(P, s[0], s[1])); });
        SEG.helix.forEach(function (s, j) {
          var h = helixPaths(P, s[0], s[1]);
          helices[j][0].setAttribute("d", h.back);
          helices[j][1].setAttribute("d", h.front);
        });
      }
    };
  }

  // Bead-and-string view of the chain.
  function buildChain(parent, opts) {
    opts = opts || {};
    var r = opts.r || 7;
    var g = el("g", {}, parent);
    var backbone = el("path", { fill: "none", stroke: "#a9b4bf", "stroke-width": opts.bw || 3, "stroke-linecap": "round", class: "part-backbone" }, g);
    var beads = [];
    for (var j = 0; j < N; j++) {
      var bg = el("g", { class: "part-aa " + (PHOB[j] ? "part-phob" : "part-phil") }, g);
      var c = el("circle", { r: r }, bg);
      el("circle", { r: r, fill: "url(#bead-shade)" }, bg);
      beads.push({ g: bg, c: c });
    }
    return {
      g: g,
      backbone: backbone,
      beads: beads,
      // colors: array of [r,g,b] or null for the two-tone colouring
      update: function (P, colors, alphas) {
        backbone.setAttribute("d", smoothPath(P));
        beads.forEach(function (b, j) {
          b.g.setAttribute("transform", "translate(" + P[j][0].toFixed(1) + " " + P[j][1].toFixed(1) + ")");
          b.c.setAttribute("fill", rgb(colors ? colors[j] : TONE[j]));
          b.g.style.opacity = alphas ? alphas[j] : 1;
        });
      }
    };
  }

  // Gradients and the bead highlight used by both builders.
  function addDefs(svg) {
    var defs = svg.querySelector("defs") || el("defs", {}, svg);
    var rg = el("radialGradient", { id: "bead-shade", cx: "0.35", cy: "0.32", r: "0.75" }, defs);
    el("stop", { offset: "0", "stop-color": "#fff", "stop-opacity": "0.55" }, rg);
    el("stop", { offset: "0.45", "stop-color": "#fff", "stop-opacity": "0" }, rg);
    el("stop", { offset: "1", "stop-color": "#000", "stop-opacity": "0.35" }, rg);
    var sg = el("linearGradient", { id: "g-strand", x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
    el("stop", { offset: "0", "stop-color": "#b3cde4" }, sg);
    el("stop", { offset: "1", "stop-color": "#6f93b5" }, sg);
    var dg = el("linearGradient", { id: "g-drug", x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
    el("stop", { offset: "0", "stop-color": "#efe6c4" }, dg);
    el("stop", { offset: "1", "stop-color": "#b9ad84" }, dg);
    return defs;
  }

  // A small drug molecule: a rounded body with two drawn rings.
  // Drawn with its bottom centre at (0, 0).
  function buildDrug(parent, w, h, cls) {
    var g = el("g", { class: "part-drug " + (cls || "") }, parent);
    var body = el("rect", { x: -w / 2, y: -h, width: w, height: h, rx: 14, fill: "url(#g-drug)", stroke: "#7d7458", "stroke-width": 1.2 }, g);
    var ring = function (cx, cy, rr) {
      var pts = [];
      for (var j = 0; j < 6; j++) pts.push((cx + rr * Math.cos(j * Math.PI / 3 + Math.PI / 6)).toFixed(1) + "," + (cy + rr * Math.sin(j * Math.PI / 3 + Math.PI / 6)).toFixed(1));
      el("polygon", { points: pts.join(" "), fill: "none", stroke: "#8a7f5c", "stroke-width": 1.6 }, g);
    };
    ring(-w * 0.18, -h / 2, Math.min(13, h * 0.26));
    ring(w * 0.18, -h / 2, Math.min(13, h * 0.26));
    el("line", { x1: -w * 0.18 + 11, y1: -h / 2, x2: w * 0.18 - 11, y2: -h / 2, stroke: "#8a7f5c", "stroke-width": 1.6 }, g);
    return { g: g, body: body };
  }

  /* ---------- Hero loop ---------- */

  // Shape at s: 0 coil, 1 collapsed, 2 native.
  function layoutAt(s) {
    if (s <= 1) return mix(COIL, COLL, ease(clamp(s)));
    return mix(COLL, NAT, ease(clamp(s - 1)));
  }

  // One cycle of the looping hero, phase 0..1.
  function heroPose(ph) {
    function rg(a, b) { return clamp((ph - a) / (b - a)); }
    var s = 2 * rg(0.08, 0.42) - 2 * rg(0.84, 0.99);
    var drug = ease(rg(0.47, 0.56)) * (1 - ease(rg(0.74, 0.8)));
    var stage = ph < 0.08 || ph >= 0.9 ? 0 : ph < 0.25 ? 1 : ph < 0.42 ? 2 : ph < 0.47 ? 3 : ph < 0.82 ? 4 : 0;
    return { s: s, drug: drug, stage: stage };
  }

  window.ProteinModel = {
    N: N, NAT: NAT, COLL: COLL, COIL: COIL, LINE: LINE, SEG: SEG, PHOB: PHOB, SEQ: SEQ,
    CENTER: CENTER, AA_COLOR: AA_COLOR, TONE: TONE, GHOST: GHOST_RGB,
    POCKET_FLOOR: 272, POCKET_LEFT: 441, POCKET_RIGHT: 559, POCKET_TOP: 190,
    el: el, rng: rng, mix: mix, mixRGB: mixRGB, rgb: rgb, smoothPath: smoothPath,
    addDefs: addDefs, buildChain: buildChain, buildCartoon: buildCartoon, buildDrug: buildDrug,
    layoutAt: layoutAt, heroPose: heroPose
  };
})();
