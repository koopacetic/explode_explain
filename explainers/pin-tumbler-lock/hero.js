/* Gallery card animation for this explainer: the assembled padlock spinning.
 * Each explainer can register one hero under its folder name. The gallery
 * calls it with an empty container and gets back an update(dt, hover) function.
 */
(function () {
  "use strict";
  var heroes = (window.ExplainerHeroes = window.ExplainerHeroes || {});

  heroes["pin-tumbler-lock"] = function (container) {
    var el = document.createElement("div");
    container.appendChild(el);
    var lock = Padlock.build(el, { labels: false });
    var angle = 20, speed = 30, open = 0;

    return function update(dt, hover) {
      speed += ((hover ? 70 : 30) - speed) * Math.min(1, dt * 3);
      angle += speed * dt;
      // On hover the plug turns and the shackle opens, as a hint of what is inside.
      open += ((hover ? 1 : 0) - open) * Math.min(1, dt * 4);
      var k = container.clientHeight / 440;
      el.style.transform = "translateY(" + 20 * k + "px) scale(" + k + ") rotateX(-8deg) rotateY(" + angle + "deg)";
      lock.pose({ ry: angle, rx: -8, turn: 90 * open, release: Math.max(0, open * 2 - 1) });
    };
  };
})();
