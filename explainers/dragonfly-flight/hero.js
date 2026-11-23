/* Gallery card animation for this explainer: a dragonfly seen from above,
 * beating its wings in slow motion with the hindwings a quarter beat ahead.
 * On hover the wings move into step, as for take-off, and beat faster.
 */
(function () {
  "use strict";
  var heroes = (window.ExplainerHeroes = window.ExplainerHeroes || {});

  heroes["dragonfly-flight"] = function (container) {
    var D = Dragonfly;
    var svg = D.el("svg", { viewBox: "230 40 540 510", style: "position:relative;width:100%;height:100%" });
    container.appendChild(svg);
    D.addDefs(svg);
    var wrap = D.el("g", {}, svg);
    var view = D.buildTopView(wrap);
    var phase = 0, lead = 0.25, rate = 0.7, lift = 0;

    return function update(dt, hover) {
      var k = Math.min(1, dt * 2.5);
      lead += ((hover ? 0 : 0.25) - lead) * k;
      rate += ((hover ? 1.6 : 0.7) - rate) * k;
      lift += ((hover ? 1 : 0) - lift) * k;
      phase = (phase + dt * rate) % 1;
      view.update(phase, phase + lead);
      wrap.setAttribute("transform", "translate(0 " + (-12 * lift).toFixed(2) + ")");
    };
  };
})();
