/* LUMEN — démarrage et gestion des touches */
'use strict';

(function () {
  /* sur un PC, l'écran 1920×1080 est mis à l'échelle de la fenêtre (sur la TV : 1) */
  function fit() {
    SCALE = Math.min(window.innerWidth / 1920, window.innerHeight / 1080) || 1;
    if (IS_TV) SCALE = 1;
    $('#app').style.transform = SCALE === 1 ? '' : 'scale(' + SCALE + ')';
  }
  window.addEventListener('resize', fit);
  fit();

  function enter(node) {
    var nav = node.getAttribute('data-nav');
    var top = Router.top();
    if (nav && !Router.overlays.length) {
      if (nav === 'resume') App.resumeNow(); else App.go(nav);
      return;
    }
    if (top && top.onEnter) top.onEnter(node);
  }

  document.addEventListener('keydown', function (e) {
    var k = normalizeKey(e), top = Router.top();
    var input = document.activeElement && document.activeElement.tagName === 'INPUT' ? document.activeElement : null;

    // saisie au clavier de la TV : on laisse taper, on reprend la main à la fin
    if (input) {
      if (k === KEY.DONE || k === KEY.CANCEL || k === KEY.ENTER || k === KEY.BACK) {
        e.preventDefault(); input.blur(); return;
      }
      if (k === KEY.UP || k === KEY.DOWN) { e.preventDefault(); input.blur(); Focus.move(k === KEY.UP ? 'up' : 'down'); }
      return;
    }
    if (!top) return;
    if (top.onKey && top.onKey(k, e)) { e.preventDefault(); return; }
    var moved = null;
    switch (k) {
      case KEY.LEFT: Focus.move('left'); moved = 'left'; break;
      case KEY.RIGHT: Focus.move('right'); moved = 'right'; break;
      case KEY.UP: Focus.move('up'); moved = 'up'; break;
      case KEY.DOWN: Focus.move('down'); moved = 'down'; break;
      case KEY.ENTER:
        if (!Focus.valid()) Focus.first(); else enter(Focus.current);
        break;
      case KEY.BACK:
        if (!Router.back()) App.rootBack();
        break;
      default: return;
    }
    if (moved && top.onMove) top.onMove(moved);
    e.preventDefault();
  });

  /* souris (tests sur PC, ou télécommande à pointeur) */
  var app = $('#app');
  app.addEventListener('mousemove', function (e) {
    document.body.classList.add('mouse');
    var n = e.target.closest && e.target.closest('.focusable');
    if (n && n !== Focus.current && (!Focus.scope || Focus.scope.contains(n))) Focus.set(n, true);
  });
  app.addEventListener('click', function (e) {
    var n = e.target.closest && e.target.closest('.focusable');
    if (!n || (Focus.scope && !Focus.scope.contains(n))) return;
    Focus.set(n, true);
    if (n.tagName === 'INPUT') { n.focus(); return; }
    enter(n);
  });
  app.addEventListener('wheel', function (e) {
    Focus.move(e.deltaY > 0 ? 'down' : 'up');
  }, { passive: true });

  /* l'appli passe en arrière-plan (touche Home, changement de source) */
  document.addEventListener('visibilitychange', function () {
    var s = Router.screen();
    if (document.hidden) { if (s && s.suspend) s.suspend(); else Player.stop(); }
    else if (s && s.resume) s.resume();
    else if (s && s.name === 'live' && s.show) s.show(true);
  });

  /* horloge */
  setInterval(function () {
    var t = clockNow();
    $$('.clock').forEach(function (n) { n.textContent = t; });
  }, 10000);

  /* démarrage */
  registerKeys();
  Player.init();
  API.load();
  if (API.base) App.go('home'); else Router.replaceAll(SetupScreen(true));
})();
