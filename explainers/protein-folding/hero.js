/* Gallery card animation for this explainer: a chain folds, a drug fits into
 * the pocket of the folded protein, then the chain unfolds again.
 * On hover the cycle runs faster.
 */
(function () {
  "use strict";
  var heroes = (window.ExplainerHeroes = window.ExplainerHeroes || {});

  heroes["protein-folding"] = function (container) {
    var M = ProteinModel;
    var svg = M.el("svg", { viewBox: "300 95 400 350", style: "position:relative;width:100%;height:100%" });
    container.appendChild(svg);
    M.addDefs(svg);
    var chain = M.buildChain(svg, { r: 8.5, bw: 3.5 });
    var drugG = M.el("g", {}, svg);
    M.buildDrug(drugG, 94, 54);
    var phase = 0.6, speed = 1;

    return function update(dt, hover) {
      speed += ((hover ? 2.2 : 1) - speed) * Math.min(1, dt * 3);
      phase = (phase + dt * speed / 9) % 1;
      var hp = M.heroPose(phase);
      chain.update(M.layoutAt(hp.s));
      drugG.setAttribute("transform", "translate(500 " + (M.POCKET_FLOOR - (1 - hp.drug) * 170).toFixed(1) + ")");
      drugG.style.opacity = Math.min(1, hp.drug * 3);
    };
  };
})();
