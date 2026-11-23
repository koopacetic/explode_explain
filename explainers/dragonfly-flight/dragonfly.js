/* Dragonfly flight: shared drawing code for the page (scenes.js) and the
 * gallery card (hero.js).
 *
 *   Dragonfly.addDefs(svg)       hatching, gradients and glow filters
 *   Dragonfly.buildTopView(g)    dragonfly seen from above, four wings
 *   Dragonfly.topKin(phase)      wing pose seen from above for a phase 0..1
 *   Dragonfly.FORE / .HIND       wing outlines, root at (0,0), tip towards +x,
 *                                leading edge towards -y
 */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var TAU = Math.PI * 2, DEG = Math.PI / 180;

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  var D = (window.Dragonfly = { el: el, TAU: TAU, DEG: DEG });

  // Colour roles: warm amber = wings (what moves), cool steel = body (fixed),
  // pale nickel = air (what the wing works on).
  D.WING_EDGE = "#c9953d";
  D.WING_FILL = "rgba(226, 180, 92, 0.22)";
  D.WING_LIGHT = "#ecc86d";
  D.WING_DARK = "#b58a2e";
  D.AIR = "#e6dcb6";
  D.ACCENT = "#e2b955";
  D.OK = "#7fd49b";
  D.BAD = "#ee6b6b";
  D.TEXT = "#e4e8ec";
  D.MUTED = "#9aa4af";
  D.VOID = "#262c33";

  D.FORE = "M0 -7 C50 -13 140 -17 192 -12 C204 -10 208 -2 204 4 C198 12 170 16 130 18 C80 20 34 18 12 12 C4 9 0 4 0 0 Z";
  D.HIND = "M0 -7 C50 -13 130 -17 182 -12 C194 -10 198 -2 194 4 C186 14 150 22 110 28 C70 34 34 40 16 34 C6 28 0 12 0 0 Z";
  var VEINS = {
    fore: ["M0 -7 C50 -13 140 -17 192 -12", "M2 -3 C60 -8 140 -11 198 -5", "M4 3 C60 4 120 6 200 2", "M6 8 C50 12 100 14 150 15"],
    hind: ["M0 -7 C50 -13 130 -17 182 -12", "M2 -3 C60 -8 130 -10 188 -5", "M4 4 C60 6 120 8 190 3", "M6 12 C40 20 80 24 120 25", "M8 22 C20 30 40 34 60 33"]
  };
  var STIGMA = { fore: [158, -15.5], hind: [148, -15.5] };
  var NODUS = { fore: [96, -15.5], hind: [84, -15] };

  function hatch(defs, id, angle, color) {
    var p = el("pattern", { id: id, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(" + angle + ")" }, defs);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: color, "stroke-width": 1.4 }, p);
  }
  function grad(defs, id, stops, horizontal) {
    var g = el("linearGradient", { id: id, x1: 0, y1: 0, x2: horizontal ? 1 : 0, y2: horizontal ? 0 : 1 }, defs);
    stops.forEach(function (s) { el("stop", { offset: s[0], "stop-color": s[1] }, g); });
  }

  D.addDefs = function (svg) {
    var defs = el("defs", {}, svg);
    hatch(defs, "df-hatch-wing", -45, "rgba(80, 55, 10, 0.45)");
    hatch(defs, "df-hatch-body", 45, "rgba(30, 36, 44, 0.55)");
    var v = el("pattern", { id: "df-veins", width: 9, height: 7, patternUnits: "userSpaceOnUse", patternTransform: "rotate(8)" }, defs);
    el("path", { d: "M0 0H9M0 0V7", stroke: "rgba(236, 200, 109, 0.3)", "stroke-width": 0.7, fill: "none" }, v);
    grad(defs, "df-g-wing", [["0", "#ecc86d"], ["1", "#a87f2a"]]);
    grad(defs, "df-g-steel", [["0", "#8e99a5"], ["1", "#5b6572"]]);
    grad(defs, "df-g-body", [["0", "#4a535e"], ["0.45", "#a3adb8"], ["1", "#4a535e"]], true);
    grad(defs, "df-g-muscle", [["0", "#e09a7c"], ["1", "#8f4a39"]]);
    var eye = el("radialGradient", { id: "df-g-eye", cx: 0.38, cy: 0.35, r: 0.7 }, defs);
    el("stop", { offset: 0, "stop-color": "#c9d2da" }, eye);
    el("stop", { offset: 1, "stop-color": "#4f5965" }, eye);

    var f = el("filter", { id: "glow", x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
    el("feGaussianBlur", { stdDeviation: 3, result: "b" }, f);
    var m = el("feMerge", {}, f);
    el("feMergeNode", { in: "b" }, m);
    el("feMergeNode", { in: "SourceGraphic" }, m);

    var fl = el("filter", { id: "glow-lit", x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
    el("feGaussianBlur", { in: "SourceAlpha", stdDeviation: 4, result: "b" }, fl);
    el("feFlood", { "flood-color": D.ACCENT, "flood-opacity": 0.9 }, fl);
    el("feComposite", { in2: "b", operator: "in", result: "g" }, fl);
    var ml = el("feMerge", {}, fl);
    el("feMergeNode", { in: "g" }, ml);
    el("feMergeNode", { in: "SourceGraphic" }, ml);
    return defs;
  };

  // How close the wing is to a stroke reversal, where it flips (0..1).
  D.flipness = function (phase) {
    var p = ((phase % 1) + 1) % 1;
    var d = Math.min(p, 1 - p, Math.abs(p - 0.5));
    return Math.exp(-d * d / (2 * 0.045 * 0.045));
  };

  // Wing pose seen from above. Phase 0 = top of the stroke, wing raised and
  // swept back; 0.5 = bottom of the stroke, lowered and swept forward.
  D.topKin = function (phase) {
    var c = Math.cos(TAU * phase), s = Math.sin(TAU * phase);
    var elev = 5 + 35 * c;            // degrees above horizontal
    var sweep = -12 * c - 6 * s;      // degrees, positive = towards the head
    return {
      elev: elev,
      sweep: sweep,
      span: Math.max(0.15, Math.cos(elev * DEG)),
      chord: 1 - 0.6 * D.flipness(phase)
    };
  };

  // One wing in its own coordinates. With fixed = true the vein strokes keep
  // their width when the wing is scaled up.
  D.drawWing = function (g, name, fixed) {
    var path = name === "fore" ? D.FORE : D.HIND;
    var nss = fixed ? { "vector-effect": "non-scaling-stroke" } : {};
    function a(o) { for (var k in nss) o[k] = nss[k]; return o; }
    el("path", { d: path, fill: D.WING_FILL }, g);
    el("path", { d: path, fill: "url(#df-veins)" }, g);
    VEINS[name].forEach(function (d, i) {
      el("path", a({ d: d, fill: "none", stroke: i === 0 ? D.WING_EDGE : "rgba(201,149,61,0.7)", "stroke-width": i === 0 ? 1.6 : 0.8 }), g);
    });
    el("path", a({ d: path, fill: "none", stroke: D.WING_EDGE, "stroke-width": 1.2 }), g);
    var st = STIGMA[name], nd = NODUS[name];
    el("rect", a({ x: st[0], y: st[1], width: 20, height: 5, rx: 1, fill: "#5a4520", stroke: D.WING_EDGE, "stroke-width": 0.8, class: "part-pterostigma" }), g);
    el("circle", { cx: nd[0], cy: nd[1] + 1, r: 2.4, fill: D.WING_LIGHT, class: "part-nodus" }, g);
  };

  // A dragonfly seen from above, head up, centred on x = 500.
  D.buildTopView = function (parent) {
    var g = el("g", { class: "df-top" }, parent);
    var trailG = el("g", {}, g);
    var hindG = el("g", {}, g);
    var foreG = el("g", {}, g);
    var bodyG = el("g", { class: "part-body" }, g);

    var wings = [
      { name: "hind", side: 1, root: [522, 184], L: 196 },
      { name: "hind", side: -1, root: [478, 184], L: 196 },
      { name: "fore", side: 1, root: [522, 144], L: 206 },
      { name: "fore", side: -1, root: [478, 144], L: 206 }
    ];
    wings.forEach(function (w) {
      w.g = el("g", { class: "part-wing part-" + w.name + "wing" }, w.name === "fore" ? foreG : hindG);
      D.drawWing(w.g, w.name);

      // Path of the wing tip over one beat (fixed), and the tip itself.
      var pts = [];
      for (var i = 0; i <= 48; i++) pts.push(tipOf(w, D.topKin(i / 48)));
      w.trail = el("path", {
        d: "M" + pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L") + " Z",
        fill: "none", stroke: "rgba(236, 200, 109, 0.5)", "stroke-width": 1.5, "stroke-dasharray": "3 4", class: "df-trail"
      }, trailG);
      w.tip = el("circle", { r: 3.5, fill: D.WING_LIGHT, class: "df-trail" }, trailG);
    });

    // Abdomen, ten segments
    el("path", { d: "M491 206 L492 470 Q493 512 500 524 Q507 512 508 470 L509 206 Z", fill: "url(#df-g-body)", stroke: "#3a424c", "stroke-width": 1 }, bodyG);
    for (var k = 1; k < 10; k++) {
      var y = 206 + k * 31;
      el("line", { x1: 491.5, y1: y, x2: 508.5, y2: y, stroke: "#3a424c", "stroke-width": 1.2 }, bodyG);
    }
    el("path", { d: "M494 524 L489 540 M506 524 L511 540", stroke: "#6f7a86", "stroke-width": 2, "stroke-linecap": "round", fill: "none" }, bodyG);
    // Thorax
    el("ellipse", { cx: 500, cy: 165, rx: 29, ry: 46, fill: "url(#df-g-body)", stroke: "#3a424c", "stroke-width": 1 }, bodyG);
    el("path", { d: "M500 125 V205", stroke: "rgba(30,36,44,0.4)", "stroke-width": 1 }, bodyG);
    // Head: two large compound eyes
    el("ellipse", { cx: 500, cy: 118, rx: 13, ry: 7, fill: "#6f7a86" }, bodyG);
    el("circle", { cx: 485, cy: 100, r: 19, fill: "url(#df-g-eye)", stroke: "#3a424c", "stroke-width": 1 }, bodyG);
    el("circle", { cx: 515, cy: 100, r: 19, fill: "url(#df-g-eye)", stroke: "#3a424c", "stroke-width": 1 }, bodyG);

    function tipOf(w, k) {
      var r = w.L * k.span, a = k.sweep * DEG;
      return [w.root[0] + w.side * r * Math.cos(a), w.root[1] - r * Math.sin(a)];
    }

    return {
      g: g,
      wings: wings,
      // phF, phH: phase of the forewings and hindwings (0..1)
      update: function (phF, phH) {
        wings.forEach(function (w) {
          var k = D.topKin(w.name === "fore" ? phF : phH);
          w.g.setAttribute("transform", "translate(" + w.root[0] + " " + w.root[1] + ") rotate(" + (-w.side * k.sweep).toFixed(2) +
            ") scale(" + (w.side * k.span).toFixed(3) + " " + k.chord.toFixed(3) + ")");
          var tp = tipOf(w, k);
          w.tip.setAttribute("cx", tp[0].toFixed(1));
          w.tip.setAttribute("cy", tp[1].toFixed(1));
        });
      }
    };
  };
})();
