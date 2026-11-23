/* Protein folding: all drawing and animation.
 *
 * Scene timeline (t = step index + progress through that step):
 *   0 Hero          chain folds, a drug binds, chain unfolds (loops in time);
 *                   eases to a stretched-out chain as scrolling begins
 *   1 Chain         the ribosome runs along the mRNA and adds amino acids
 *   2 Water         colours change to water-avoiding / water-loving; water appears
 *   3 Collapse      chain collapses into an irregular ball, oily beads inside
 *   4 Secondary     zoom in; helix and sheet form, hydrogen bonds drawn,
 *                   ribbon cartoon fades in
 *   5 Native fold   zoom out; ribbon cartoon, labels, pocket outline
 *   6 Anfinsen      heat unfolds the protein (inactive), cooling refolds it
 *   7 Funnel        protein shrinks into a ball at the rim of the energy
 *                   funnel and rolls down while folding
 *   8 Misfolding    a second ball sticks in a side pit; amyloid fibril grows;
 *                   a chaperone lifts the ball out and it folds
 *   9 Function      protein grows back from the bottom ball; partner binds,
 *                   pocket closes slightly, activity lamp turns on
 *  10 Drug design   zoom on the pocket; three candidates try to fit
 *  11 Prediction    sequence -> prediction -> outline laid over the measured fold
 *  12 Other uses    three panels: corrector, stabilizer, protein medicines
 *  13 Summary       hero loop again, with the current stage named
 */
(function () {
  "use strict";

  var E = Explainer, M = ProteinModel;
  var range = E.range, ease = E.ease, lerp = E.lerp, win = E.window, clamp = E.clamp;
  var el = M.el, N = M.N;
  var OK = "#7fd49b", BAD = "#ee6b6b", ACCENT = "#e2b955";

  var svg = E.$("#drawing");
  var defs = M.addDefs(svg);

  function G(parent, attrs) { return el("g", attrs || {}, parent); }
  function T(parent, x, y, text, cls, anchor) {
    var t = el("text", { x: x, y: y, class: cls || "", "text-anchor": anchor || "start" }, parent);
    t.textContent = text;
    return t;
  }
  function lead(parent, x1, y1, x2, y2) { return el("line", { x1: x1, y1: y1, x2: x2, y2: y2, class: "lead" }, parent); }
  function show(node, v) {
    node.style.opacity = v;
    node.style.display = v <= 0.001 ? "none" : "";
  }
  function translate(node, x, y, s) {
    node.setAttribute("transform", "translate(" + x.toFixed(2) + " " + y.toFixed(2) + ")" + (s !== undefined ? " scale(" + s.toFixed(4) + ")" : ""));
  }
  function outline(node, color, amount) {
    if (amount > 0.01) { node.setAttribute("stroke", color); node.setAttribute("stroke-width", 3 * amount); }
    else { node.setAttribute("stroke", node.dataset.stroke || "none"); node.setAttribute("stroke-width", node.dataset.sw || 1); }
  }
  function charge(parent, x, y, sign) {
    var g = G(parent);
    el("circle", { cx: x, cy: y, r: 7, fill: "#262c33", stroke: "#9aa4af", "stroke-width": 1 }, g);
    T(g, x, y + 4.5, sign, "small", "middle").setAttribute("style", "font-size:13px;font-weight:600");
    return g;
  }
  function jitter(t, a, b, amp) { return amp * Math.sin(range(t, a, b) * Math.PI * 8); }

  /* =====================================================================
   * Energy funnel (absolute coordinates)
   * ===================================================================== */

  var FX = 430, FB = 470, FH = 340, FW = 300, PIT = 595;
  function fy(x) {
    var u = Math.min(1, Math.abs(x - FX) / FW);
    var ue = Math.sqrt(u * u + 0.0004);
    return FB - FH * Math.pow(ue, 0.7) + 6 * Math.sin(u * 30) * u + 38 * Math.exp(-Math.pow((x - PIT) / 16, 2));
  }
  // Ball centre resting on the surface at x, offset along the surface normal.
  function ballAt(x, r) {
    var d = (fy(x + 1) - fy(x - 1)) / 2, L = Math.sqrt(1 + d * d);
    return [x + r * d / L, fy(x) - r / L];
  }
  var XPIT = PIT;
  (function () { var best = -1e9; for (var x = 570; x < 625; x += 0.5) if (fy(x) > best) { best = fy(x); XPIT = x; } })();
  var FUNNEL_D = "M130 500 L130 " + fy(130).toFixed(1);
  for (var fx = 133; fx <= 730; fx += 3) FUNNEL_D += " L" + fx + " " + fy(fx).toFixed(1);
  FUNNEL_D += " L730 500 Z";

  var funnelG = G(svg);
  function groundInto(parent) {
    el("path", { d: FUNNEL_D, fill: "url(#g-ground)", class: "part-funnel" }, parent);
    el("path", { d: FUNNEL_D, fill: "url(#hatch-ground)" }, parent);
  }
  groundInto(funnelG);
  el("ellipse", { cx: FX, cy: fy(130), rx: 300, ry: 20, fill: "none", stroke: "#9aa4af", "stroke-width": 1, "stroke-dasharray": "4 5", opacity: 0.6 }, funnelG);
  // axes
  el("path", { d: "M95 470 L95 140 M89 152 L95 140 L101 152", class: "lead" }, funnelG);
  T(funnelG, 82, 305, "Energy", "cap", "middle").setAttribute("transform", "rotate(-90 82 305)");
  el("path", { d: "M130 48 L730 48 M142 42 L130 48 L142 54 M718 42 L730 48 L718 54", class: "lead" }, funnelG);
  T(funnelG, FX, 36, "Width: number of possible shapes", "cap", "middle");
  var lblUnfolded = T(funnelG, 150, 84, "Unfolded chain", "small", "middle");
  lead(funnelG, FX, FB + 4, FX, 506);
  T(funnelG, FX, 526, "Native fold", "accent", "middle");
  var lblTrap = G(funnelG, { class: "lbl" });
  lead(lblTrap, 552, 246, 578, 262);
  T(lblTrap, 548, 244, "Local minimum (trap)", "small", "end");

  // Inset on the right: Levinthal's random search (step 7), amyloid (step 8)
  var levG = G(svg);
  el("rect", { x: 765, y: 120, width: 190, height: 250, rx: 10, class: "frame" }, levG);
  ["Random search,", "one shape at a time:", "about 10⁹⁴ shapes", "for 100 amino acids,", "longer than the age", "of the universe"]
    .forEach(function (s, j) { T(levG, 860, 165 + j * 30, s, "small", "middle"); });
  el("line", { x1: 785, y1: 145, x2: 935, y2: 345, stroke: BAD, "stroke-width": 2.5, opacity: 0.85 }, levG);

  var amyG = G(svg, { class: "part-amyloid" });
  el("rect", { x: 765, y: 120, width: 190, height: 360, rx: 10, class: "frame" }, amyG);
  T(amyG, 860, 148, "Amyloid fibril", "small", "middle");
  var amyStrands = [];
  for (var j = 0; j < 9; j++) {
    var y0 = 178 + j * 30;
    amyStrands.push(el("path", {
      d: "M805 " + (y0 - 6) + " H897 V" + (y0 - 12) + " L917 " + y0 + " L897 " + (y0 + 12) + " V" + (y0 + 6) + " H805 Z",
      fill: "#d6a44e", stroke: BAD, "stroke-width": 1.5
    }, amyG));
  }
  T(amyG, 860, 464, "Misfolded chains stack", "small", "middle");

  /* =====================================================================
   * Step 12 panels (absolute coordinates)
   * ===================================================================== */

  var TILE_X = [190, 500, 810];
  var tilesBack = G(svg);
  ["Corrector", "Stabilizer", "Protein medicines"].forEach(function (name, i) {
    el("rect", { x: TILE_X[i] - 140, y: 120, width: 280, height: 300, rx: 12, class: "frame" }, tilesBack);
    T(tilesBack, TILE_X[i], 108, name, "", "middle");
  });
  [["Helps a misfolded protein", "reach its fold (cystic fibrosis)"],
   ["Holds a protein's parts", "together (transthyretin)"],
   ["Cells make and fold", "insulin and antibodies"]].forEach(function (lines, i) {
    T(tilesBack, TILE_X[i], 446, lines[0], "small", "middle");
    T(tilesBack, TILE_X[i], 464, lines[1], "small", "middle");
  });

  // Tile A: a small funnel; a corrector drug frees the trapped chain.
  var tileA = G(tilesBack, { transform: "translate(190 300) scale(0.36) translate(-430 -330)" });
  groundInto(tileA);
  var tABall = el("circle", { r: 40, fill: "#262c33", stroke: "#cfa651", "stroke-width": 5 }, tileA);
  var tADrug = G(tileA);
  el("rect", { x: -26, y: -26, width: 52, height: 52, rx: 12, fill: "url(#g-drug)", stroke: "#7d7458", "stroke-width": 2 }, tADrug);

  // Tile B: a mirrored copy of the native fold (the live protein is the other half).
  var symG = G(defs, { id: "native-sym" });
  M.buildCartoon(symG, "solid").update(M.NAT);
  var tBCopy = el("use", { href: "#native-sym" }, tilesBack);
  var tBDrug = el("rect", { x: -9, y: -36, width: 18, height: 36, rx: 5, fill: "url(#g-drug)", stroke: "#7d7458" });

  // Tile C: a cell producing folded antibodies.
  var tileC = G(tilesBack);
  el("ellipse", { cx: 790, cy: 285, rx: 95, ry: 75, fill: "rgba(124,164,200,0.08)", stroke: "#7ca4c8", "stroke-width": 2 }, tileC);
  el("circle", { cx: 752, cy: 285, r: 26, fill: "rgba(124,164,200,0.1)", stroke: "#7ca4c8", "stroke-dasharray": "3 3" }, tileC);
  el("ellipse", { cx: 812, cy: 276, rx: 11, ry: 8, fill: "url(#g-steel)" }, tileC);
  el("ellipse", { cx: 812, cy: 288, rx: 9, ry: 5, fill: "url(#g-steel)" }, tileC);
  el("path", { d: "M823 280 c6 -8 10 6 16 -2 s8 8 14 0", fill: "none", stroke: "#e3b862", "stroke-width": 2 }, tileC);
  var Ys = [[905, 205], [930, 290], [905, 372]].map(function (end) {
    var g = G(tileC);
    el("path", { d: "M0 2 V20 M0 2 L-11 -11 M0 2 L11 -11", fill: "none", stroke: "#e3b862", "stroke-width": 5, "stroke-linecap": "round" }, g);
    el("path", { d: "M-11 -11 l-3 -3 M11 -11 l3 -3", fill: "none", stroke: "#efe6c4", "stroke-width": 5, "stroke-linecap": "round" }, g);
    return { g: g, end: end };
  });

  /* =====================================================================
   * Step 11: experiment and prediction (absolute coordinates)
   * ===================================================================== */

  var expG = G(svg);
  T(expG, 230, 140, "Experiment", "", "middle");
  el("line", { x1: 50, y1: 300, x2: 152, y2: 300, stroke: "#9cc3ef", "stroke-width": 3, opacity: 0.8 }, expG);
  T(expG, 56, 288, "X-rays", "small");
  [-70, -35, 0, 35, 70].forEach(function (dy) {
    el("line", { x1: 172, y1: 300, x2: 290, y2: 300 + dy * 1.3, stroke: "#9cc3ef", "stroke-width": 1, opacity: 0.5 }, expG);
  });
  el("polygon", { points: "160,284 178,278 190,292 186,314 168,322 156,306", fill: "rgba(156,195,239,0.35)", stroke: "#9cc3ef", "stroke-width": 1.5 }, expG);
  T(expG, 172, 346, "Crystal", "small", "middle");
  el("rect", { x: 290, y: 200, width: 110, height: 200, rx: 4, fill: "#262c33", stroke: "#5b6572" }, expG);
  var rx = M.rng(5);
  for (j = 0; j < 46; j++) {
    var a = rx() * Math.PI * 2, rr = 8 + rx() * 80;
    el("circle", { cx: 345 + Math.cos(a) * rr * 0.6, cy: 300 + Math.sin(a) * rr, r: 1 + rx() * 2.2, fill: "#dde4ea", opacity: 0.4 + rx() * 0.6 }, expG);
  }
  T(expG, 345, 424, "Diffraction pattern", "small", "middle");
  T(expG, 230, 462, "Months to years per structure", "cap", "middle");

  T(expG, 700, 70, M.SEQ, "small code", "middle");
  el("path", { d: "M700 80 V104 M694 96 L700 104 L706 96", class: "lead" }, expG);
  el("rect", { x: 595, y: 106, width: 210, height: 38, rx: 8, fill: "#343a42", stroke: "#9aa4af" }, expG);
  T(expG, 700, 131, "Structure prediction", "", "middle");
  T(expG, 815, 131, "Minutes", "cap");
  el("path", { d: "M700 146 V196 M694 188 L700 196 L706 188", class: "lead" }, expG);
  T(expG, 700, 468, "Solid: measured. Outline: predicted.", "small", "middle");

  /* =====================================================================
   * Step 1: messenger RNA and ribosome (absolute coordinates)
   * ===================================================================== */

  var synthG = G(svg);
  var X0 = M.LINE[0][0], X1 = M.LINE[N - 1][0];
  var mrna = G(synthG, { class: "part-mrna" });
  el("line", { x1: X0 - 30, y1: 372, x2: X1 + 24, y2: 372, stroke: "#c9b6e4", "stroke-width": 3 }, mrna);
  for (j = 0; j < N; j++) {
    var cx = M.LINE[j][0];
    el("path", { d: "M" + (cx - 5) + " 372 v7 M" + cx + " 372 v7 M" + (cx + 5) + " 372 v7", stroke: "#c9b6e4", "stroke-width": 1.5 }, mrna);
  }
  T(synthG, X1 + 32, 377, "mRNA", "small");
  var ribo = G(synthG, { class: "part-ribosome" });
  var riboLink = el("line", { stroke: "#a9b4bf", "stroke-width": 2, "stroke-dasharray": "3 3" }, synthG);
  el("ellipse", { cx: 0, cy: 342, rx: 26, ry: 19, fill: "url(#g-steel)" }, ribo);
  el("ellipse", { cx: 0, cy: 378, rx: 21, ry: 10, fill: "url(#g-steel)" }, ribo);
  T(ribo, 0, 410, "Ribosome", "small", "middle");
  var lblAA = G(synthG);
  lead(lblAA, X0, 291, X0 + 8, 318);
  T(lblAA, X0 + 4, 333, "Amino acid", "small");
  var letters = G(synthG);
  var letterEls = [];
  for (j = 0; j < N; j++) letterEls.push(T(letters, M.LINE[j][0], M.LINE[j][1] - 13, M.SEQ.charAt(j), "aa code", "middle"));

  /* =====================================================================
   * Step 6: denaturing conditions
   * ===================================================================== */

  var heatG = G(svg);
  el("rect", { x: 245, y: 150, width: 20, height: 240, rx: 10, fill: "#262c33", stroke: "#9aa4af" }, heatG);
  var heatFill = el("rect", { x: 249, width: 12, rx: 6, fill: "url(#g-heat)" }, heatG);
  T(heatG, 255, 134, "Heat or urea", "small", "middle");
  var stateText = T(svg, 500, 452, "", "cap", "middle");

  /* =====================================================================
   * The protein (its own coordinate space, moved as one group)
   * ===================================================================== */

  var pg = G(svg);
  var hbondG = G(pg, { class: "part-hbond" });
  var HB = [];
  for (j = 3; j <= 9; j++) HB.push([j, j + 3]);
  for (j = 0; j < 6; j++) HB.push([16 + j, 29 - j]);
  var hbLines = HB.map(function () {
    return el("line", { stroke: "#dde4ea", "stroke-width": 1.5, "stroke-dasharray": "3 3", opacity: 0.8 }, hbondG);
  });
  var chain = M.buildChain(pg, { r: 7 });
  var cartoon = M.buildCartoon(pg, "solid");
  var pocket = el("path", { fill: "none", stroke: ACCENT, "stroke-width": 2, "stroke-dasharray": "6 5", filter: "url(#glow)", class: "part-pocket" }, pg);

  var SEAT = M.POCKET_FLOOR;
  var chargesG = G(pg);
  charge(chargesG, 449, 243, "+");
  charge(chargesG, 551, 243, "+");

  var partner = G(pg, { class: "part-partner" });
  el("rect", { x: -44, y: -50, width: 88, height: 50, rx: 22, fill: "url(#g-partner)", stroke: "#6f5a92", "stroke-width": 1.2 }, partner);
  var partnerMarks = G(partner);
  charge(partnerMarks, -32, -25, "−");
  charge(partnerMarks, 32, -25, "−");

  var drugA = M.buildDrug(pg, 150, 56);
  var drugB = M.buildDrug(pg, 94, 54);
  var drugC = M.buildDrug(pg, 94, 54);
  [drugA, drugB, drugC].forEach(function (d) { d.body.dataset.stroke = "#7d7458"; d.body.dataset.sw = 1.2; });
  var bMarks = G(drugB.g), cMarks = G(drugC.g);
  charge(bMarks, -36, -27, "+"); charge(bMarks, 36, -27, "+");
  charge(cMarks, -36, -27, "−"); charge(cMarks, 36, -27, "−");

  // Predicted structure: same fold, except the flexible C-terminal tail.
  var PRED = M.NAT.map(function (p) { return p.slice(); });
  PRED[45] = [596, 192]; PRED[46] = [618, 196]; PRED[47] = [640, 206];
  var predG = G(pg);
  M.buildCartoon(predG, "outline").update(PRED);
  T(predG, 652, 214, "Low confidence", "small");

  // Labels in protein space
  var lbl3 = G(pg);
  lead(lbl3, 676, 290, 540, 290);
  T(lbl3, 682, 295, "Hydrophobic core", "small");
  lead(lbl3, 330, 210, 395, 210);
  T(lbl3, 326, 215, "Hydrophilic surface", "small", "end");

  var lbl4 = G(pg);
  lead(lbl4, 380, 240, 410, 240);
  T(lbl4, 376, 245, "Alpha helix", "", "end");
  T(lbl4, 498, 384, "Beta sheet", "", "middle");
  T(lbl4, 498, 404, "Hydrogen bonds (dashed)", "small", "middle");

  var lbl5 = G(pg);
  lead(lbl5, 372, 245, 406, 245);
  T(lbl5, 368, 250, "Helix", "", "end");
  T(lbl5, 498, 388, "Sheet", "", "middle");
  lead(lbl5, 640, 128, 626, 138);
  T(lbl5, 645, 128, "Loop", "");
  T(lbl5, 500, 176, "Pocket", "accent", "middle");

  /* =====================================================================
   * Overlays: tile drugs, funnel balls, chaperone, activity lamp
   * ===================================================================== */

  svg.appendChild(tBDrug);

  function makeBall(id) {
    var g = G(svg);
    var cp = el("clipPath", { id: id }, defs);
    el("circle", { r: 21 }, cp);
    var c = el("circle", { r: 24, fill: "#262c33", stroke: "#cfa651", "stroke-width": 2.5 }, g);
    var inner = G(g, { "clip-path": "url(#" + id + ")" });
    var pl = el("path", { fill: "none", stroke: "#e3b862", "stroke-width": 1.6, "stroke-linejoin": "round" }, inner);
    return { g: g, c: c, pl: pl };
  }
  var ball1 = makeBall("clip-b1"), ball2 = makeBall("clip-b2");
  ball2.g.classList.add("part-trap");
  function miniChain(ball, P) {
    var s = 0.075;
    ball.pl.setAttribute("d", M.smoothPath(P.map(function (p) { return [(p[0] - 500) * s, (p[1] - 265) * s]; })));
  }

  var chap = G(svg, { class: "part-chaperone" });
  el("rect", { x: -38, y: -30, width: 11, height: 58, rx: 4, fill: "url(#g-steel)" }, chap);
  el("rect", { x: 27, y: -30, width: 11, height: 58, rx: 4, fill: "url(#g-steel)" }, chap);
  el("rect", { x: -38, y: -42, width: 76, height: 13, rx: 6, fill: "url(#g-steel)" }, chap);
  T(chap, 46, -34, "Chaperone", "small");

  var lamp = G(svg);
  var lampDot = el("circle", { cx: 640, cy: 250, r: 9, filter: "url(#glow)" }, lamp);
  var lampText = T(lamp, 656, 255, "", "small");

  var summaryText = T(svg, 500, 470, "", "cap", "middle");
  var STAGES = ["Unfolded chain", "Hydrophobic collapse", "Helices and sheets form", "Native fold", "Drug bound in the pocket"];

  /* =====================================================================
   * Water (canvas)
   * ===================================================================== */

  var canvas = E.$("#water"), ctx = canvas.getContext("2d");
  var rw = M.rng(3), WATER = [];
  for (j = 0; j < 150; j++) WATER.push({ x: rw(), y: rw(), ph: rw() * 6.3, sp: 0.6 + rw(), dx: rw() - 0.5, dy: rw() - 0.5, a: rw() * 6.3 });
  var clock = 0;

  function drawWater(alpha) {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (alpha <= 0.001) return;
    WATER.forEach(function (p) {
      var x = ((p.x + clock * 0.006 * p.dx + 0.01 * Math.sin(clock * p.sp + p.ph)) % 1 + 1) % 1 * w;
      var y = ((p.y + clock * 0.006 * p.dy + 0.01 * Math.cos(clock * p.sp * 1.3 + p.ph)) % 1 + 1) % 1 * h;
      var a = p.a + Math.sin(clock * p.sp + p.ph) * 0.8;
      ctx.globalAlpha = alpha * 0.55;
      ctx.fillStyle = "#e4e8ec";
      for (var s = -1; s <= 1; s += 2) {
        ctx.beginPath();
        ctx.arc(x + 4.5 * Math.cos(a + s * 0.95), y + 4.5 * Math.sin(a + s * 0.95), 1.8, 0, 6.3);
        ctx.fill();
      }
      ctx.fillStyle = "#9cc3ef";
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, 6.3);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  /* =====================================================================
   * Camera
   * ===================================================================== */

  var BOX_WIDE = [
    [270, 70, 460, 400], [60, 60, 880, 440], [60, 60, 880, 440], [180, 60, 640, 420],
    [350, 165, 300, 260], [270, 80, 520, 380], [170, 60, 660, 430],
    [40, 15, 930, 530], [40, 15, 930, 530], [290, 60, 460, 400], [340, 40, 400, 330],
    [30, 20, 940, 520], [30, 70, 940, 430], [270, 70, 460, 400]
  ];
  var BOX_NARROW = [
    [300, 80, 400, 380], [90, 150, 820, 300], [90, 150, 820, 300], [250, 90, 500, 400],
    [370, 170, 250, 250], [330, 90, 360, 340], [230, 80, 460, 400],
    [60, 20, 700, 500], [370, 90, 600, 420], [330, 90, 360, 330], [350, 60, 360, 330],
    [30, 20, 940, 520], [30, 70, 940, 430], [300, 80, 400, 380]
  ];
  function keysFor(boxes) {
    var keys = [[0, boxes[0]]];
    for (var i = 1; i < boxes.length; i++) keys.push([i - 0.15, boxes[i - 1]], [i + 0.25, boxes[i]]);
    return keys;
  }
  var KEYS_WIDE = keysFor(BOX_WIDE), KEYS_NARROW = keysFor(BOX_NARROW);

  /* =====================================================================
   * Legend
   * ===================================================================== */

  var legendItems = Array.prototype.map.call(document.querySelectorAll("#legend span"), function (span) {
    var steps = {};
    span.dataset.steps.split(",").forEach(function (part) {
      var ab = part.split("-").map(Number);
      for (var s = ab[0]; s <= (ab.length > 1 ? ab[1] : ab[0]); s++) steps[s] = true;
    });
    return { span: span, steps: steps };
  });
  var legend = E.$("#legend");
  var legendStep = -1;

  /* =====================================================================
   * Render
   * ===================================================================== */

  function fitted(P, f) {
    if (f <= 0.001) return P;
    return P.map(function (p, i) {
      var w = clamp((300 - p[1]) / 100);
      if (i <= 12) return [p[0] + 5 * f * w, p[1]];
      if (i >= 35) return [p[0] - 5 * f * w, p[1]];
      return p;
    });
  }

  function pocketD(f) {
    var l = M.POCKET_LEFT + 5 * f, r = M.POCKET_RIGHT - 5 * f, b = SEAT, tp = M.POCKET_TOP;
    return "M" + l + " " + tp + " L" + l + " " + (b - 10) + " Q" + l + " " + b + " " + (l + 10) + " " + b +
      " L" + (r - 10) + " " + b + " Q" + r + " " + b + " " + r + " " + (b - 10) + " L" + r + " " + tp;
  }

  var heroPhase = 0.02;

  function render(t, dt, info) {
    // ----- time-driven parts: the hero loop and the water -----
    var looping = Math.max(1 - range(t, 0.3, 0.8), range(t, 12.9, 13.2));
    if (!info.reduceMotion) {
      if (looping > 0.01) heroPhase = (heroPhase + dt / 9) % 1;
      clock += dt;
    } else {
      heroPhase = 0.6;
    }
    var hp = M.heroPose(heroPhase), heroP = M.layoutAt(hp.s);

    // ----- camera -----
    var box = E.keyframes(t, info.narrow ? KEYS_NARROW : KEYS_WIDE);
    svg.setAttribute("viewBox", box.join(" "));
    var sr = svg.getBoundingClientRect();
    var scale = Math.min(sr.width / box[2], sr.height / box[3]) || 1;
    svg.style.setProperty("--z", ((info.narrow ? 0.85 : 1) / scale).toFixed(3));

    // ----- legend -----
    var step = clamp(Math.floor(t + 0.15), 0, 13);
    if (step !== legendStep) {
      legendItems.forEach(function (it) { it.span.classList.toggle("on", !!it.steps[step]); });
      legendStep = step;
    }
    legend.style.opacity = 1;

    // ----- chain shape -----
    var fit = Math.max(ease(range(t, 9.3, 9.45)) * (1 - ease(range(t, 9.85, 9.95))),
                       ease(range(t, 10.5, 10.6)) * (1 - range(t, 10.85, 10.95)));
    var P;
    if (t < 1) P = M.mix(heroP, M.LINE, ease(range(t, 0.3, 0.85)));
    else if (t < 2.85) P = M.LINE;
    else if (t < 3.95) P = M.mix(M.LINE, M.COLL, ease(range(t, 2.85, 3.6)));
    else if (t < 5.85) P = M.mix(M.COLL, M.NAT, ease(range(t, 3.95, 4.6)));
    else if (t < 6.3) P = M.mix(M.NAT, M.COIL, ease(range(t, 5.85, 6.25)));
    else if (t < 6.85) P = M.mix(M.COIL, M.NAT, ease(range(t, 6.3, 6.7)));
    else if (t < 8.85) P = M.mix(M.NAT, M.COIL, ease(range(t, 6.85, 7.05)));
    else if (t < 12.85) P = fitted(M.NAT, fit);
    else P = M.mix(M.NAT, heroP, ease(range(t, 12.85, 13.15)));

    // Water keeps the loose chain moving (steps 2 and 3).
    var jig = 3 * win(t, 1.85, 2.1, 3.6, 3.85);
    if (jig > 0) {
      P = P.map(function (p, i) {
        return [p[0] + jig * Math.sin(clock * 4 + i * 1.9), p[1] + jig * Math.cos(clock * 3.3 + i * 1.3)];
      });
    }

    // ----- bead or ribbon view -----
    var cart;
    if (t < 5.85) cart = ease(range(t, 4.45, 4.9));
    else if (t < 6.85) cart = clamp(1 - range(t, 5.85, 5.95) + range(t, 6.62, 6.75));
    else if (t < 8.85) cart = 1 - range(t, 6.85, 6.92);
    else if (t < 12.85) cart = 1;
    else cart = 1 - range(t, 12.85, 12.95);
    var beadVis = 1 - cart;

    // ----- bead colours -----
    var ribX = lerp(X0 - 30, X1 + 30, range(t, 0.95, 1.6));
    var cols = [], alphas = [];
    var ghost = ease(range(t, 0.4, 0.85)), tone = ease(range(t, 1.85, 2.2));
    for (var i = 0; i < N; i++) {
      if (t < 1.85) {
        var built = clamp((ribX - M.LINE[i][0]) / 16 + 0.5);
        var base = M.mixRGB(M.TONE[i], M.GHOST, ghost);
        cols.push(M.mixRGB(base, M.AA_COLOR[i], built));
        alphas.push(lerp(lerp(1, 0.22, ghost), 1, built));
        letterEls[i].style.opacity = built;
      } else {
        cols.push(M.mixRGB(M.AA_COLOR[i], M.TONE[i], tone));
        alphas.push(1);
      }
    }

    show(chain.g, beadVis);
    if (beadVis > 0.001) {
      chain.update(P, cols, alphas);
      chain.backbone.style.opacity = t < 1.85 ? lerp(1, 0.35, ghost) + 0.65 * range(t, 1.0, 1.6) : 1;
    }
    show(cartoon.g, cart);
    if (cart > 0.001) cartoon.update(P);

    // ----- protein group placement -----
    var X = 500, Y = 265, S = 1;
    if (t < 8.85) {
      var pIn = ease(range(t, 6.85, 7.05)), b1 = ballAt(150, 24);
      X = lerp(500, b1[0], pIn); Y = lerp(265, b1[1], pIn); S = lerp(1, 0.075, pIn);
    } else {
      var pOut = ease(range(t, 8.85, 9.05)), b2 = ballAt(FX, 24);
      X = lerp(b2[0], 500, pOut); Y = lerp(b2[1], 265, pOut); S = lerp(0.075, 1, pOut);
    }
    var sep = 26 * ease(range(t, 11.95, 12.12)) * (1 - ease(range(t, 12.3, 12.45)));
    var shake = jitter(t, 12.12, 12.25, 2);
    var m11 = ease(range(t, 10.85, 11.1)) * (1 - ease(range(t, 11.85, 12.05)));
    var m12 = ease(range(t, 11.85, 12.05)) * (1 - ease(range(t, 12.85, 13.05)));
    X += (700 - 500) * m11 + (460 - sep / 2 - shake - 500) * m12;
    Y += (330 - 265) * m11 + (285 - 265) * m12;
    S += (0.95 - 1) * m11 + (0.36 - 1) * m12;
    pg.setAttribute("transform", "translate(" + X.toFixed(2) + " " + Y.toFixed(2) + ") scale(" + S.toFixed(4) + ") translate(-500 -265)");
    show(pg, t < 8.85 ? 1 - range(t, 7.0, 7.08) : range(t, 8.85, 8.9));

    // ----- step 1: ribosome -----
    var synth = win(t, 0.85, 1.0, 1.85, 2.0);
    show(synthG, synth);
    if (synth > 0.001) {
      ribo.setAttribute("transform", "translate(" + ribX.toFixed(1) + " 0)");
      var k = clamp(Math.round((ribX - X0) / 16 - 0.5), 0, N - 1);
      riboLink.setAttribute("x1", ribX); riboLink.setAttribute("y1", 323);
      riboLink.setAttribute("x2", P[k][0]); riboLink.setAttribute("y2", P[k][1] + 7);
      riboLink.style.opacity = 1 - range(t, 1.55, 1.65);
      show(letters, info.narrow ? 0 : 1);
      show(lblAA, range(t, 1.25, 1.4));
    }

    // ----- water -----
    drawWater(win(t, 1.85, 2.1, 3.8, 4.0));

    // ----- hydrogen bonds -----
    var hb = win(t, 4.3, 4.55, 4.95, 5.15);
    show(hbondG, hb);
    if (hb > 0.001) {
      HB.forEach(function (pair, j) {
        var a = P[pair[0]], b = P[pair[1]];
        hbLines[j].setAttribute("x1", a[0]); hbLines[j].setAttribute("y1", a[1]);
        hbLines[j].setAttribute("x2", b[0]); hbLines[j].setAttribute("y2", b[1]);
      });
    }

    // ----- protein-space labels -----
    show(lbl3, win(t, 3.45, 3.65, 3.85, 4.0));
    show(lbl4, win(t, 4.3, 4.5, 4.95, 5.1));
    show(lbl5, win(t, 4.95, 5.2, 5.8, 5.9));

    // ----- pocket outline -----
    var pk = Math.max(win(t, 4.95, 5.2, 5.8, 5.9), win(t, 9.0, 9.2, 10.85, 10.95));
    show(pocket, pk);
    if (pk > 0.001) pocket.setAttribute("d", pocketD(fit));

    // ----- step 6: denaturing -----
    var dn = win(t, 5.8, 5.95, 6.8, 6.9);
    show(heatG, dn);
    var heat = ease(range(t, 5.85, 6.1)) * (1 - ease(range(t, 6.3, 6.55)));
    heatFill.setAttribute("y", 386 - 232 * heat);
    heatFill.setAttribute("height", Math.max(0, 232 * heat));
    show(stateText, dn);
    stateText.textContent = t < 5.95 ? "Native" : t < 6.5 ? "Unfolded (denatured)" : "Refolded";

    // ----- activity lamp -----
    var lampVis = Math.max(dn, win(t, 9.0, 9.15, 10.85, 10.95));
    show(lamp, lampVis);
    if (lampVis > 0.001) {
      var state;
      if (t < 7) state = t > 5.97 && t < 6.62 ? ["bad", "Inactive"] : ["ok", "Active"];
      else state = t < 9.4 ? ["idle", "No partner"] : t < 9.95 ? ["ok", "Active"] : t < 10.64 ? ["idle", "No partner"] : ["bad", "Blocked"];
      lampDot.setAttribute("fill", state[0] === "ok" ? OK : state[0] === "bad" ? BAD : "#5b6572");
      lampText.setAttribute("class", "small " + (state[0] === "idle" ? "" : state[0]));
      lampText.textContent = state[1];
    }

    // ----- steps 9 and 10: partner and drugs -----
    var chg = win(t, 10.0, 10.12, 10.8, 10.9);
    show(chargesG, chg);
    partnerMarks.style.opacity = chg; bMarks.style.opacity = chg; cMarks.style.opacity = chg;

    var py, pop;
    if (t < 10.5) {
      py = SEAT - (1 - ease(range(t, 9.1, 9.35))) * 190 - ease(range(t, 9.85, 10.0)) * 190;
      pop = range(t, 9.08, 9.15) * (1 - range(t, 9.92, 10.0));
    } else {
      py = SEAT - 54 - (1 - ease(range(t, 10.55, 10.66))) * 190;
      pop = range(t, 10.53, 10.6) * (1 - range(t, 10.85, 10.95));
    }
    show(partner, pop);
    translate(partner, 500 + jitter(t, 10.66, 10.8, 3), py);

    var ay = 188 - (1 - ease(range(t, 9.98, 10.1))) * 190 - ease(range(t, 10.18, 10.26)) * 190;
    show(drugA.g, range(t, 9.96, 10.0) * (1 - range(t, 10.22, 10.26)));
    translate(drugA.g, 500 + jitter(t, 10.1, 10.18, 4), ay);
    outline(drugA.body, BAD, win(t, 10.1, 10.12, 10.18, 10.2));

    var by = 236 - (1 - ease(range(t, 10.24, 10.34))) * 190 - ease(range(t, 10.4, 10.47)) * 190;
    show(drugB.g, range(t, 10.22, 10.26) * (1 - range(t, 10.44, 10.47)));
    translate(drugB.g, 500 + jitter(t, 10.34, 10.4, 4), by);
    outline(drugB.body, BAD, win(t, 10.34, 10.36, 10.4, 10.42));

    var cy, cop;
    if (t < 1 || t > 12.85) {
      cy = SEAT - (1 - hp.drug) * 170;
      cop = Math.min(1, hp.drug * 3) * (t < 1 ? 1 - range(t, 0.3, 0.6) : range(t, 13.0, 13.15));
    } else {
      cy = SEAT - (1 - E.easeOutBack(range(t, 10.44, 10.56), 0.6)) * 190;
      cop = range(t, 10.42, 10.46) * (1 - range(t, 10.85, 10.95));
    }
    show(drugC.g, cop);
    translate(drugC.g, 500, cy);
    outline(drugC.body, OK, win(t, 10.56, 10.6, 10.8, 10.85));

    // ----- step 11: prediction -----
    show(expG, win(t, 10.95, 11.15, 11.85, 11.95));
    show(predG, range(t, 11.1, 11.2) * (1 - range(t, 11.85, 11.95)));
    predG.setAttribute("transform", "translate(0 " + (-(1 - ease(range(t, 11.15, 11.45))) * 140).toFixed(1) + ")");

    // ----- steps 7 and 8: funnel -----
    var fun = range(t, 6.9, 7.05) * (1 - range(t, 8.85, 9.0));
    show(funnelG, fun);
    lblUnfolded.style.opacity = range(t, 7.05, 7.15);
    show(lblTrap, win(t, 8.15, 8.25, 8.85, 9.0));
    show(levG, info.narrow ? 0 : win(t, 7.25, 7.45, 7.85, 7.95));
    show(amyG, range(t, 8.1, 8.18) * (1 - range(t, 8.85, 9.0)));
    amyStrands.forEach(function (s, j) {
      var a = range(t, 8.15 + j * 0.025, 8.22 + j * 0.025);
      s.style.opacity = a;
      s.setAttribute("transform", "translate(" + (-24 * (1 - a)).toFixed(1) + " 0)");
    });

    show(ball1.g, range(t, 7.0, 7.08) * (1 - range(t, 8.85, 9.0)));
    var roll = ease(range(t, 7.15, 7.55));
    var c1 = ballAt(lerp(150, FX, roll), 24);
    translate(ball1.g, c1[0], c1[1]);
    miniChain(ball1, M.mix(M.COIL, M.NAT, roll));

    // Second chain: falls into the trap, a chaperone lifts it out, it folds.
    show(ball2.g, range(t, 7.85, 7.9) * (1 - range(t, 8.85, 9.0)));
    var x2, lift = 0, pl = range(t, 8.5, 8.6);
    if (t < 8.5) x2 = lerp(718, XPIT, E.easeOutBack(range(t, 7.88, 8.15), 0.8));
    else if (t < 8.6) { x2 = lerp(XPIT, 548, ease(pl)); lift = 50 * Math.sin(Math.PI * pl); }
    else x2 = lerp(548, FX, ease(range(t, 8.6, 8.75)));
    var c2 = ballAt(x2, 24);
    c2[1] -= lift;
    translate(ball2.g, c2[0], c2[1]);
    var trapped = win(t, 8.12, 8.2, 8.5, 8.56);
    ball2.c.setAttribute("stroke", trapped > 0.5 ? BAD : "#cfa651");
    ball2.c.setAttribute("stroke-width", 2.5 + trapped);
    miniChain(ball2, M.mix(M.COLL, M.NAT, ease(range(t, 8.6, 8.75))));

    var chIn = ease(range(t, 8.38, 8.5)), chOut = ease(range(t, 8.6, 8.7));
    show(chap, range(t, 8.36, 8.42) * (1 - chOut));
    translate(chap, c2[0], c2[1] - (1 - chIn) * 120 - chOut * 120);

    // ----- step 12: panels -----
    var tiles = win(t, 11.85, 12.0, 12.85, 12.95);
    show(tilesBack, tiles);
    show(tBDrug, tiles * range(t, 12.12, 12.17));
    if (tiles > 0.001) {
      // A: corrector
      var pA = ease(range(t, 12.12, 12.45)), r40 = 40;
      var ax2 = lerp(XPIT, FX, pA);
      var ca = ballAt(ax2, r40);
      ca[1] -= 60 * Math.sin(Math.PI * pA);
      tABall.setAttribute("cx", ca[0]); tABall.setAttribute("cy", ca[1]);
      tABall.setAttribute("stroke", t < 12.1 ? BAD : "#cfa651");
      var dIn = ease(range(t, 11.95, 12.1));
      translate(tADrug, ca[0], ca[1] - r40 - 26 - (1 - dIn) * 160);
      tADrug.style.opacity = range(t, 11.95, 12.0);
      // B: stabilizer copy and drug
      var cs = 0.36;
      tBCopy.setAttribute("transform", "translate(" + (540 + sep / 2 + shake).toFixed(2) + " 285) scale(" + -cs + " " + cs + ") translate(-500 -265)");
      translate(tBDrug, 500, lerp(150, 300, ease(range(t, 12.15, 12.3))));
      // C: antibodies leave the cell
      Ys.forEach(function (y, j) {
        var p = ease(range(t, 11.95 + j * 0.12, 12.3 + j * 0.12));
        y.g.setAttribute("transform", "translate(" + lerp(830, y.end[0], p).toFixed(1) + " " + lerp(282, y.end[1], p).toFixed(1) + ") scale(" + lerp(0.3, 1, p).toFixed(3) + ")");
        y.g.style.opacity = range(t, 11.95 + j * 0.12, 12.0 + j * 0.12);
      });
    }

    // ----- summary -----
    show(summaryText, range(t, 13.05, 13.2));
    summaryText.textContent = STAGES[hp.stage];
  }

  E.start(render);
})();
