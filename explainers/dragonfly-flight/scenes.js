/* Dragonfly flight: all drawing and animation.
 *
 * Scene timeline (t = step index + progress through that step):
 *   0 Hero          dragonfly from above, wings beating, tip paths
 *   1 Plate         the camera zooms into a cut through the right forewing;
 *                   the wing section in a stream of air, lift and drag
 *   2 Stall         angle of attack 8 -> 40 degrees; lift graph; flow separates
 *   3 Flapping      the section sweeps back and forth, keeping its tilt;
 *                   forces alternate, net force close to zero
 *   4 Flip          pronation and supination; net force points up
 *   5 LEV           a vortex sits on the upper surface; graph adds the
 *                   flapping-wing curve
 *   6 Tilted        stroke plane tilts to 60 degrees; downstroke steep,
 *                   upstroke nearly edge-on
 *   7 Drag          per-half-stroke forces add tip to tail; weight; share
 *                   of the upward force from drag
 *   8 Muscles       front cross-section of the thorax; elevator and
 *                   depressor muscles rock each wing over its fulcrum
 *   9 Four wings    the thorax shrinks into the top view; four phase dials
 *  10 Phase         top view moves left; tip-height traces; phase scrubbed
 *                   180 -> 90 -> 0 degrees
 *  11 Wake          two sections, forewing above and ahead of hindwing;
 *                   swirling wake straightened by the hindwing
 *  12 Wing          one forewing enlarged: veins, nodus, pterostigma,
 *                   corrugated cross-section
 *  13 Summary       the wing shrinks back into the hero view
 *
 * The wing beat runs on time (like the hero loop); everything else is a
 * function of t. The force model is quasi-steady, with coefficients from
 * Wang (2004): CL = 1.2 sin 2a, CD = 1.4 - cos 2a.
 */
(function () {
  "use strict";

  var E = Explainer, D = Dragonfly, el = D.el, TAU = D.TAU, DEG = D.DEG;
  var range = E.range, ease = E.ease, lerp = E.lerp, win = E.window, clamp = E.clamp;
  var ACCENT = D.ACCENT, BAD = D.BAD, TEXT = D.TEXT, MUTED = D.MUTED, AIR = D.AIR;

  var svg = E.$("#drawing");
  D.addDefs(svg);

  // ---------- helpers ----------

  function G(parent, attrs) { return el("g", attrs || {}, parent); }
  function T(parent, x, y, text, cls, anchor) {
    var t = el("text", { x: x, y: y, class: cls || "", "text-anchor": anchor || "start" }, parent);
    t.textContent = text;
    return t;
  }
  function lead(parent, x1, y1, x2, y2) { return el("line", { x1: x1, y1: y1, x2: x2, y2: y2, class: "lead" }, parent); }
  function setLine(ln, x1, y1, x2, y2) {
    ln.setAttribute("x1", x1.toFixed(1)); ln.setAttribute("y1", y1.toFixed(1));
    ln.setAttribute("x2", x2.toFixed(1)); ln.setAttribute("y2", y2.toFixed(1));
  }
  function setXY(node, x, y) { node.setAttribute("x", x.toFixed(1)); node.setAttribute("y", y.toFixed(1)); }
  function setText(node, s) { if (node.textContent !== s) node.textContent = s; }
  function show(node, v) {
    node.style.opacity = v;
    node.style.display = v <= 0.001 ? "none" : "";
  }
  // Scale by s about (cx, cy), then move that point to (tx, ty).
  function xf(node, tx, ty, s, cx, cy) {
    node.setAttribute("transform", "translate(" + tx.toFixed(2) + " " + ty.toFixed(2) + ") scale(" + s.toFixed(4) + ") translate(" + (-cx).toFixed(2) + " " + (-cy).toFixed(2) + ")");
  }
  function mix(a, b, p) {
    var pa = [1, 3, 5].map(function (i) { return parseInt(a.substr(i, 2), 16); });
    var pb = [1, 3, 5].map(function (i) { return parseInt(b.substr(i, 2), 16); });
    return "rgb(" + pa.map(function (v, i) { return Math.round(lerp(v, pb[i], p)); }).join(",") + ")";
  }
  function frac(x) { return x - Math.floor(x); }

  // Straight arrow with a filled head.
  function Arrow(parent, color, w, cls, glow) {
    var g = G(parent, { class: cls || "" });
    if (glow) g.setAttribute("filter", "url(#glow)");
    var line = el("line", { stroke: color, "stroke-width": w, "stroke-linecap": "round" }, g);
    var head = el("path", { fill: color }, g);
    return {
      g: g,
      len: 0,
      color: function (c) { line.setAttribute("stroke", c); head.setAttribute("fill", c); },
      set: function (x1, y1, x2, y2) {
        var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
        this.len = L;
        if (L < 3) { g.style.display = "none"; return; }
        g.style.display = "";
        var ux = dx / L, uy = dy / L, h = Math.min(L * 0.6, 7 + 2.4 * w), hw = h * 0.5;
        var bx = x2 - ux * h, by = y2 - uy * h;
        setLine(line, x1, y1, bx + ux * 1, by + uy * 1);
        head.setAttribute("d", "M" + x2.toFixed(1) + " " + y2.toFixed(1) + " L" + (bx - uy * hw).toFixed(1) + " " + (by + ux * hw).toFixed(1) +
          " L" + (bx + uy * hw).toFixed(1) + " " + (by - ux * hw).toFixed(1) + " Z");
      }
    };
  }

  // Wing section (flat plate) in its own coordinates: leading edge at +x.
  var PLATE = "M55 0 C55 -3.5 51 -5 45 -5 L-55 -1.2 L-55 1.2 L45 5 C51 5 55 3.5 55 0 Z";
  function plate(parent, s) {
    var g = G(parent);
    var inner = G(g, { transform: "scale(" + (s || 1) + ")" });
    el("path", { d: PLATE, fill: "url(#df-g-wing)", class: "part-chord" }, inner);
    el("path", { d: PLATE, fill: "url(#df-hatch-wing)" }, inner);
    el("path", { d: PLATE, fill: "none", stroke: "#8a6a22", "stroke-width": 1 }, inner);
    var le = el("circle", { cx: 55, cy: 0, r: 4, fill: "#fff", stroke: "#3a2f1a", "stroke-width": 1.2, class: "part-le" }, inner);
    return { g: g, inner: inner, le: le };
  }
  function placePlate(p, x, y, th) {
    p.g.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ") rotate(" + (-th / DEG).toFixed(2) + ")");
  }

  var SPIRAL = (function () {
    var pts = [];
    for (var a = 0; a <= 4 * Math.PI; a += 0.25) {
      var r = 2 + 14 * a / (4 * Math.PI);
      pts.push((r * Math.cos(a)).toFixed(1) + " " + (r * Math.sin(a)).toFixed(1));
    }
    return "M" + pts.join(" L");
  })();

  /* =====================================================================
   * Force model
   * ===================================================================== */

  function CLflap(a) { return 1.2 * Math.sin(2 * a); }
  function CDflap(a) { return 1.4 - Math.cos(2 * a); }
  var STALL = 13 * DEG;
  function CLsteady(a) { return a < STALL ? 0.7 * a / STALL : 0.42 + 0.28 * Math.exp(-(a - STALL) / (4 * DEG)); }
  function stallOf(a) { return clamp((a - STALL) / (6 * DEG)); }
  function CDsteady(a, st) { return 0.08 + 1.1 * Math.pow(Math.sin(a), 2) + 0.35 * st; }

  // Chord angle (maths convention, radians) at phase phi of the beat.
  // Phase 0 = top/back end of the stroke, 0.5 = bottom/front end.
  function chordAngle(phi, P) {
    var td = Math.PI + P.beta - P.ad, tu = P.beta + P.au, w = 0.07, th;
    if (phi < w) th = lerp(tu, td, ease((phi + w) / (2 * w)));
    else if (phi > 1 - w) th = lerp(tu, td, ease((phi - (1 - w)) / (2 * w)));
    else if (phi > 0.5 - w && phi < 0.5 + w) th = lerp(td, tu, ease((phi - (0.5 - w)) / (2 * w)));
    else th = phi < 0.5 ? td : tu;
    return lerp(td, th, P.flip);
  }

  function kin(phi, P) {
    phi = frac(phi);
    var s = Math.sin(TAU * phi), c = Math.cos(TAU * phi);
    var d = [Math.cos(P.beta), Math.sin(P.beta)];
    return {
      pos: [P.A * c * d[0], P.A * c * d[1]],
      u: s >= 0 ? [-d[0], -d[1]] : [d[0], d[1]],
      sp: Math.abs(s),
      th: chordAngle(phi, P),
      down: s >= 0
    };
  }

  // Lift and drag on a flat plate with chord angle th, moving in direction u
  // at relative speed sp (0..1).
  function forces(u, sp, th, steady) {
    var c = [Math.cos(th), Math.sin(th)];
    var a = Math.acos(Math.min(1, Math.abs(c[0] * u[0] + c[1] * u[1])));
    var m = [-c[1], c[0]];
    if (m[0] * u[0] + m[1] * u[1] < 0) m = [-m[0], -m[1]];
    var mu = m[0] * u[0] + m[1] * u[1];
    var l = [-(m[0] - mu * u[0]), -(m[1] - mu * u[1])], ll = Math.hypot(l[0], l[1]) || 1;
    l = [l[0] / ll, l[1] / ll];
    var q = sp * sp, st = steady ? stallOf(a) : 0;
    var CL = steady ? CLsteady(a) : CLflap(a), CD = steady ? CDsteady(a, st) : CDflap(a);
    return { a: a, stall: st, ldir: l, L: [l[0] * CL * q, l[1] * CL * q], D: [-u[0] * CD * q, -u[1] * CD * q] };
  }

  // Mean force over one beat, split by half-stroke and by lift/drag.
  function cycleMean(P) {
    var N = 120, down = [0, 0], up = [0, 0], lv = 0, dv = 0;
    for (var i = 0; i < N; i++) {
      var k = kin((i + 0.5) / N, P), f = forces(k.u, k.sp, k.th, false);
      var h = k.down ? down : up;
      h[0] += (f.L[0] + f.D[0]) / N; h[1] += (f.L[1] + f.D[1]) / N;
      lv += f.L[1] / N; dv += f.D[1] / N;
    }
    return { down: down, up: up, net: [down[0] + up[0], down[1] + up[1]], lv: lv, dv: dv };
  }

  // Which side of the plate (in its own maths frame) the lift points to.
  function sideOf(ldir, th) { return (-Math.sin(th) * ldir[0] + Math.cos(th) * ldir[1]) >= 0 ? 1 : -1; }

  function secParams(t) {
    var p6 = ease(range(t, 5.85, 6.5)), fl = ease(range(t, 2.85, 3.4));
    return {
      flap: fl,
      A: 150 * fl,
      flip: ease(range(t, 3.85, 4.4)),
      beta: 60 * DEG * p6,
      ad: lerp(30, 70, p6) * DEG,
      au: lerp(30, 5, p6) * DEG,
      alpha: lerp(8, 40, ease(range(t, 1.85, 2.6))) * DEG
    };
  }

  /* =====================================================================
   * Steps 0, 9, 10, 13: top view
   * ===================================================================== */

  var topWrap = G(svg);
  var top = D.buildTopView(topWrap);
  var cutG = G(svg);
  var cutLine = el("line", { stroke: ACCENT, "stroke-width": 2, "stroke-dasharray": "5 4" }, cutG);
  var cutTxt = T(cutG, 0, 0, "cut", "small accent");

  // Summary labels
  var sumG = G(svg);
  T(sumG, 800, 100, "forewing", "");
  lead(sumG, 795, 96, 715, 130);
  T(sumG, 800, 262, "hindwing", "");
  lead(sumG, 795, 257, 700, 210);
  T(sumG, 70, 70, "wing-tip path, one beat", "small");
  lead(sumG, 150, 76, 272, 132);
  T(sumG, 70, 330, "thorax: direct muscles", "small");
  lead(sumG, 160, 336, 474, 175);

  /* =====================================================================
   * Steps 1-7: wing section
   * ===================================================================== */

  var C = [430, 285];
  function SX(p) { return C[0] + p[0]; }
  function SY(p) { return C[1] - p[1]; }

  var secG = G(svg);
  T(secG, 40, 40, "← head (forward)", "cap");

  var streamG = G(secG), washG = G(secG);
  var stream = [], wash = [];
  for (var i = 0; i < 84; i++) {
    var row = i % 12, col = Math.floor(i / 12);
    stream.push({ x: -430 + col * 137 + (row % 2) * 68 + Math.random() * 30, y: -230 + row * 40 + Math.random() * 10, c: el("circle", { r: 2.2, fill: AIR }, streamG) });
  }
  for (i = 0; i < 56; i++) {
    wash.push({ x: (Math.random() * 2 - 1) * 200, y: (Math.random() * 2 - 1) * 250, c: el("circle", { r: 2.2, fill: AIR }, washG) });
  }

  // Horizontal reference and tilt angle (step 6)
  var tiltG = G(secG);
  var horizLine = el("line", { stroke: MUTED, "stroke-width": 1, "stroke-dasharray": "2 5" }, tiltG);
  var tiltArc = el("path", { fill: "none", stroke: MUTED, "stroke-width": 1.2 }, tiltG);
  var tiltTxt = T(tiltG, 0, 0, "60°", "small");

  // Stroke plane
  var planeG = G(secG, { class: "part-plane" });
  var planeLine = el("line", { stroke: "#c7ced6", "stroke-width": 1.5, "stroke-dasharray": "8 6" }, planeG);
  var planeTxt = T(planeG, 0, 0, "stroke plane", "cap");
  var downS = Arrow(planeG, MUTED, 1.5), upS = Arrow(planeG, MUTED, 1.5);
  var downTxt = T(planeG, 0, 0, "downstroke", "small", "middle");
  var upTxt = T(planeG, 0, 0, "upstroke", "small", "middle");
  var flipG = G(secG);
  var supTxt = T(flipG, 0, 0, "supination", "small", "middle");
  supTxt.setAttribute("class", "small part-sup");
  var pronTxt = T(flipG, 0, 0, "pronation", "small", "middle");
  pronTxt.setAttribute("class", "small part-pron");

  // Ghost outlines of the wing at evenly spaced moments of the beat
  var ghostG = G(secG);
  var ghosts = [];
  for (i = 0; i < 10; i++) {
    var gp = G(ghostG);
    el("path", { d: PLATE, fill: "none", stroke: D.WING_LIGHT, "stroke-width": 1 }, gp);
    ghosts.push(gp);
  }

  var wing = plate(secG);
  var levG = G(wing.inner, { class: "part-lev" });
  var levSpiral = el("path", { d: SPIRAL, fill: "none", stroke: AIR, "stroke-width": 2, "stroke-linecap": "round" }, levG);
  var stallG = G(wing.inner, { class: "part-stall" });
  var stallSp = [0, 1].map(function () {
    return el("path", { d: SPIRAL, fill: "none", stroke: BAD, "stroke-width": 1.6, "stroke-linecap": "round" }, stallG);
  });

  var liftA = Arrow(secG, TEXT, 3, "part-lift"), dragA = Arrow(secG, "#aeb8c2", 3, "part-drag");
  var liftTxt = T(secG, 0, 0, "lift", "small"), dragTxt = T(secG, 0, 0, "drag", "small");

  // Step 1 labels
  var lab1 = G(secG);
  var leTxt = T(lab1, 0, 0, "leading edge", "small", "end"), leLead = lead(lab1, 0, 0, 0, 0);
  var teTxt = T(lab1, 0, 0, "trailing edge", "small"), teLead = lead(lab1, 0, 0, 0, 0);
  var chTxt = T(lab1, 0, 0, "chord (cut face)", "small", "middle"), chLead = lead(lab1, 0, 0, 0, 0);
  var airA = Arrow(lab1, AIR, 2);
  airA.set(80, 110, 200, 110);
  T(lab1, 80, 96, "air, relative to the wing", "small");

  // Step 2: angle of attack
  var aoaG = G(secG);
  var aoaLine = el("line", { stroke: MUTED, "stroke-width": 1, "stroke-dasharray": "4 4" }, aoaG);
  var aoaArc = el("path", { fill: "none", stroke: ACCENT, "stroke-width": 1.6 }, aoaG);
  var aoaTxt = T(aoaG, 0, 0, "", "accent", "end");
  var stallTxt = T(aoaG, 0, 0, "stall: flow breaks away", "small bad");

  // Graph: lift coefficient against angle of attack (steps 2 and 5)
  var grG = G(secG);
  el("rect", { x: 640, y: 30, width: 330, height: 205, rx: 6, class: "frame" }, grG);
  function gx(a) { return 680 + 260 * a / (90 * DEG); }
  function gy(c) { return 200 - 120 * c / 1.3; }
  el("path", { d: "M680 60 V200 H945", class: "axis" }, grG);
  T(grG, 812, 226, "angle of attack", "small", "middle");
  T(grG, 660, 50, "lift", "small");
  [0, 30, 60, 90].forEach(function (d) { T(grG, gx(d * DEG), 214, d + "°", "small", "middle"); });
  function curve(fn) {
    var pts = [];
    for (var d = 0; d <= 90; d += 1) pts.push(gx(d * DEG).toFixed(1) + " " + gy(fn(d * DEG)).toFixed(1));
    return "M" + pts.join(" L");
  }
  el("path", { d: curve(CLsteady), fill: "none", stroke: "#c7ced6", "stroke-width": 2 }, grG);
  T(grG, 790, 186, "steady wing", "small");
  var flapCurve = el("path", { d: curve(CLflap), fill: "none", stroke: D.WING_LIGHT, "stroke-width": 2.5, pathLength: 1, "stroke-dasharray": "1 1", class: "part-lev" }, grG);
  var flapLbl = T(grG, 800, 70, "flapping wing (with vortex)", "small");
  flapLbl.setAttribute("fill", D.WING_LIGHT);
  var grDot = el("circle", { r: 5, fill: TEXT }, grG);
  var grStall = el("line", { x1: gx(STALL), y1: 60, x2: gx(STALL), y2: 200, stroke: BAD, "stroke-width": 1, "stroke-dasharray": "3 3" }, grG);

  // Wing, air and labels zoom together; the graph and net force stay put.
  var secCam = G(secG);
  [streamG, washG, tiltG, planeG, flipG, ghostG, wing.g, liftA.g, dragA.g, liftTxt, dragTxt, lab1, aoaG].forEach(function (n) { secCam.appendChild(n); });
  secG.appendChild(grG);

  // Net force over one beat (steps 3-7)
  var N0 = [850, 395], NS = 210;
  var netG = G(secG);
  var weightA = Arrow(netG, MUTED, 3, "part-weight");
  var fDownA = Arrow(netG, D.WING_LIGHT, 3, "part-fdown"), fUpA = Arrow(netG, D.WING_DARK, 3, "part-fup");
  var netA = Arrow(netG, ACCENT, 4.5, "part-net", true);
  var netZero = el("circle", { cx: N0[0], cy: N0[1], r: 7, fill: "none", stroke: BAD, "stroke-width": 2 }, netG);
  T(netG, N0[0] - 18, N0[1] + 20, "net force, one beat", "cap", "end");
  var netNote = T(netG, N0[0] - 18, N0[1] + 42, "", "small", "end");
  var weightTxt = T(netG, 0, 0, "weight", "small");
  var fDownTxt = T(netG, 0, 0, "downstroke", "small");
  var fUpTxt = T(netG, 0, 0, "upstroke", "small", "end");
  var shareG = G(netG);
  var shareTxt1 = T(shareG, N0[0] - 18, N0[1] + 72, "", "small", "end");
  var shareTxt2 = T(shareG, N0[0] - 18, N0[1] + 92, "", "small", "end");

  /* =====================================================================
   * Step 8: thorax cross-section
   * ===================================================================== */

  var thxG = G(svg);
  var FUL = [[400, 215], [600, 215]];
  el("path", { d: "M350 226 L350 330 Q355 430 500 439 Q645 430 650 330 L650 226 Z", fill: D.VOID, opacity: 0.7 }, thxG);
  var muscleG = G(thxG);
  var WALL = "M338 226 L338 330 Q345 442 500 452 Q655 442 662 330 L662 226 L650 226 L650 330 Q645 430 500 439 Q355 430 350 330 L350 226 Z";
  var POST = "M650 296 L612 300 L606 222 L594 222 L590 312 L650 312 Z";
  [WALL, POST, "M350 296 L388 300 L394 222 L406 222 L410 312 L350 312 Z"].forEach(function (d) {
    el("path", { d: d, fill: "url(#df-g-steel)" }, thxG);
    el("path", { d: d, fill: "url(#df-hatch-body)" }, thxG);
    el("path", { d: d, fill: "none", stroke: "#3a424c", "stroke-width": 1 }, thxG);
  });
  var notum = el("path", { fill: "none", stroke: "#8e99a5", "stroke-width": 7, "stroke-linecap": "round" }, thxG);
  var thxWings = [-1, 1].map(function (side) {
    var w = { side: side, F: FUL[side > 0 ? 1 : 0] };
    w.membrane = el("line", { stroke: "#6f7a86", "stroke-width": 1.5 }, thxG);
    w.elev = el("line", { "stroke-linecap": "round", class: "part-elev" }, muscleG);
    w.depr = el("line", { "stroke-linecap": "round", class: "part-depr" }, muscleG);
    w.wing = el("path", { fill: "url(#df-g-wing)", stroke: "#8a6a22", "stroke-width": 1, class: "part-wing" }, thxG);
    el("circle", { cx: w.F[0], cy: w.F[1], r: 6, fill: "#dde4ea", stroke: "#3a424c", "stroke-width": 1.2, class: "part-fulcrum" }, thxG);
    return w;
  });
  var thxLab = G(thxG);
  T(thxLab, 500, 120, "pleural fulcrum (pivot)", "small", "middle");
  lead(thxLab, 470, 126, 404, 208);
  lead(thxLab, 530, 126, 596, 208);
  T(thxLab, 250, 505, "elevator muscle", "small", "middle");
  var elevLead = lead(thxLab, 0, 0, 0, 0);
  T(thxLab, 750, 505, "depressor muscle", "small", "middle");
  var deprLead = lead(thxLab, 0, 0, 0, 0);
  T(thxLab, 500, 480, "thorax wall (cut), seen from the front", "small", "middle");
  var thxWingTxt = T(thxLab, 0, 0, "wing", "small");

  /* =====================================================================
   * Step 9: phase dials
   * ===================================================================== */

  var dialG = G(svg, { class: "part-phase" });
  var dials = [[800, 140, "fore", 1], [200, 140, "fore", -1], [800, 250, "hind", 1], [200, 250, "hind", -1]].map(function (d) {
    var g = G(dialG);
    el("circle", { cx: d[0], cy: d[1], r: 24, fill: "rgba(0,0,0,0.2)", stroke: MUTED, "stroke-width": 1.2 }, g);
    el("circle", { cx: d[0], cy: d[1] - 24, r: 2.5, fill: MUTED }, g);
    var hand = el("line", { x1: d[0], y1: d[1], stroke: d[2] === "fore" ? D.WING_LIGHT : D.WING_DARK, "stroke-width": 3, "stroke-linecap": "round" }, g);
    T(g, d[0], d[1] + 44, d[2] === "fore" ? "forewing" : "hindwing", "small", "middle");
    return { x: d[0], y: d[1], name: d[2], hand: hand };
  });

  /* =====================================================================
   * Step 10: tip-height traces
   * ===================================================================== */

  var trG = G(svg);
  var TX0 = 540, TX1 = 940, PXB = 200, YF = 140, YH = 330, AMP = 45;
  el("rect", { x: 520, y: 55, width: 440, height: 380, rx: 6, class: "frame" }, trG);
  T(trG, TX0, 84, "forewing tip height", "small");
  T(trG, TX0, 268, "hindwing tip height", "small");
  [YF, YH].forEach(function (y) { el("line", { x1: TX0, y1: y, x2: TX1, y2: y, stroke: MUTED, "stroke-width": 1, "stroke-dasharray": "2 5" }, trG); });
  var foreTr = el("path", { fill: "none", stroke: D.WING_LIGHT, "stroke-width": 2.5 }, trG);
  var hindTr = el("path", { fill: "none", stroke: D.WING_DARK, "stroke-width": 2.5 }, trG);
  var foreMark = el("line", { stroke: MUTED, "stroke-width": 1, "stroke-dasharray": "3 3" }, trG);
  var hindMark = el("line", { stroke: MUTED, "stroke-width": 1, "stroke-dasharray": "3 3" }, trG);
  var bracket = el("path", { fill: "none", stroke: ACCENT, "stroke-width": 2, class: "part-phase" }, trG);
  var phaseTxt = T(trG, 0, 0, "", "accent", "middle");
  T(trG, TX1, 425, "time →", "cap", "end");
  var modeTxt = [["hover", 0.5, 600], ["cruise", 0.25, 740], ["take-off", 0, 880]].map(function (m) {
    var tx = T(trG, m[2], 465, m[0] + " ≈" + Math.round(m[1] * 360) + "°", "small", "middle");
    return { t: tx, d: m[1] };
  });

  /* =====================================================================
   * Step 11: forewing wake meets the hindwing
   * ===================================================================== */

  var wkG = G(svg);
  T(wkG, 40, 40, "← head (forward)", "cap");
  var PW = { A: 95, beta: 60 * DEG, ad: 70 * DEG, au: 5 * DEG, flip: 1 };
  var wkPartG = G(wkG, { class: "part-swirl" });
  var wkParts = [];
  for (i = 0; i < 60; i++) wkParts.push(el("circle", { r: 2.2, fill: AIR }, wkPartG));
  var wkWings = [{ c: [380, 225], name: "forewing" }, { c: [470, 345], name: "hindwing" }].map(function (w) {
    var d = [Math.cos(PW.beta), -Math.sin(PW.beta)], L = PW.A + 30;
    el("line", { x1: w.c[0] - d[0] * L, y1: w.c[1] - d[1] * L, x2: w.c[0] + d[0] * L, y2: w.c[1] + d[1] * L, stroke: "#c7ced6", "stroke-width": 1.2, "stroke-dasharray": "8 6" }, wkG);
    T(wkG, w.c[0] + d[0] * L + 10, w.c[1] + d[1] * L + 4, w.name, "small");
    w.p = plate(wkG, 0.75);
    return w;
  });
  T(wkG, 230, 340, "swirl", "small");
  lead(wkG, 270, 336, 400, 300);
  T(wkG, 640, 500, "straightened flow", "small");
  lead(wkG, 636, 496, 560, 500);

  /* =====================================================================
   * Step 12: the wing itself
   * ===================================================================== */

  var plG = G(svg);
  var plWing = G(plG, { class: "part-forewing" });
  D.drawWing(plWing, "fore", true);
  var plLab = G(plG);
  T(plLab, 456, 128, "nodus", "small", "middle");
  lead(plLab, 456, 134, 456, 178);
  T(plLab, 701, 128, "pterostigma", "small", "middle");
  lead(plLab, 701, 134, 701, 180);
  T(plLab, 200, 150, "leading edge", "small", "middle");
  lead(plLab, 210, 156, 240, 190);
  T(plLab, 560, 330, "veins", "small", "middle");
  lead(plLab, 560, 316, 560, 270);
  el("line", { x1: 334, y1: 182, x2: 334, y2: 298, stroke: ACCENT, "stroke-width": 1.5, "stroke-dasharray": "5 4" }, plLab);
  var insetG = G(plG, { class: "part-corr" });
  (function () {
    var pts = [];
    for (var k = 0; k <= 10; k++) pts.push((400 + 32 * k) + " " + (430 + (k % 2 ? 10 : -10) * (1 - k / 14)));
    el("path", { d: "M" + pts.join(" L"), fill: "none", stroke: D.WING_DARK, "stroke-width": 4, "stroke-linejoin": "round", "stroke-linecap": "round" }, insetG);
    el("circle", { cx: 400, cy: 420, r: 5.5, fill: D.WING_DARK }, insetG);
    T(insetG, 560, 398, "cross-section at the dashed line (corrugation)", "small", "middle");
    T(insetG, 392, 456, "leading edge", "small", "start");
  })();

  /* =====================================================================
   * Camera and legend
   * ===================================================================== */

  var legendItems = Array.prototype.map.call(document.querySelectorAll("#legend span"), function (span) {
    var steps = {};
    span.getAttribute("data-steps").split(",").forEach(function (part) {
      var ab = part.split("-").map(Number);
      for (var s = ab[0]; s <= (ab.length > 1 ? ab[1] : ab[0]); s++) steps[s] = true;
    });
    return { span: span, steps: steps };
  });
  var legendStep = -1;

  var beatTop = 0, beatSec = 0, clock = 0;

  function render(t, dt, info) {
    if (info.reduceMotion) { dt = 0; beatTop = 0.3; beatSec = 0.3; }
    clock += dt;
    // On-screen beat rate: about 0.55 beats per second, 50-70 times slower than life.
    beatTop += dt * 0.55 * (1 - win(t, 0.35, 0.65, 1.2, 1.3));
    beatSec += dt * 0.5;

    var step = clamp(Math.floor(t + 0.15), 0, 13);
    if (step !== legendStep) {
      legendItems.forEach(function (it) { it.span.classList.toggle("on", !!it.steps[step]); });
      legendStep = step;
    }

    // ----- top view -----
    var lead = E.keyframes(t, [[8.9, [0.25]], [9.2, [0.5]], [9.9, [0.5]], [10.15, [0.25]], [10.3, [0.25]], [10.55, [0]], [12.7, [0]], [13.0, [0.25]]])[0];
    top.update(beatTop, beatTop + lead);

    var topO;
    var rw = top.wings[2], rk = D.topKin(beatTop);
    var along = 0.7 * rw.L * rk.span, ang = rk.sweep * DEG;
    var cp = [rw.root[0] + along * Math.cos(ang), rw.root[1] - along * Math.sin(ang)];
    if (t < 4) {
      var pz = ease(range(t, 0.65, 1.1));
      xf(topWrap, lerp(cp[0], C[0], pz), lerp(cp[1], C[1], pz), lerp(1, 3.2, pz), cp[0], cp[1]);
      topO = 1 - range(t, 0.85, 1.1);
    } else if (t < 12) {
      var pm = ease(range(t, 9.85, 10.3));
      xf(topWrap, lerp(500, 260, pm), 290, lerp(1, 0.62, pm), 500, 290);
      topO = range(t, 8.85, 9.15) * (1 - range(t, 10.85, 11.1));
    } else {
      topWrap.removeAttribute("transform");
      topO = range(t, 12.85, 13.05);
    }
    show(topWrap, topO);

    var cutO = win(t, 0.4, 0.6, 0.8, 0.95);
    show(cutG, cutO);
    if (cutO > 0) {
      var nx = Math.sin(ang), ny = Math.cos(ang), h = 34 * rk.chord;
      setLine(cutLine, cp[0] + nx * h, cp[1] + ny * h, cp[0] - nx * h, cp[1] - ny * h);
      setXY(cutTxt, cp[0] + nx * h + 6, cp[1] + ny * h + 14);
    }
    show(sumG, range(t, 13.0, 13.3));

    // ----- section view -----
    var secO = range(t, 0.95, 1.2) * (1 - range(t, 7.85, 8.05));
    show(secG, secO);
    if (secO > 0) renderSection(t, dt);

    // ----- thorax -----
    var thxO = range(t, 7.9, 8.15) * (1 - range(t, 8.85, 9.1));
    show(thxG, thxO);
    if (thxO > 0) {
      var po = ease(range(t, 8.85, 9.15));
      xf(thxG, 500, lerp(290, 165, po), lerp(0.75, 1, ease(range(t, 7.9, 8.2))) * lerp(1, 0.25, po), 500, 290);
      renderThorax();
    }

    // ----- dials -----
    var dO = win(t, 8.95, 9.2, 9.85, 10.05);
    show(dialG, dO);
    if (dO > 0) {
      dials.forEach(function (d) {
        var ph = d.name === "fore" ? beatTop : beatTop + lead;
        var a = TAU * frac(ph);
        setLine(d.hand, d.x, d.y, d.x + 20 * Math.sin(a), d.y - 20 * Math.cos(a));
      });
    }

    // ----- traces -----
    var trO = win(t, 9.85, 10.1, 10.85, 11.05);
    show(trG, trO);
    if (trO > 0) renderTraces(lead);

    // ----- wake -----
    var wkO = win(t, 10.9, 11.15, 11.85, 12.05);
    show(wkG, wkO);
    if (wkO > 0) renderWake();

    // ----- wing plan -----
    var plO = range(t, 11.9, 12.15) * (1 - range(t, 12.95, 13.1));
    show(plG, plO);
    if (plO > 0) {
      var pw = ease(range(t, 12.75, 13.05));
      plWing.setAttribute("transform", "translate(" + lerp(130, 522, pw).toFixed(1) + " " + lerp(230, 144, pw).toFixed(1) + ") scale(" + lerp(3.4, 1, pw).toFixed(3) + ")");
      show(plLab, 1 - range(t, 12.7, 12.85));
      var pi = ease(range(t, 12.05, 12.5));
      xf(insetG, lerp(334, 560, pi), lerp(240, 430, pi), lerp(0.15, 1, pi), 560, 430);
      show(insetG, range(t, 12.05, 12.2) * (1 - range(t, 12.7, 12.85)));
    }
  }

  function renderSection(t, dt) {
    var P = secParams(t), fl = P.flap;
    xf(secCam, C[0], C[1], lerp(1.35, 1, fl), C[0], C[1]);
    var M = cycleMean(P);

    // Steady pose (steps 1-2) and flapping pose (3-7), blended
    var thS = Math.PI - P.alpha;
    var fS = forces([-1, 0], 1, thS, true);
    var k = kin(beatSec, P);
    var fF = forces(k.u, k.sp, k.th, false);
    var th = lerp(thS, k.th, fl);
    var x = SX(k.pos), y = SY(k.pos);
    placePlate(wing, x, y, th);

    var sc = lerp(150, 55, fl);
    var Lv = [lerp(fS.L[0], fF.L[0], fl) * sc, lerp(fS.L[1], fF.L[1], fl) * sc];
    var Dv = [lerp(fS.D[0], fF.D[0], fl) * sc, lerp(fS.D[1], fF.D[1], fl) * sc];
    var stall = (1 - fl) * fS.stall;
    liftA.set(x, y, x + Lv[0], y - Lv[1]);
    dragA.set(x, y, x + Dv[0], y - Dv[1]);
    liftA.color(stall > 0.4 ? BAD : TEXT);
    var lblO = 1 - fl * 0.6;
    show(liftTxt, liftA.len > 25 ? lblO : 0);
    show(dragTxt, dragA.len > 25 ? lblO : 0);
    setXY(liftTxt, x + Lv[0] + 8, y - Lv[1] - 4);
    setXY(dragTxt, x + Dv[0] + 8, y - Dv[1] + 14);

    // Leading-edge vortex (step 5 on) and stalled wake (step 2)
    var sideF = sideOf(fF.ldir, k.th), sideS = sideOf(fS.ldir, thS);
    var levAmt = range(t, 4.85, 5.3) * fl * k.sp * clamp((fF.a - 15 * DEG) / (15 * DEG));
    show(levG, levAmt);
    levG.setAttribute("transform", "translate(24 " + (-sideF * 17) + ") scale(" + (0.6 + 0.5 * levAmt).toFixed(2) + ") rotate(" + (-sideF * clock * 430 % 360).toFixed(1) + ")");
    show(stallG, stall);
    stallSp[0].setAttribute("transform", "translate(-40 " + (-sideS * 30) + ") rotate(" + (-clock * 300 % 360).toFixed(1) + ")");
    stallSp[1].setAttribute("transform", "translate(-90 " + (-sideS * 42) + ") scale(0.8) rotate(" + (-clock * 260 % 360).toFixed(1) + ")");

    // Air: a stream past the still wing (steps 1-2), downwash when flapping
    show(streamG, (1 - fl) * 0.65);
    if (fl < 1) {
      var cl = fS.L[1] / 0.7;
      stream.forEach(function (p, i) {
        p.x += 170 * dt;
        if (p.x > 530) p.x -= 960;
        var g = Math.exp(-p.y * p.y / (2 * 80 * 80));
        var dy = 42 * cl * g * (0.3 * Math.exp(-p.x * p.x / (2 * 50 * 50)) - 1 / (1 + Math.exp(-p.x / 45)));
        var jx = 0, jy = 0;
        if (stall > 0 && p.y > -10 && p.y < 90 && p.x > -30) {
          var amp = stall * 22 * Math.min(1, (p.x + 30) / 80);
          jx = amp * Math.sin(clock * 6 + i * 1.7);
          jy = amp * Math.cos(clock * 5 + i * 2.3);
        }
        p.c.setAttribute("cx", (C[0] + p.x + jx).toFixed(1));
        p.c.setAttribute("cy", (C[1] - p.y - dy - jy).toFixed(1));
      });
    }
    show(washG, fl * 0.6);
    if (fl > 0) {
      var down = 150 * Math.max(0, M.net[1]) / 0.5;
      wash.forEach(function (p, i) {
        p.y -= down * dt;
        if (p.y < -250) { p.y += 500; p.x = (Math.random() * 2 - 1) * 200; }
        p.c.setAttribute("cx", (C[0] + p.x + 5 * Math.sin(clock * 2 + i)).toFixed(1));
        p.c.setAttribute("cy", (C[1] - p.y).toFixed(1));
      });
    }

    // Stroke plane, direction labels, tilt
    var d = [Math.cos(P.beta), Math.sin(P.beta)], n = [-d[1], d[0]];
    function at(a, b) { return [C[0] + a * d[0] + b * n[0], C[1] - (a * d[1] + b * n[1])]; }
    show(planeG, fl);
    if (fl > 0) {
      var e0 = at(-(P.A + 40), 0), e1 = at(P.A + 40, 0);
      setLine(planeLine, e0[0], e0[1], e1[0], e1[1]);
      setXY(planeTxt, e1[0] + 8, e1[1] - 22);
      var a0 = at(0.25 * P.A, -26), a1 = at(-0.65 * P.A, -26);
      downS.set(a0[0], a0[1], a1[0], a1[1]);
      var b0 = at(-0.25 * P.A, 26), b1 = at(0.65 * P.A, 26);
      upS.set(b0[0], b0[1], b1[0], b1[1]);
      var dt0 = at(-0.2 * P.A, -48), ut0 = at(0.2 * P.A, 46);
      setXY(downTxt, dt0[0], dt0[1] + 5);
      setXY(upTxt, ut0[0], ut0[1] + 5);
    }
    show(flipG, win(t, 3.9, 4.2, 5.85, 6.1));
    var sp = at(-(P.A + 75), 0), pp = at(P.A + 75, 0);
    setXY(supTxt, sp[0], sp[1] + 5);
    setXY(pronTxt, pp[0], pp[1] + 5);

    var tiltO = range(t, 5.9, 6.3) * fl;
    show(tiltG, tiltO);
    if (tiltO > 0) {
      setLine(horizLine, C[0] - 230, C[1], C[0] + 230, C[1]);
      tiltArc.setAttribute("d", "M" + (C[0] + 90) + " " + C[1] + " A90 90 0 0 0 " + (C[0] + 90 * d[0]).toFixed(1) + " " + (C[1] - 90 * d[1]).toFixed(1));
      setText(tiltTxt, Math.round(P.beta / DEG) + "°");
      setXY(tiltTxt, C[0] + 112 * Math.cos(P.beta / 2), C[1] - 112 * Math.sin(P.beta / 2) + 5);
    }

    // Ghosts
    show(ghostG, fl * 0.4);
    if (fl > 0) {
      ghosts.forEach(function (g, i) {
        var kg = kin((i + 0.5) / 10, P);
        g.setAttribute("transform", "translate(" + SX(kg.pos).toFixed(1) + " " + SY(kg.pos).toFixed(1) + ") rotate(" + (-kg.th / DEG).toFixed(2) + ")");
      });
    }

    // Step 1 labels
    var l1 = win(t, 0.95, 1.2, 1.85, 2.05);
    show(lab1, l1);
    if (l1 > 0) {
      var c = [Math.cos(th), -Math.sin(th)];
      var le = [x + 55 * c[0], y + 55 * c[1]], te = [x - 55 * c[0], y - 55 * c[1]];
      setXY(leTxt, le[0] - 30, le[1] - 50); setLine(leLead, le[0] - 28, le[1] - 46, le[0] - 3, le[1] - 5);
      setXY(teTxt, te[0] + 30, te[1] + 60); setLine(teLead, te[0] + 28, te[1] + 48, te[0] + 2, te[1] + 4);
      setXY(chTxt, x, y + 70); setLine(chLead, x, y + 54, x, y + 6);
    }

    // Step 2: angle of attack
    var l2 = win(t, 1.85, 2.05, 2.85, 3.05);
    show(aoaG, l2);
    if (l2 > 0) {
      setLine(aoaLine, x, y, x - 150, y);
      var ca = Math.cos(P.alpha), sa = Math.sin(P.alpha);
      aoaArc.setAttribute("d", "M" + (x - 95) + " " + y + " A95 95 0 0 1 " + (x - 95 * ca).toFixed(1) + " " + (y - 95 * sa).toFixed(1));
      setText(aoaTxt, "angle of attack " + Math.round(P.alpha / DEG) + "°");
      setXY(aoaTxt, x - 160, y + 5);
      show(stallTxt, stall);
      setXY(stallTxt, x - 150, y - 105);
    }

    // Graph
    var grO = win(t, 1.85, 2.1, 2.85, 3.1) + win(t, 4.85, 5.1, 5.85, 6.1);
    show(grG, grO);
    if (grO > 0) {
      var fc = ease(range(t, 4.9, 5.4));
      flapCurve.setAttribute("stroke-dashoffset", (1 - fc).toFixed(3));
      show(flapLbl, fc);
      show(grDot, t < 4 ? 1 : 0);
      grDot.setAttribute("cx", gx(P.alpha).toFixed(1));
      grDot.setAttribute("cy", gy(CLsteady(P.alpha)).toFixed(1));
      grDot.setAttribute("fill", stall > 0.4 ? BAD : TEXT);
      show(grStall, t < 4 ? 0.8 : 0.4);
    }

    // Net force over one beat
    var netO = range(t, 2.95, 3.3);
    show(netG, netO);
    if (netO > 0) {
      var nv = M.net;
      netA.set(N0[0], N0[1], N0[0] + nv[0] * NS, N0[1] - nv[1] * NS);
      var zero = Math.hypot(nv[0], nv[1]) < 0.02;
      show(netZero, zero ? 1 : 0);
      setText(netNote, zero ? "close to zero" : "");
      netNote.setAttribute("class", "small bad");

      var p7 = ease(range(t, 6.85, 7.35)), o7 = range(t, 6.85, 7.05);
      show(fDownA.g, o7); show(fUpA.g, o7); show(fDownTxt, o7); show(fUpTxt, o7);
      var dTip = [N0[0] + M.down[0] * NS, N0[1] - M.down[1] * NS];
      fDownA.set(N0[0], N0[1], dTip[0], dTip[1]);
      var uT = [lerp(N0[0], dTip[0], p7), lerp(N0[1], dTip[1], p7)];
      fUpA.set(uT[0], uT[1], uT[0] + M.up[0] * NS, uT[1] - M.up[1] * NS);
      setXY(fDownTxt, dTip[0] + 10, (N0[1] + dTip[1]) / 2 + 20);
      setXY(fUpTxt, uT[0] + M.up[0] * NS - 10, uT[1] - M.up[1] * NS - 6);
      var o8 = range(t, 7.15, 7.4);
      show(weightA.g, o8); show(weightTxt, o8);
      weightA.set(N0[0], N0[1], N0[0], N0[1] + Math.max(0, nv[1]) * NS);
      setXY(weightTxt, N0[0] + 10, N0[1] + Math.max(0, nv[1]) * NS - 4);
      show(shareG, o8);
      if (o8 > 0 && nv[1] > 0.05) {
        var dShare = Math.round(100 * M.dv / nv[1]);
        setText(shareTxt1, "upward force in this model:");
        setText(shareTxt2, dShare + "% from drag, " + (100 - dShare) + "% from lift");
      }
    }
  }

  function renderThorax() {
    var kk = D.topKin(beatTop), psi = kk.elev * DEG, sv = Math.sin(TAU * frac(beatTop));
    var actE = Math.max(0, -sv), actD = Math.max(0, sv);
    var inner = [];
    thxWings.forEach(function (w) {
      var o = [w.side * Math.cos(psi), -Math.sin(psi)];
      var pd = w.side > 0 ? [-o[1], o[0]] : [o[1], -o[0]];
      var F = w.F;
      var I = [F[0] - 42 * o[0], F[1] - 42 * o[1]];
      var Tp = [F[0] + 300 * o[0], F[1] + 300 * o[1]];
      inner.push(I);
      w.wing.setAttribute("d", "M" + (I[0] - 4 * pd[0]).toFixed(1) + " " + (I[1] - 4 * pd[1]).toFixed(1) +
        " L" + (Tp[0] - 1.5 * pd[0]).toFixed(1) + " " + (Tp[1] - 1.5 * pd[1]).toFixed(1) +
        " L" + (Tp[0] + 1.5 * pd[0]).toFixed(1) + " " + (Tp[1] + 1.5 * pd[1]).toFixed(1) +
        " L" + (I[0] + 4 * pd[0]).toFixed(1) + " " + (I[1] + 4 * pd[1]).toFixed(1) + " Z");
      var Dp = [F[0] + 26 * o[0] + 12 * pd[0], F[1] + 26 * o[1] + 12 * pd[1]];
      var ea = [500 + w.side * 45, 425], da = [500 + w.side * 128, 420];
      setLine(w.elev, I[0], I[1] + 4, ea[0], ea[1]);
      w.elev.setAttribute("stroke", mix("#9a5644", "#e8a487", actE));
      w.elev.setAttribute("stroke-width", (14 + 10 * actE).toFixed(1));
      setLine(w.depr, Dp[0], Dp[1], da[0], da[1]);
      w.depr.setAttribute("stroke", mix("#9a5644", "#e8a487", actD));
      w.depr.setAttribute("stroke-width", (14 + 10 * actD).toFixed(1));
      var M0 = [F[0] + 50 * o[0], F[1] + 50 * o[1]];
      setLine(w.membrane, 500 + w.side * 156, 226, M0[0], M0[1]);
      if (w.side > 0) {
        setXY(thxWingTxt, Tp[0] - 40, Tp[1] - 14);
        setLine(deprLead, 750, 490, (Dp[0] + da[0]) / 2 + 8, (Dp[1] + da[1]) / 2 + 40);
      } else {
        setLine(elevLead, 250, 490, (I[0] + ea[0]) / 2 - 8, (I[1] + ea[1]) / 2 + 40);
      }
    });
    notum.setAttribute("d", "M" + inner[0][0].toFixed(1) + " " + inner[0][1].toFixed(1) + " Q500 " + (Math.min(inner[0][1], inner[1][1]) - 30).toFixed(1) +
      " " + inner[1][0].toFixed(1) + " " + inner[1][1].toFixed(1));
  }

  function renderTraces(lead) {
    var pf = beatTop, f = [], h = [];
    for (var X = TX0; X <= TX1; X += 4) {
      var ph = pf - (TX1 - X) / PXB;
      f.push(X + " " + (YF - AMP * Math.cos(TAU * ph)).toFixed(1));
      h.push(X + " " + (YH - AMP * Math.cos(TAU * (ph + lead))).toFixed(1));
    }
    foreTr.setAttribute("d", "M" + f.join(" L"));
    hindTr.setAttribute("d", "M" + h.join(" L"));
    var xf0 = TX1 - PXB * frac(pf);
    if (xf0 - PXB * lead < TX0 + 10) xf0 += PXB;
    if (xf0 > TX1) xf0 -= PXB;
    var xh0 = xf0 - PXB * lead;
    setLine(foreMark, xf0, YF - AMP - 6, xf0, 240);
    setLine(hindMark, xh0, 232, xh0, YH - AMP - 6);
    bracket.setAttribute("d", "M" + xh0.toFixed(1) + " 232 V240 H" + xf0.toFixed(1) + " V232");
    setText(phaseTxt, "hindwing leads by " + Math.round(lead * 360) + "°");
    setXY(phaseTxt, Math.min(Math.max((xh0 + xf0) / 2, 650), 850), 224);
    modeTxt.forEach(function (m) { m.t.setAttribute("class", Math.abs(m.d - lead) < 0.04 ? "small accent" : "small"); });
  }

  function renderWake() {
    wkWings.forEach(function (w, j) {
      var k = kin(beatSec + 0.5 * j, PW);
      placePlate(w.p, w.c[0] + k.pos[0], w.c[1] - k.pos[1], k.th);
    });
    var v = [180, 290], vl = Math.hypot(v[0], v[1]);
    v = [v[0] / vl, v[1] / vl];
    var nn = [-v[1], v[0]];
    wkParts.forEach(function (c, i) {
      var s = frac(i / wkParts.length + clock * 0.22);
      var r = 22 * (s < 0.33 ? Math.min(1, s / 0.1) : Math.max(0, 1 - (s - 0.33) / 0.14));
      var a = clock * 4 + i * 2.39996;
      var spread = ((i % 7) - 3) * 7 * clamp((s - 0.33) / 0.15);
      var bx = 380 + 180 * s + nn[0] * spread, by = 250 + 290 * s + nn[1] * spread;
      c.setAttribute("cx", (bx + nn[0] * r * Math.cos(a) + v[0] * r * 0.35 * Math.sin(a)).toFixed(1));
      c.setAttribute("cy", (by + nn[1] * r * Math.cos(a) + v[1] * r * 0.35 * Math.sin(a)).toFixed(1));
      c.style.opacity = (0.7 * Math.sin(Math.PI * s)).toFixed(2);
    });
  }

  E.start(render);
})();
