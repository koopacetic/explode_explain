/* 3D padlock built from flat layers with CSS 3D transforms.
 * Used by the explainer page (scenes.js) and by the gallery card (hero.js).
 *
 *   var lock = Padlock.build(containerEl);
 *   lock.pose({ ex: 0.5, rx: -10, ry: 30 });
 *
 * Pose values (all optional, default 0):
 *   ex         explode amount, 0 = assembled, 1 = fully exploded
 *   tug        shackle pulled up slightly (0..1)
 *   turn       plug rotation in degrees; drives the cam, which drives the latch
 *   release    shackle popped open (0..1, may overshoot slightly)
 *   keyShow    key opacity; keyIn: key insertion (0 = out, 1 = in)
 *   see        front face see-through amount (0..1)
 *   solo       fade out everything except the cylinder (0..1)
 *   labels     opacity of the exploded-view labels
 *   camLabels  opacity of the cam and latch labels
 *   rx, ry     camera angles; used for lighting and to turn labels to the viewer
 *
 * Linkage: the cam is a lever on the back of the plug with a pin at its tip.
 * The pin sits in a vertical slot in an arm fixed to the latch, so as the plug
 * turns, the pin's sideways movement slides the latch (a "scotch yoke").
 */
(function () {
  "use strict";

  var W = 220, H = 180, D = 56;   // body width, height, depth (px)
  var BY = 40;                    // body centre y
  var CY = 70, CR = 32;           // cylinder centre y and radius
  var CAM_R = 46;                 // cam pin distance from plug axis
  var CAM_A0 = -135;              // cam pin angle when locked (degrees, clockwise from +x)
  var LINK_Z = -D / 2 + 3;        // depth of the latch and arm, just inside the back wall

  var LIGHT = -35;                // light direction around the vertical axis (degrees)

  function lerp(a, b, p) { return a + (b - a) * p; }
  function rad(d) { return d * Math.PI / 180; }

  function place(el, x, y, z, extra) {
    el.style.transform = "translate3d(" + x + "px," + y + "px," + z + "px)" + (extra || "");
  }

  // Shackle from plain divs (an arc plus two legs). Inline SVG does not render
  // reliably inside CSS 3D scenes in every browser. The front copy is shaded to
  // look round; the copies behind it are flat and darker.
  function shackleHtml(shaded, color) {
    var s = "position:absolute;box-sizing:border-box;";
    var leg = shaded
      ? "linear-gradient(90deg,#66717d,#e6ebf0 38%,#aab4be 62%,#5d6772)"
      : color;
    var arc = shaded
      ? "radial-gradient(circle at 50% 100%,transparent 58.5px,#66717d 59px,#e6ebf0 67px," +
        "#aab4be 73px,#5d6772 80.5px,transparent 81px)"
      : "radial-gradient(circle at 50% 100%,transparent 58.5px," + color + " 59px," +
        color + " 80.5px,transparent 81px)";
    return '<div style="' + s + 'left:-81px;top:-192px;width:162px;height:81px;background:' + arc + '"></div>' +
      '<div style="' + s + 'left:-81px;top:-111.5px;width:22px;height:171px;background:' + leg + '"></div>' +
      '<div style="' + s + 'left:59px;top:-111.5px;width:22px;height:81px;background:' + leg + '"></div>' +
      '<div style="' + s + 'left:-65px;top:-28px;width:6px;height:14px;background:#30363d"></div>';
  }

  function build(root, options) {
    options = options || {};
    root.classList.add("lock3d");

    function part(cls, w, h, html) {
      var el = document.createElement("div");
      el.className = "p " + cls;
      el.style.width = w + "px";
      el.style.height = h + "px";
      el.style.marginLeft = -w / 2 + "px";
      el.style.marginTop = -h / 2 + "px";
      if (html) el.innerHTML = html;
      root.appendChild(el);
      return el;
    }

    // Faces with their outward direction around the vertical axis (for lighting).
    var faces = {
      back:   { el: part("face face-back part-body", W, H), n: 180 },
      left:   { el: part("face face-left part-body", D, H), n: -90 },
      right:  { el: part("face face-right part-body", D, H), n: 90 },
      top:    { el: part("face face-top part-body", W, D), n: null, shade: 0 },
      bottom: { el: part("face face-bottom part-body", W, D), n: null, shade: 0.45 }
    };

    var latch = part("latch part-latch", 52, 12);
    var arm = part("yoke part-latch", 12, 74, '<div class="slot"></div>');
    var cam = part("cam part-cam", CAM_R * 2 + 12, 12, '<div class="cam-pin"></div>');

    var shackles = [
      { z: -9, el: part("shackle part-shackle", 0, 0, shackleHtml(false, "#6d7884")) },
      { z: 0,  el: part("shackle part-shackle", 0, 0, shackleHtml(false, "#8f9aa6")) },
      { z: 9,  el: part("shackle part-shackle", 0, 0, shackleHtml(true)) }
    ];

    // A stack of discs reads as a solid barrel when viewed at an angle.
    var discs = [];
    for (var i = 0; i < 9; i++) {
      discs.push({ z: lerp(-D / 2 + 12, D / 2 - 2, i / 8), el: part("disc part-cylinder", CR * 2, CR * 2) });
    }
    var discFront = part("disc disc-front part-cylinder", CR * 2, CR * 2, '<div class="keyway"></div>');

    var pins = [];
    for (i = 0; i < 5; i++) pins.push(part("pin3d part-pins", 9, 40));

    var front = { el: part("face face-front part-body", W, H), n: 0 }; // last, so it draws over internals
    faces.front = front;

    var key = part("key3d part-key", 0, 0,
      '<div class="blade" style="width:100px;height:18px;margin:-9px 0 0 -50px;' +
      'transform:translate3d(0,0,50px) rotateY(90deg)"></div>' +
      '<div class="bow" style="width:46px;height:46px;margin:-23px 0 0 -23px;' +
      'transform:translate3d(0,0,122px) rotateY(90deg)"></div>');

    var labels = {};
    if (options.labels !== false) {
      ["Shackle", "Body", "Latch", "Cylinder", "Pins", "Cam"].forEach(function (name) {
        var el = document.createElement("div");
        el.className = "p lbl3d";
        el.textContent = name;
        root.appendChild(el);
        labels[name] = el;
      });
    }

    var others = [faces.back.el, faces.left.el, faces.right.el, faces.top.el, faces.bottom.el,
      latch, arm, cam].concat(shackles.map(function (s) { return s.el; }), pins);

    function pose(s) {
      var ex = s.ex || 0, tug = s.tug || 0, release = s.release || 0;
      var turn = s.turn || 0, rx = s.rx || 0, ry = s.ry || 0;
      var keep = 1 - (s.solo || 0);

      // --- body faces, shaded by how directly each one faces the light ---
      place(front.el, 0, BY, D / 2 + 110 * ex);
      front.el.style.opacity = (1 - 0.55 * ex - 0.7 * (s.see || 0)) * keep;
      place(faces.back.el, 0, BY, -D / 2 - 70 * ex, " rotateY(180deg)");
      place(faces.left.el, -W / 2 - 60 * ex, BY, 0, " rotateY(-90deg)");
      place(faces.right.el, W / 2 + 60 * ex, BY, 0, " rotateY(90deg)");
      place(faces.top.el, 0, BY - H / 2 - 40 * ex, 0, " rotateX(90deg)");
      place(faces.bottom.el, 0, BY + H / 2 + 40 * ex, 0, " rotateX(-90deg)");
      for (var f in faces) {
        var face = faces[f];
        var shade = face.n === null ? face.shade
          : 0.6 * (1 - Math.max(0, Math.cos(rad(face.n + ry - LIGHT))));
        face.el.style.setProperty("--shade", shade.toFixed(3));
      }

      // --- shackle ---
      var lift = 110 * ex + 6 * tug + 50 * release;
      shackles.forEach(function (sh) { place(sh.el, 0, -lift, sh.z); });

      // --- cylinder ---
      var bz = 170 * ex, by = 70 * ex;
      discs.forEach(function (d) { place(d.el, 0, CY + by, d.z + bz); });
      place(discFront, 0, CY + by, D / 2 + 1 + bz, " rotateZ(" + turn + "deg)");
      pins.forEach(function (p, j) {
        place(p, 0, CY - 12 + by - 75 * ex, -D / 2 + 10 + j * 9 + bz);
      });

      // --- cam and latch linkage ---
      var a = CAM_A0 + turn;
      var pinX = CAM_R * Math.cos(rad(a));
      var shift = pinX - CAM_R * Math.cos(rad(CAM_A0));  // latch travel follows the pin
      place(cam, 0, CY + by, LINK_Z + 4 + bz, " rotateZ(" + a + "deg)");
      place(latch, -36 + shift + 30 * ex, -21, LINK_Z);
      place(arm, CAM_R * Math.cos(rad(CAM_A0)) + shift + 30 * ex, 10, LINK_Z + 1);

      // --- key ---
      key.style.opacity = s.keyShow || 0;
      place(key, 0, CY, D / 2 + 2 + (1 - (s.keyIn || 0)) * 60, " rotateZ(" + turn + "deg)");

      others.forEach(function (el) { el.style.opacity = keep; });

      // --- labels, turned to face the viewer ---
      if (labels.Body) {
        var bill = " rotateY(" + -ry + "deg) rotateX(" + -rx + "deg) translate(-10px,-50%)";
        place(labels.Shackle, 85, -175 - 110 * ex, 0, bill);
        place(labels.Body, W / 2 + 60 * ex + 10, BY + 60, 0, bill);
        var l = (s.labels || 0) * keep, c = s.camLabels || 0;
        // In the exploded view the latch label sits by the latch. In the
        // release scene the labels sit outside the body, level with the parts,
        // so the body walls do not hide them.
        if (c > l) place(labels.Latch, W / 2 + 16, -21, D / 2, bill);
        else place(labels.Latch, -20 + 30 * ex, -40, 20, bill);
        place(labels.Cylinder, CR + 10, CY + by + 20, bz + D / 2, bill);
        place(labels.Pins, 15, CY + by - 75 * ex - 10, bz, bill);
        place(labels.Cam, W / 2 + 16, CY - 30, D / 2, bill);
        labels.Shackle.style.opacity = l;
        labels.Body.style.opacity = l;
        labels.Cylinder.style.opacity = l;
        labels.Pins.style.opacity = l;
        labels.Latch.style.opacity = Math.max(l, c);
        labels.Cam.style.opacity = c;
      }
    }

    pose({});
    return { pose: pose, CY: CY, CR: CR, D: D };
  }

  window.Padlock = { build: build };
})();
