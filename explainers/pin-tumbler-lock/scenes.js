/* Pin tumbler lock: all drawing and animation.
 *
 * Scene timeline (t = step index + progress through that step):
 *   0 Hero            padlock spins
 *   1 Purpose         spin stops facing front, shackle tugs against latch
 *   2 Components      padlock explodes into parts, labels appear
 *   3 Cylinder        barrel turns face-on and lines up with the end section,
 *                     then the 3D view hands over to the 2D sections
 *   4 Shear line      shear line drawn; zoom to end view; empty plug turns freely
 *   5 Pin stacks      pins and springs drop into chambers
 *   6 Locked state    plug tries to turn, blocked; blocking pins turn red
 *   7 Inserting key   zoom to side view; key slides in, pins ride over cuts
 *   8 Bitting         cut depths shown; shear line turns green
 *   9 Turning         plug turns 90 degrees
 *  10 Incorrect key   key swapped for one wrong cut; turn is blocked
 *  11 Release         back to 3D padlock; key turns the cam, the cam slides
 *                     the latch, the shackle springs up
 *  12 Tolerances      back to the sections; the end view is replaced by a top
 *                     view at the shear line; chamber offsets grow (exaggerated)
 *  13 Tension         tension wrench goes in; plug turns until one pin binds
 *  14 Setting a pin   pick lifts the binding pin until it sets; next pin binds
 *  15 Single pin      remaining pins set in binding order; plug turns open
 *  16 Raking          rake oscillates in the keyway; some pins set by chance
 *  17 Security pins   spool pin causes a false set, then counter-rotation
 *  18 Keyspace        bitting digits count through the combinations
 *  19 Summary         padlock reassembles and spins again
 */
(function () {
  "use strict";

  var E = Explainer;
  var range = E.range, ease = E.ease, lerp = E.lerp, win = E.window;

  /* =====================================================================
   * Part 1: 3D padlock (built by padlock.js)
   * ===================================================================== */

  var view3d = E.$("#view3d");
  var lockEl = E.$("#lock3d");
  var floor = E.$("#floor");
  var lock = Padlock.build(lockEl);
  var CY = lock.CY, CR = lock.CR, D = lock.D;
  var PERSPECTIVE = 1400;                     // must match .view3d in lock.css
  var plugCircle = E.$("#end-plug .part-plug");

  // Spin state. This is the one thing not driven purely by t: the hero lock
  // keeps spinning in time, then eases to face front as the reader scrolls.
  var spin = 0;

  function render3d(t, dt, opts) {
    var opacity = t < 6 ? 1 - range(t, 2.95, 3.2)
      : range(t, 10.85, 11.1) * (1 - range(t, 11.85, 12.05)) + range(t, 18.85, 19.1);
    view3d.style.opacity = opacity;
    if (opacity <= 0.001) return;

    // --- spin ---
    var spinning = t < 6 ? 1 - range(t, 0.55, 1.05) : range(t, 19.0, 19.4);
    if (opts.reduceMotion) spinning = 0;
    spin += dt * 45 * spinning;
    if (spinning < 1) {
      var target = Math.round(spin / 360) * 360;
      spin += (target - spin) * Math.min(1, dt * 5 * (1 - spinning));
    }

    // --- scene progress values ---
    var ex = t < 6 ? ease(range(t, 1.85, 2.5)) : 0;      // explode
    var align = t < 6 ? ease(range(t, 2.5, 2.95)) : 0;   // line barrel up with end section
    var cam = t > 6 ? ease(range(t, 10.8, 11.1)) * (1 - ease(range(t, 11.85, 12.2))) : 0;
    var reset = 1 - ease(range(t, 11.85, 12.05));

    // --- camera ---
    var vr = view3d.getBoundingClientRect();
    var k = Math.min(vr.width, vr.height) / 620;
    var s = k, ox = 0, oy = k * 30;
    var rx = -14 * ex - 12 * cam;
    var ry = spin - 30 * ex - 40 * cam;

    if (align > 0) {
      // Solve for the scale and offset that put the barrel's front face exactly
      // over the plug circle of the end section (allowing for perspective), so
      // the crossfade looks like the barrel turning into the drawing.
      // Note: CSS scale() does not scale depth, so the perspective factor f
      // depends only on the face's z position.
      var cr = plugCircle.getBoundingClientRect();
      var tx = cr.left + cr.width / 2 - (vr.left + vr.width / 2);
      var ty = cr.top + cr.height / 2 - (vr.top + vr.height / 2);
      var R = cr.width / 2;
      var zc = D / 2 + 1 + 170 * ex, yc = CY + 70 * ex;  // barrel face position (padlock.js)
      var f = PERSPECTIVE / (PERSPECTIVE - zc);
      var sA = R / (CR * f);
      s = lerp(s, sA, align);
      ox = lerp(ox, tx / f, align);
      oy = lerp(oy, ty / f - sA * yc, align);
      rx = lerp(rx, 0, align);
      ry = lerp(ry, spin, align);
    }

    lockEl.style.transform = "translate(" + ox + "px," + oy + "px) scale(" + s + ") rotateX(" + rx + "deg) rotateY(" + ry + "deg)";

    floor.style.transform = "translate(" + ox + "px," + (oy + s * 175) + "px) scale(" + s + ")";
    floor.style.opacity = (1 - 0.7 * ex) * (1 - align);

    lock.pose({
      ex: ex,
      tug: t < 6 ? Math.abs(Math.sin(range(t, 1.1, 1.6) * Math.PI * 2)) : 0,
      turn: t > 6 ? 90 * ease(range(t, 11.1, 11.4)) * reset : 0,
      release: t > 6 ? E.easeOutBack(range(t, 11.4, 11.6), 1.6) * reset : 0,
      keyShow: t > 6 ? win(t, 10.85, 11.0, 11.85, 12.0) : 0,
      keyIn: t > 6 ? ease(range(t, 10.9, 11.1)) : 0,
      see: cam,
      solo: align,
      labels: t < 6 ? range(t, 2.25, 2.45) : 0,
      camLabels: t > 6 ? win(t, 11.0, 11.15, 11.8, 11.95) : 0,
      rx: rx,
      ry: ry
    });
  }

  /* =====================================================================
   * Part 2: 2D cross-sections (SVG)
   * ===================================================================== */

  var CX = [140, 220, 300, 380, 460];  // chamber centres (x), side view
  var SHEAR = 260;                     // shear line (y)
  var REST = 335;                      // key pin tip with no key
  var DRIVER = 46;                     // driver pin length
  var CH_TOP = 130;                    // top of chambers
  var KEY_IN = 530, KEY_OUT = -10;     // key tip x when inserted / withdrawn
  var PLUG_AXIS = 320;
  var END_X = 810, FOCUS = 2;          // end view centre x, pin shown in end view

  var CORRECT = [3, 1, 4, 2, 5];
  var WRONG = [3, 1, 2, 2, 5];

  // Section camera (SVG viewBox) for each scene: whole drawing, side view only,
  // or end view only. Narrow screens show one view at a time so it can be larger.
  var FULL = [40, 90, 940, 450], SIDE = [0, 95, 720, 430], END = [650, 95, 330, 440];
  var VIEW_WIDE = [
    [3.0, FULL], [4.1, FULL], [4.3, END], [4.9, END], [5.05, FULL],
    [6.85, FULL], [7.0, SIDE], [8.85, SIDE], [9.0, FULL]
  ];
  var VIEW_NARROW = [
    [3.0, END], [4.9, END], [5.05, SIDE], [8.85, SIDE], [9.0, END], [9.85, END], [10.0, SIDE],
    [11.8, SIDE], [11.95, END], [13.8, END], [13.95, SIDE]
  ];

  function depthY(d) { return 293 + 7 * d; }  // y of the cut bottom for depth d
  var PIN_LEN = CORRECT.map(function (d) { return depthY(d) - SHEAR; });

  // Key top edge as [x, y] points, in key coordinates (tip at x = 0).
  function keyProfile(cuts) {
    var pts = [[-480, 296]];
    cuts.forEach(function (d, j) {
      var x = CX[j] - KEY_IN, y = depthY(d), f = y - 296;
      pts.push([x - 4 - f, 296], [x - 4, y], [x + 4, y], [x + 4 + f, 296]);
    });
    pts.push([-30, 296], [0, 340]);
    return pts;
  }

  function keyTop(pts, x) {
    if (x > 0 || x < -480) return null;
    for (var j = 1; j < pts.length; j++) {
      if (x <= pts[j][0]) {
        var a = pts[j - 1], b = pts[j];
        return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0] || 1));
      }
    }
    return null;
  }

  function keyPath(pts) {
    return "M" + pts.map(function (p) { return p[0] + " " + p[1]; }).join(" L") +
      " L-8 362 L-480 362 Z";
  }

  function keyPinPath(cx, top, tip) {
    return "M" + (cx - 11) + " " + top + " h22 V" + (tip - 7) + " L" + cx + " " + tip +
      " L" + (cx - 11) + " " + (tip - 7) + " Z";
  }

  function springPoints(cx, top, bottom) {
    var pts = [], n = 10;
    for (var j = 0; j <= n; j++) {
      var x = j === 0 || j === n ? cx : cx + (j % 2 ? -9 : 9);
      pts.push(x + "," + lerp(top, bottom, j / n));
    }
    return pts.join(" ");
  }

  // ---- build static and dynamic SVG elements ----
  var svg = E.svg;
  var section = E.$("#section");
  var legend = E.$("#legend");
  var g = function (id) { return document.getElementById(id); };

  CX.forEach(function (cx) {
    svg("rect", { x: cx - 13, y: CH_TOP, width: 26, height: SHEAR - CH_TOP, fill: "#262c33" }, g("side-chambers"));
    svg("rect", { x: cx - 13, y: SHEAR, width: 26, height: 40, fill: "#262c33" }, g("side-plug-chambers"));
  });

  var sideKeyGroup = g("side-key");
  var sideKey = svg("path", { fill: "url(#g-key)", stroke: "#7d7458", "stroke-width": 1 }, sideKeyGroup);
  svg("rect", { x: -560, y: 236, width: 82, height: 170, rx: 16, fill: "url(#g-key)", stroke: "#7d7458" }, sideKeyGroup);
  svg("circle", { cx: -530, cy: 321, r: 14, fill: "#2e353e" }, sideKeyGroup);

  var SPRING = { fill: "none", stroke: "#a9b4bf", "stroke-width": 2.5, "stroke-linejoin": "round", class: "part-spring" };

  var stacks = CX.map(function (cx) {
    return {
      cx: cx,
      keypin: svg("path", { fill: "url(#g-keypin)", class: "part-keypin" }, g("side-keypins")),
      driver: svg("rect", { x: cx - 11, width: 22, height: DRIVER, rx: 3, fill: "url(#g-driver)", class: "part-driver" }, g("side-drivers")),
      spring: svg("polyline", SPRING, g("side-springs")),
      shear: svg("line", { x1: cx - 13, x2: cx + 13, y1: SHEAR, y2: SHEAR, "stroke-width": 4 }, g("side-shear"))
    };
  });

  var shearLine = svg("line", { x1: 50, x2: 580, y1: SHEAR, y2: SHEAR, stroke: "#e2b955", "stroke-width": 2, "stroke-dasharray": 530 }, g("side-shear"));
  g("side-shear").insertBefore(shearLine, g("side-shear").firstChild); // base line under the coloured segments

  var bitLabels = [svg("text", { x: 60, y: 452, class: "small" }, g("side-bitting"))];
  bitLabels[0].textContent = "Bitting";
  CX.forEach(function (cx) {
    bitLabels.push(svg("text", { x: cx, y: 455, "text-anchor": "middle", class: "bit" }, g("side-bitting")));
  });

  var endKey = svg("rect", { x: 806, width: 8, fill: "url(#g-key)" }, g("end-key"));
  var endKeyPin = svg("path", { fill: "url(#g-keypin)", class: "part-keypin" }, g("end-keypin"));
  var endDriver = svg("rect", { x: END_X - 11, width: 22, height: DRIVER, rx: 3, fill: "url(#g-driver)", class: "part-driver" }, g("end-driver"));
  var endSpring = svg("polyline", SPRING, g("end-spring"));
  var endShear = g("end-shear");
  var END_SHEAR_LEN = 2 * Math.PI * 60;
  endShear.setAttribute("stroke-dasharray", END_SHEAR_LEN);

  var profiles = { correct: keyProfile(CORRECT), wrong: keyProfile(WRONG) };


  /* ---- Lock picking model (steps 12-18) ----
   * Top view: each housing hole is drilled ERR px off the ideal line. When the
   * plug turns, its holes move down by d. A driver pin has SLACK px of play, so
   * pin j binds (is pinched) once d reaches BIND[j] = ERR[j] + SLACK. Pins
   * therefore bind, and must be set, in ascending order of BIND. */
  var ERR = [3, -3, 7.5, 0, 12];
  var SLACK = 4;
  var BIND = ERR.map(function (e) { return e + SLACK; });
  var ORDER = [0, 1, 2, 3, 4].sort(function (a, b) { return BIND[a] - BIND[b]; });
  var SPOOL = ORDER[2];                // pin given a spool driver in step 17
  var OPEN = 30;                       // plug travel once every pin is set
  var PICK_LOW = 344;                  // pick tip height when not lifting
  var TX = [700, 755, 810, 865, 920];  // chamber centres (x), top view

  function setTip(j) { return SHEAR + PIN_LEN[j]; } // tip height that puts the gap on the shear line

  // A lift: the pick moves under a pin (move -> up), lifts it (up -> set),
  // the pin sets, and the pick drops back (set -> drop).
  function lift(pin, move, up, set, drop) { return { pin: pin, move: move, up: up, set: set, drop: drop }; }

  var PHASES = [
    { from: 11.5, to: 15.9, pickOut: [15.55, 15.7], lifts: [
      lift(ORDER[0], 13.85, 14.15, 14.45, 14.55),
      lift(ORDER[1], 14.92, 14.96, 15.04, 15.06),
      lift(ORDER[2], 15.07, 15.11, 15.19, 15.21),
      lift(ORDER[3], 15.22, 15.26, 15.34, 15.36),
      lift(ORDER[4], 15.37, 15.41, 15.49, 15.51)] },
    { from: 15.9, to: 16.9, rakeSets: [16.3, 16.42, 16.55] },
    { from: 16.9, to: 17.9, pickOut: [17.72, 17.85], falseSet: [17.2, 17.3, 17.35, 17.62], lifts: [
      lift(ORDER[0], 16.95, 16.99, 17.06, 17.08),
      lift(ORDER[1], 17.09, 17.12, 17.18, 17.2),
      lift(SPOOL, 17.3, 17.35, 17.62, 17.66)] },
    { from: 17.9, to: 99 }
  ];

  function phaseAt(t) {
    for (var i = 0; i < PHASES.length; i++) if (t < PHASES[i].to) return PHASES[i];
    return PHASES[PHASES.length - 1];
  }

  // Times at which pins set in this phase, in binding order.
  function setTimes(ph) {
    if (ph.rakeSets) return ph.rakeSets;
    return (ph.lifts || []).map(function (l) { return l.set; });
  }

  function isSet(ph, j, t) {
    var times = setTimes(ph);
    for (var k = 0; k < times.length; k++) if (ORDER[k] === j && t >= times[k]) return true;
    return false;
  }

  // Rake: a wavy blade. Top edge in rake coordinates (tip at x = 0).
  var RAKE = [[-500, 350], [-250, 348], [-230, 318], [-200, 348], [-170, 330], [-140, 348],
    [-110, 318], [-80, 348], [-50, 328], [-15, 348], [0, 350]];

  function pickState(t) {
    var ph = phaseAt(t);
    var st = { ph: ph, pick: 0, pickX: 40, tipY: PICK_LOW, lifting: -1, rake: 0, rakeX: -10, falseSet: 0 };

    // Tension: on from step 13, eased off between phases, off for the keyspace step.
    var tension = ease(range(t, 13.1, 13.35)) *
      (1 - win(t, 15.8, 15.88, 15.95, 16.05)) *
      (1 - win(t, 16.82, 16.88, 16.92, 16.98)) *
      (1 - ease(range(t, 17.85, 18.0)));

    // Plug travel: limited by the first pin not yet set; eases on as each pin sets.
    var times = setTimes(ph), d = BIND[ORDER[0]];
    times.forEach(function (s, k) {
      var next = k + 1 < ORDER.length ? BIND[ORDER[k + 1]] : OPEN;
      d = lerp(d, next, ease(range(t, s, s + 0.06)));
    });
    if (ph.falseSet) {
      var fs = ph.falseSet;
      st.falseSet = ease(range(t, fs[0], fs[1])) * (1 - range(t, fs[2], fs[3]));
      // The plug turns into the spool's waist: further than a normal pin allows,
      // but not as far as the next pin's binding point.
      var room = BIND[ORDER[3]] - BIND[SPOOL];
      d += 0.9 * room * st.falseSet;
    }
    st.d = d * tension;
    st.tension = tension;

    // Pick position and lift.
    if (ph.lifts) {
      var first = ph.lifts[0];
      st.pick = win(t, first.move - 0.05, first.move, ph.pickOut[1] - 0.03, ph.pickOut[1]);
      var x = 40;
      ph.lifts.forEach(function (l) {
        if (t >= l.move) x = lerp(x, CX[l.pin], ease(range(t, l.move, l.up)));
        if (t >= l.up && t < l.set) {
          st.lifting = l.pin;
          st.tipY = lerp(PICK_LOW, setTip(l.pin), ease(range(t, l.up, l.set)));
        } else if (t >= l.set && t < l.drop) {
          st.tipY = lerp(setTip(l.pin), PICK_LOW, range(t, l.set, l.drop));
        }
      });
      st.pickX = lerp(x, -120, ease(range(t, ph.pickOut[0], ph.pickOut[1])));
    }

    // Rake: slide in, scrub back and forth, slide out.
    if (ph.rakeSets) {
      st.rake = win(t, 15.92, 15.97, 16.8, 16.87);
      var inX = lerp(-10, 300, ease(range(t, 15.95, 16.1)));
      var scrub = Math.sin(range(t, 16.1, 16.7) * Math.PI * 2 * 2.5) * 100;
      st.rakeX = lerp(inX + scrub, -10, ease(range(t, 16.7, 16.85)));
    }
    return st;
  }

  // ---- picking elements ----
  var tools = g("side-tools");
  var wrench = svg("path", { class: "part-wrench", d: "M100 358 H54 Q44 358 44 368 V470",
    fill: "none", stroke: "#c3ccd5", "stroke-width": 7, "stroke-linecap": "round", "stroke-linejoin": "round" }, tools);
  var pickTool = svg("path", { class: "part-pick", fill: "none", stroke: "#dfe5ea", "stroke-width": 5,
    "stroke-linecap": "round", "stroke-linejoin": "round" }, tools);
  var rakeTool = svg("path", { class: "part-rake", fill: "#cfd7de", stroke: "#7d8893", "stroke-width": 1 }, tools);
  rakeTool.setAttribute("d", "M" + RAKE.map(function (p) { return p[0] + " " + p[1]; }).join(" L") + " L0 360 L-500 360 Z");

  var spools = CX.map(function () {
    return svg("path", { fill: "url(#g-driver)", class: "part-spool part-driver" }, g("side-drivers"));
  });
  function spoolPath(cx, top) {
    return "M" + (cx - 11) + " " + top + " h22 v10 h-6 v26 h6 v10 h-22 v-10 h6 v-26 h-6 Z";
  }

  var topHousingHoles = [], topPlugHoles = [], topDrivers = [], topKeyPins = [];
  TX.forEach(function (x) {
    topPlugHoles.push(svg("circle", { cx: x, cy: 320, r: 15, fill: "#262c33" }, g("top-plug-holes")));
    topKeyPins.push(svg("circle", { cx: x, cy: 320, r: 12, fill: "url(#g-keypin)", class: "part-keypin" }, g("top-plug-holes")));
    topHousingHoles.push(svg("circle", { cx: x, cy: 320, r: 15, fill: "none", stroke: "#dfe5ea",
      "stroke-width": 1.5, "stroke-dasharray": "4 3" }, g("top-housing-holes")));
    topDrivers.push(svg("circle", { cx: x, cy: 320, r: 13, fill: "url(#g-driver)", class: "part-driver" }, g("top-pins")));
  });
  var topBinding = g("top-binding");

  function renderSection(t, opts) {
    // The camera is set even while hidden: the 3D view lines up with it.
    var box = E.keyframes(t, opts.narrow ? VIEW_NARROW : VIEW_WIDE);
    section.setAttribute("viewBox", box.join(" "));

    var opacity = range(t, 2.95, 3.2) * (1 - range(t, 10.85, 11.05)) + win(t, 11.85, 12.05, 18.85, 19.05);
    section.style.opacity = opacity;
    legend.style.opacity = opacity * range(t, 5.5, 5.8);
    if (opacity <= 0.001) return;

    var picking = t > 11.5;

    // The side view joins slightly after the end view, which the barrel turns into.
    g("side").style.opacity = t < 6 ? range(t, 3.1, 3.4) : 1;
    // From step 12 the end view is replaced by the top view.
    g("end").style.display = picking ? "none" : "";
    g("top").style.display = picking ? "" : "none";
    // On phones, hide the top view's edge while the camera frames the side view.
    g("top").style.opacity = opts.narrow ? E.clamp((box[0] - 200) / 400) : 1;

    // --- key position and which key (steps 7-10) ---
    var swapped = t > 10.17;
    var cuts = swapped ? WRONG : CORRECT;
    var pts = swapped ? profiles.wrong : profiles.correct;
    var insert = swapped
      ? ease(range(t, 10.2, 10.45))
      : ease(range(t, 6.9, 7.7)) * (1 - ease(range(t, 10.0, 10.15)));
    var keyX = lerp(KEY_OUT, KEY_IN, insert);
    var keyOpacity = picking ? 0 : range(t, 6.75, 6.9);
    var keyPresent = keyOpacity > 0;

    // --- lock picking state (steps 12-18) ---
    var pk = picking ? pickState(t) : null;

    // --- plug rotation (degrees) ---
    var theta =
      360 * ease(range(t, 4.3, 4.85)) +
      3 * Math.sin(range(t, 6.15, 6.8) * Math.PI * 6) +
      90 * ease(range(t, 9.05, 9.5)) * (1 - ease(range(t, 9.8, 10.0))) +
      3 * Math.sin(range(t, 10.5, 10.8) * Math.PI * 6) +
      90 * ease(range(t, 15.55, 15.75)) * (1 - ease(range(t, 15.8, 15.9)));

    // --- status highlight (red = blocking, green = clear) ---
    var status = Math.max(
      win(t, 6.1, 6.25, 6.85, 7.0),
      win(t, 7.85, 8.1, 9.75, 9.9),
      win(t, 10.45, 10.55, 10.85, 10.95)
    );
    var pickStatus = win(t, 13.3, 13.45, 17.85, 17.95);

    // --- pins ---
    var pinsVisible = t > 4.9;
    var binding = -1;
    stacks.forEach(function (st, j) {
      // Pins drop in with a small bounce at the bottom.
      var p = range(t, 4.95 + j * 0.07, 5.3 + j * 0.07);
      var drop = E.easeOutBack(p, 0.9);
      var dy = picking ? 0 : -(1 - drop) * 120;

      var tip = REST, set = false;
      if (keyPresent) {
        var top = keyTop(pts, st.cx - keyX);
        if (top !== null && top < tip) tip = top;
      }
      if (pk) {
        set = isSet(pk.ph, j, t);
        if (pk.lifting === j) tip = Math.min(tip, pk.tipY);
        if (pk.rake > 0) {
          var rt = keyTop(RAKE, st.cx - pk.rakeX);
          if (rt !== null && rt < tip) tip = rt;
        }
      }
      var kpTop = tip - PIN_LEN[j];
      // A set driver pin stays above the shear line, caught on the plug.
      var driverTop = set ? Math.min(SHEAR - DRIVER, kpTop - DRIVER) : kpTop - DRIVER;
      var driverBlocks = !set && kpTop > SHEAR + 0.5;
      var keyPinBlocks = kpTop < SHEAR - 0.5;
      st.blocked = driverBlocks || keyPinBlocks;

      st.keypin.setAttribute("d", keyPinPath(st.cx, kpTop + dy, tip + dy));
      st.driver.setAttribute("y", driverTop + dy);
      st.spring.setAttribute("points", springPoints(st.cx, CH_TOP, driverTop + dy));

      // Spool driver in the security pin step.
      var isSpool = pk && j === SPOOL && t > 16.9 && t < 17.9;
      st.driver.style.display = isSpool ? "none" : "";
      spools[j].style.display = isSpool ? "" : "none";
      if (isSpool) spools[j].setAttribute("d", spoolPath(st.cx, driverTop));

      var vis = pinsVisible ? E.clamp(p * 2) : 0;
      st.keypin.style.opacity = vis;
      st.driver.style.opacity = vis;
      st.spring.style.opacity = pinsVisible ? range(t, 5.35, 5.6) : 0;

      if (pk) {
        var bound = !set && pk.tension > 0.5 && pk.d - ERR[j] >= SLACK - 0.1;
        if (bound) binding = j;
        outline(isSpool ? spools[j] : st.driver, bound ? pickStatus : 0, "#e2b955");
        outline(st.keypin, 0);
        st.shear.setAttribute("stroke", set ? "#7fd49b" : "#e2b955");
        st.shear.style.opacity = (set || bound) ? pickStatus : 0;
      } else {
        outline(st.driver, driverBlocks ? status : 0);
        outline(st.keypin, keyPinBlocks ? status : 0);
        st.shear.setAttribute("stroke", st.blocked ? "#ee6b6b" : "#7fd49b");
        st.shear.style.opacity = status;
      }

      if (j === FOCUS && !picking) {
        endKeyPin.setAttribute("d", keyPinPath(END_X, kpTop + dy, tip + dy));
        endKeyPin.style.opacity = vis;
        endDriver.setAttribute("y", driverTop + dy);
        endDriver.style.opacity = vis;
        endSpring.setAttribute("points", springPoints(END_X, CH_TOP, driverTop + dy));
        endSpring.style.opacity = st.spring.style.opacity;
        outline(endDriver, driverBlocks ? status : 0);
        outline(endKeyPin, keyPinBlocks ? status : 0);
        endShear.setAttribute("stroke", status > 0.01 ? (st.blocked ? "#ee6b6b" : "#7fd49b") : "#e2b955");

        var kt = keyPresent ? keyTop(pts, st.cx - keyX) : null;
        if (kt !== null) {
          endKey.setAttribute("y", kt);
          endKey.setAttribute("height", 362 - kt);
          endKey.style.opacity = keyOpacity;
        } else {
          endKey.style.opacity = 0;
        }
      }

      if (pk) renderTopPin(j, pk, set, t);
    });

    // --- top view ---
    if (pk) {
      g("top-plug").setAttribute("transform", "translate(0 " + pk.d * 1.6 + ")"); // same exaggeration as the holes
      g("top-ideal").style.opacity = win(t, 12.1, 12.3, 13.8, 13.95);
      topBinding.style.opacity = binding >= 0 ? pickStatus : 0;
      if (binding >= 0) {
        topBinding.setAttribute("x", TX[binding]);
        topBinding.textContent = pk.falseSet > 0.5 ? "False set" : "Binding";
      }
    }

    // --- tools ---
    wrench.style.opacity = pk ? range(t, 12.85, 12.95) * (1 - range(t, 17.9, 18.0)) : 0;
    wrench.setAttribute("transform", "translate(" + lerp(-120, 0, ease(range(t, 12.85, 13.1))) + " 0)");
    pickTool.style.opacity = pk ? pk.pick : 0;
    if (pk) {
      var px = pk.pickX;
      pickTool.setAttribute("d", "M" + (px - 600) + " 350 L" + (px - 12) + " 350 Q" + (px - 2) + " 350 " + px + " " + pk.tipY);
      rakeTool.style.opacity = pk.rake;
      rakeTool.setAttribute("transform", "translate(" + pk.rakeX + " 0)");
    } else {
      rakeTool.style.opacity = 0;
    }
    g("side-falseset").setAttribute("x", CX[SPOOL]);
    g("side-falseset").style.opacity = pk ? E.clamp(pk.falseSet * 2) : 0;

    // --- key (side view) ---
    sideKeyGroup.style.opacity = keyOpacity;
    sideKey.setAttribute("d", keyPath(pts));
    sideKeyGroup.setAttribute("transform", "translate(" + keyX + " 0)");

    // --- rotation: side view is a projection, end view is a true rotation ---
    var c = Math.cos(theta * Math.PI / 180);
    g("side-plug-contents").setAttribute("transform",
      "translate(0 " + PLUG_AXIS + ") scale(1 " + c + ") translate(0 " + -PLUG_AXIS + ")");
    g("end-plug").setAttribute("transform", "rotate(" + theta + " " + END_X + " " + PLUG_AXIS + ")");

    // --- shear line draw-in ---
    var draw = range(t, 3.9, 4.15);
    shearLine.setAttribute("stroke-dashoffset", 530 * (1 - draw));
    endShear.setAttribute("stroke-dashoffset", END_SHEAR_LEN * (1 - draw));
    endShear.style.opacity = draw > 0 ? 1 : 0;

    // --- bitting labels (and the keyspace counter in step 18) ---
    var keyspace = win(t, 18.0, 18.15, 18.85, 19.0);
    var bitOpacity = Math.max(win(t, 7.9, 8.15, 9.8, 9.95), win(t, 10.3, 10.45, 10.85, 10.95), keyspace);
    g("side-bitting").style.opacity = bitOpacity;
    g("side-keyspace").style.opacity = keyspace;
    var shown = cuts;
    if (t > 17.95) {
      // Count through every combination, like an odometer (base 5).
      var n = Math.floor(range(t, 18.05, 18.7) * 3124);
      shown = [0, 0, 0, 0, 0].map(function (_, i) { return Math.floor(n / Math.pow(5, 4 - i)) % 5 + 1; });
    }
    shown.forEach(function (d, j) {
      bitLabels[j + 1].textContent = d;
      bitLabels[j + 1].setAttribute("class", "bit" + (t < 17.95 && d !== CORRECT[j] ? " bad" : ""));
    });

    // --- labels ---
    // Side-view labels sit between the two views; on phones, hide them while
    // the camera frames the right-hand view so they do not overlap it.
    var sideLabels = opts.narrow ? E.clamp((450 - box[0]) / 250) : 1;
    g("lbl-parts").style.opacity = range(t, 3.2, 3.45) * sideLabels;
    g("lbl-shear").style.opacity = range(t, 3.95, 4.2) * sideLabels;
    g("lbl-pins").style.opacity = picking ? 0 : range(t, 5.4, 5.7);
  }

  // Top view of one chamber: housing hole (dashed, fixed), plug hole (moves
  // with the plug), and the pin seen from above.
  function renderTopPin(j, pk, set, t) {
    var grow = ease(range(t, 12.1, 12.5));
    var hY = 320 + ERR[j] * grow * 1.6;          // drawn offset, exaggerated further
    var r = pk.d - ERR[j];                        // plug hole relative to housing hole
    topHousingHoles[j].setAttribute("cy", hY);
    var drv = topDrivers[j], kp = topKeyPins[j];
    if (set) {
      // Driver above the shear line: shown as a green ring; key pin rides in the plug.
      drv.setAttribute("cy", hY);
      drv.setAttribute("r", 13);
      drv.setAttribute("fill", "none");
      drv.setAttribute("stroke", "#7fd49b");
      drv.setAttribute("stroke-width", 2.5);
      kp.style.opacity = 1;
    } else {
      // Driver across the shear line: pushed by the plug hole, up to its slack.
      var spool = j === SPOOL && t > 16.9 && t < 17.9 && r > SLACK;
      drv.setAttribute("cy", hY + E.clamp(r - SLACK / 2, 0, SLACK / 2) * 1.6);
      drv.setAttribute("r", spool ? Math.max(7, 13 - (r - SLACK) * 0.7) : 13);
      drv.setAttribute("fill", "url(#g-driver)");
      var bound = pk.tension > 0.5 && r >= SLACK - 0.1;
      if (bound) {
        drv.setAttribute("stroke", "#e2b955");
        drv.setAttribute("stroke-width", 3);
      } else {
        drv.removeAttribute("stroke");
      }
      kp.style.opacity = 0;
    }
  }

  function outline(el, amount, color) {
    if (amount > 0.01) {
      el.setAttribute("stroke", color || "#ee6b6b");
      el.setAttribute("stroke-width", 3 * amount);
    } else {
      el.removeAttribute("stroke");
    }
  }

  E.start(function (t, dt, opts) {
    renderSection(t, opts);  // first: the 3D view reads the section's position
    render3d(t, dt, opts);
  });
})();
