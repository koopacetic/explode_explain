/* Heart and circulation: the shared body model.
 *
 * Used by the page (scenes.js) and by the gallery card (hero.js).
 *
 * The body is seen from the side, facing right, and built from bones: torso,
 * neck (ending at the centre of the head), thigh, shin, foot and one arm. A
 * pose is a hip position plus one angle per bone, so standing, sitting and
 * lying are just different numbers, and any pose in between can be drawn.
 *
 * Every vessel is a list of points given relative to a bone as (bone, u, v):
 * u runs along the bone from 0 to 1, v is a sideways offset in drawing units.
 * Because vessels are attached to bones, they bend with the body: the leg
 * veins kink at the knee and hip when the figure sits down. Positions used by
 * the scenes (heart, head, ankle, a clot in the calf vein) come from the same
 * model, so labels and moving parts always stay on the body.
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
  function lerp(a, b, p) { return a + (b - a) * p; }
  function f1(v) { return v.toFixed(1); }

  var ART = "#c4473f", ART_P = "#e0675c";      // oxygen-rich: vessel, cells
  var VEIN = "#5f86b3", VEIN_P = "#9cc0e6";    // oxygen-poor: vessel, cells
  var SKIN_OUT = "#6f7a86", SKIN = "#39414a";  // the body outline (fixed)

  var LEN = { torso: 170, neck: 58, thigh: 120, shin: 115, foot: 40, upper: 76, fore: 70 };
  var HEAD_R = 32;
  var CM = 2.8; // drawing units per centimetre of a real adult (175 cm tall)

  // Angles in degrees, screen coordinates: 0 points right, 90 points down.
  var POSES = {
    stand: { hx: 360, hy: 280, torso: -90, neck: -88, thigh: 90, shin: 90, ankle: 0, arm: 96, fore: 98 },
    sit:   { hx: 360, hy: 400, torso: -94, neck: -86, thigh: 0, shin: 90, ankle: 0, arm: 72, fore: 14 },
    lie:   { hx: 430, hy: 440, torso: -180, neck: -180, thigh: 0, shin: 0, ankle: 0, arm: 0, fore: 0 }
  };

  function mixPose(a, b, p) {
    var out = {};
    for (var k in a) out[k] = lerp(a[k], b[k], p);
    return out;
  }

  function dirv(a) { var r = a * Math.PI / 180; return [Math.cos(r), Math.sin(r)]; }

  // Point on a bone: along by u (0..1), sideways by v. The sideways direction
  // is the bone direction turned 90 degrees: for the torso it is the front of
  // the body, for the thigh and shin it is the back (the calf side), for the
  // foot it is the sole.
  function atBone(b, u, v) {
    return [b.o[0] + b.d[0] * u * b.L - b.d[1] * v, b.o[1] + b.d[1] * u * b.L + b.d[0] * v];
  }

  function resolve(p) {
    var B = {};
    function bone(name, o, ang) {
      var d = dirv(ang);
      B[name] = { o: o, d: d, L: LEN[name], ang: ang };
      return [o[0] + d[0] * LEN[name], o[1] + d[1] * LEN[name]];
    }
    var hip = [p.hx, p.hy];
    var sh = bone("torso", hip, p.torso);
    var head = bone("neck", sh, p.neck);
    var knee = bone("thigh", hip, p.thigh);
    var ankle = bone("shin", knee, p.shin);
    var toe = bone("foot", ankle, p.shin - 90 + p.ankle);
    var shoulder = atBone(B.torso, 0.9, 0);
    var elbow = bone("upper", shoulder, p.arm);
    var wrist = bone("fore", elbow, p.fore);
    return { B: B, hip: hip, sh: sh, head: head, knee: knee, ankle: ankle, toe: toe, shoulder: shoulder, elbow: elbow, wrist: wrist };
  }

  /* ---------- Vessels ---------- */

  var VESSELS = {
    // Left ventricle -> aortic arch -> descending aorta -> leg artery -> foot
    artDown: { kind: "art", pts: [["torso", .70, 16], ["torso", .79, 20], ["torso", .86, 15], ["torso", .885, 5], ["torso", .86, -7],
      ["torso", .78, -15], ["torso", .55, -18], ["torso", .25, -18], ["torso", .06, -12], ["thigh", .1, -9], ["thigh", .5, -10],
      ["thigh", .88, -4], ["shin", .08, 8], ["shin", .5, 4], ["shin", .9, -1], ["foot", .25, 3], ["foot", .72, 2]] },
    // Foot -> deep leg vein -> inferior vena cava -> right atrium
    veinUp: { kind: "vein", pts: [["foot", .72, -3], ["foot", .25, -3], ["shin", .92, 5], ["shin", .5, 12], ["shin", .1, 13],
      ["thigh", .9, 9], ["thigh", .5, 3], ["thigh", .1, 2], ["torso", .06, -3], ["torso", .3, -7], ["torso", .55, -5],
      ["torso", .64, 4], ["torso", .68, 9]] },
    // Top of the arch -> carotid artery -> brain
    artUp: { kind: "art", pts: [["torso", .875, 9], ["torso", .95, 8], ["neck", .3, 8], ["neck", .75, 6], ["neck", 1.1, 4], ["neck", 1.3, -2]] },
    // Brain -> jugular vein -> superior vena cava -> right atrium
    veinDown: { kind: "vein", pts: [["neck", 1.25, -9], ["neck", .8, -8], ["neck", .3, -6], ["torso", .95, -2], ["torso", .84, 3], ["torso", .74, 9]] },
    // Right ventricle -> lungs
    pulmOut: { kind: "vein", pts: [["torso", .69, 8], ["torso", .74, -2], ["torso", .8, -14], ["torso", .86, -22]] },
    // Lungs -> left atrium
    pulmIn: { kind: "art", pts: [["torso", .84, -28], ["torso", .74, -30], ["torso", .66, -22], ["torso", .65, -8], ["torso", .68, 6]] }
  };
  var ORDER = ["pulmOut", "pulmIn", "veinUp", "veinDown", "artDown", "artUp"];

  // Smooth curve through points (Catmull-Rom), returned as a dense polyline.
  function sample(pts, k) {
    var out = [], n = pts.length;
    for (var i = 0; i < n - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      for (var j = 0; j < k; j++) {
        var s = j / k, s2 = s * s, s3 = s2 * s, q = [0, 0];
        for (var c = 0; c < 2; c++) {
          q[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * s + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * s2 +
            (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * s3);
        }
        out.push(q);
      }
    }
    out.push(pts[n - 1]);
    return out;
  }
  function lengths(poly) {
    var cl = [0];
    for (var i = 1; i < poly.length; i++) {
      cl.push(cl[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
    }
    return cl;
  }
  function pointAt(poly, cl, f) {
    var L = cl[cl.length - 1], s = Math.min(1, Math.max(0, f)) * L;
    var lo = 0, hi = cl.length - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cl[mid] < s) lo = mid; else hi = mid; }
    var seg = cl[hi] - cl[lo] || 1, p = (s - cl[lo]) / seg;
    return [lerp(poly[lo][0], poly[hi][0], p), lerp(poly[lo][1], poly[hi][1], p)];
  }
  function polyD(poly) {
    var d = "M" + f1(poly[0][0]) + " " + f1(poly[0][1]);
    for (var i = 1; i < poly.length; i++) d += " L" + f1(poly[i][0]) + " " + f1(poly[i][1]);
    return d;
  }

  // Heart outline, apex down, about 2 units across.
  var HEART_D = "M0 0.95 C-0.25 0.72 -1 0.3 -1 -0.25 C-1 -0.78 -0.42 -0.98 0 -0.55 C0.42 -0.98 1 -0.78 1 -0.25 C1 0.3 0.25 0.72 0 0.95 Z";

  function addDefs(svg) {
    if (svg.querySelector("#g-muscle")) return svg.querySelector("defs");
    var defs = svg.querySelector("defs") || el("defs", {}, svg);
    defs.innerHTML +=
      '<linearGradient id="g-muscle" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d98d6e"/><stop offset="1" stop-color="#8f4a39"/></linearGradient>' +
      '<linearGradient id="g-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8e99a5"/><stop offset="0.45" stop-color="#dde4ea"/><stop offset="1" stop-color="#87929e"/></linearGradient>' +
      '<pattern id="hatch-muscle" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,0.16)" stroke-width="1.3"/></pattern>' +
      '<pattern id="hatch-steel" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,0.14)" stroke-width="1.3"/></pattern>' +
      '<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '<filter id="glow-lit" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#f3d27a" flood-opacity="1"/><feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#e2b955" flood-opacity="0.7"/></filter>' +
      '<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="13" markerHeight="13" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#9aa4af"/></marker>';
    return defs;
  }

  /* ---------- Building and drawing a body ---------- */

  function build(parent) {
    var root = el("g", {}, parent);
    var outG = el("g", {}, root), inG = el("g", {}, root);

    var CAPS = [["torso", 78], ["neck", 30], ["thigh", 46], ["shin", 34], ["foot", 18]];
    var caps = CAPS.map(function (c) {
      return {
        name: c[0], w: c[1],
        out: el("line", { stroke: SKIN_OUT, "stroke-width": c[1] + 4, "stroke-linecap": "round" }, outG),
        fill: el("line", { stroke: SKIN, "stroke-width": c[1], "stroke-linecap": "round" }, inG)
      };
    });
    var headOut = el("circle", { r: HEAD_R + 2, fill: SKIN_OUT }, outG);
    var headIn = el("circle", { r: HEAD_R, fill: SKIN }, inG);
    var calfOut = el("ellipse", { rx: 40, ry: 16, fill: SKIN_OUT }, outG);
    var calfIn = el("ellipse", { rx: 38, ry: 14, fill: SKIN }, inG);

    // The near arm, with its own outline so it reads as in front.
    var armG = el("g", { opacity: 0.85 }, root);
    var arm = [["upper", 20], ["fore", 17]].map(function (c) {
      return {
        name: c[0],
        out: el("line", { stroke: SKIN_OUT, "stroke-width": c[1] + 3, "stroke-linecap": "round" }, armG),
        fill: el("line", { stroke: "#3e4650", "stroke-width": c[1], "stroke-linecap": "round" }, armG)
      };
    });

    var lungs = el("ellipse", { rx: 40, ry: 27, fill: "rgba(156,192,230,0.07)", stroke: "#7d8896", "stroke-width": 1.2, "stroke-dasharray": "4 4", class: "part-lung" }, root);
    var brain = el("ellipse", { rx: 22, ry: 23, fill: "rgba(226,185,85,0.06)", stroke: "#7d8896", "stroke-width": 1.2, "stroke-dasharray": "4 4", class: "part-brain" }, root);
    var calfMuscle = el("ellipse", { rx: 34, ry: 11, fill: "url(#g-muscle)", class: "part-calf" }, root);

    var vesG = el("g", { "stroke-linecap": "round", "stroke-linejoin": "round", fill: "none" }, root);
    var cellG = el("g", {}, root);
    var vessels = {};
    var standJ = resolve(POSES.stand);
    ORDER.forEach(function (name) {
      var v = VESSELS[name];
      var cls = "part-" + name + (v.kind === "art" ? " part-art" : " part-vein") +
        ((name === "pulmOut" || name === "pulmIn") ? " part-pulm" : " part-sys") + (name === "veinUp" ? " part-legvein part-pool" : "");
      var path = el("path", { stroke: v.kind === "art" ? ART : VEIN, "stroke-width": 5, class: cls }, vesG);
      var poly = sample(v.pts.map(function (q) { return atBone(standJ.B[q[0]], q[1], q[2]); }), 8);
      var L0 = lengths(poly);
      L0 = L0[L0.length - 1];
      var n = Math.max(3, Math.round(L0 / 22));
      var cells = [];
      for (var i = 0; i < n; i++) {
        cells.push({ phase: (i + 0.3 * Math.sin(i * 12.9898)) / n, c: el("circle", { r: 2.8, fill: v.kind === "art" ? ART_P : VEIN_P }, cellG) });
      }
      vessels[name] = { def: v, path: path, L0: L0, travel: 0, cells: cells, poly: poly, cl: lengths(poly) };
    });

    var heart = el("path", { d: HEART_D, fill: "url(#g-muscle)", stroke: "#5c2f26", "stroke-width": 0.08, class: "part-heart" }, root);

    var api = { g: root, lungs: lungs, brain: brain, heart: heart, J: standJ, vessels: vessels };

    api.at = function (bone, u, v) { return atBone(api.J.B[bone], u, v); };
    api.pointOn = function (name, f) { var V = vessels[name]; return pointAt(V.poly, V.cl, f); };
    // Fraction along a vessel nearest to a point.
    api.fracNear = function (name, pt) {
      var V = vessels[name], best = 1e9, bi = 0;
      V.poly.forEach(function (q, i) { var d = Math.hypot(q[0] - pt[0], q[1] - pt[1]); if (d < best) { best = d; bi = i; } });
      return V.cl[bi] / V.cl[V.cl.length - 1];
    };

    /* state:
     *   pose      a pose object (see POSES and mixPose)
     *   dt        seconds since the last frame (drives the moving cells)
     *   flow      overall flow speed (1 = resting)
     *   legFlow   extra factor for the leg veins (sitting slows them)
     *   pool      0..1, leg veins swollen with pooled blood
     *   beat      0..1, heart contraction
     *   calf      0..1, show the calf muscle; squeeze 0..1 contracts it
     *   swell     0..1, swollen ankles
     *   dim       optional {vesselName: opacity}
     */
    api.update = function (s) {
      var J = api.J = resolve(s.pose);
      var B = J.B;

      caps.forEach(function (c) {
        var b = B[c.name];
        var a = b.o, z = [b.o[0] + b.d[0] * b.L, b.o[1] + b.d[1] * b.L];
        var w = c.w * (c.name === "foot" ? 1 + 0.35 * (s.swell || 0) : 1);
        [c.out, c.fill].forEach(function (ln, k) {
          ln.setAttribute("x1", f1(a[0])); ln.setAttribute("y1", f1(a[1]));
          ln.setAttribute("x2", f1(z[0])); ln.setAttribute("y2", f1(z[1]));
          ln.setAttribute("stroke-width", f1(w + (k === 0 ? 4 : 0)));
        });
      });
      [headOut, headIn].forEach(function (c) { c.setAttribute("cx", f1(J.head[0])); c.setAttribute("cy", f1(J.head[1])); });
      arm.forEach(function (c) {
        var b = B[c.name], z = [b.o[0] + b.d[0] * b.L, b.o[1] + b.d[1] * b.L];
        [c.out, c.fill].forEach(function (ln) {
          ln.setAttribute("x1", f1(b.o[0])); ln.setAttribute("y1", f1(b.o[1]));
          ln.setAttribute("x2", f1(z[0])); ln.setAttribute("y2", f1(z[1]));
        });
      });

      var sq = s.squeeze || 0;
      function placeEllipse(node, bone, u, v, extra) {
        var p = atBone(B[bone], u, v);
        node.setAttribute("transform", "translate(" + f1(p[0]) + " " + f1(p[1]) + ") rotate(" + f1(B[bone].ang) + ")" + (extra || ""));
      }
      placeEllipse(calfOut, "shin", 0.33, 12 + 3 * sq);
      placeEllipse(calfIn, "shin", 0.33, 12 + 3 * sq);
      calfOut.setAttribute("ry", f1(16 + 4 * sq)); calfIn.setAttribute("ry", f1(14 + 4 * sq));
      placeEllipse(calfMuscle, "shin", 0.33, 13 + 3 * sq);
      calfMuscle.setAttribute("ry", f1(10 + 4 * sq));
      calfMuscle.setAttribute("rx", f1(33 - 3 * sq));
      calfMuscle.style.opacity = (s.calf || 0) * 0.9;
      calfMuscle.style.display = (s.calf || 0) > 0.001 ? "" : "none";
      placeEllipse(lungs, "torso", 0.77, -8);
      placeEllipse(brain, "neck", 1.12, -3);

      var flow = s.flow === undefined ? 1 : s.flow;
      var legFlow = s.legFlow === undefined ? 1 : s.legFlow;
      ORDER.forEach(function (name) {
        var V = vessels[name];
        var poly = sample(V.def.pts.map(function (q) { return atBone(B[q[0]], q[1], q[2]); }), 8);
        V.poly = poly; V.cl = lengths(poly);
        V.path.setAttribute("d", polyD(poly));
        var w = 5;
        if (name === "veinUp") w = 5 + 5 * (s.pool || 0);
        V.path.setAttribute("stroke-width", w);
        var op = s.dim && s.dim[name] !== undefined ? s.dim[name] : 1;
        V.path.style.opacity = 0.85 * op;
        var speed = 75 * flow * (name === "veinUp" ? legFlow : 1);
        V.travel = (V.travel + (s.dt || 0) * speed / V.L0) % 1;
        V.cells.forEach(function (cell) {
          var f = (cell.phase + V.travel) % 1;
          var p = pointAt(poly, V.cl, f);
          cell.c.setAttribute("cx", f1(p[0])); cell.c.setAttribute("cy", f1(p[1]));
          cell.c.style.opacity = op;
        });
      });

      var hp = atBone(B.torso, 0.70, 12);
      var sc = 17 * (1 - 0.1 * (s.beat || 0));
      heart.setAttribute("transform", "translate(" + f1(hp[0]) + " " + f1(hp[1]) + ") rotate(" + f1(B.torso.ang + 90 - 28) + ") scale(" + sc.toFixed(2) + ")");
      return J;
    };

    api.update({ pose: POSES.stand, dt: 0 });
    return api;
  }

  // Heart contraction through one beat (phase 0..1): a quick squeeze, then rest.
  function beatShape(ph) {
    return ph < 0.38 ? Math.sin(Math.PI * ph / 0.38) : 0;
  }

  window.BodyModel = {
    el: el, POSES: POSES, mixPose: mixPose, resolve: resolve, atBone: atBone, build: build, addDefs: addDefs, beatShape: beatShape,
    HEART_D: HEART_D, CM: CM, ART: ART, ART_P: ART_P, VEIN: VEIN, VEIN_P: VEIN_P, sample: sample, lengths: lengths, pointAt: pointAt, polyD: polyD
  };
})();
