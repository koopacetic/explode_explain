/* Heart and circulation: all drawing and animation.
 *
 * Scene timeline (t = step index + progress through that step):
 *   0 Hero          standing figure, blood circulating, heart beating
 *   1 Two pumps     the heart grows out of the body into a four-chamber
 *                   schematic; ventricles squeeze, valves open and shut,
 *                   a cup fills with one stroke volume
 *   2 Flow volume   heart moves left; five 1-litre bottles fill over a minute
 *   3 Circuits      heart shrinks back into the body; pulmonary, then systemic
 *                   circuit highlighted; figure-eight inset
 *   4 Speed         branching tree aorta -> capillaries -> vena cava; graph of
 *                   total cross-section and speed
 *   5 Pressure      same tree; graph changes to pressure, pulsing on the left
 *   6 Distribution  the 5 L/min band splits to the organs (Sankey)
 *   7 Head branches aortic arch, carotid and vertebral arteries, circle of
 *                   Willis; one carotid blocked, flow goes round the ring
 *   8 Steady        autoregulation curve; pressure scrubbed, arteriole widens
 *                   and narrows
 *   9 Gravity       figure lying -> standing; pressure at head, heart, feet
 *  10 Soft veins    leg veins swell; U-tube inset
 *  11 Reflex        replay of standing up; pressure at the head over 30 s;
 *                   carotid sensor pulses; heart rate rises
 *  12 Fainting      replay with a failing reflex; the figure falls and recovers
 *  13 Valves        close-up of a deep calf vein grows from the calf
 *  14 Calf pump     the muscle squeezes; valves alternate; ankle pressure falls
 *  15 Leaky valves  flaps do not meet; backflow; vein bulges
 *  16 Sitting       close-up returns to the calf; figure sits; flow slows,
 *                   bends and pressure points marked, ankles swell
 *  17 Clots         zoom to the calf; clot grows; a piece travels to the lungs
 *  18 Moving        ankle pumps restart the flow; the figure stands
 *  19 Summary       hero view again
 */
(function () {
  "use strict";

  var E = Explainer, M = BodyModel;
  var range = E.range, ease = E.ease, lerp = E.lerp, win = E.window, clamp = E.clamp;
  var el = M.el;
  var OK = "#7fd49b", BAD = "#ee6b6b", ACCENT = "#e2b955", VALVE = "#e6dcb6";
  var ART = M.ART, ART_P = M.ART_P, VEIN = M.VEIN, VEIN_P = M.VEIN_P;
  var MUSCLE_EDGE = "#b0634c";

  var svg = E.$("#drawing");
  var defs = M.addDefs(svg);

  function G(parent, attrs) { return el("g", attrs || {}, parent); }
  function T(parent, x, y, text, cls, anchor) {
    var t = el("text", { x: x, y: y, class: cls || "", "text-anchor": anchor || "start" }, parent);
    t.textContent = text;
    return t;
  }
  function lead(parent, x1, y1, x2, y2) { return el("line", { x1: x1, y1: y1, x2: x2, y2: y2, class: "lead" }, parent); }
  function setLine(ln, a, b) {
    ln.setAttribute("x1", a[0].toFixed(1)); ln.setAttribute("y1", a[1].toFixed(1));
    ln.setAttribute("x2", b[0].toFixed(1)); ln.setAttribute("y2", b[1].toFixed(1));
  }
  function show(node, v) {
    node.style.opacity = v;
    node.style.display = v <= 0.001 ? "none" : "";
  }
  // p = 0: the group is shrunk to scale s0 with its centre (cx, cy) at `from`;
  // p = 1: the group is at full size in its own place.
  function growFrom(node, p, from, cx, cy, s0, to, s1) {
    var tx = to ? to[0] : cx, ty = to ? to[1] : cy, sEnd = s1 || 1;
    var s = lerp(s0, sEnd, p), x = lerp(from[0], tx, p), y = lerp(from[1], ty, p);
    node.setAttribute("transform", "translate(" + x.toFixed(2) + " " + y.toFixed(2) + ") scale(" + s.toFixed(4) + ") translate(" + -cx + " " + -cy + ")");
  }
  function curveD(pts) { return M.polyD(M.sample(pts, 8)); }

  // Dotted overlays that move along a vessel to show the flow.
  var flows = [];
  function flowLine(parent, d, color, width, speed, gap) {
    var p = el("path", { d: d, fill: "none", stroke: color, "stroke-width": width, "stroke-linecap": "round", "stroke-dasharray": "0.1 " + (gap || 16) }, parent);
    var f = { p: p, speed: speed, off: 0 };
    flows.push(f);
    return f;
  }
  function vessel(parent, d, w, color, cls) {
    el("path", { d: d, fill: "none", stroke: "rgba(0,0,0,0.35)", "stroke-width": w + 4, "stroke-linecap": "round" }, parent);
    return el("path", { d: d, fill: "none", stroke: color, "stroke-width": w, "stroke-linecap": "round", class: cls || "" }, parent);
  }

  /* =====================================================================
   * Step 6: where the flow goes (Sankey)
   * ===================================================================== */

  var sankeyG = G(svg);
  var sankeyClip = el("clipPath", { id: "clip-sankey" }, defs);
  var sankeyClipR = el("rect", { x: 0, y: 0, width: 0, height: 560 }, sankeyClip);
  var sankeyBands = G(sankeyG, { "clip-path": "url(#clip-sankey)" });
  el("rect", { x: 140, y: 120, width: 60, height: 300, rx: 4, fill: ART }, sankeyBands);
  T(sankeyG, 170, 100, "5 L/min", "big", "middle");
  T(sankeyG, 170, 446, "from the heart", "small", "middle");
  var ORGANS = [["Brain", 15, "750"], ["Heart muscle", 5, "250"], ["Kidneys", 20, "1,000"],
    ["Liver and gut", 25, "1,250"], ["Muscles", 15, "750"], ["Skin and other", 20, "1,000"]];
  var sankeyLabels = G(sankeyG);
  (function () {
    var ys = 120, yt = 85;
    ORGANS.forEach(function (o, i) {
      var h = 3 * o[1], brain = i === 0;
      var d = "M200 " + ys + " C410 " + ys + " 410 " + yt + " 620 " + yt + " L620 " + (yt + h) +
        " C410 " + (yt + h) + " 410 " + (ys + h) + " 200 " + (ys + h) + " Z";
      el("path", { d: d, fill: ART, opacity: brain ? 0.9 : 0.5, stroke: brain ? ACCENT : "none", "stroke-width": 2, class: brain ? "part-brain" : "" }, sankeyBands);
      el("rect", { x: 620, y: yt, width: 18, height: h, fill: ART, opacity: brain ? 1 : 0.8 }, sankeyBands);
      var yc = yt + h / 2;
      T(sankeyLabels, 652, yc - 2, o[0], brain ? "accent" : "");
      T(sankeyLabels, 652, yc + 15, o[2] + " mL/min (" + o[1] + "%)", "small");
      ys += h; yt += h + 16;
    });
  })();
  T(sankeyLabels, 410, 520, "Brain: 2% of body weight, 15% of the flow, 20% of the oxygen", "accent", "middle");
  T(sankeyLabels, 410, 545, "Resting adult, approximate", "cap", "middle");

  /* =====================================================================
   * Steps 4 and 5: branching tree and graphs
   * ===================================================================== */

  var treeG = G(svg);
  var treeClip = el("clipPath", { id: "clip-tree" }, defs);
  var treeClipR = el("rect", { x: 0, y: 0, width: 0, height: 300 }, treeClip);
  var treeInner = G(treeG, { "clip-path": "url(#clip-tree)" });
  var COLX = [100, 200, 300, 400, 500, 600, 700, 800, 900], COLN = [1, 2, 4, 8, 16, 8, 4, 2, 1];
  var EDGE_W = [16, 11, 7, 2.5, 2.5, 7, 11, 18], EDGE_SP = [70, 50, 25, 4, 4, 18, 35, 55];
  function ty(c, k) { return 45 + (k + 0.5) / COLN[c] * 200; }
  for (var g = 0; g < 8; g++) {
    var n0 = COLN[g], x1 = COLX[g], x2 = COLX[g + 1], xm = (x1 + x2) / 2;
    var vein = g >= 4;
    for (var k = 0; k < n0; k++) {
      var kids = g < 4 ? [2 * k, 2 * k + 1] : [k >> 1];
      if (g >= 4 && k % 2 === 1) continue;
      kids.forEach(function (kk) {
        var y1 = ty(g, k), y2 = ty(g + 1, kk);
        var d = "M" + x1 + " " + y1 + " C" + xm + " " + y1 + " " + xm + " " + y2 + " " + x2 + " " + y2;
        el("path", { d: d, fill: "none", stroke: vein ? VEIN : ART, "stroke-width": EDGE_W[g], "stroke-linecap": "round", class: (g === 3 || g === 4) ? "part-cap" : "" }, treeInner);
        flowLine(treeInner, d, vein ? VEIN_P : ART_P, Math.max(1.6, EDGE_W[g] * 0.45), EDGE_SP[g], 18);
      });
      if (g >= 4) {
        // merging: the sibling joins the same parent
        var y1b = ty(g, k + 1), y2b = ty(g + 1, k >> 1);
        var db = "M" + x1 + " " + y1b + " C" + xm + " " + y1b + " " + xm + " " + y2b + " " + x2 + " " + y2b;
        el("path", { d: db, fill: "none", stroke: VEIN, "stroke-width": EDGE_W[g], "stroke-linecap": "round", class: g === 4 ? "part-cap" : "" }, treeInner);
        flowLine(treeInner, db, VEIN_P, Math.max(1.6, EDGE_W[g] * 0.45), EDGE_SP[g], 18);
      }
    }
  }
  [[100, "Aorta"], [200, "Arteries"], [350, "Arterioles"], [500, "Capillaries"], [650, "Venules"], [790, "Veins"], [905, "Vena cava"]]
    .forEach(function (l) { T(treeG, l[0], 275, l[1], "small", "middle"); });

  // Graph axes
  var GX0 = 80, GX1 = 920, GY0 = 500, GH = 160;
  var graphG = G(treeG);
  el("path", { d: "M" + GX0 + " 330 V" + GY0 + " H" + GX1, class: "axis" }, graphG);
  function gpts(vals, scale) { return vals.map(function (v, i) { return [COLX[i], GY0 - GH * v / scale]; }); }

  var areaG = G(graphG);
  var AREA = [0.02, 0.06, 0.2, 0.55, 1, 0.6, 0.25, 0.1, 0.05], SPEED = [1, 0.7, 0.3, 0.06, 0.012, 0.04, 0.15, 0.35, 0.55];
  var areaLine = M.sample(gpts(AREA, 1), 8);
  el("path", { d: M.polyD(areaLine) + " L" + COLX[8] + " " + GY0 + " L" + COLX[0] + " " + GY0 + " Z", fill: "rgba(142,153,165,0.3)", stroke: "#a9b4bf", "stroke-width": 1.5 }, areaG);
  el("path", { d: curveD(gpts(SPEED, 1)), fill: "none", stroke: ACCENT, "stroke-width": 3, filter: "url(#glow)" }, areaG);
  T(areaG, 545, 352, "Total cross-section of all vessels", "small");
  T(areaG, 118, 336, "Speed of the blood", "accent");
  T(areaG, 500, 305, "Same flow through every level: about 83 mL per second", "", "middle");
  T(areaG, 100, 524, "Aorta: ≈ 3 cm², ≈ 30 cm/s", "small", "start");
  T(areaG, 500, 524, "Capillaries: ≈ 3,000 cm² in total, ≈ 0.3 mm/s", "small", "middle");

  var pressG = G(graphG);
  var pressClip = el("clipPath", { id: "clip-press" }, defs);
  var pressClipR = el("rect", { x: 0, y: 300, width: 0, height: 260 }, pressClip);
  var PMID = [100, 97, 65, 35, 25, 15, 10, 6, 3], PAMP = [20, 22, 10, 2, 0, 0, 0, 0, 0];
  [0, 40, 80, 120].forEach(function (v) {
    var y = GY0 - GH * v / 120;
    T(pressG, GX0 - 8, y + 4, String(v), "small", "end");
    el("line", { x1: GX0, y1: y, x2: GX1, y2: y, stroke: "rgba(255,255,255,0.06)" }, pressG);
  });
  T(pressG, GX0 - 8, 318, "mmHg", "small", "end");
  var pressInner = G(pressG, { "clip-path": "url(#clip-press)" });
  var bandTop = M.sample(PMID.map(function (v, i) { return [COLX[i], GY0 - GH * (v + PAMP[i]) / 120]; }), 8);
  var bandBot = M.sample(PMID.map(function (v, i) { return [COLX[i], GY0 - GH * (v - PAMP[i]) / 120]; }), 8);
  el("path", { d: M.polyD(bandTop.concat(bandBot.slice().reverse())) + " Z", fill: "rgba(196,71,63,0.22)" }, pressInner);
  var pressLine = el("path", { fill: "none", stroke: ACCENT, "stroke-width": 3, filter: "url(#glow)" }, pressInner);
  T(pressG, 118, 334, "120 / 80", "accent");
  var pressNote = G(pressG);
  T(pressNote, 610, 410, "Under 10 mmHg left in the veins", "accent");
  lead(pressNote, 760, 418, 785, 482);

  /* =====================================================================
   * Step 7: aortic arch and the head's branches (front view)
   * ===================================================================== */

  var archG = G(svg);
  var A_AORTA = "M500 452 L500 330 C500 262 548 240 590 252 C632 264 652 300 652 360 L652 548";
  var A_BRACH = "M512 280 C496 250 472 226 448 212";
  var A_RSUB = "M448 212 C400 200 330 210 250 236";
  var A_RCAR = "M448 212 C446 170 442 130 442 82";
  var A_LCAR = "M552 250 C556 200 558 140 558 82";
  var A_LSUB = "M596 254 C620 225 660 210 750 236";
  var A_RVERT = "M372 206 C382 160 470 152 496 134";
  var A_LVERT = "M676 216 C664 166 530 152 504 134";
  var A_BAS = "M500 134 L500 94";
  vessel(archG, A_AORTA, 24, ART, "part-arch");
  vessel(archG, A_BRACH, 15, ART);
  vessel(archG, A_RSUB, 10, ART);
  vessel(archG, A_LSUB, 10, ART);
  vessel(archG, A_RVERT, 6, ART, "part-vertebral");
  vessel(archG, A_LVERT, 6, ART, "part-vertebral");
  vessel(archG, A_BAS, 8, ART, "part-vertebral");
  vessel(archG, A_RCAR, 10, ART, "part-carotid");
  var lcarBlock = el("path", { d: A_LCAR, fill: "none", stroke: BAD, "stroke-width": 18, "stroke-linecap": "round" }, archG);
  vessel(archG, A_LCAR, 10, ART, "part-carotid");
  ["M450 66 L420 30", "M550 66 L580 30", "M482 56 L470 26", "M518 56 L530 26"].forEach(function (d) { vessel(archG, d, 4, ART); });
  var ring = el("ellipse", { cx: 500, cy: 74, rx: 62, ry: 20, fill: "none", stroke: ART, "stroke-width": 6, class: "part-willis" }, archG);
  var ringOk = el("ellipse", { cx: 500, cy: 74, rx: 62, ry: 20, fill: "none", stroke: OK, "stroke-width": 3, filter: "url(#glow)" }, archG);
  var archHeart = el("path", { d: M.HEART_D, fill: "url(#g-muscle)", transform: "translate(500 490) scale(42)" }, archG);
  ["M500 444 C480 444 466 456 462 474", "M500 444 C520 444 534 456 538 474"].forEach(function (d) {
    el("path", { d: d, fill: "none", stroke: ART, "stroke-width": 4, class: "part-coronary" }, archG);
  });
  var archFlows = [A_AORTA, A_BRACH, A_RSUB, A_LSUB, A_RCAR, A_RVERT, A_LVERT, A_BAS].map(function (d, i) {
    return flowLine(archG, d, ART_P, i === 0 ? 9 : 4, 45, 18);
  });
  var lcarFlow = flowLine(archG, A_LCAR, ART_P, 4, 45, 18);
  var ringFlow = flowLine(archG, "M500 94 C540 94 562 86 562 74 C562 62 540 54 500 54 C460 54 438 62 438 74", ART_P, 3, 25, 14);
  var archLabels = G(archG);
  T(archLabels, 680, 300, "Aortic arch", "", "start"); lead(archLabels, 676, 294, 640, 278);
  T(archLabels, 445, 526, "Coronary arteries", "small", "end"); lead(archLabels, 448, 520, 466, 470);
  T(archLabels, 430, 140, "Carotid arteries", "", "end"); lead(archLabels, 432, 134, 441, 134);
  T(archLabels, 350, 172, "Vertebral arteries", "small", "end"); lead(archLabels, 352, 168, 384, 176);
  T(archLabels, 470, 262, "Brachiocephalic trunk", "small", "end"); lead(archLabels, 472, 258, 488, 248);
  T(archLabels, 600, 70, "Circle of Willis", "", "start"); lead(archLabels, 596, 66, 563, 72);
  T(archLabels, 500, 16, "To the brain", "cap", "middle");
  T(archLabels, 240, 244, "To the right arm", "small", "end");
  T(archLabels, 760, 244, "To the left arm", "small", "start");
  T(archLabels, 668, 530, "To the rest of the body", "small", "start");
  var blockLabels = G(archG);
  T(blockLabels, 572, 175, "Blocked", "bad");
  T(blockLabels, 600, 100, "Blood reaches round the ring", "ok small");
  var blockX = el("path", { d: "M548 160 L568 180 M568 160 L548 180", stroke: BAD, "stroke-width": 4, "stroke-linecap": "round" }, blockLabels);

  /* =====================================================================
   * Step 8: autoregulation
   * ===================================================================== */

  var autoG = G(svg);
  function ax(P) { return 120 + 2.5 * P; }
  function ay(F) { return 460 - 0.24 * F; }
  function brainFlow(P) { return P < 60 ? 750 * P / 60 : P <= 150 ? 750 : 750 + (P - 150) * 8; }
  el("rect", { x: ax(60), y: 100, width: ax(150) - ax(60), height: 360, fill: "rgba(127,212,155,0.07)", class: "part-auto" }, autoG);
  T(autoG, ax(105), 120, "Autoregulation range", "ok small", "middle");
  el("path", { d: "M120 100 V460 H620", class: "axis" }, autoG);
  [0, 50, 100, 150, 200].forEach(function (P) { T(autoG, ax(P), 480, String(P), "small", "middle"); });
  [0, 750, 1500].forEach(function (F) { T(autoG, 112, ay(F) + 4, String(F), "small", "end"); });
  T(autoG, 370, 506, "Mean arterial pressure (mmHg)", "cap", "middle");
  var yl = T(autoG, 60, 280, "Brain blood flow (mL/min)", "cap", "middle");
  yl.setAttribute("transform", "rotate(-90 60 280)");
  var autoPts = [];
  for (var P0 = 0; P0 <= 200; P0 += 2) autoPts.push([ax(P0), ay(brainFlow(P0))]);
  el("path", { d: "M" + ax(0) + " " + ay(0) + " L" + ax(190) + " " + ay(1500), fill: "none", stroke: "#9aa4af", "stroke-width": 1.5, "stroke-dasharray": "6 6" }, autoG);
  T(autoG, ax(178), ay(1440), "Rigid pipe", "small", "end");
  el("path", { d: M.polyD(autoPts), fill: "none", stroke: ACCENT, "stroke-width": 3, filter: "url(#glow)" }, autoG);
  var autoGuideX = el("line", { class: "lead", "stroke-dasharray": "3 4" }, autoG);
  var autoGuideY = el("line", { class: "lead", "stroke-dasharray": "3 4" }, autoG);
  var autoDot = el("circle", { r: 8, fill: ACCENT, stroke: "#1c2026", "stroke-width": 2 }, autoG);
  // Arteriole in cross-section: muscle ring around the lumen.
  var artOuter = el("circle", { cx: 810, cy: 250, fill: "url(#g-muscle)" }, autoG);
  var artHatch = el("circle", { cx: 810, cy: 250, fill: "url(#hatch-muscle)" }, autoG);
  var artLumen = el("circle", { cx: 810, cy: 250, fill: ART }, autoG);
  T(autoG, 810, 335, "Brain arteriole, cut across", "small", "middle");
  var autoP = T(autoG, 810, 380, "", "", "middle");
  var autoF = T(autoG, 810, 406, "", "ok", "middle");
  var autoState = T(autoG, 810, 432, "", "cap", "middle");

  /* =====================================================================
   * Steps 1 and 2: the heart close-up
   * ===================================================================== */

  var pumpG = G(svg);
  var SIDES = [
    { c: 422, ac: 400, outX: 475, inX: 370, fill: "#3f5872", cell: VEIN_P },
    { c: 578, ac: 600, outX: 525, inX: 630, fill: "#7a3430", cell: ART_P }
  ];
  function flap(parent) { return el("path", { fill: "none", stroke: VALVE, "stroke-width": 5, "stroke-linecap": "round", class: "part-valve" }, parent); }
  function setFlap(f, h, tip) { f.setAttribute("d", "M" + h[0].toFixed(1) + " " + h[1].toFixed(1) + " L" + tip[0].toFixed(1) + " " + tip[1].toFixed(1)); }
  SIDES.forEach(function (S) {
    [["M" + S.inX + " 40 L" + S.inX + " 128"], ["M" + S.outX + " 236 L" + S.outX + " 42"]].forEach(function (d) {
      el("path", { d: d[0], stroke: MUSCLE_EDGE, "stroke-width": 24, fill: "none" }, pumpG);
      el("path", { d: d[0], stroke: S.fill, "stroke-width": 15, fill: "none" }, pumpG);
    });
    S.inFlow = flowLine(pumpG, "M" + S.inX + " 40 L" + S.inX + " 128", S.cell, 5, 22, 14);
    S.outFlow = flowLine(pumpG, "M" + S.outX + " 236 L" + S.outX + " 42", S.cell, 5, 0, 14);
    S.atG = G(pumpG);
    el("rect", { x: S.ac - 55, y: 118, width: 110, height: 92, rx: 34, fill: S.fill, stroke: MUSCLE_EDGE, "stroke-width": 8, class: "part-atrium" }, S.atG);
    el("rect", { x: S.ac - 55, y: 118, width: 110, height: 92, rx: 34, fill: "none", stroke: "url(#hatch-muscle)", "stroke-width": 8 }, S.atG);
    S.vG = G(pumpG);
    var vd = "M" + (S.c - 75) + " 225 L" + (S.c + 75) + " 225 C" + (S.c + 80) + " 330 " + (S.c + 40) + " 420 " + S.c + " 445 C" +
      (S.c - 40) + " 420 " + (S.c - 80) + " 330 " + (S.c - 75) + " 225 Z";
    el("path", { d: vd, fill: S.fill, stroke: MUSCLE_EDGE, "stroke-width": 14, "stroke-linejoin": "round", class: "part-ventricle" }, S.vG);
    el("path", { d: vd, fill: "none", stroke: "url(#hatch-muscle)", "stroke-width": 14 }, S.vG);
    el("rect", { x: S.inX - 7, y: 108, width: 14, height: 18, fill: S.fill }, pumpG);
    el("rect", { x: S.ac - 31, y: 198, width: 62, height: 36, fill: S.fill }, pumpG);
    el("rect", { x: S.outX - 8, y: 205, width: 16, height: 34, fill: S.fill }, pumpG);
    S.av = [flap(pumpG), flap(pumpG)];
    S.ov = [flap(pumpG), flap(pumpG)];
  });
  var pumpLabels = G(pumpG);
  T(pumpLabels, 370, 28, "From body", "small", "middle");
  T(pumpLabels, 482, 28, "To lungs", "small", "end");
  T(pumpLabels, 518, 28, "To body", "small", "start");
  T(pumpLabels, 630, 28, "From lungs", "small", "middle");
  T(pumpLabels, 290, 168, "Right atrium", "", "end"); lead(pumpLabels, 294, 162, 344, 162);
  T(pumpLabels, 290, 326, "Right ventricle", "", "end"); lead(pumpLabels, 294, 320, 352, 320);
  T(pumpLabels, 290, 236, "Valve", "small", "end"); lead(pumpLabels, 294, 232, 366, 222);
  T(pumpLabels, 710, 168, "Left atrium", "", "start"); lead(pumpLabels, 706, 162, 656, 162);
  T(pumpLabels, 710, 326, "Left ventricle", "", "start"); lead(pumpLabels, 706, 320, 650, 320);
  T(pumpLabels, 500, 484, "Septum (shared wall)", "small", "middle"); lead(pumpLabels, 500, 470, 500, 380);
  var cupG = G(pumpG, { class: "part-cup" });
  var cupFill = el("path", { fill: ART, opacity: 0.85 }, cupG);
  el("path", { d: "M800 392 L806 470 L874 470 L880 392", fill: "none", stroke: "#a9b4bf", "stroke-width": 2.5, "stroke-linejoin": "round" }, cupG);
  T(cupG, 840, 374, "Stroke volume", "small", "middle");
  T(cupG, 840, 496, "≈ 70 mL per beat", "accent", "middle");

  // Step 2: bottles
  var bottleG = G(svg);
  var bottles = [];
  for (var bi = 0; bi < 5; bi++) {
    var bx = 562 + bi * 76;
    var bf = el("rect", { x: bx + 3, width: 50, fill: ART, opacity: 0.9 }, bottleG);
    el("path", { d: "M" + (bx + 18) + " 180 L" + (bx + 18) + " 205 Q" + bx + " 212 " + bx + " 226 L" + bx + " 372 Q" + bx + " 380 " + (bx + 8) +
      " 380 L" + (bx + 48) + " 380 Q" + (bx + 56) + " 380 " + (bx + 56) + " 372 L" + (bx + 56) + " 226 Q" + (bx + 56) + " 212 " + (bx + 38) +
      " 205 L" + (bx + 38) + " 180", fill: "none", stroke: "#a9b4bf", "stroke-width": 2.5 }, bottleG);
    T(bottleG, bx + 28, 402, "1 L", "small", "middle");
    bottles.push(bf);
  }
  T(bottleG, 752, 112, "One minute at rest", "cap", "middle");
  T(bottleG, 752, 145, "70 mL × 70 beats ≈ 4.9 L", "accent", "middle");
  var bottleRead = T(bottleG, 752, 440, "", "", "middle");
  T(bottleG, 752, 475, "Total blood in an adult: about 5 L", "small", "middle");
  T(bottleG, 752, 498, "Hard exercise: 20 L/min or more", "small", "middle");

  /* =====================================================================
   * Step 3: figure-eight inset
   * ===================================================================== */

  var circG = G(svg);
  el("rect", { x: 650, y: 80, width: 300, height: 400, rx: 12, class: "frame" }, circG);
  el("rect", { x: 740, y: 100, width: 120, height: 46, rx: 10, fill: "rgba(156,192,230,0.12)", stroke: "#7d8896", class: "part-pulm" }, circG);
  T(circG, 800, 129, "Lungs", "", "middle");
  el("rect", { x: 740, y: 412, width: 120, height: 46, rx: 10, fill: "rgba(255,255,255,0.05)", stroke: "#7d8896", class: "part-sys" }, circG);
  T(circG, 800, 441, "Body", "", "middle");
  el("rect", { x: 722, y: 255, width: 66, height: 60, rx: 10, fill: "#3f5872", stroke: MUSCLE_EDGE, "stroke-width": 4 }, circG);
  el("rect", { x: 812, y: 255, width: 66, height: 60, rx: 10, fill: "#7a3430", stroke: MUSCLE_EDGE, "stroke-width": 4 }, circG);
  T(circG, 755, 290, "Right", "small", "middle");
  T(circG, 845, 290, "Left", "small", "middle");
  [["M755 255 C755 205 770 180 780 150", VEIN, "part-pulm"], ["M820 150 C830 180 845 205 845 255", ART, "part-pulm"],
   ["M845 315 C845 360 830 385 820 410", ART, "part-sys"], ["M780 410 C770 385 755 360 755 315", VEIN, "part-sys"]].forEach(function (c) {
    el("path", { d: c[0], fill: "none", stroke: c[1], "stroke-width": 6, "marker-end": "url(#arrow)", class: c[2] }, circG);
    flowLine(circG, c[0], c[1] === ART ? ART_P : VEIN_P, 3, 30, 14);
  });
  T(circG, 800, 205, "Pulmonary", "small", "middle");
  T(circG, 800, 222, "circuit", "small", "middle");
  T(circG, 800, 358, "Systemic", "small", "middle");
  T(circG, 800, 375, "circuit", "small", "middle");

  /* =====================================================================
   * Steps 13 to 15: close-up of a deep calf vein
   * ===================================================================== */

  var veinG = G(svg);
  var VX = 520, VY = [130, 290, 450];
  var vMuscle = el("ellipse", { cx: 400, cy: 290, rx: 88, ry: 178, fill: "url(#g-muscle)", class: "part-calf" }, veinG);
  var vMuscleH = el("ellipse", { cx: 400, cy: 290, rx: 88, ry: 178, fill: "url(#hatch-muscle)" }, veinG);
  T(veinG, 400, 290, "Calf muscle", "", "middle");
  el("rect", { x: 640, y: 30, width: 40, height: 500, rx: 14, fill: "url(#g-steel)" }, veinG);
  el("rect", { x: 640, y: 30, width: 40, height: 500, rx: 14, fill: "url(#hatch-steel)" }, veinG);
  T(veinG, 660, 20, "Shin bone", "small", "middle");
  var lumen = el("path", { fill: "#2a3646" }, veinG);
  var wallL = el("path", { fill: "none", stroke: VEIN, "stroke-width": 6, "stroke-linejoin": "round", class: "part-varicose" }, veinG);
  var wallR = el("path", { fill: "none", stroke: VEIN, "stroke-width": 6, "stroke-linejoin": "round", class: "part-varicose" }, veinG);
  var vCellsG = G(veinG);
  var vCells = [];
  for (var ci = 0; ci < 44; ci++) {
    vCells.push({ y: 30 + ((ci * 0.6180339) % 1) * 500, xo: ((ci * 0.7548777) % 1) * 1.4 - 0.7,
      c: el("circle", { r: 4.5, fill: VEIN_P }, vCellsG) });
  }
  var valves = VY.map(function (y) {
    var v = { y: y };
    v.bad = [el("path", { fill: "none", stroke: BAD, "stroke-width": 10, "stroke-linecap": "round" }, veinG),
             el("path", { fill: "none", stroke: BAD, "stroke-width": 10, "stroke-linecap": "round" }, veinG)];
    v.f = [flap(veinG), flap(veinG)];
    v.f.forEach(function (f) { f.setAttribute("class", "part-vvalve part-valve"); f.setAttribute("stroke-width", 4.5); });
    return v;
  });
  T(veinG, VX, 18, "To the heart", "small", "middle");
  T(veinG, VX, 552, "From the foot", "small", "middle");
  var arrowUp = el("path", { d: "M582 330 L582 240", stroke: OK, "stroke-width": 3, fill: "none", "marker-end": "url(#arrow)" }, veinG);
  var arrowDown = el("path", { d: "M582 240 L582 330", stroke: BAD, "stroke-width": 3, fill: "none", "marker-end": "url(#arrow)" }, veinG);
  var backNote = T(veinG, 730, 220, "Backward push: valves shut", "small");
  var vReadG = G(veinG);
  T(vReadG, 730, 400, "Pressure in ankle veins", "cap");
  var vRead = T(vReadG, 730, 432, "", "accent big");
  var vState = T(vReadG, 730, 458, "", "small");
  var bulgeNote = T(veinG, 730, 300, "Stretched vein bulges", "bad small");

  function halfW(y, sq, bulge) {
    var inW = y > 160 && y < 420 ? Math.pow(Math.sin(Math.PI * (y - 160) / 260), 0.7) : 0;
    var out = 0;
    if (y > 135 && y < 445) { var u = ((y - 135) % 155) / 155; out = Math.pow(Math.sin(Math.PI * u), 2); }
    return 20 - 11 * sq * inW + 15 * bulge * out;
  }

  /* =====================================================================
   * Body scenes: chair, body, labels and insets
   * ===================================================================== */

  var chairG = G(svg);
  el("line", { x1: 180, y1: 528, x2: 720, y2: 528, stroke: "rgba(255,255,255,0.15)", "stroke-width": 2 }, chairG);
  el("path", { d: "M300 425 H452 Q462 425 462 433 Q462 441 452 441 H300 Z", fill: "url(#g-steel)" }, chairG);
  el("path", { d: "M298 250 h14 v190 h-14 z", fill: "url(#g-steel)" }, chairG);
  el("path", { d: "M310 441 L310 527 M448 441 L448 527", stroke: "#8e99a5", "stroke-width": 6 }, chairG);

  var bodyG = G(svg);
  var body = M.build(bodyG);
  var bodyLbl = G(bodyG);

  // Step 3 labels on the body
  var lblLung = G(bodyLbl); var lnLung = lead(lblLung, 0, 0, 0, 0); var txLung = T(lblLung, 0, 0, "Lungs", "", "end");
  var lblHeart = G(bodyLbl); var lnHeart = lead(lblHeart, 0, 0, 0, 0); var txHeart = T(lblHeart, 0, 0, "Heart", "", "start");
  var lblBrain = G(bodyLbl); var lnBrain = lead(lblBrain, 0, 0, 0, 0); var txBrain = T(lblBrain, 0, 0, "Brain", "", "end");

  // Step 9 gauges
  var gaugeG = G(bodyLbl);
  T(gaugeG, 700, 96, "Arterial pressure", "cap");
  var gauges = ["Head", "Heart", "Feet"].map(function (name, i) {
    var g = G(gaugeG);
    return { ln: lead(g, 0, 0, 0, 0), tx: T(g, 700, 150 + i * 135, "", i === 0 ? "accent" : ""), y: 145 + i * 135, name: name };
  });
  var rulerG = G(bodyLbl);
  var rulerHead = el("path", { class: "lead" }, rulerG), rulerFoot = el("path", { class: "lead" }, rulerG);
  var rulerHeadT = T(rulerG, 0, 0, "", "small", "end"), rulerFootT = T(rulerG, 0, 0, "", "small", "end");
  var heartLevel = el("line", { stroke: "rgba(226,185,85,0.5)", "stroke-dasharray": "5 6", "stroke-width": 1.2 }, rulerG);
  var heartLevelT = T(rulerG, 0, 0, "Heart level", "small accent", "start");

  // Step 10 pooling label and U-tube
  var poolLbl = G(bodyLbl); var lnPool = lead(poolLbl, 0, 0, 0, 0);
  var txPool = T(poolLbl, 0, 0, "500–800 mL pools in the legs", "accent", "start");
  var utubeG = G(svg);
  T(utubeG, 800, 60, "Arteries and veins form a U", "cap", "middle");
  el("rect", { x: 650, y: 75, width: 300, height: 425, rx: 12, class: "frame" }, utubeG);
  el("path", { d: "M785 110 L720 110 L720 400 Q720 440 760 440 L800 440", fill: "none", stroke: ART, "stroke-width": 14, "stroke-linejoin": "round" }, utubeG);
  el("path", { d: "M800 440 L840 440 Q880 440 880 400 M880 110 L815 110", fill: "none", stroke: VEIN, "stroke-width": 14 }, utubeG);
  var uVein = el("path", { fill: VEIN }, utubeG);
  el("path", { d: M.HEART_D, fill: "url(#g-muscle)", transform: "translate(800 112) scale(20)" }, utubeG);
  flowLine(utubeG, "M785 110 L720 110 L720 400 Q720 440 760 440 L800 440", ART_P, 4, 30, 16);
  T(utubeG, 800, 300, "Gravity adds the same", "small", "middle");
  T(utubeG, 800, 318, "pressure on both sides", "small", "middle");
  T(utubeG, 720, 476, "Artery: stiff", "small", "middle");
  T(utubeG, 880, 476, "Vein: soft", "small", "middle");

  // Steps 11 and 12: sensor on the neck and chart
  var baroG = G(bodyLbl, { class: "part-baro" });
  var baroRing = el("circle", { r: 6, fill: "none", stroke: ACCENT, "stroke-width": 2 }, baroG);
  var baroDot = el("circle", { r: 5, fill: ACCENT }, baroG);
  var lnBaro = lead(baroG, 0, 0, 0, 0);
  var txBaro = T(baroG, 0, 0, "Carotid sinus (pressure sensor)", "small", "start");

  var chartG = G(svg);
  el("rect", { x: 690, y: 80, width: 275, height: 400, rx: 12, class: "frame" }, chartG);
  T(chartG, 836, 108, "Pressure at the head (mmHg)", "cap", "middle");
  function cx(sec) { return 728 + (sec + 3) * 215 / 33; }
  function cy(P) { return 420 - (P - 20) * 3.4; }
  el("path", { d: "M728 140 V420 H945", class: "axis" }, chartG);
  [40, 60, 80, 100].forEach(function (P) { T(chartG, 722, cy(P) + 4, String(P), "small", "end"); });
  [0, 10, 20, 30].forEach(function (s) { T(chartG, cx(s), 438, String(s), "small", "middle"); });
  T(chartG, 836, 462, "Seconds after standing up", "cap", "middle");
  el("line", { x1: 728, y1: cy(40), x2: 945, y2: cy(40), stroke: BAD, "stroke-width": 1.5, "stroke-dasharray": "6 5" }, chartG);
  T(chartG, 945, cy(40) + 16, "Too little for the brain", "bad small", "end");
  el("line", { x1: cx(0), y1: 140, x2: cx(0), y2: 420, stroke: "rgba(255,255,255,0.2)", "stroke-dasharray": "3 4" }, chartG);
  var curveA = el("path", { fill: "none", stroke: OK, "stroke-width": 3 }, chartG);
  var curveB1 = el("path", { fill: "none", stroke: BAD, "stroke-width": 3 }, chartG);
  var curveB2 = el("path", { fill: "none", stroke: OK, "stroke-width": 3 }, chartG);
  var chartRead = T(chartG, 836, 510, "", "accent", "middle");

  // Step 16 to 18 labels, meter, clot
  var sitG = G(bodyLbl);
  var SIT_LBL = ["Vein bent at the hip", "Vein bent at the knee", "Seat edge presses on the thigh", "Calf pump idle", "Ankles swell"];
  var sitLabels = SIT_LBL.map(function (s, i) {
    var g = G(sitG);
    return { g: g, ln: lead(g, 0, 0, 0, 0), tx: T(g, 560, 330 + i * 44, s, "small"), ring: el("circle", { r: 13, fill: "none", stroke: ACCENT, "stroke-width": 1.5, "stroke-dasharray": "3 3" }, g) };
  });
  var meterG = G(svg);
  var meterTime = T(meterG, 640, 78, "", "cap");
  T(meterG, 640, 122, "Flow in the deep leg veins", "small");
  el("rect", { x: 640, y: 132, width: 260, height: 14, rx: 7, fill: "#262c33", stroke: "#5b6572" }, meterG);
  var meterBar = el("rect", { x: 640, y: 132, height: 14, rx: 7 }, meterG);

  var clotG = G(bodyLbl, { class: "part-dvt" });
  var clot = el("ellipse", { rx: 10, ry: 5, fill: "#5a2326", stroke: BAD, "stroke-width": 1.5 }, clotG);
  var clotLn = lead(clotG, 0, 0, 0, 0);
  var clotT = T(clotG, 0, 0, "Deep vein thrombosis (DVT)", "bad", "start");
  var embolus = el("ellipse", { rx: 6, ry: 3.5, fill: "#5a2326", stroke: BAD, "stroke-width": 1.5, class: "part-pe" }, bodyLbl);
  var peG = G(bodyLbl, { class: "part-pe" });
  var peLn = lead(peG, 0, 0, 0, 0);
  var peT = T(peG, 0, 0, "Pulmonary embolism", "bad", "end");
  var helpG = G(bodyLbl);
  var helpAnkle = T(helpG, 560, 420, "Ankle pumps: the calf squeezes the veins", "ok", "start");
  var helpStand = T(helpG, 560, 300, "Stand up and walk every hour or so", "ok", "start");

  // Move the insets and the vein close-up above the body.
  svg.appendChild(utubeG); svg.appendChild(chartG); svg.appendChild(circG); svg.appendChild(meterG); svg.appendChild(veinG);

  /* =====================================================================
   * Camera and legend
   * ===================================================================== */

  var HERO = [-140, 0, 1000, 560], FULL = [0, 0, 1000, 560], LEG = [340, 360, 280, 157];
  var KEYS = [[0, HERO], [0.6, HERO], [0.95, FULL], [16.85, FULL], [17.05, LEG], [17.33, LEG], [17.5, FULL], [18.85, FULL], [19.1, HERO]];

  var legendItems = Array.prototype.map.call(document.querySelectorAll("#legend span"), function (span) {
    var steps = {};
    span.dataset.steps.split(",").forEach(function (part) {
      var ab = part.split("-").map(Number);
      for (var s = ab[0]; s <= (ab.length > 1 ? ab[1] : ab[0]); s++) steps[s] = true;
    });
    return { span: span, steps: steps };
  });
  var legendStep = -1;

  /* =====================================================================
   * Body model helpers for the gravity and reflex scenes
   * ===================================================================== */

  var P = M.POSES;
  var HEART_UV = [0.70, 12];
  function headOffset(pose) {
    var J = M.resolve(pose);
    var h = M.atBone(J.B.torso, HEART_UV[0], HEART_UV[1]);
    return (h[1] - J.head[1]) / M.CM * -0.78; // mmHg; negative when the head is above the heart
  }
  function standFrac(sec) { return ease(range(sec, -2, 0)); }
  function fallFrac(sec) { return ease(range(sec, 8, 10)); }
  function poseA(sec) { return M.mixPose(P.lie, P.stand, standFrac(sec)); }
  function poseB(sec) { return sec < 8 ? M.mixPose(P.lie, P.stand, standFrac(sec)) : M.mixPose(P.stand, P.lie, fallFrac(sec)); }
  function headA(sec) { return 93 + headOffset(poseA(sec)) - 15 * ease(range(sec, 0, 3)) + 20 * ease(range(sec, 2.5, 12)); }
  function headB(sec) {
    var drop = -15 * ease(range(sec, 0, 3)) - 14 * ease(range(sec, 3, 8));
    return 93 + headOffset(poseB(sec)) + drop * (1 - ease(range(sec, 9, 16)));
  }
  function chartD(fn, s0, s1) {
    if (s1 <= s0) return "";
    var d = "";
    for (var s = s0; s <= s1 + 1e-6; s += 0.25) d += (d ? " L" : "M") + cx(s).toFixed(1) + " " + cy(fn(s)).toFixed(1);
    return d;
  }
  var secA = function (t) { return lerp(-3, 30, range(t, 10.9, 11.6)); };
  var secB = function (t) { return lerp(-3, 30, range(t, 11.95, 12.65)); };

  function poseAt(t) {
    if (t < 8.95) return P.stand;
    if (t < 10.75) return M.mixPose(P.lie, P.stand, ease(range(t, 9.05, 9.5)));
    if (t < 10.9) return M.mixPose(P.stand, P.lie, ease(range(t, 10.75, 10.9)));
    if (t < 11.8) return poseA(secA(t));
    if (t < 11.95) return M.mixPose(P.stand, P.lie, ease(range(t, 11.8, 11.95)));
    if (t < 12.8) return poseB(secB(t));
    if (t < 16.05) return M.mixPose(P.lie, P.stand, ease(range(t, 12.8, 12.95)));
    if (t < 18.35) return M.mixPose(P.stand, P.sit, ease(range(t, 16.05, 16.4)));
    return M.mixPose(P.sit, P.stand, ease(range(t, 18.35, 18.6)));
  }
  function poolAt(t) {
    if (t < 9.85) return 0;
    if (t < 10.9) return ease(range(t, 9.9, 10.35)) * (1 - range(t, 10.75, 10.9));
    if (t < 11.95) return 0.9 * ease(range(secA(t), 0, 3)) * (1 - range(t, 11.8, 11.95));
    if (t < 12.95) return ease(range(secB(t), 0, 3)) * (1 - ease(range(secB(t), 8, 11)));
    return 0;
  }

  /* =====================================================================
   * Render
   * ===================================================================== */

  var clock = 0, beatPh = 0, pumpPh = 0, veinD = 0, anklePh = 0;

  function render(t, dt, info) {
    if (info.reduceMotion) dt = 0;
    clock += dt;
    beatPh = (beatPh + dt) % 1; // 60 beats per minute
    var beat = M.beatShape(beatPh);

    // ----- camera -----
    var box = E.keyframes(t, KEYS);
    svg.setAttribute("viewBox", box.join(" "));
    var sr = svg.getBoundingClientRect();
    var scale = Math.min(sr.width / box[2], sr.height / box[3]) || 1;
    svg.style.setProperty("--z", ((info.narrow ? 0.85 : 1) / scale).toFixed(3));

    // ----- legend -----
    var step = clamp(Math.floor(t + 0.15), 0, 19);
    if (step !== legendStep) {
      legendItems.forEach(function (it) { it.span.classList.toggle("on", !!it.steps[step]); });
      legendStep = step;
    }

    // ----- moving dots along vessels -----
    flows.forEach(function (f) {
      f.off -= dt * f.speed;
      f.p.setAttribute("stroke-dashoffset", f.off.toFixed(1));
    });

    // ----- body -----
    var bodyVis = Math.max(1 - range(t, 0.7, 0.85),
      range(t, 3.0, 3.15) * (1 - range(t, 3.85, 4.0)),
      range(t, 8.85, 9.0) * (1 - range(t, 13.0, 13.15)),
      range(t, 15.9, 16.05));
    show(bodyG, bodyVis);
    var pose = poseAt(t);
    var ankleAmp = range(t, 17.9, 18.05) * (1 - range(t, 18.3, 18.4));
    anklePh = (anklePh + dt / 1.3) % 1;
    var ankleS = Math.sin(anklePh * Math.PI * 2);
    if (ankleAmp > 0) { pose = Object.assign({}, pose); pose.ankle = -22 * ankleS * ankleAmp; }
    var hiP = win(t, 3.1, 3.2, 3.35, 3.42), hiS = win(t, 3.38, 3.45, 3.6, 3.7);
    var sysOp = 1 - 0.75 * hiP, pulOp = 1 - 0.75 * hiS;
    var legFlow = 1 - 0.8 * ease(range(t, 16.2, 16.6)) + 0.55 * ease(range(t, 17.9, 18.1)) + 0.25 * ease(range(t, 18.35, 18.6));
    var calfShow = Math.max(win(t, 16.2, 16.35, 16.85, 16.95), win(t, 17.9, 18.0, 18.5, 18.6));
    var swell = ease(range(t, 16.2, 16.6)) * (1 - ease(range(t, 18.4, 18.7)));
    var J = null;
    if (bodyVis > 0.001) {
      J = body.update({
        pose: pose, dt: dt, flow: 1, legFlow: legFlow, pool: poolAt(t), beat: beat,
        calf: calfShow, squeeze: ankleAmp * Math.max(0, ankleS), swell: swell,
        dim: { pulmOut: pulOp, pulmIn: pulOp, artDown: sysOp, veinUp: sysOp, artUp: sysOp, veinDown: sysOp }
      });
    }
    var heartPt = body.at("torso", HEART_UV[0], HEART_UV[1]);

    // Step 3 labels
    var l3 = win(t, 3.15, 3.3, 3.85, 3.95);
    show(lblLung, l3); show(lblHeart, l3); show(lblBrain, l3);
    if (l3 > 0.001) {
      var lp = body.at("torso", 0.8, -26);
      setLine(lnLung, lp, [250, lp[1]]); txLung.setAttribute("x", 244); txLung.setAttribute("y", lp[1] + 5);
      setLine(lnHeart, [heartPt[0] + 14, heartPt[1]], [460, heartPt[1]]); txHeart.setAttribute("x", 466); txHeart.setAttribute("y", heartPt[1] + 5);
      var bp = body.at("neck", 1.12, -18);
      setLine(lnBrain, bp, [250, bp[1]]); txBrain.setAttribute("x", 244); txBrain.setAttribute("y", bp[1] + 5);
    }

    // Step 9 gauges and ruler
    var g9 = win(t, 8.95, 9.1, 9.85, 9.95);
    show(gaugeG, g9);
    show(rulerG, g9 * ease(range(t, 9.35, 9.5)));
    if (g9 > 0.001 && J) {
      [J.head, heartPt, J.ankle].forEach(function (pt, i) {
        var g = gauges[i];
        var Pm = 93 + (pt[1] - heartPt[1]) / M.CM * 0.78;
        g.tx.textContent = g.name + ": " + Math.round(Pm) + " mmHg";
        setLine(g.ln, [pt[0] + (i === 1 ? 16 : 10), pt[1]], [692, g.y]);
      });
      var rx = J.hip[0] - 90;
      rulerHead.setAttribute("d", "M" + (rx + 6) + " " + J.head[1] + " H" + rx + " V" + heartPt[1] + " H" + (rx + 6));
      rulerFoot.setAttribute("d", "M" + (rx + 6) + " " + (heartPt[1] + 4) + " H" + rx + " V" + J.ankle[1] + " H" + (rx + 6));
      rulerHeadT.setAttribute("x", rx - 6); rulerHeadT.setAttribute("y", (J.head[1] + heartPt[1]) / 2 + 4);
      rulerHeadT.textContent = "≈ " + 5 * Math.round((heartPt[1] - J.head[1]) / M.CM / 5) + " cm";
      rulerFootT.setAttribute("x", rx - 6); rulerFootT.setAttribute("y", (J.ankle[1] + heartPt[1]) / 2 + 4);
      rulerFootT.textContent = "≈ " + 5 * Math.round((J.ankle[1] - heartPt[1]) / M.CM / 5) + " cm";
      setLine(heartLevel, [rx, heartPt[1]], [600, heartPt[1]]);
      heartLevelT.setAttribute("x", 470); heartLevelT.setAttribute("y", heartPt[1] - 8);
    }

    // Step 10 pooling and U-tube
    var p10 = win(t, 9.95, 10.1, 10.75, 10.85);
    show(poolLbl, p10);
    if (p10 > 0.001) {
      var tp = body.at("thigh", 0.5, 3);
      setLine(lnPool, tp, [418, tp[1] + 30]); txPool.setAttribute("x", 424); txPool.setAttribute("y", tp[1] + 36);
    }
    show(utubeG, win(t, 9.9, 10.05, 10.85, 10.95));
    var pl = ease(range(t, 9.95, 10.35));
    var left = [], right = [];
    for (var y = 110; y <= 400; y += 10) {
      var w = 7 + 11 * pl * Math.pow((y - 110) / 290, 1.5);
      left.push((880 - w).toFixed(1) + " " + y); right.unshift((880 + w).toFixed(1) + " " + y);
    }
    uVein.setAttribute("d", "M" + left.join(" L") + " L" + right.join(" L") + " Z");

    // Steps 11 and 12: sensor, chart, readouts
    var c11 = win(t, 10.85, 11.0, 12.85, 12.95);
    show(chartG, c11);
    var baroOn = win(t, 10.9, 11.05, 11.8, 11.9);
    show(baroG, baroOn);
    if (baroOn > 0.001) {
      var bpt = body.at("neck", 0.3, 8);
      baroDot.setAttribute("cx", bpt[0]); baroDot.setAttribute("cy", bpt[1]);
      var ringP = (clock * 1.2) % 1;
      baroRing.setAttribute("cx", bpt[0]); baroRing.setAttribute("cy", bpt[1]);
      baroRing.setAttribute("r", 6 + 18 * ringP); baroRing.style.opacity = 1 - ringP;
      setLine(lnBaro, [bpt[0] + 6, bpt[1] - 4], [bpt[0] + 50, bpt[1] - 40]);
      txBaro.setAttribute("x", bpt[0] + 54); txBaro.setAttribute("y", bpt[1] - 42);
    }
    if (c11 > 0.001) {
      if (t < 11.9) {
        var sa = secA(t);
        curveA.setAttribute("d", chartD(headA, -3, sa));
        curveA.style.opacity = 1;
        curveB1.setAttribute("d", ""); curveB2.setAttribute("d", "");
        chartRead.textContent = "Heart rate: " + Math.round(62 + 18 * ease(range(sa, 1, 8))) + " beats/min";
        chartRead.setAttribute("class", "accent");
      } else {
        var sb = secB(t);
        curveA.setAttribute("d", chartD(headA, -3, 30));
        curveA.style.opacity = 0.25;
        curveB1.setAttribute("d", chartD(headB, -3, Math.min(sb, 9)));
        curveB2.setAttribute("d", sb > 9 ? chartD(headB, 9, sb) : "");
        var hb = headB(sb);
        chartRead.textContent = sb < 1 ? "Standing up" : hb < 40 ? "Brain supply too low: faints" : sb > 9 ? "Lying flat: supply restored" : "Reflex falling behind";
        chartRead.setAttribute("class", hb < 40 ? "bad" : sb > 9 ? "ok" : "accent");
      }
    }

    // Steps 16 to 18
    var s16 = win(t, 16.15, 16.3, 16.85, 16.95);
    show(sitG, s16);
    if (s16 > 0.001) {
      var pts = [body.at("thigh", 0.06, 2), body.at("shin", 0.03, 11), [455, 427], body.at("shin", 0.33, 26), body.at("foot", 0.3, 0)];
      sitLabels.forEach(function (L, i) {
        var a = range(t, 16.2 + i * 0.05, 16.28 + i * 0.05);
        L.g.style.opacity = a;
        var ly = 330 + i * 44;
        setLine(L.ln, [pts[i][0] + 12, pts[i][1]], [552, ly - 5]);
        L.ring.setAttribute("cx", pts[i][0]); L.ring.setAttribute("cy", pts[i][1]);
      });
    }
    show(chairG, range(t, 15.95, 16.1) * (1 - range(t, 18.4, 18.55)));
    var m16 = win(t, 16.1, 16.25, 18.85, 18.95);
    show(meterG, m16);
    if (m16 > 0.001) {
      var hrs = 4 * ease(range(t, 16.2, 16.6));
      meterTime.textContent = t < 17.9 ? "Time seated: " + hrs.toFixed(1) + " h" : t < 18.4 ? "Ankle pumps while seated" : "Standing and walking";
      var mf = clamp(legFlow);
      meterBar.setAttribute("width", (260 * Math.max(0.05, mf)).toFixed(1));
      meterBar.setAttribute("fill", mf < 0.4 ? BAD : mf < 0.85 ? ACCENT : OK);
    }

    var clotVis = range(t, 16.95, 17.05) * (1 - range(t, 17.85, 17.95));
    show(clotG, clotVis);
    var clotPt = body.at("shin", 0.42, 12.5);
    if (clotVis > 0.001) {
      var cs = ease(range(t, 16.95, 17.25)) * (t > 17.33 ? 0.75 : 1);
      clot.setAttribute("transform", "translate(" + clotPt[0].toFixed(1) + " " + clotPt[1].toFixed(1) + ") rotate(" + (body.J.B.shin.ang).toFixed(1) + ") scale(" + Math.max(0.01, cs).toFixed(3) + ")");
      setLine(clotLn, [clotPt[0] + 8, clotPt[1]], [536, 444]);
      clotT.setAttribute("x", 540); clotT.setAttribute("y", 450);
      clotT.style.opacity = range(t, 17.15, 17.25);
      clotLn.style.opacity = range(t, 17.15, 17.25);
    }
    var travel = range(t, 17.35, 17.6);
    var embVis = range(t, 17.33, 17.36) * (1 - range(t, 17.85, 17.95));
    show(embolus, embVis);
    if (embVis > 0.001) {
      var f0 = body.fracNear("veinUp", clotPt), ep;
      if (travel < 0.7) ep = body.pointOn("veinUp", lerp(f0, 1, ease(travel / 0.7)));
      else ep = body.pointOn("pulmOut", ease((travel - 0.7) / 0.3));
      embolus.setAttribute("cx", ep[0].toFixed(1)); embolus.setAttribute("cy", ep[1].toFixed(1));
    }
    var pe = win(t, 17.58, 17.65, 17.85, 17.95);
    show(peG, pe);
    body.lungs.setAttribute("stroke", pe > 0.3 ? BAD : "#7d8896");
    body.lungs.setAttribute("stroke-width", pe > 0.3 ? 2.5 : 1.2);
    body.lungs.setAttribute("stroke-dasharray", pe > 0.3 ? "none" : "4 4");
    if (pe > 0.001) {
      var lungPt = body.at("torso", 0.86, -22);
      setLine(peLn, lungPt, [262, lungPt[1] - 20]);
      peT.setAttribute("x", 256); peT.setAttribute("y", lungPt[1] - 15);
    }
    show(helpG, Math.max(win(t, 17.95, 18.05, 18.85, 18.95), 0));
    helpAnkle.style.opacity = win(t, 17.95, 18.05, 18.3, 18.4);
    helpStand.style.opacity = range(t, 18.45, 18.55);

    // ----- heart close-up (steps 1 and 2) -----
    var pumpVis = range(t, 0.7, 0.85) * (1 - range(t, 3.05, 3.2));
    show(pumpG, pumpVis);
    if (pumpVis > 0.001) {
      var standHeart = M.atBone(M.resolve(P.stand).B.torso, HEART_UV[0], HEART_UV[1]);
      if (t < 1.5) growFrom(pumpG, ease(range(t, 0.7, 1.0)), standHeart, 500, 280, 0.06);
      else if (t < 2.5) growFrom(pumpG, ease(range(t, 1.85, 2.1)), [500, 280], 500, 280, 1, [290, 290], 0.72);
      else growFrom(pumpG, 1 - ease(range(t, 2.85, 3.2)), standHeart, 500, 280, 0.06, [290, 290], 0.72);
      show(pumpLabels, range(t, 0.95, 1.1) * (1 - range(t, 1.85, 1.95)));
      show(cupG, win(t, 1.0, 1.15, 1.85, 1.95));
      var aS = beatPh > 0.82 ? Math.sin(Math.PI * (beatPh - 0.82) / 0.18) : 0;
      var avOpen = 1 - clamp(beat * 4);
      var ovOpen = beatPh < 0.38 ? clamp(beat * 4) : 0;
      SIDES.forEach(function (S) {
        S.vG.setAttribute("transform", "translate(" + S.c + " 225) scale(" + (1 - 0.16 * beat).toFixed(3) + " " + (1 - 0.12 * beat).toFixed(3) + ") translate(" + -S.c + " -225)");
        S.atG.setAttribute("transform", "translate(" + S.ac + " 164) scale(" + (1 - 0.07 * aS).toFixed(3) + ") translate(" + -S.ac + " -164)");
        setFlap(S.av[0], [S.ac - 30, 216], [lerp(S.ac - 2, S.ac - 25, avOpen), lerp(224, 254, avOpen)]);
        setFlap(S.av[1], [S.ac + 30, 216], [lerp(S.ac + 2, S.ac + 25, avOpen), lerp(224, 254, avOpen)]);
        setFlap(S.ov[0], [S.outX - 9, 230], [lerp(S.outX - 1, S.outX - 7, ovOpen), lerp(238, 202, ovOpen)]);
        setFlap(S.ov[1], [S.outX + 9, 230], [lerp(S.outX + 1, S.outX + 7, ovOpen), lerp(238, 202, ovOpen)]);
        S.outFlow.speed = 140 * ovOpen;
      });
      var level = beatPh < 0.38 ? ease(beatPh / 0.38) : 1 - ease(clamp((beatPh - 0.5) / 0.4));
      var ly2 = 470 - 70 * level;
      var lx = 806 - 6 * (470 - ly2) / 78;
      cupFill.setAttribute("d", "M" + lx.toFixed(1) + " " + ly2.toFixed(1) + " L806 470 L874 470 L" + (1680 - lx).toFixed(1) + " " + ly2.toFixed(1) + " Z");
    }

    // Step 2: bottles
    var b2 = win(t, 1.85, 2.0, 2.85, 3.0);
    show(bottleG, b2);
    if (b2 > 0.001) {
      var mins = range(t, 1.95, 2.6), litres = 4.9 * mins;
      bottles.forEach(function (b, i) {
        var f = clamp(litres - i);
        b.setAttribute("y", (377 - 150 * f).toFixed(1));
        b.setAttribute("height", (150 * f).toFixed(1));
      });
      bottleRead.textContent = "After " + Math.round(60 * mins) + " s: " + litres.toFixed(1) + " L pumped";
    }

    // Step 3: inset
    show(circG, win(t, 3.1, 3.25, 3.85, 3.95));

    // Steps 4 and 5: tree and graphs
    var tv = win(t, 3.85, 3.95, 5.85, 5.95);
    show(treeG, tv);
    if (tv > 0.001) {
      treeClipR.setAttribute("width", (1000 * ease(range(t, 3.9, 4.3))).toFixed(1));
      show(graphG, range(t, 4.0, 4.1));
      show(areaG, win(t, 4.0, 4.15, 4.85, 4.95));
      show(pressG, range(t, 4.88, 4.98));
      pressClipR.setAttribute("width", (GX0 + (GX1 - GX0 + 20) * ease(range(t, 4.9, 5.35))).toFixed(1));
      show(pressNote, range(t, 5.3, 5.4));
      var wave = PMID.map(function (v, i) { return [COLX[i], GY0 - GH * (v + PAMP[i] * (2 * M.beatShape((beatPh - i * 0.05 + 1) % 1) - 1)) / 120]; });
      pressLine.setAttribute("d", curveD(wave));
    }

    // Step 6: Sankey
    var sv = win(t, 5.85, 5.95, 6.85, 6.95);
    show(sankeyG, sv);
    if (sv > 0.001) {
      sankeyClipR.setAttribute("width", (140 + 520 * ease(range(t, 5.85, 6.3))).toFixed(1));
      show(sankeyLabels, range(t, 6.2, 6.35));
    }

    // Step 7: arch
    var av = win(t, 6.85, 7.0, 7.85, 7.95);
    show(archG, av);
    if (av > 0.001) {
      var blk = win(t, 7.3, 7.4, 7.85, 7.95);
      show(blockLabels, blk);
      lcarBlock.style.opacity = blk;
      ringOk.style.opacity = blk;
      lcarFlow.speed = 45 * (1 - (blk > 0.5 ? 1 : 0));
      ringFlow.speed = blk > 0.5 ? 25 : 0;
      ringFlow.p.style.opacity = blk;
      show(archLabels, range(t, 6.95, 7.1));
    }

    // Step 8: autoregulation
    var auv = win(t, 7.85, 7.95, 8.85, 8.95);
    show(autoG, auv);
    if (auv > 0.001) {
      var Pp = E.keyframes(t, [[7.95, [95]], [8.15, [55]], [8.22, [55]], [8.42, [150]], [8.48, [150]], [8.6, [95]]])[0];
      var Fv = brainFlow(Pp);
      autoDot.setAttribute("cx", ax(Pp)); autoDot.setAttribute("cy", ay(Fv));
      setLine(autoGuideX, [ax(Pp), ay(Fv)], [ax(Pp), 460]);
      setLine(autoGuideY, [ax(Pp), ay(Fv)], [120, ay(Fv)]);
      var r = 24 * Math.sqrt(95 / clamp(Pp, 60, 150));
      artLumen.setAttribute("r", r.toFixed(1));
      artOuter.setAttribute("r", (r + 16).toFixed(1));
      artHatch.setAttribute("r", (r + 16).toFixed(1));
      autoP.textContent = "Pressure: " + Math.round(Pp) + " mmHg";
      autoF.textContent = "Brain flow: " + Math.round(Fv) + " mL/min";
      autoF.setAttribute("class", Pp >= 59 && Pp <= 151 ? "ok" : "bad");
      autoState.textContent = Pp < 59 ? "Fully widened: flow falls" : Pp < 85 ? "Arterioles widen" : Pp > 151 ? "Fully narrowed" : Pp > 105 ? "Arterioles narrow" : "Resting width";
    }

    // ----- vein close-up (steps 13 to 15) -----
    var vv = range(t, 12.9, 13.05) * (1 - range(t, 15.95, 16.1));
    show(veinG, vv);
    if (vv > 0.001) {
      var calfPt = M.atBone(M.resolve(P.stand).B.shin, 0.33, 13);
      if (t < 14) growFrom(veinG, ease(range(t, 12.9, 13.2)), calfPt, 520, 280, 0.08);
      else growFrom(veinG, 1 - ease(range(t, 15.85, 16.1)), calfPt, 520, 280, 0.08);

      var amp = range(t, 13.85, 14.05) * (1 - range(t, 15.85, 15.95));
      var leak = range(t, 14.85, 15.1) * (1 - range(t, 15.85, 15.95));
      var bulge = ease(range(t, 15.0, 15.4)) * (1 - range(t, 15.85, 15.95));
      pumpPh = (pumpPh + dt / 1.4) % 1;
      var sq = amp * (pumpPh < 0.45 ? Math.sin(Math.PI * pumpPh / 0.45) : 0);
      var relax = amp * (pumpPh >= 0.45 ? Math.sin(Math.PI * (pumpPh - 0.45) / 0.55) : 0);
      var back = win(t, 13.25, 13.3, 13.42, 13.47) * (1 - amp);
      veinD += dt * (6 * (1 - amp) + 170 * sq - 120 * leak * relax);
      var Dnow = veinD - 10 * back;

      // Walls and lumen
      var Lp = [], Rp = [];
      for (var yy = 30; yy <= 530; yy += 10) {
        var hw = halfW(yy, sq, bulge);
        Lp.push([VX - hw - 3, yy]); Rp.push([VX + hw + 3, yy]);
      }
      wallL.setAttribute("d", M.polyD(Lp)); wallR.setAttribute("d", M.polyD(Rp));
      lumen.setAttribute("d", M.polyD(Lp.concat(Rp.slice().reverse())) + " Z");
      vMuscle.setAttribute("rx", (88 + 16 * sq).toFixed(1)); vMuscle.setAttribute("cx", (400 + 6 * sq).toFixed(1));
      vMuscleH.setAttribute("rx", (88 + 16 * sq).toFixed(1)); vMuscleH.setAttribute("cx", (400 + 6 * sq).toFixed(1));

      vCells.forEach(function (c) {
        var yC = 30 + (((c.y - 30 - Dnow) % 500) + 500) % 500;
        c.c.setAttribute("cx", (VX + c.xo * halfW(yC, sq, bulge) * 0.8).toFixed(1));
        c.c.setAttribute("cy", yC.toFixed(1));
      });

      valves.forEach(function (v, i) {
        var still = 0.45 * (1 - back);
        var pumped = i < 2 ? clamp(sq * 4) : clamp(relax * 4);
        var open = lerp(still, pumped, amp);
        var gap = 1.5 + 9 * leak;
        var hy = v.y + 18;
        var hwH = halfW(hy, sq, bulge), hwT = halfW(v.y - 8, sq, bulge);
        var tipY = lerp(v.y - 2, v.y - 22, open);
        setFlap(v.f[0], [VX - hwH, hy], [lerp(VX - gap, VX - hwT + 4, open), tipY]);
        setFlap(v.f[1], [VX + hwH, hy], [lerp(VX + gap, VX + hwT - 4, open), tipY]);
        v.bad[0].setAttribute("d", v.f[0].getAttribute("d"));
        v.bad[1].setAttribute("d", v.f[1].getAttribute("d"));
        v.bad[0].style.opacity = leak * 0.8; v.bad[1].style.opacity = leak * 0.8;
      });
      arrowUp.style.opacity = sq;
      arrowDown.style.opacity = leak * relax;
      backNote.style.opacity = back;
      bulgeNote.style.opacity = bulge;
      var pAnkle = lerp(90, 25, amp) + 55 * leak;
      vRead.textContent = "≈ " + Math.round(pAnkle) + " mmHg";
      vState.textContent = leak > 0.5 ? "Walking, leaky valves" : amp > 0.5 ? "Walking" : "Standing still";
      vRead.setAttribute("class", (leak > 0.5 ? "bad" : amp > 0.5 ? "ok" : "accent") + " big");
    }
  }

  E.start(render);
})();
