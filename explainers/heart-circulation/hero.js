/* Gallery card animation for this explainer: a standing figure with blood
 * circulating, the heart beating at rest. On hover the heart rate rises, as
 * in exercise, and the blood moves faster.
 */
(function () {
  "use strict";
  var heroes = (window.ExplainerHeroes = window.ExplainerHeroes || {});

  heroes["heart-circulation"] = function (container) {
    var M = BodyModel;
    var svg = M.el("svg", { viewBox: "60 -17 600 616", style: "position:relative;width:100%;height:100%" });
    container.appendChild(svg);
    M.addDefs(svg);
    var body = M.build(svg);
    var phase = 0, rate = 1;

    return function update(dt, hover) {
      rate += ((hover ? 2.3 : 1) - rate) * Math.min(1, dt * 2);
      phase = (phase + dt * rate) % 1; // 60 beats per minute at rest
      body.update({ pose: M.POSES.stand, dt: dt, flow: rate, beat: M.beatShape(phase) });
    };
  };
})();
