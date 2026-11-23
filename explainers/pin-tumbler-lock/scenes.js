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
 *  12 Summary         padlock reassembles and spins again
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
    var opacity = t < 6 ? 1 - range(t, 2.95, 3.2) : range(t, 10.85, 11.1);
    view3d.style.opacity = opacity;
    if (opacity <= 0.001) return;

    // --- spin ---
    var spinning = t < 6 ? 1 - range(t, 0.55, 1.05) : range(t, 12.0, 12.4);
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
    [3.0, END], [4.9, END], [5.05, SIDE], [8.85, SIDE], [9.0, END], [9.85, END], [10.0, SIDE]
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

  function renderSection(t, opts) {
    // The camera is set even while hidden: the 3D view lines up with it.
    var box = E.keyframes(t, opts.narrow ? VIEW_NARROW : VIEW_WIDE);
    section.setAttribute("viewBox", box.join(" "));

    var opacity = range(t, 2.95, 3.2) * (1 - range(t, 10.85, 11.05));
    section.style.opacity = opacity;
    legend.style.opacity = opacity * range(t, 5.5, 5.8);
    if (opacity <= 0.001) return;

    // The side view joins slightly after the end view, which the barrel turns into.
    g("side").style.opacity = t < 6 ? range(t, 3.1, 3.4) : 1;

    // --- key position and which key ---
    var swapped = t > 10.17;
    var cuts = swapped ? WRONG : CORRECT;
    var pts = swapped ? profiles.wrong : profiles.correct;
    var insert = swapped
      ? ease(range(t, 10.2, 10.45))
      : ease(range(t, 6.9, 7.7)) * (1 - ease(range(t, 10.0, 10.15)));
    var keyX = lerp(KEY_OUT, KEY_IN, insert);
    var keyOpacity = range(t, 6.75, 6.9);
    var keyPresent = keyOpacity > 0;

    // --- plug rotation (degrees) ---
    var theta =
      360 * ease(range(t, 4.3, 4.85)) +
      3 * Math.sin(range(t, 6.15, 6.8) * Math.PI * 6) +
      90 * ease(range(t, 9.05, 9.5)) * (1 - ease(range(t, 9.8, 10.0))) +
      3 * Math.sin(range(t, 10.5, 10.8) * Math.PI * 6);

    // --- status highlight (red = blocking, green = clear) ---
    var status = Math.max(
      win(t, 6.1, 6.25, 6.85, 7.0),
      win(t, 7.85, 8.1, 9.75, 9.9),
      win(t, 10.45, 10.55, 10.85, 10.95)
    );

    // --- pins ---
    var pinsVisible = t > 4.9;
    stacks.forEach(function (st, j) {
      // Pins drop in with a small bounce at the bottom.
      var p = range(t, 4.95 + j * 0.07, 5.3 + j * 0.07);
      var drop = E.easeOutBack(p, 0.9);
      var dy = -(1 - drop) * 120;

      var tip = REST;
      if (keyPresent) {
        var top = keyTop(pts, st.cx - keyX);
        if (top !== null && top < tip) tip = top;
      }
      var kpTop = tip - PIN_LEN[j];
      var driverTop = kpTop - DRIVER;
      var driverBlocks = kpTop > SHEAR + 0.5;
      var keyPinBlocks = kpTop < SHEAR - 0.5;
      st.blocked = driverBlocks || keyPinBlocks;

      st.keypin.setAttribute("d", keyPinPath(st.cx, kpTop + dy, tip + dy));
      st.driver.setAttribute("y", driverTop + dy);
      st.spring.setAttribute("points", springPoints(st.cx, CH_TOP, driverTop + dy));

      var vis = pinsVisible ? E.clamp(p * 2) : 0;
      st.keypin.style.opacity = vis;
      st.driver.style.opacity = vis;
      st.spring.style.opacity = pinsVisible ? range(t, 5.35, 5.6) : 0;

      outline(st.driver, driverBlocks ? status : 0);
      outline(st.keypin, keyPinBlocks ? status : 0);

      st.shear.setAttribute("stroke", st.blocked ? "#ee6b6b" : "#7fd49b");
      st.shear.style.opacity = status;

      if (j === FOCUS) {
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
    });

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

    // --- bitting labels ---
    var bitOpacity = Math.max(win(t, 7.9, 8.15, 9.8, 9.95), win(t, 10.3, 10.45, 10.85, 10.95));
    g("side-bitting").style.opacity = bitOpacity;
    cuts.forEach(function (d, j) {
      bitLabels[j + 1].textContent = d;
      bitLabels[j + 1].setAttribute("class", "bit" + (d !== CORRECT[j] ? " bad" : ""));
    });

    // --- labels ---
    g("lbl-parts").style.opacity = range(t, 3.2, 3.45);
    g("lbl-shear").style.opacity = range(t, 3.95, 4.2);
    g("lbl-pins").style.opacity = range(t, 5.4, 5.7);
  }

  function outline(el, amount) {
    if (amount > 0.01) {
      el.setAttribute("stroke", "#ee6b6b");
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
