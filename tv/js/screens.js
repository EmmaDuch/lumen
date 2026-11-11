/* LUMEN 2.0 — écrans de l'appli */
'use strict';

/* ---------- fabrication de cartes ---------- */
function progPct(p) {
  if (!p) return 0;
  return Math.max(0, Math.min(100, Math.round((nowSec() - p.start) / Math.max(1, p.stop - p.start) * 100)));
}
function artHTML(ch, prog, extra) {
  /* vignette 16:9 : image du programme si on en a une, sinon initiales sur fond coloré */
  var img = prog && prog.image ? prog.image : '';
  return '<div class="tile16' + (extra || '') + '" style="background:' + tint(ch.id) + '">' +
    (img ? '<img loading="lazy" src="' + esc(API.img(img)) + '" alt="" onerror="this.remove()">' : '') +
    '<span class="ini">' + esc(initials(ch.name)) + '</span>' +
    '<span class="lv">EN DIRECT</span>' +
    '<span class="n">' + esc(ch.num ? ch.num + ' · ' + ch.name : ch.name) + '</span>' +
    (prog ? '<div class="bar"><i style="width:' + progPct(prog) + '%;background:var(--live)"></i></div>' : '') +
    '</div>';
}
function chCardHTML(ch, idx) {
  return '<div class="card focusable" data-key="ch:' + ch.id + '" data-idx="' + idx + '" data-act="channel">' +
    artHTML(ch, ch.now) +
    '<div class="cap">' + esc(ch.now ? ch.now.title : ch.name) + '</div>' +
    '<div class="cap2">' + esc(ch.now ? ch.name : 'Pas de guide') + '</div></div>';
}
function posterHTML(it, idx, sub) {
  var p = it.progress, pct = p && !p.done ? p.pct : 0;
  return '<div class="poster focusable" data-key="' + it.kind + ':' + it.id + '" data-idx="' + idx + '" data-act="open">' +
    '<div class="art" style="background:' + tint(it.id) + '"><div class="fallback">' + esc(it.name) + '</div>' +
    (it.poster ? '<img loading="lazy" src="' + esc(API.img(it.poster)) + '" alt="" onerror="this.remove()">' : '') +
    (it.fav ? '<span class="badge">' + ICON.starFill + '</span>' : '') +
    (p && p.done ? '<span class="badge">' + ICON.check + '</span>' : '') +
    (pct > 0 ? '<div class="bar"><i style="width:' + pct + '%"></i></div>' : '') +
    '</div><div class="cap">' + esc(it.name) + '</div>' + (sub ? '<div class="cap2">' + esc(sub) + '</div>' : '') + '</div>';
}
function tileHTML(act, icon, title, sub) {
  return '<div class="poster tile focusable" data-act="' + act + '" data-key="tile:' + act + '"><div class="art">' +
    '<div class="tile-icon">' + icon + '</div><div><div class="tile-title">' + title + '</div><div class="tile-sub">' + sub + '</div></div>' +
    '</div><div class="cap">Ma liste</div></div>';
}
function badgesHTML(ch, info) {
  var out = [];
  var res = info && info.label ? info.label : (ch && ch.quality ? ch.quality : '');
  if (res) out.push('<span class="bdg">' + esc(res) + '</span>');
  if (info && info.codec) out.push('<span class="bdg">' + esc(codecName(info.codec)) + '</span>');
  if (info && info.audio) out.push('<span class="bdg">' + esc(info.audio) + '</span>');
  if (ch && ch.archive) out.push('<span class="bdg fill">REPLAY</span>');
  return out.join('');
}
function loadingHTML(msg) { return '<div class="spinner"></div><div>' + esc(msg || 'Chargement…') + '</div>'; }
function errorHTML(msg) {
  return '<div>' + esc(msg) + '</div><button class="btn focusable" data-act="retry" data-default>Réessayer</button>';
}
function remainingLabel(p) {
  if (!p) return '';
  if (p.done) return 'Terminé';
  return p.remaining ? dur(p.remaining) + ' restantes' : '';
}
function keepFocus(root, fn) {
  var key = Focus.current && root.contains(Focus.current) ? Focus.current.getAttribute('data-key') : null;
  fn();
  if (!root.__rendered) { root.__rendered = true; if (Focus.scope === root || root.contains(Focus.scope)) Focus.first(root); return; }
  var n = key ? root.querySelector('[data-key="' + key.replace(/"/g, '') + '"]') : null;
  if (n) Focus.set(n, true); else if (!Focus.valid()) Focus.first(root);
}

/* ---------- navigation générale ---------- */
var App = {
  lastBack: 0,
  go: function (name) {
    var make = {
      home: HomeScreen, live: GuideScreen, search: SearchScreen, settings: SettingsScreen,
      vod: function () { return CatalogScreen('vod'); }, series: function () { return CatalogScreen('series'); }
    }[name];
    if (make) Router.replaceAll(make());
  },
  resumeNow: function () {
    if (!Now.channel) return;
    var ch = Now.channel;
    API.get('/api/live?cat=all').then(function (d) {
      var i = d.channels.findIndex(function (c) { return c.id === ch.id; });
      App.playLive(d.channels, i < 0 ? 0 : i);
    }).catch(function () { App.playLive([ch], 0); });
  },
  rootBack: function () {
    var s = Router.screen();
    if (s && s.name !== 'home') { this.go('home'); return; }
    if (Date.now() - this.lastBack < 2500) { this.exit(); return; }
    this.lastBack = Date.now();
    Toast.show('Appuyez encore sur Retour pour quitter LUMEN');
  },
  exit: function () {
    Player.stop();
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { Toast.show('Au revoir'); }
  },
  open: function (kind, id) {
    if (kind === 'movie') Router.push(MovieScreen(id));
    else if (kind === 'series') Router.push(SeriesScreen(id));
    else if (kind === 'channel') Router.push(ChannelScreen(id));
  },
  playLive: function (channels, index) { Router.push(PlayerScreen({ mode: 'live', channels: channels, index: index })); },
  playReplay: function (channel, prog) { Router.push(PlayerScreen({ mode: 'replay', channel: channel, prog: prog })); },
  playMovie: function (item, fromStart) { Router.push(PlayerScreen({ mode: 'movie', item: item, fromStart: fromStart })); },
  playEpisodes: function (series, episodes, index, fromStart) {
    Router.push(PlayerScreen({ mode: 'episode', series: series, episodes: episodes, index: index, fromStart: fromStart }));
  },
  resumeSeries: function (seriesId) {
    Toast.show('Chargement…', 1200);
    API.get('/api/series/detail?id=' + seriesId).then(function (d) {
      var flat = flattenEpisodes(d);
      var idx = d.resume ? flat.findIndex(function (e) { return e.id === d.resume.episode_id; }) : 0;
      App.playEpisodes({ id: d.id, name: d.name, backdrop: d.backdrop }, flat, Math.max(0, idx));
    }).catch(function (e) { Toast.show(e.message); });
  },
  toggleWatchlist: function (it, onDone) {
    var req = it.watchlist ? API.del('/api/watchlist?kind=' + it.kind + '&id=' + it.id)
      : API.post('/api/watchlist', { kind: it.kind, id: it.id, fav: false });
    req.then(function () {
      it.watchlist = !it.watchlist; if (!it.watchlist) it.fav = false;
      Toast.show(it.watchlist ? 'Ajouté à « À regarder plus tard »' : 'Retiré de « À regarder plus tard »');
      if (onDone) onDone();
    }).catch(function (e) { Toast.show(e.message); });
  },
  toggleFav: function (it, onDone) {
    API.post('/api/watchlist', { kind: it.kind, id: it.id, fav: !it.fav }).then(function () {
      it.fav = !it.fav; it.watchlist = true;
      Toast.show(it.fav ? 'Ajouté aux favoris' : 'Retiré des favoris');
      if (onDone) onDone();
    }).catch(function (e) { Toast.show(e.message); });
  },
  toggleFavChannel: function (ch, onDone) {
    API.post('/api/favchannels', { id: ch.id, on: !ch.fav }).then(function () {
      ch.fav = !ch.fav;
      Toast.show(ch.fav ? ch.name + ' ajoutée aux favoris' : ch.name + ' retirée des favoris');
      if (onDone) onDone();
    }).catch(function (e) { Toast.show(e.message); });
  }
};
function flattenEpisodes(d) {
  var flat = [];
  (d.seasons || []).forEach(function (s) { s.episodes.forEach(function (e) { e.season = s.season; flat.push(e); }); });
  return flat;
}
function baseScreen(name, html) {
  return { name: name, el: el('<section class="screen" data-screen="' + name + '">' + html + '</section>') };
}

/* =====================================================================
   PREMIER LANCEMENT / ADRESSE DU SERVEUR
   ===================================================================== */
function SetupScreen(first) {
  var s = baseScreen('setup',
    '<div class="form">' +
    '<div class="brand" style="position:static"><div class="brand-mark">' + ICON.mark + '</div><span class="brand-name">LUMEN</span></div>' +
    '<h1>' + (first ? 'Bienvenue' : 'Serveur LUMEN') + '</h1>' +
    '<p>Indiquez l’adresse du serveur LUMEN sur votre réseau. Par exemple 192.168.1.20</p>' +
    '<div class="field"><label for="srv">Adresse du serveur</label><input id="srv" class="input focusable" data-default autocomplete="off" spellcheck="false" placeholder="192.168.1.20"></div>' +
    '<div class="field"><label for="tok">Mot de passe du serveur (laisser vide s’il n’y en a pas)</label><input id="tok" class="input focusable" autocomplete="off" spellcheck="false"></div>' +
    '<div class="error" id="err"></div>' +
    '<div class="actions"><button class="btn focusable" data-act="save">Se connecter</button>' +
    (first ? '' : '<button class="btn focusable" data-act="cancel">Annuler</button>') + '</div></div>');
  var srv = $('#srv', s.el), tok = $('#tok', s.el), err = $('#err', s.el);
  srv.value = (API.base || '').replace(/^http:\/\//, '').replace(/:8765$/, '');
  tok.value = API.token || '';
  s.onEnter = function (n) {
    var act = n.getAttribute('data-act');
    if (n.tagName === 'INPUT') { n.focus(); return; }
    if (act === 'cancel') { Router.back(); return; }
    if (act !== 'save') return;
    var base = API.normalize(srv.value), token = tok.value.trim();
    if (!base) { err.textContent = 'Indiquez une adresse.'; return; }
    err.textContent = 'Connexion…';
    var oldToken = API.token; API.token = token;
    API.req('GET', '/api/status', null, base).then(function (st) {
      API.base = base; Store.set('server', base); Store.set('token', token);
      if (!st.catalog_sync) Toast.show('Connecté. Le serveur prépare encore le catalogue…', 4000);
      App.go('home');
    }).catch(function (e) {
      API.token = oldToken;
      err.textContent = 'Impossible de joindre ' + base + ' : ' + e.message + '. Vérifiez l’adresse et que le serveur est démarré.';
    });
  };
  return s;
}

/* =====================================================================
   ACCUEIL
   ===================================================================== */
function HomeScreen() {
  var s = baseScreen('home',
    '<div class="hero-art"></div>' + headerHTML('home') +
    '<div class="hero"></div><div class="dots"></div>' +
    '<div class="rows scroll-y" data-pad="40"><div class="inner"></div></div><div class="state"></div>');
  var data = null, hero = $('.hero', s.el), rows = $('.rows .inner', s.el), state = $('.state', s.el);
  var art = $('.hero-art', s.el), dots = $('.dots', s.el), heroList = [], heroIdx = 0, heroTimer = null;

  function load(quiet) {
    if (!quiet) { state.innerHTML = loadingHTML(); state.classList.remove('hidden'); }
    API.get('/api/home').then(function (d) { data = d; state.classList.add('hidden'); keepFocus(s.el, render); })
      .catch(function (e) {
        if (quiet && data) return;
        hero.innerHTML = ''; rows.innerHTML = '';
        state.classList.remove('hidden'); state.innerHTML = errorHTML(e.message); Focus.first(state);
      });
  }
  function buildHeroList() {
    heroList = [];
    data.continue.forEach(function (it) { heroList.push(it); });
    data.recent_movies.slice(0, 4).forEach(function (m) { heroList.push({ kind: 'movie', id: m.id, name: m.name, poster: m.poster, backdrop: m.poster, added: m.added, fresh: true }); });
    if (!heroList.length && data.channels[0]) heroList.push({ kind: 'live', channel: data.channels[0] });
    heroList = heroList.slice(0, 6);
  }
  function renderHero() {
    var h = heroList[heroIdx];
    if (!h) {
      hero.innerHTML = '<div class="kicker">Bienvenue</div><h1>LUMEN</h1>' +
        '<p class="plot">Le catalogue est vide pour l’instant. Vérifiez la synchronisation dans les Réglages.</p>' +
        '<div class="actions"><button class="btn focusable" data-default data-nav="settings" data-key="hero-play">Réglages</button></div>';
      return;
    }
    var kicker, title, meta, plot = '', prog = '';
    if (h.kind === 'live') {
      kicker = 'En direct'; title = h.channel.now ? h.channel.now.title : h.channel.name;
      meta = h.channel.num + ' · ' + h.channel.name;
    } else if (h.fresh) {
      kicker = 'Nouveau'; title = h.name; meta = 'Film ajouté ' + dayLabel(h.added);
    } else {
      kicker = h.resume && h.resume.next ? 'Épisode suivant' : 'Reprendre la lecture';
      title = h.name;
      meta = h.kind === 'series' && h.resume
        ? 'Saison ' + h.resume.season + ' · Épisode ' + h.resume.episode + (h.resume.title ? ' · ' + h.resume.title : '')
        : 'Film';
      var p = h.progress;
      if (p && !p.done) {
        prog = '<div style="display:flex;align-items:center;gap:16px"><div class="bar" style="width:420px"><i style="width:' +
          p.pct + '%"></i></div><span class="meta" style="font-size:19px">' + esc(remainingLabel(p)) + '</span></div>';
      }
    }
    hero.innerHTML = '<div class="kicker">' + esc(kicker) + '</div><h1>' + esc(title) + '</h1>' +
      '<div class="meta">' + esc(meta) + '</div>' + plot + prog +
      '<div class="actions"><button class="btn focusable" data-default data-act="hero-play" data-key="hero-play">' +
      ICON.play + (h.kind === 'live' ? 'Regarder' : (h.fresh ? 'Regarder' : 'Reprendre')) + '</button>' +
      '<button class="btn focusable" data-act="hero-open" data-key="hero-open">' +
      (h.kind === 'live' ? 'La chaîne' : 'Voir la fiche') + '</button></div>';
    var bg = h.kind === 'live' ? (h.channel.now && h.channel.now.image) : (h.backdrop || h.poster);
    art.style.backgroundImage = bg ? 'url("' + API.img(bg) + '")' : '';
    dots.innerHTML = heroList.length > 1 ? heroList.map(function (_, i) {
      return '<i class="' + (i === heroIdx ? 'on' : '') + '"></i>';
    }).join('') : '';
  }
  function rotate() {
    clearTimeout(heroTimer);
    if (heroList.length < 2) return;
    heroTimer = setTimeout(function () {
      if (s.el.classList.contains('browsing') || Router.top() !== s) { rotate(); return; }
      heroIdx = (heroIdx + 1) % heroList.length;
      renderHero();
      rotate();
    }, 9000);
  }
  function render() {
    buildHeroList();
    if (heroIdx >= heroList.length) heroIdx = 0;
    renderHero();
    rotate();
    var out = '';
    if (data.channels.length) {
      out += '<div class="section"><h2>Chaînes favorites <small>Touche jaune dans le guide pour en ajouter</small></h2>' +
        '<div class="strip" data-group="fav"><div class="row">' + data.channels.map(chCardHTML).join('') + '</div></div></div>';
    } else {
      out += '<div class="section"><h2>Chaînes favorites</h2>' +
        '<div class="empty-card focusable" data-nav="live">Aucune chaîne favorite. Dans le guide, placez-vous sur une chaîne et appuyez sur la touche jaune.</div></div>';
    }
    if (data.continue.length) {
      out += '<div class="section"><h2>Reprendre la lecture</h2><div class="strip" data-group="cont"><div class="row">' +
        data.continue.map(function (it, i) {
          var sub = it.kind === 'series' && it.resume ? 'S' + it.resume.season + ' · É' + it.resume.episode : remainingLabel(it.progress);
          return posterHTML(it, i, sub).replace('data-act="open"', 'data-act="resume"').replace('data-key="', 'data-key="c-');
        }).join('') + '</div></div></div>';
    }
    if (data.recent_movies.length) {
      out += '<div class="section"><h2>Films ajoutés récemment</h2><div class="strip" data-group="movies"><div class="row">' +
        data.recent_movies.map(function (it, i) { return posterHTML(it, i); }).join('') + '</div></div></div>';
    }
    if (data.recent_series.length) {
      out += '<div class="section"><h2>Séries mises à jour</h2><div class="strip" data-group="series"><div class="row">' +
        data.recent_series.map(function (it, i) { return posterHTML(it, i); }).join('') + '</div></div></div>';
    }
    rows.innerHTML = out;
    chainRows();
  }
  /* chaque rangée est une liste horizontale ; haut et bas passent d'une rangée à l'autre */
  function chainRows() {
    var zones = $$('.section > .strip, .section > .empty-card', rows);
    zones.forEach(function (z, i) {
      if (z.classList.contains('strip')) z.setAttribute('data-list', 'h');
      var prev = zones[i - 1], next = zones[i + 1];
      z.setAttribute('data-nav-up', prev ? (prev.getAttribute('data-group') || 'row' + (i - 1)) : 'pills');
      z.setAttribute('data-nav-down', next ? (next.getAttribute('data-group') || 'row' + (i + 1)) : 'stop');
      if (!z.getAttribute('data-group')) z.setAttribute('data-group', 'row' + i);
    });
  }
  function findItem(n) {
    var key = n.getAttribute('data-key') || '', idx = Number(n.getAttribute('data-idx'));
    if (key.indexOf('c-') === 0) return data.continue[idx];
    var grp = n.closest('[data-group]'), g = grp && grp.getAttribute('data-group');
    if (g === 'movies') return data.recent_movies[idx];
    if (g === 'series') return data.recent_series[idx];
    return null;
  }
  function playItem(it) {
    if (!it) return;
    if (it.kind === 'movie') App.playMovie(it); else App.resumeSeries(it.id);
  }
  s.onEnter = function (n) {
    var act = n.getAttribute('data-act'), h = heroList[heroIdx];
    if (act === 'retry') return load();
    if (act === 'hero-play') {
      if (!h) return;
      if (h.kind === 'live') return App.playLive(data.channels, 0);
      return playItem(h);
    }
    if (act === 'hero-open') {
      if (!h) return;
      return App.open(h.kind === 'live' ? 'channel' : h.kind, h.kind === 'live' ? h.channel.id : h.id);
    }
    if (act === 'resume') return playItem(findItem(n));
    if (act === 'open') { var it = findItem(n); if (it) App.open(it.kind, it.id); return; }
    if (act === 'channel') App.playLive(data.channels, Number(n.getAttribute('data-idx')));
  };
  s.onKey = function (k) {
    var n = Focus.current;
    if (k === KEY.YELLOW && n && n.getAttribute('data-act') === 'open') {
      var it = findItem(n); if (it) App.toggleWatchlist(it, function () { load(true); });
      return true;
    }
    if (n && n.getAttribute('data-act') === 'hero-play' && heroList.length > 1 && (k === KEY.LEFT || k === KEY.RIGHT)) {
      if (k === KEY.LEFT && !n.previousElementSibling) return false;
      heroIdx = (heroIdx + (k === KEY.RIGHT ? 1 : heroList.length - 1)) % heroList.length;
      renderHero(); rotate();
      var f = $('[data-key="hero-play"]', s.el); if (f) Focus.set(f, true);
      return true;
    }
    if (k === KEY.INFO && n && n.getAttribute('data-act') === 'channel') {
      App.open('channel', data.channels[Number(n.getAttribute('data-idx'))].id); return true;
    }
    return false;
  };
  var rowsBox = $('.rows', s.el);
  s.el.addEventListener('focused', function (e) {
    var inRows = rowsBox.contains(e.target);
    s.el.classList.toggle('browsing', inRows);
    if (!inRows) { rowsBox.scrollTop = 0; return; }
    /* on fait remonter la rangée choisie vers le haut, comme sur l'accueil de la TV */
    var sec = e.target.closest('.section');
    if (sec) rowsBox.scrollTop = Math.max(0, sec.offsetTop - 40);
  });
  s.show = function (returning) { load(returning); rotate(); };
  s.hide = function () { clearTimeout(heroTimer); };
  s.destroy = function () { clearTimeout(heroTimer); };
  return s;
}

/* =====================================================================
   GUIDE EN GRILLE (En direct)
   ===================================================================== */
var G = { X: 160, W: 1280, HOURS: 3 };   /* zone des programmes, dans .g-rows */

function GuideScreen() {
  var s = baseScreen('live', headerHTML('live') +
    '<div class="g-art"></div>' +
    '<div class="g-info"><h1 id="gi-t"></h1><div class="meta" id="gi-m"></div><div class="d" id="gi-d"></div>' +
    '<div class="badges" id="gi-b"></div></div>' +
    '<div class="g-cats scroll-y" data-group="cats" data-list="v" data-pad="60" data-nav-right="grid" data-nav-up="pills" data-nav-down="stop">' +
    '<div class="cats"></div></div>' +
    '<div class="g-time"></div><div class="g-nowline hidden"></div>' +
    '<div class="g-rows scroll-y" data-group="grid" data-pad="90" data-nav-left="cats" data-nav-right="stop"></div>' +
    '<div class="state hidden"></div>' +
    '<div class="hints"><span class="hint"><span class="key">OK</span>Regarder</span>' +
    '<span class="hint"><span class="key yellow">Jaune</span>Favori</span>' +
    '<span class="hint"><span class="key green">Vert</span>Replay</span>' +
    '<span class="hint"><span class="key blue">Bleu</span>Modifier</span>' +
    '<span class="hint"><span class="key">Info</span>La chaîne</span></div>');
  var catsBox = $('.cats', s.el), rowsBox = $('.g-rows', s.el), timeBox = $('.g-time', s.el);
  var nowLine = $('.g-nowline', s.el), state = $('.state', s.el), art = $('.g-art', s.el);
  var cats = [], cat = Store.get('liveCat', 'all'), chans = [], total = 0, loading = false, req = 0;
  var winStart = 0, rowEls = [], curRow = 0, curProg = 0, tick = null, numBuf = '', numTimer = null;
  var prevTimer = null, prevId = null, alive = true, handing = false;

  /* ----- aperçu vidéo : la chaîne survolée se lance dans le cadre en haut à droite ----- */
  function artRect() {
    var r = art.getBoundingClientRect();
    return { x: Math.round(r.left / SCALE), y: Math.round(r.top / SCALE),
             w: Math.round(r.width / SCALE), h: Math.round(r.height / SCALE) };
  }
  function stopPreview() {
    clearTimeout(prevTimer); prevTimer = null;
    if (prevId === null) return;
    prevId = null;
    art.classList.remove('live');
    s.el.classList.remove('previewing');
    if (handing) { handing = false; return; }   // le lecteur reprend le flux tel quel
    s.playingId = null;
    Player.stop();
  }
  function schedulePreview() {
    if (!Store.get('preview', true)) return;
    var ch = chans[curRow];
    if (!ch || ch.id === prevId) return;
    clearTimeout(prevTimer);
    prevTimer = setTimeout(function () { startPreview(ch); }, 1400);
  }
  function startPreview(ch) {
    if (!alive || Router.top() !== s || !Store.get('preview', true)) return;
    if (chans[curRow] !== ch) return;                 // on a bougé entre-temps
    prevId = ch.id; s.playingId = ch.id;
    API.get('/api/play?kind=live&id=' + ch.id).then(function (d) {
      if (!alive || prevId !== ch.id || Router.top() !== s) return;
      art.classList.add('live');
      s.el.classList.add('previewing');
      Player.play(d.url, {
        live: true, rect: artRect(),
        onError: function () { stopPreview(); },
        onEnd: function () { stopPreview(); }
      });
    }).catch(function () { prevId = null; s.playingId = null; });
  }

  function roundWin(t) { return Math.floor(t / 1800) * 1800; }
  function pps() { return G.W / (G.HOURS * 3600); }

  function loadCats() {
    API.get('/api/categories?kind=live').then(function (d) {
      cats = [{ id: 'fav', name: 'Favoris', fav: true }, { id: 'all', name: 'Toutes les chaînes' },
        { id: 'replay', name: 'Avec replay' }].concat(d);
      renderCats();
    }).catch(function () {});
  }
  function renderCats() {
    // la liste ne change pas en naviguant : on ne reconstruit que si elle est vraiment différente,
    // sinon on déplace juste la marque « active » — sans quoi le focus serait perdu à chaque pas
    var sig = cats.map(function (c) { return c.id + ':' + (c.name || ''); }).join('|');
    if (catsBox.getAttribute('data-sig') !== sig) {
      catsBox.setAttribute('data-sig', sig);
      catsBox.innerHTML = cats.map(function (c) {
        if (c.fav) {
          return '<div class="fav focusable" data-cat="fav" data-key="cat:fav">' +
            ICON.starFill + 'Favoris</div><div class="sepline"></div>';
        }
        return '<div class="cat focusable" data-cat="' + esc(c.id) + '" data-key="cat:' + esc(c.id) + '">' +
          '<span class="nm">' + esc(c.name) + '</span><small></small></div>';
      }).join('');
    }
    cats.forEach(function (c) {
      var n = catsBox.querySelector('[data-cat="' + cssEsc(c.id) + '"]');
      if (!n) return;
      n.classList.toggle('active', c.id === cat);
      var sm = n.querySelector('small');
      if (sm) sm.textContent = (c.id === cat && c.count) ? c.count + ' chaînes' : '';
    });
  }
  function load(c, reset) {
    if (reset) { cat = c; Store.set('liveCat', c); chans = []; curRow = 0; curProg = 0; winStart = roundWin(nowSec()); }
    if (loading) return;
    loading = true;
    var my = ++req;
    if (reset) { rowsBox.innerHTML = ''; state.innerHTML = loadingHTML(); state.classList.remove('hidden'); }
    API.get('/api/guide?cat=' + encodeURIComponent(cat) + '&start=' + winStart + '&hours=' + G.HOURS +
            '&offset=' + chans.length + '&limit=50').then(function (d) {
      if (my !== req) return;
      loading = false; state.classList.add('hidden');
      total = d.total;
      chans = chans.concat(d.channels);
      if (reset) renderCats();
      if (!chans.length) {
        state.innerHTML = cat === 'fav'
          ? 'Pas encore de favoris. Choisissez « Toutes les chaînes » et appuyez sur la touche jaune.'
          : 'Aucune chaîne dans cette catégorie.';
        state.classList.remove('hidden');
        if (cat === 'fav') load('all', true);
        return;
      }
      renderGrid();
      // si l'utilisateur parcourt encore la colonne de gauche, la grille ne lui vole pas le focus
      if (reset) focusCell(0, nowIndex(0), !!(Focus.current && Focus.current.hasAttribute('data-cat')));
    }).catch(function (e) {
      loading = false;
      if (reset) { state.innerHTML = errorHTML(e.message); state.classList.remove('hidden'); Focus.first(state); }
    });
  }
  function reloadWindow() {
    /* la fenêtre d'heures a bougé : on redemande les programmes pour les mêmes chaînes */
    var my = ++req, count = chans.length;
    API.get('/api/guide?cat=' + encodeURIComponent(cat) + '&start=' + winStart + '&hours=' + G.HOURS +
            '&offset=0&limit=' + count).then(function (d) {
      if (my !== req) return;
      chans = d.channels; renderGrid(); focusCell(curRow, curProg);
    }).catch(function () {});
  }
  function renderTime() {
    var html = '', t = winStart, p = pps();
    var nowX = (nowSec() - winStart) * p;
    for (var i = 0; i <= G.HOURS * 2; i++) {
      var x = (t - winStart) * p;
      // on saute l'heure ronde qui tomberait sous le repère rouge de l'heure courante
      if (x <= G.W - 40 && Math.abs(x - nowX) > 70) html += '<span style="left:' + Math.round(x) + 'px">' + hhmm(t) + '</span>';
      t += 1800;
    }
    var nx = nowX;
    if (nx >= 0 && nx <= G.W) {
      html += '<span class="now" style="left:' + Math.round(nx) + 'px;transform:translateX(-50%)">' + clockNow() + '</span>';
      nowLine.classList.remove('hidden');
      nowLine.style.left = Math.round(440 + G.X + nx) + 'px';
    } else nowLine.classList.add('hidden');
    timeBox.innerHTML = html;
  }
  function rowHTML(ch, ri) {
    var p = pps(), winEnd = winStart + G.HOURS * 3600, blocks = '';
    var progs = ch.programmes || [];
    if (!progs.length) {
      blocks = '<div class="g-prog none focusable" style="left:' + G.X + 'px;width:' + (G.W - 6) + 'px" ' +
        'data-row="' + ri + '" data-pi="-1" data-key="g:' + ch.id + ':-1">Aucune information</div>';
    } else {
      progs.forEach(function (pr, pi) {
        var a = Math.max(pr.start, winStart), b = Math.min(pr.stop, winEnd);
        if (b <= a) return;
        var left = G.X + (a - winStart) * p, w = Math.max(28, (b - a) * p - 6);
        var past = pr.stop <= nowSec();
        blocks += '<div class="g-prog focusable' + (past ? ' past' : '') + '" style="left:' + Math.round(left) +
          'px;width:' + Math.round(w) + 'px" data-row="' + ri + '" data-pi="' + pi + '" data-key="g:' + ch.id + ':' + pi + '">' +
          esc(pr.title || 'Programme') + (past && ch.archive ? '<span class="rp">REPLAY</span>' : '') + '</div>';
      });
    }
    return '<div class="g-row" data-row="' + ri + '">' +
      '<div class="g-ch"><span class="n">' + esc(ch.num || '') +
      '<small class="st">' + (ch.fav ? '★' : '☆') + '</small></span>' + logoHTML(ch) + '</div>' + blocks + '</div>';
  }
  function renderGrid() {
    renderTime();
    rowsBox.innerHTML = chans.map(rowHTML).join('');
    rowEls = $$('.g-row', rowsBox);
  }
  function nowIndex(ri) {
    var progs = (chans[ri] && chans[ri].programmes) || [];
    var t = nowSec();
    for (var i = 0; i < progs.length; i++) if (progs[i].stop > t) return i;
    return progs.length ? progs.length - 1 : -1;
  }
  function cellNode(ri, pi) {
    var row = rowEls[ri];
    if (!row) return null;
    return row.querySelector('[data-pi="' + pi + '"]') || row.querySelector('.g-prog');
  }
  function focusCell(ri, pi, silent) {
    var n = cellNode(ri, pi);
    if (!n) return;
    curRow = ri; curProg = Number(n.getAttribute('data-pi'));
    if (!silent) Focus.set(n);      // silencieux : on garde le focus dans la colonne des bouquets
    else { showInfo(); }
  }
  function current() {
    var ch = chans[curRow];
    if (!ch) return {};
    var pr = (ch.programmes || [])[curProg];
    return { ch: ch, pr: pr };
  }
  function showInfo() {
    var c = current();
    if (!c.ch) return;
    var pr = c.pr;
    $('#gi-t', s.el).textContent = pr ? (pr.title || 'Programme') : c.ch.name;
    var m = [];
    if (pr) {
      m.push(hhmm(pr.start) + ' – ' + hhmm(pr.stop));
      if (pr.stop > nowSec() && pr.start <= nowSec()) m.push(dur(pr.stop - nowSec()) + ' restantes');
      else m.push(dur(pr.stop - pr.start));
      if (pr.categ) m.push(pr.categ);
    } else m.push('Pas de guide pour cette chaîne');
    $('#gi-m', s.el).innerHTML = m.map(esc).join(' <span class="sep">|</span> ');
    $('#gi-d', s.el).textContent = pr && pr.desc ? pr.desc : '';
    $('#gi-b', s.el).innerHTML = badgesHTML(c.ch, null);
    if (prevId === c.ch.id) return;        // l'aperçu occupe déjà le cadre
    var img = pr && pr.image;
    art.innerHTML = (img ? '<img src="' + esc(API.img(img)) + '" alt="" onerror="this.remove()">' : '') +
      '<span class="ini">' + esc(initials(c.ch.name)) + '</span>';
    art.style.background = tint(c.ch.id);
  }
  s.el.addEventListener('focused', function (e) {
    var n = e.target;
    if (n.classList.contains('g-prog')) {
      curRow = Number(n.getAttribute('data-row'));
      curProg = Number(n.getAttribute('data-pi'));
      if (prevId !== null && chans[curRow] && chans[curRow].id !== prevId) stopPreview();
      showInfo();
      schedulePreview();
      if (curRow > chans.length - 8 && chans.length < total) load(cat, false);
    } else if (n.hasAttribute('data-cat')) autoCat(n.getAttribute('data-cat'));
  });
  var autoCat = debounce(function (c) {
    if (Focus.current && Focus.current.getAttribute('data-cat') === c && c !== cat) {
      cats.forEach(function (x) { x.count = x.id === c ? x.count : x.count; });
      load(c, true);
      renderCats();
    }
  }, 450);

  function shiftWindow(dir) {
    winStart += dir * 1800;
    if (winStart < roundWin(nowSec()) - 6 * 3600) winStart = roundWin(nowSec()) - 6 * 3600;
    reloadWindow();
  }
  function moveProg(dir) {
    var ch = chans[curRow];
    if (!ch) return true;
    var progs = ch.programmes || [], next = curProg + dir;
    if (next < 0) return false;   // au bord gauche : on part vers les catégories
    if (next >= progs.length) { shiftWindow(1); return true; }
    var n = cellNode(curRow, next);
    if (!n) { shiftWindow(dir); return true; }
    focusCell(curRow, next);
    return true;
  }
  function moveRow(dir) {
    var ri = curRow + dir;
    if (ri < 0) return false;
    if (ri >= chans.length) {
      if (chans.length < total) load(cat, false);
      return true;
    }
    /* on garde la même position dans le temps */
    var c = current(), t = c.pr ? c.pr.start : nowSec();
    var progs = chans[ri].programmes || [], pi = 0;
    for (var i = 0; i < progs.length; i++) if (progs[i].stop > t) { pi = i; break; }
    focusCell(ri, pi);
    return true;
  }

  s.onEnter = function (n) {
    var act = n.getAttribute('data-act');
    if (act === 'retry') return load(cat, true);
    if (n.hasAttribute('data-cat')) { load(n.getAttribute('data-cat'), true); renderCats(); return; }
    if (!n.classList.contains('g-prog')) return;
    var c = current();
    if (!c.ch) return;
    var t = nowSec();
    if (c.pr && c.pr.stop <= t) {
      if (!c.ch.archive) { Toast.show('Programme terminé, et pas de replay sur cette chaîne'); return; }
      return App.playReplay(c.ch, c.pr);
    }
    if (c.pr && c.pr.start > t) { progDetailGuide(c.ch, c.pr); return; }
    // si l'aperçu joue déjà cette chaîne, on la passe au lecteur sans la relancer
    if (prevId === c.ch.id) handing = true;
    App.playLive(chans, curRow);
  };
  s.onKey = function (k) {
    var n = Focus.current, inGrid = n && n.classList.contains('g-prog');
    if (inGrid) {
      if (k === KEY.RIGHT) return moveProg(1);
      if (k === KEY.LEFT) return moveProg(-1);
      if (k === KEY.DOWN || k === KEY.CH_DOWN) return moveRow(1);
      if (k === KEY.UP || k === KEY.CH_UP) return moveRow(-1);
      var ch = chans[curRow];
      if (k === KEY.YELLOW && ch) {
        App.toggleFavChannel(ch, function () {
          var row = rowEls[curRow];
          if (row) row.querySelector('.st').textContent = ch.fav ? '★' : '☆';
        });
        return true;
      }
      if (k === KEY.GREEN && ch) {
        if (ch.archive) Router.push(ReplayScreen(ch)); else Toast.show('Pas de replay sur ' + ch.name);
        return true;
      }
      if (k === KEY.BLUE && ch) { editChannel(ch, function () { load(cat, true); }); return true; }
      if (k === KEY.INFO && ch) { App.open('channel', ch.id); return true; }
      if (k >= 48 && k <= 57) {
        numBuf += String(k - 48); Toast.show('Chaîne ' + numBuf, 1500);
        clearTimeout(numTimer);
        numTimer = setTimeout(function () {
          var i = chans.findIndex(function (c) { return String(c.num) === numBuf; });
          numBuf = '';
          if (i < 0) Toast.show('Chaîne introuvable dans cette liste'); else focusCell(i, nowIndex(i));
        }, 1300);
        return true;
      }
    }
    if (k === KEY.BLUE && n && n.hasAttribute('data-cat')) {
      var c0 = cats.filter(function (x) { return x.id === n.getAttribute('data-cat'); })[0];
      if (!c0 || !c0.orig_name) { Toast.show('Cette liste ne peut pas être renommée'); return true; }
      renameCategory('live', c0, function () { loadCats(); });
      return true;
    }
    return false;
  };
  /* fiche d'un programme de la grille (même contenu que dans le panneau du lecteur) */
  function progDetailGuide(ch, p) {
    var ov = { el: el('<div class="panel pd">' +
      (p.image ? '<div class="pd-art"><img src="' + esc(API.img(p.image)) + '" alt="" onerror="this.parentNode.remove()"></div>' : '') +
      '<div class="pd-day">' + esc(dayLabel(p.start)) + ' · ' + esc(ch.name) + '</div>' +
      '<h2>' + esc(p.title || 'Programme') + '</h2>' +
      '<div class="pd-meta">' + [hhmm(p.start) + ' – ' + hhmm(p.stop), dur(p.stop - p.start), p.categ || '']
        .filter(Boolean).map(esc).join(' <span style="opacity:.45">|</span> ') + '</div>' +
      '<div class="scroll-y pd-plot" data-pad="40">' +
      (p.desc ? esc(p.desc) : '<span style="color:var(--muted)">Pas de résumé pour ce programme.</span>') +
      '</div></div>') };
    ov.onEnter = function () { Router.closeOverlay(); };
    Router.overlay(ov);
  }

  s.show = function (returning) {
    alive = true;
    if (!returning) { loadCats(); load(cat, true); }
    else { renderTime(); showInfo(); }
    tick = setInterval(function () { renderTime(); }, 30000);
  };
  s.hide = function () { clearInterval(tick); stopPreview(); };
  s.destroy = function () { alive = false; clearInterval(tick); stopPreview(); };
  return s;
}

/* =====================================================================
   PAGE D'UNE CHAÎNE
   ===================================================================== */
function ChannelScreen(id) {
  var s = baseScreen('channel', '<div class="ch-bg"></div>' + headerHTML('live') +
    '<div class="crumb">' + ICON.back + 'Chaîne</div>' +
    '<div class="ch-head"></div><div class="ch-cols"></div><div class="ch-others"></div><div class="state"></div>');
  var d = null, head = $('.ch-head', s.el), cols = $('.ch-cols', s.el), others = $('.ch-others', s.el);
  var state = $('.state', s.el), bg = $('.ch-bg', s.el);
  function load() {
    state.innerHTML = loadingHTML(); state.classList.remove('hidden');
    API.get('/api/channel?id=' + id).then(function (r) { d = r; state.classList.add('hidden'); keepFocus(s.el, render); })
      .catch(function (e) { state.innerHTML = errorHTML(e.message); state.classList.remove('hidden'); Focus.first(state); });
  }
  function thumb(prog, label) {
    if (!prog) return '<div class="ch-thumb" style="background:' + tint(d.id) + '"><span class="ini">' + esc(initials(d.name)) + '</span></div>';
    return '<div class="ch-thumb" style="background:' + tint(d.id) + '">' +
      (prog.image ? '<img src="' + esc(API.img(prog.image)) + '" alt="" onerror="this.remove()">' : '') +
      '<span class="ini">' + esc(initials(d.name)) + '</span>' +
      (label ? '<span class="bdg live lv">EN DIRECT</span>' : '') +
      '<span class="hh">' + hhmm(prog.start) + ' – ' + hhmm(prog.stop) + '</span>' +
      (label ? '<div class="bar"><i style="width:' + progPct(prog) + '%"></i></div>' : '') + '</div>';
  }
  function render() {
    bg.style.backgroundImage = d.now && d.now.image ? 'url("' + API.img(d.now.image) + '")' : '';
    head.innerHTML = logoHTML(d, 'round big') +
      '<div style="flex:1;min-width:0"><div class="ch-title">' +
      '<span class="ch-star">' + (d.fav ? ICON.starFill : ICON.star) + '</span>' +
      '<h1>' + esc(d.num ? d.num + ' ' + d.name : d.name) + '</h1>' +
      '<div class="badges">' + badgesHTML(d, null) +
      (d.archive_days ? '<span class="bdg fill">REPLAY ' + d.archive_days + ' JOUR' + (d.archive_days > 1 ? 'S' : '') + '</span>' : '') +
      '</div></div>' +
      '<p class="plot" style="margin-top:14px;max-width:1200px">' +
      esc([d.cat_name, d.guide_name ? 'Guide : ' + d.guide_name : ''].filter(Boolean).join(' · ') ||
          'Chaîne de votre abonnement.') + '</p></div>';
    cols.innerHTML =
      '<div class="ch-col"><div class="lbl">En cours</div>' + thumb(d.now, true) +
      '<div class="ch-pt">' + esc(d.now ? d.now.title : d.name) + '</div>' +
      '<div class="ch-pd">' + esc(d.now && d.now.desc ? d.now.desc : '') + '</div></div>' +
      '<div class="ch-mid" data-group="act">' +
      '<button class="btn focusable" data-default data-act="watch" data-key="watch">' + ICON.play + 'Regarder la chaîne</button>' +
      (d.archive ? '<button class="btn focusable" data-act="replay" data-key="replay">' + ICON.history24 + 'Replay de la chaîne</button>' : '') +
      '<button class="btn focusable" data-act="fav" data-key="fav">' + (d.fav ? ICON.starFill : ICON.star) +
      (d.fav ? 'Retirer des favoris' : 'Ajouter aux favoris') + '</button></div>' +
      '<div class="ch-col"><div class="lbl">Programme suivant</div>' + thumb(d.next, false) +
      '<div class="ch-pt">' + esc(d.next ? d.next.title : '—') + '</div>' +
      '<div class="ch-pd">' + esc(d.next && d.next.desc ? d.next.desc : '') + '</div></div>';
    others.innerHTML = d.others.length
      ? '<div class="lbl">Peut aussi vous intéresser</div><div class="scroll-x" data-group="others" data-padx="96"><div class="row">' +
        d.others.map(function (c, i) {
          return '<div class="orb focusable" data-act="other" data-idx="' + i + '" data-key="o:' + c.id + '">' +
            (c.logo ? '<img src="' + esc(API.img(c.logo)) + '" alt="" onerror="this.remove()">' : '') +
            esc(initials(c.name)) + '</div>';
        }).join('') + '</div></div>'
      : '';
  }
  s.onEnter = function (n) {
    var act = n.getAttribute('data-act');
    if (act === 'retry') return load();
    if (act === 'watch') {
      return API.get('/api/live?cat=all').then(function (r) {
        var i = r.channels.findIndex(function (c) { return c.id === d.id; });
        App.playLive(i < 0 ? [d] : r.channels, i < 0 ? 0 : i);
      }).catch(function () { App.playLive([d], 0); });
    }
    if (act === 'replay') return Router.push(ReplayScreen(d));
    if (act === 'fav') return App.toggleFavChannel(d, function () { keepFocus(s.el, render); });
    if (act === 'other') return Router.push(ChannelScreen(d.others[Number(n.getAttribute('data-idx'))].id));
  };
  s.onKey = function (k) {
    if (k === KEY.YELLOW && d) { App.toggleFavChannel(d, function () { keepFocus(s.el, render); }); return true; }
    if (k === KEY.GREEN && d && d.archive) { Router.push(ReplayScreen(d)); return true; }
    return false;
  };
  s.show = function () { load(); };
  return s;
}

/* =====================================================================
   LECTEUR PLEIN ÉCRAN
   ===================================================================== */
function PlayerScreen(o) {
  var live = o.mode === 'live', replay = o.mode === 'replay', base = 0;
  var s = baseScreen('player',
    '<div class="player-ui' + (live ? ' compact' : '') + '"><div class="scrim"></div>' +
    '<div class="p-panel">' +
    '<div class="p-head">' +
    '<img class="p-poster hidden" id="p-poster" alt="">' +
    '<div class="p-meta">' +
    '<div class="p-top" id="p-top"></div>' +
    '<h1 class="p-title" id="p-title"></h1>' +
    '<div class="p-sub" id="p-sub"></div>' +
    '</div></div>' +
    '<div class="p-seek' + (live ? '' : ' vod focusable') + '" id="p-seek"' + (live ? '' : ' data-key="seek"') + '>' +
    '<i id="p-fill" style="width:0"></i>' + (live ? '' : '<b id="p-knob" style="left:0"></b>') + '</div>' +
    (live ? '<div class="p-rest" id="p-rest"></div>'
          : '<div class="p-times"><span id="p-pos">0:00</span><span id="p-dur"></span></div>') +
    '<div class="p-ctl" data-group="ctl" data-list="h">' +
    (live
      ? '<div class="btn focusable" data-default data-act="home">' + ICON.home + 'Accueil</div>' +
        '<div class="btn focusable" data-act="guide">' + ICON.guide + 'Guide</div>' +
        '<div class="btn focusable hidden" data-act="startover">' + ICON.restart + 'Depuis le début</div>' +
        '<div class="btn focusable hidden" data-act="replay">' + ICON.history24 + 'Replay</div>'
      : '<div class="round focusable" data-act="rw" aria-label="Reculer">' + ICON.rw + '</div>' +
        '<div class="round big focusable" data-default data-act="toggle" aria-label="Pause">' + ICON.pause + '</div>' +
        '<div class="round focusable" data-act="ff" aria-label="Avancer">' + ICON.ff + '</div>' +
        (o.mode === 'episode' ? '<div class="btn focusable" data-act="nextep">' + ICON.next + 'Épisode suivant</div>' : '')) +
    '<div class="grow"></div>' +
    (live ? '<div class="round focusable" data-act="info" aria-label="La chaîne">' + ICON.info + '</div>' +
            '<div class="round focusable" data-act="fav" aria-label="Favori">' + ICON.star + '</div>' : '') +
    '<div class="round focusable" data-act="tracks" aria-label="Audio et sous-titres">' + ICON.subs + '</div>' +
    '</div>' +
    (live ? '<div class="p-pop" id="p-pop"></div>' : '') +
    '</div>' +
    '</div><div class="p-status hidden"></div><div class="zap hidden"></div>');
  s.el.classList.add('see-through');
  var ui = $('.player-ui', s.el), status = $('.p-status', s.el), zapBox = $('.zap', s.el);
  var idx = o.index || 0, hideTimer = null, zapTimer = null, numBuf = '', numTimer = null;
  var cur = null, lastSaved = 0, seekTarget = null, seekTimer = null, endTimer = null, nextUp = null;
  var alive = true, epgTimer = null, infoTimer = null, vInfo = null;
  var RETRY_DELAYS = [2, 3, 5, 8, 12, 20], retries = 0, retryTimer = null, healthyTimer = null;
  var lastTick = Date.now(), lastPos = -1, watchdog = null, resumeAt = null, userPaused = false;

  function showUI(persist, full) {
    if (live) ui.classList.toggle('compact', !full);
    ui.classList.remove('faded'); document.body.classList.add('overlay-up');
    clearTimeout(hideTimer);
    if (!persist) hideTimer = setTimeout(hideUI, full ? 12000 : 5000);
  }
  /* passe de la barre discrète au bandeau complet */
  function expandUI() {
    if (!live || !ui.classList.contains('compact')) return false;
    showUI(false, true);
    var first = $('.p-ctl .focusable:not(.hidden)', s.el);
    if (first) Focus.set(first);
    return true;
  }
  function collapseUI() {
    if (!live || ui.classList.contains('compact')) return false;
    showUI(false, false);
    if (Focus.current && ui.contains(Focus.current)) Focus.current.classList.remove('focused'), Focus.current = null;
    return true;
  }
  function uiHidden() { return ui.classList.contains('faded'); }
  function hideUI() {
    if (!Player.isPlaying() || Router.overlays.length || nextUp) return;
    ui.classList.add('faded'); document.body.classList.remove('overlay-up');
    if (live) {
      ui.classList.add('compact');
      if (Focus.current && ui.contains(Focus.current)) Focus.current.classList.remove('focused'), Focus.current = null;
    }
  }
  function setStatus(html) {
    if (!html) { status.classList.add('hidden'); status.innerHTML = ''; return; }
    status.innerHTML = html; status.classList.remove('hidden');
  }
  function setToggleIcon() {
    var b = $('[data-act="toggle"]', s.el);
    if (b) b.innerHTML = Player.isPlaying() ? ICON.pause : ICON.play32;
  }
  function refreshBadges() {
    var ch = live ? o.channels[idx] : (replay ? o.channel : null);
    var top = $('#p-top', s.el);
    if (!top) return;
    if (live) {
      top.innerHTML = logoHTML(ch, 'p-logo') +
        '<span class="bdg live">EN DIRECT</span>' +
        '<span style="font-size:25px;font-weight:600">' + esc((ch.num ? ch.num + ' ' : '') + ch.name) + '</span>' +
        badgesHTML(ch, vInfo);
    } else if (replay) {
      top.innerHTML = logoHTML(o.channel, 'p-logo') +
        '<span class="bdg fill">REPLAY</span>' +
        '<span style="font-size:25px;font-weight:600">' + esc(o.channel.name) + '</span>' +
        '<span style="font-size:21px;color:var(--soft)">' + esc(dayLabel(o.prog.start)) + '</span>' +
        badgesHTML(null, vInfo);
    } else {
      top.innerHTML = '<span class="bdg">' + (o.mode === 'movie' ? 'FILM' : 'SÉRIE') + '</span>' + badgesHTML(null, vInfo);
    }
  }

  /* le guide passe les chaînes avec leurs « programmes » mais sans « now » :
     on le reconstruit, sinon pas d'image ni de progression dans le bandeau */
  function ensureNow(ch, then) {
    if (!ch || ch._loading) return;
    var t = nowSec();
    if (ch.now && ch.now.stop > t) { if (then) then(); return; }
    if (ch.programmes && ch.programmes.length) {
      var p = ch.programmes.filter(function (x) { return x.stop > t; });
      if (p.length) { ch.now = p[0]; ch.next = p[1] || null; if (then) then(); return; }
    }
    ch._loading = true;
    API.get('/api/epg?id=' + ch.id + '&hours=4').then(function (d) {
      ch._loading = false;
      var p = (d.programmes || []).filter(function (x) { return x.stop > nowSec(); });
      ch.now = p[0] || null; ch.next = p[1] || null;
      if (alive && then) then();
    }).catch(function () { ch._loading = false; });
  }

  /* ----- informations affichées ----- */
  function liveInfo() {
    var ch = o.channels[idx];
    refreshBadges();
    $('#p-title', s.el).textContent = ch.now ? ch.now.title : ch.name;
    var m = [];
    if (ch.now) m.push(hhmm(ch.now.start) + ' – ' + hhmm(ch.now.stop));
    if (ch.now && ch.now.categ) m.push(ch.now.categ);
    if (ch.next) m.push('Ensuite ' + hhmm(ch.next.start) + ' · ' + ch.next.title);
    $('#p-sub', s.el).innerHTML = m.map(esc).join(' <span style="opacity:.45">|</span> ');
    $('#p-fill', s.el).style.width = progPct(ch.now) + '%';
    var rest = $('#p-rest', s.el);
    if (rest) rest.textContent = ch.now ? dur(Math.max(0, ch.now.stop - nowSec())) + ' restantes' : '';
    var so = $('[data-act="startover"]', s.el), rp = $('[data-act="replay"]', s.el);
    if (so) so.classList.toggle('hidden', !(ch.archive && ch.now));
    if (rp) rp.classList.toggle('hidden', !ch.archive);
    var fav = $('[data-act="fav"]', s.el);
    if (fav) { fav.innerHTML = ch.fav ? ICON.starFill : ICON.star; fav.classList.toggle('on', !!ch.fav); }
    Now.set(ch, ch.now);
  }
  function refreshEpg() {
    var ch = o.channels[idx];
    if (!ch || !ch.now || ch.now.stop > nowSec()) { if (live) liveInfo(); return; }
    API.get('/api/epg?id=' + ch.id + '&hours=4').then(function (d) {
      var p = d.programmes.filter(function (x) { return x.stop > nowSec(); });
      ch.now = p[0] || null; ch.next = p[1] || null; if (alive) liveInfo();
    }).catch(function () {});
  }
  /* l'affiche à gauche du titre, dans le bandeau */
  function setPoster(src, wide) {
    var im = $('#p-poster', s.el);
    if (!im) return;
    if (!src) { im.classList.add('hidden'); im.removeAttribute('src'); return; }
    im.classList.toggle('wide', !!wide);
    im.onerror = function () { im.classList.add('hidden'); };
    im.src = API.img(src);
    im.classList.remove('hidden');
  }
  function vodInfo() {
    refreshBadges();
    if (replay) {
      setPoster(o.prog.image, true);
      $('#p-title', s.el).textContent = o.prog.title || o.channel.name;
      $('#p-sub', s.el).textContent = hhmm(o.prog.start) + ' – ' + hhmm(o.prog.stop) +
        (o.prog.categ ? ' | ' + o.prog.categ : '');
    } else if (o.mode === 'movie') {
      setPoster(o.item.poster);
      $('#p-title', s.el).textContent = o.item.name;
      $('#p-sub', s.el).textContent = '';
    } else {
      var e = o.episodes[idx], nxt = o.episodes[idx + 1];
      setPoster(e.image || o.series.poster || o.series.backdrop, !!e.image);
      $('#p-title', s.el).textContent = e.title || ('Épisode ' + e.episode);
      $('#p-sub', s.el).textContent = o.series.name + ' · Saison ' + e.season + ' · Épisode ' + e.episode +
        (nxt ? '   |   Ensuite S' + nxt.season + ' · É' + nxt.episode : '');
      var nb = $('[data-act="nextep"]', s.el); if (nb) nb.classList.toggle('hidden', !nxt);
    }
  }
  function updateTime(pos) {
    if (live) return;
    if (replay) pos = base + pos;
    var d = replay ? cur.duration : (Player.duration() || (cur && cur.duration) || 0);
    var p = seekTarget !== null ? seekTarget : pos;
    var pct = d ? Math.min(100, p / d * 100) : 0;
    $('#p-fill', s.el).style.width = pct + '%';
    var kn = $('#p-knob', s.el); if (kn) kn.style.left = pct + '%';
    $('#p-pos', s.el).textContent = clock(p);
    $('#p-dur', s.el).textContent = d ? '-' + clock(Math.max(0, d - p)) : '';
    if (cur && Date.now() - lastSaved > 15000 && pos > 10) save();
  }
  function save(done) {
    if (live || replay || !cur) return;
    var d = Player.duration() || cur.duration || 0, pos = done ? d : Player.position();
    if (!d || pos < 5) return;
    lastSaved = Date.now();
    var body = { kind: o.mode === 'movie' ? 'movie' : 'episode', id: cur.id, position: pos, duration: d };
    if (o.mode === 'episode') body.series_id = o.series.id;
    API.post('/api/progress', body).catch(function () {});
  }

  /* ----- lecture ----- */
  function start() {
    clearTimeout(retryTimer); clearTimeout(endTimer);
    lastTick = Date.now(); lastPos = -1; userPaused = false; vInfo = null;
    nextUp = null; $$('.next-up', s.el).forEach(function (n) { n.remove(); });
    setStatus(loadingHTML('Chargement…')); showUI(true, live ? !ui.classList.contains('compact') : undefined);
    var q, myIdx = idx;
    if (live) {
      cur = o.channels[idx];
      ensureNow(cur, function () { if (alive) { liveInfo(); popular(); } });
      liveInfo(); pushRecent(cur); popular();
      q = '/api/play?kind=live&id=' + cur.id;
    }
    else if (replay) {
      cur = { id: o.channel.id, duration: o.prog.stop - o.prog.start };
      base = resumeAt !== null ? Math.max(0, Math.floor(resumeAt / 60) * 60) : 0; resumeAt = null;
      vodInfo(); q = '/api/play?kind=replay&id=' + o.channel.id + '&start=' + (o.prog.start + base) + '&stop=' + o.prog.stop;
    } else if (o.mode === 'movie') { cur = o.item; vodInfo(); q = '/api/play?kind=movie&id=' + cur.id; }
    else { cur = o.episodes[idx]; vodInfo(); q = '/api/play?kind=episode&id=' + cur.id + '&ext=' + encodeURIComponent(cur.ext || 'mp4'); }
    if (live && Player.url && Player.state !== 'idle' && s.prevPlayingId === cur.id) {
      s.prevPlayingId = null;
      Player.setRect({ x: 0, y: 0, w: 1920, h: 1080 });
      Player.cb = callbacks(); setStatus(''); setToggleIcon(); showUI(); grabInfo();
      return;
    }
    API.get(q).then(function (d) {
      if (!alive || myIdx !== idx) return;
      if (d.local && d.playable === false) setStatus('<div class="warn">' + esc(d.note || 'Format non lu par le téléviseur') + '</div>');
      Player.play(d.local ? API.media(d.url) : d.url, Object.assign(callbacks(), {
        live: live, rect: { x: 0, y: 0, w: 1920, h: 1080 },
        start: resumeAt !== null && !replay ? resumeAt : (o.fromStart ? 0 : (d.start || 0))
      }));
      o.fromStart = false; resumeAt = null;
    }).catch(function (e) { failed(e.message); });
  }
  function grabInfo() {
    clearTimeout(infoTimer);
    infoTimer = setTimeout(function () {
      if (!alive) return;
      vInfo = Player.videoInfo();
      refreshBadges();
    }, 1500);
  }
  function callbacks() {
    return {
      onReady: function () {
        if (!alive) return;
        setStatus(''); setToggleIcon(); showUI(); grabInfo();
        lastTick = Date.now();
        clearTimeout(healthyTimer); healthyTimer = setTimeout(function () { retries = 0; }, 60000);
      },
      onBuffering: function (b) { if (!alive) return; setStatus(b ? loadingHTML('Chargement…') : ''); },
      onTime: function (pos) { if (!alive) return; if (pos !== lastPos) { lastPos = pos; lastTick = Date.now(); } updateTime(pos); },
      onEnd: function () { if (alive) ended(); },
      onError: function (msg) { if (alive) failed(msg); }
    };
  }
  function failed(msg) {
    var pos = Player.position();
    Player.stop();
    clearTimeout(healthyTimer);
    if (retries < RETRY_DELAYS.length) {
      var wait = RETRY_DELAYS[retries++];
      if (!live && pos > 5) resumeAt = replay ? base + pos : pos;
      setStatus(loadingHTML('Reconnexion dans ' + wait + ' s (essai ' + retries + ' sur ' + RETRY_DELAYS.length + ')' +
        (!live && resumeAt ? ' · la lecture reprendra au même endroit' : '')));
      retryTimer = setTimeout(function () { if (alive) start(); }, wait * 1000);
      return;
    }
    setStatus('<div>Lecture impossible' + (live ? ' sur cette chaîne' : '') + '.<br>' +
      '<span style="font-size:20px;color:var(--muted)">' + esc(msg || '') + '</span></div>' +
      '<div class="actions" data-group="err"><button class="btn focusable" data-act="retry" data-default>Réessayer</button>' +
      (live ? '<button class="btn focusable" data-act="next">Chaîne suivante</button>' : '') + '</div>');
    showUI(true); Focus.first(status);
  }
  function ended() {
    save(true);
    if (o.mode === 'episode' && o.episodes[idx + 1]) {
      var nxt = o.episodes[idx + 1], left = 10;
      nextUp = el('<div class="next-up"><div class="kicker">Épisode suivant dans <span id="nu-s">10</span> s</div>' +
        '<div style="font-size:28px;font-weight:600">S' + nxt.season + ' · É' + nxt.episode + (nxt.title ? ' · ' + esc(nxt.title) : '') + '</div>' +
        '<div class="actions" style="margin-top:4px"><button class="btn focusable" data-act="nextep" data-default>' + ICON.play + 'Regarder</button>' +
        '<button class="btn focusable" data-act="quit">Arrêter</button></div></div>');
      s.el.appendChild(nextUp); showUI(true); Focus.first(nextUp);
      var t = function () {
        left--; var n = $('#nu-s', s.el); if (n) n.textContent = left;
        if (left <= 0) { idx++; start(); } else endTimer = setTimeout(t, 1000);
      };
      endTimer = setTimeout(t, 1000);
    } else if (!live) Router.back();
    else failed('le direct s’est arrêté');
  }

  /* ----- chaînes populaires, zapping ----- */
  /* mémoire des chaînes regardées, gardée sur le téléviseur */
  function pushRecent(ch) {
    if (!ch) return;
    var l = Store.get('recentCh', []).filter(function (x) { return x && x.id !== ch.id; });
    l.unshift({ id: ch.id, num: ch.num, name: ch.name, logo: ch.logo });
    Store.set('recentCh', l.slice(0, 12));
  }
  function popular() {
    var box = $('#p-pop', s.el);
    if (!box || !live) return;
    var here = o.channels[idx].id;
    var recent = Store.get('recentCh', []).filter(function (c) { return c && c.id !== here; });
    var fromList = o.channels.filter(function (c) { return c.id !== here; });
    var list = recent.length ? recent.slice(0, 10) : fromList.slice(0, 10);
    var label = recent.length ? 'Dernières chaînes' : 'Chaînes';
    box.innerHTML = list.length ? '<div class="lbl">' + label + '</div>' +
      '<div class="strip" data-group="pop" data-list="h" data-nav-up="ctl" data-nav-down="stop"><div class="row">' +
      list.map(function (c) {
        var full = o.channels.filter(function (x) { return x.id === c.id; })[0] || c;
        return '<div class="focusable" data-act="pick" data-cid="' + c.id + '" data-key="p:' + c.id + '">' +
          artHTML(full, full.now) + '</div>';
      }).join('') + '</div></div>' : '';
    // le programme en cours manque parfois : on le demande une seule fois par chaîne
    list.forEach(function (c) {
      var full = o.channels.filter(function (x) { return x.id === c.id; })[0];
      if (!full || full.now || full._asked) return;
      full._asked = true;
      ensureNow(full, function () { if (alive) popular(); });
    });
  }
  /* bascule vers une chaîne choisie dans la rangée du bas, même si elle n'est pas dans la liste courante */
  function pickChannel(cid) {
    var i = o.channels.findIndex(function (x) { return x.id === cid; });
    if (i < 0) {
      var st = Store.get('recentCh', []).filter(function (x) { return x && x.id === cid; })[0];
      if (!st) return;
      o.channels = o.channels.concat([{ id: st.id, num: st.num, name: st.name, logo: st.logo }]);
      i = o.channels.length - 1;
    }
    zap(0, i);
  }
  function zap(delta, absolute) {
    if (!live) return;
    var n = o.channels.length;
    idx = absolute !== undefined ? absolute : (idx + delta + n) % n;
    ensureNow(o.channels[idx], function () { if (alive) { liveInfo(); popular(); } });
    liveInfo(); showUI(false, !ui.classList.contains('compact'));
    zapBox.textContent = o.channels[idx].num || o.channels[idx].name; zapBox.classList.remove('hidden');
    clearTimeout(zapTimer);
    zapTimer = setTimeout(function () {
      zapBox.classList.add('hidden'); retries = 0; resumeAt = null; setStatus(''); Player.stop(); start();
    }, 450);
  }
  function seekBy(sec) {
    if (live) return;
    var from = seekTarget !== null ? seekTarget : (replay ? base : 0) + Player.position();
    var d = replay ? cur.duration : (Player.duration() || 0);
    seekTarget = Math.max(0, d ? Math.min(d - 3, from + sec) : from + sec);
    updateTime(Player.position()); showUI();
    clearTimeout(seekTimer);
    seekTimer = setTimeout(function () {
      if (replay) { resumeAt = seekTarget; seekTarget = null; Player.stop(); start(); return; }
      Player.seekTo(seekTarget); seekTarget = null;
    }, replay ? 900 : 700);
  }

  /* ----- panneaux ----- */
  function guidePanel() {
    var ch = o.channels[idx], progs = [];
    var ov = { el: el('<div class="panel"><h2>' + esc(ch.name) + '</h2><div class="lbl">Guide des programmes</div>' +
      '<div class="scroll-y" data-pad="60"><div class="state" style="position:static;margin-top:120px">' + loadingHTML() + '</div></div></div>') };
    ov.onEnter = function (n) {
      var i = n && n.getAttribute('data-pi');
      if (i === null || i === undefined) return Router.closeOverlay();
      progDetail(ch, progs[Number(i)]);
    };
    Router.overlay(ov); showUI(true);
    API.get('/api/epg?id=' + ch.id + '&hours=24&back=4').then(function (d) {
      progs = d.programmes;
      var box = $('.scroll-y', ov.el), t = nowSec();
      box.innerHTML = progs.length ? progs.map(function (p, i) {
        var cur = p.start <= t && p.stop > t;
        return '<div class="opt focusable' + (cur ? ' sel' : '') + '" data-pi="' + i + '"' + (cur ? ' data-default' : '') + '>' +
          '<span class="t">' + hhmm(p.start) + '</span>' +
          '<span style="flex:1">' + esc(p.title) + '</span>' +
          (cur ? '<span class="bdg live">EN COURS</span>' : '') + '</div>';
      }).join('') : '<div class="opt">Pas de guide pour cette chaîne.</div>';
      Focus.first(ov.el);
    }).catch(function (e) { $('.scroll-y', ov.el).innerHTML = '<div class="opt">' + esc(e.message) + '</div>'; });
    ov.onClose = function () { showUI(); };
  }

  /* zapping rapide : la liste des chaînes, à gauche, sans quitter la lecture */
  function zapPanel() {
    var WIN = 240, start = 0, ov = null;
    function window_(center) {
      start = Math.max(0, Math.min(center - Math.floor(WIN / 2), o.channels.length - WIN));
      if (start < 0) start = 0;
      return o.channels.slice(start, start + WIN);
    }
    function rowHTML(c, i) {
      var here = i === idx;
      return '<div class="zrow focusable' + (here ? ' sel' : '') + '" data-ci="' + i + '" data-key="z:' + c.id + '"' +
        (here ? ' data-default' : '') + '>' +
        logoHTML(c, 'zlogo') +
        '<div class="znum">' + (c.num || '') + '</div>' +
        '<div class="zmeta"><div class="zname">' + esc(c.name) + '</div>' +
        '<div class="znow">' + esc(c.now ? c.now.title : '') + '</div></div>' +
        (here ? '<span class="bdg live">EN DIRECT</span>' : '') + '</div>';
    }
    function render(center) {
      var list = window_(center);
      $('.scroll-y', ov.el).innerHTML = list.map(function (c, k) { return rowHTML(c, start + k); }).join('');
    }
    ov = { el: el('<div class="panel left zap"><div class="lbl">Chaînes</div>' +
      '<div class="scroll-y" data-pad="120"></div></div>') };
    ov.onEnter = function (n) {
      var i = n && n.getAttribute('data-ci');
      if (i === null || i === undefined) return Router.closeOverlay();
      Router.closeOverlay();
      zap(0, Number(i));
    };
    // près du bord de la fenêtre affichée, on la recentre pour pouvoir continuer
    ov.onMove = function () {
      var cur = Focus.current && Focus.current.getAttribute('data-ci');
      if (cur === null || cur === undefined) return;
      var i = Number(cur);
      if (o.channels.length <= WIN) return;
      if (i < start + 20 || i > start + WIN - 20) {
        render(i);
        var n = $('[data-ci="' + i + '"]', ov.el);
        if (n) Focus.set(n);
      }
    };
    Router.overlay(ov);
    render(idx);
    var cur = $('[data-ci="' + idx + '"]', ov.el);
    if (cur) Focus.set(cur); else Focus.first(ov.el);
    ov.onClose = function () { showUI(); };
  }

  /* fiche détaillée d'un programme, ouverte depuis la liste du guide */
  function progDetail(ch, p) {
    if (!p) return;
    var t = nowSec(), past = p.stop <= t, cur = p.start <= t && p.stop > t;
    var meta = [hhmm(p.start) + ' – ' + hhmm(p.stop), dur(p.stop - p.start)];
    if (p.categ) meta.push(p.categ);
    var actions = '';
    if (ch.archive && (past || cur)) {
      actions = '<div class="pd-actions"><div class="btn primary focusable" data-act="pd-replay" data-key="pd-replay" data-default>' +
        ICON.restart + (cur ? 'Depuis le début' : 'Voir en replay') + '</div></div>';
    }
    var ov = { el: el('<div class="panel pd">' +
      (p.image ? '<div class="pd-art"><img src="' + esc(API.img(p.image)) + '" alt="" onerror="this.parentNode.remove()"></div>' : '') +
      '<div class="pd-day">' + esc(dayLabel(p.start)) + '</div>' +
      '<h2>' + esc(p.title) + '</h2>' +
      '<div class="pd-meta">' + meta.map(esc).join(' <span style="opacity:.45">|</span> ') + '</div>' +
      '<div class="scroll-y pd-plot" data-pad="40">' + (p.desc ? esc(p.desc) : '<span style="color:var(--muted)">Pas de résumé pour ce programme.</span>') + '</div>' +
      actions + '</div>') };
    ov.onEnter = function (n) {
      if (n && n.getAttribute('data-act') === 'pd-replay') {
        Router.closeOverlay(); Router.closeOverlay();
        App.playReplay(ch, p);
        return;
      }
      Router.closeOverlay();
    };
    Router.overlay(ov);
    if (actions) Focus.first(ov.el);
  }
  function tracksPanel() {
    var t = Player.tracks(), v = Player.videoInfo();
    var opt = function (type, index, label, sel) {
      return '<div class="opt focusable' + (sel ? ' sel' : '') + '" data-type="' + type + '" data-index="' + index + '"' +
        (sel ? ' data-default' : '') + '><span>' + esc(label) + '</span>' + (sel ? ICON.check : '') + '</div>';
    };
    var info = v.label ? '<div class="lbl">Flux</div><div class="opt">' + esc(v.label + (v.width ? '  ' + v.width + '×' + v.height : '')) +
      '<span class="t" style="width:auto">' + esc(codecName(v.codec) + (v.audio ? ' · ' + v.audio : '')) + '</span></div>' : '';
    var html = info + '<div class="lbl">Audio</div>' +
      (t.audio.length ? t.audio.map(function (a) { return opt('a', a.index, a.label, a.index === t.curAudio); }).join('')
        : '<div class="opt">Piste par défaut</div>') +
      '<div class="lbl">Sous-titres</div>' + opt('t', -1, 'Désactivés', t.curText < 0) +
      t.text.map(function (a) { return opt('t', a.index, a.label, a.index === t.curText); }).join('');
    var ov = { el: el('<div class="panel"><h2>Audio et sous-titres</h2><div class="scroll-y" data-pad="60">' + html + '</div></div>') };
    ov.onEnter = function (n) {
      var type = n.getAttribute('data-type'), index = Number(n.getAttribute('data-index'));
      if (type === 'a') Player.selectAudio(index); else if (type === 't') Player.selectText(index);
      Router.closeOverlay();
    };
    ov.onClose = function () { showUI(); };
    Router.overlay(ov); showUI(true);
  }

  s.onEnter = function (n) {
    var act = n.getAttribute('data-act');
    showUI(false, live ? !ui.classList.contains('compact') : undefined);
    if (act === 'toggle') { Player.toggle(); userPaused = !Player.isPlaying(); lastTick = Date.now(); setToggleIcon(); if (userPaused) showUI(true); }
    else if (act === 'home') { Router.back(); App.go('home'); }
    else if (act === 'pick') { setStatus(''); pickChannel(Number(n.getAttribute('data-cid'))); }
    else if (act === 'next') { setStatus(''); zap(1); }
    else if (act === 'rw') seekBy(replay ? -300 : -10);
    else if (act === 'ff') seekBy(replay ? 300 : 30);
    else if (act === 'retry') { retries = 0; setStatus(''); start(); }
    else if (act === 'guide') guidePanel();
    else if (act === 'tracks') tracksPanel();
    else if (act === 'info') App.open('channel', o.channels[idx].id);
    else if (act === 'fav') App.toggleFavChannel(o.channels[idx], liveInfo);
    else if (act === 'startover') { var so = o.channels[idx]; if (so.now) App.playReplay(so, so.now); }
    else if (act === 'replay') Router.push(ReplayScreen(o.channels[idx]));
    else if (act === 'nextep') { save(); if (o.episodes[idx + 1]) { idx++; Player.stop(); start(); } }
    else if (act === 'quit') Router.back();
    else if (n.id === 'p-seek') { Player.toggle(); userPaused = !Player.isPlaying(); lastTick = Date.now(); setToggleIcon(); }
  };
  s.onKey = function (k) {
    var wasHidden = ui.classList.contains('faded');
    if (k === KEY.PLAY) { Player.resume(); userPaused = false; lastTick = Date.now(); setToggleIcon(); showUI(); return true; }
    if (k === KEY.PAUSE) { Player.pause(); userPaused = true; setToggleIcon(); showUI(true); return true; }
    if (k === KEY.PLAYPAUSE) { Player.toggle(); userPaused = !Player.isPlaying(); lastTick = Date.now(); setToggleIcon(); showUI(userPaused); return true; }
    if (k === KEY.STOP) { Router.back(); return true; }
    if (k === KEY.INFO) {
      if (live) { App.open('channel', o.channels[idx].id); return true; }
      if (wasHidden) showUI(); else { ui.classList.add('faded'); document.body.classList.remove('overlay-up'); }
      return true;
    }
    if (live) {
      if (!Router.overlays.length && (k === KEY.CH_UP || (k === KEY.UP && wasHidden))) { setStatus(''); zap(-1); return true; }
      if (!Router.overlays.length && (k === KEY.CH_DOWN || (k === KEY.DOWN && wasHidden))) { setStatus(''); zap(1); return true; }
      if (k === KEY.GUIDE) { guidePanel(); return true; }
      if (k === KEY.YELLOW) { App.toggleFavChannel(o.channels[idx], liveInfo); return true; }
      if (k === KEY.GREEN && o.channels[idx].archive) { Router.push(ReplayScreen(o.channels[idx])); return true; }
      if (k >= 48 && k <= 57) {
        numBuf += String(k - 48); zapBox.textContent = numBuf; zapBox.classList.remove('hidden');
        clearTimeout(numTimer);
        numTimer = setTimeout(function () {
          var i = o.channels.findIndex(function (ch) { return String(ch.num) === numBuf; });
          numBuf = '';
          if (i < 0) { zapBox.classList.add('hidden'); Toast.show('Chaîne introuvable'); } else zap(0, i);
        }, 1400);
        return true;
      }
    } else {
      if (k === KEY.FF) { seekBy(replay ? 300 : 30); return true; }
      if (k === KEY.RW) { seekBy(replay ? -300 : -10); return true; }
      if (Focus.current && Focus.current.id === 'p-seek' && (k === KEY.LEFT || k === KEY.RIGHT)) {
        seekBy(k === KEY.LEFT ? (replay ? -60 : -10) : (replay ? 60 : 30)); return true;
      }
      if (k === KEY.CH_DOWN && o.mode === 'episode' && o.episodes[idx + 1]) { save(); idx++; Player.stop(); start(); return true; }
    }
    if (wasHidden && (k === KEY.ENTER || k === KEY.LEFT || k === KEY.RIGHT || k === KEY.UP || k === KEY.DOWN)) { showUI(); return true; }
    // en direct : la barre discrète s'ouvre sur OK, et se referme sur Retour
    if (live) {
      if (k === KEY.LEFT && ui.classList.contains('compact')) { zapPanel(); return true; }
      if (k === KEY.ENTER && ui.classList.contains('compact')) { expandUI(); return true; }
      if ((k === KEY.UP || k === KEY.DOWN) && ui.classList.contains('compact')) { expandUI(); return true; }
      if (k === KEY.BACK && !ui.classList.contains('compact')) { collapseUI(); return true; }
    }
    showUI(false, live ? !ui.classList.contains('compact') : undefined);
    return false;
  };
  s.show = function (returning) {
    if (returning) { start(); return; }
    var prev = Router.stack[Router.stack.length - 2];
    s.prevPlayingId = prev && prev.name === 'live' ? prev.playingId : null;
    start();
    epgTimer = setInterval(function () { if (live) refreshEpg(); }, 30000);
    watchdog = setInterval(function () {
      if (!alive || userPaused || Player.state === 'idle' || seekTarget !== null) return;
      if (Date.now() - lastTick > (live ? 20000 : 30000)) failed('le flux s’est figé');
    }, 5000);
  };
  s.hide = function () { clearTimeout(retryTimer); clearTimeout(zapTimer); clearTimeout(seekTimer); Player.cb = {}; };
  s.destroy = function () {
    alive = false; save();
    [hideTimer, zapTimer, endTimer, seekTimer, retryTimer, healthyTimer, infoTimer].forEach(clearTimeout);
    clearInterval(epgTimer); clearInterval(watchdog);
    document.body.classList.remove('overlay-up');
    Player.stop();
    if (!live) Now.clear();
  };
  s.suspend = function () { save(); Player.suspend(); };
  s.resume = function () { Player.restore(); lastTick = Date.now(); showUI(); };
  return s;
}

/* =====================================================================
   REPLAY D'UNE CHAÎNE
   ===================================================================== */
function ReplayScreen(ch) {
  var s = baseScreen('replay', headerHTML('live') +
    '<div class="page-top"><div class="icon-btn focusable" data-act="back" aria-label="Retour">' + ICON.back + '</div>' +
    logoHTML(ch) + '<h1>Replay · ' + esc(ch.name) + '</h1>' +
    '<div class="chips" data-group="days" data-nav-down="progs"><div class="row"></div></div></div>' +
    '<div class="grid-wrap scroll-y" data-pad="100"><div class="replay-list" data-group="progs" data-nav-up="days"></div></div>' +
    '<div class="state"></div>');
  var progs = [], days = [], day = null, list = $('.replay-list', s.el), state = $('.state', s.el);
  function dayKey(ts) { var d = new Date(ts * 1000); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function load() {
    state.innerHTML = loadingHTML(); state.classList.remove('hidden');
    API.get('/api/replay?id=' + ch.id).then(function (d) {
      progs = d.programmes; state.classList.add('hidden');
      var seen = {}; days = [];
      progs.forEach(function (p) { var k = dayKey(p.start); if (!seen[k]) { seen[k] = 1; days.push({ key: k, ts: p.start }); } });
      if (!progs.length) { state.innerHTML = 'Aucun programme en replay pour le moment.'; state.classList.remove('hidden'); return; }
      day = days[0].key;
      $('.chips .row', s.el).innerHTML = days.map(function (x) {
        var lbl = dayLabel(x.ts).replace(/^le /, '');
        return '<div class="chip focusable' + (x.key === day ? ' active' : '') + '" data-day="' + x.key + '">' +
          esc(lbl.charAt(0).toUpperCase() + lbl.slice(1)) + '</div>';
      }).join('');
      renderDay();
      Focus.first(list);
    }).catch(function (e) { state.innerHTML = errorHTML(e.message); state.classList.remove('hidden'); Focus.first(state); });
  }
  function renderDay() {
    var t = nowSec();
    list.innerHTML = progs.map(function (p, i) {
      if (dayKey(p.start) !== day) return '';
      var onAir = p.stop > t;
      return '<div class="rp-row focusable' + (p.available ? '' : ' unavailable') + '" data-idx="' + i + '">' +
        '<div class="rp-time">' + hhmm(p.start) + '<small>' + dur(p.stop - p.start) + '</small></div>' +
        (p.image ? '<div class="rp-img"><img loading="lazy" src="' + esc(API.img(p.image)) + '" alt="" onerror="this.remove()"></div>' : '') +
        '<div class="rp-body"><div class="rp-title">' + esc(p.title || 'Programme') + '</div>' +
        (p.desc ? '<div class="rp-desc">' + esc(p.desc) + '</div>' : '') + '</div>' +
        (onAir ? '<span class="bdg red">EN COURS</span>' : (p.available ? '' : '<span class="rp-na">Non disponible</span>')) +
        '</div>';
    }).join('');
    $('.grid-wrap', s.el).scrollTop = 0;
  }
  s.el.addEventListener('focused', function (e) {
    var n = e.target;
    if (n.hasAttribute('data-day') && n.getAttribute('data-day') !== day) {
      day = n.getAttribute('data-day');
      $$('.chip', s.el).forEach(function (c) { c.classList.toggle('active', c === n); });
      renderDay();
    }
  });
  s.onEnter = function (n) {
    var act = n.getAttribute('data-act');
    if (act === 'back') return Router.back();
    if (act === 'retry') return load();
    if (n.classList.contains('rp-row')) {
      var p = progs[Number(n.getAttribute('data-idx'))];
      if (!p.available) { Toast.show('Ce programme n’est pas enregistré par votre fournisseur'); return; }
      App.playReplay(ch, p);
    }
  };
  s.show = function (returning) { if (!returning) load(); };
  return s;
}

/* =====================================================================
   FILMS / SÉRIES (catalogue)
   ===================================================================== */
function CatalogScreen(kind) {
  var isVod = kind === 'vod';
  var s = baseScreen(kind, headerHTML(kind) +
    '<div class="page-top"><div class="chips" data-group="chips" data-nav-down="grid"><div class="row"></div></div></div>' +
    '<div class="grid-wrap scroll-y" data-pad="80"><div class="grid" data-group="grid" data-nav-up="chips"></div></div>' +
    '<div class="state hidden"></div>');
  var chips = $('.chips .row', s.el), grid = $('.grid', s.el), wrap = $('.grid-wrap', s.el), state = $('.state', s.el);
  var cat = 'all', items = [], total = 0, loading = false, req = 0, firstLoad = true;
  var path = isVod ? '/api/vod' : '/api/series';

  function loadCats() {
    API.get('/api/categories?kind=' + kind).then(function (d) {
      chips.innerHTML = [{ id: 'all', name: isVod ? 'Tous les films' : 'Toutes les séries' }].concat(d).map(function (c) {
        return '<div class="chip focusable' + (c.id === cat ? ' active' : '') + '" data-cat="' + esc(c.id) + '" data-key="cat:' + esc(c.id) + '">' + esc(c.name) + '</div>';
      }).join('');
    }).catch(function () {});
  }
  function load(reset) {
    if (loading && !reset) return;
    if (reset) { items = []; total = 0; grid.innerHTML = ''; wrap.scrollTop = 0; state.innerHTML = loadingHTML(); state.classList.remove('hidden'); }
    loading = true;
    var my = ++req;
    API.get(path + '?cat=' + encodeURIComponent(cat) + '&offset=' + items.length + '&limit=70').then(function (d) {
      if (my !== req) return;
      loading = false; state.classList.add('hidden');
      var start = items.length;
      if (reset && cat === 'all') {
        grid.insertAdjacentHTML('beforeend',
          tileHTML('history', ICON.history, 'Historique', isVod ? 'Films déjà vus ou commencés' : 'Séries déjà vues ou en cours') +
          tileHTML('later', ICON.bookmark, 'À regarder plus tard', isVod ? 'Vos favoris et films mis de côté' : 'Vos favoris et séries mises de côté'));
      }
      items = items.concat(d.items); total = d.total;
      grid.insertAdjacentHTML('beforeend', d.items.map(function (it, i) {
        return posterHTML(it, start + i, isVod ? (it.progress && !it.progress.done ? remainingLabel(it.progress) : '') : (it.genre || ''));
      }).join(''));
      if (reset) {
        if (!items.length) { state.innerHTML = 'Rien dans cette catégorie.'; state.classList.remove('hidden'); }
        if (firstLoad || !Focus.valid() || Focus.current.closest('.grid')) Focus.first(grid);
        firstLoad = false;
      }
    }).catch(function (e) {
      loading = false;
      if (reset) { state.innerHTML = errorHTML(e.message); state.classList.remove('hidden'); Focus.first(state); }
    });
  }
  s.el.addEventListener('focused', function (e) {
    var i = Number(e.target.getAttribute('data-idx'));
    if (e.target.classList.contains('poster') && i > items.length - 22 && items.length < total) load(false);
  });
  s.onEnter = function (n) {
    var act = n.getAttribute('data-act');
    if (act === 'retry') return load(true);
    if (n.classList.contains('chip')) {
      cat = n.getAttribute('data-cat');
      $$('.chip', s.el).forEach(function (c) { c.classList.toggle('active', c === n); });
      load(true); return;
    }
    if (act === 'history') return Router.push(HistoryScreen(isVod ? 'movies' : 'series'));
    if (act === 'later') return Router.push(WatchlistScreen(isVod ? 'movies' : 'series'));
    if (act === 'open') { var it = items[Number(n.getAttribute('data-idx'))]; if (it) App.open(it.kind, it.id); }
  };
  s.onKey = function (k) {
    var n = Focus.current;
    if (k === KEY.BLUE && n && n.classList.contains('chip') && n.getAttribute('data-cat') !== 'all') {
      var cid = n.getAttribute('data-cat');
      API.get('/api/categories?kind=' + kind).then(function (d) {
        var c0 = d.filter(function (c) { return c.id === cid; })[0];
        if (c0) renameCategory(kind, c0, loadCats);
      });
      return true;
    }
    if (k === KEY.YELLOW && n && n.getAttribute('data-act') === 'open') {
      var it = items[Number(n.getAttribute('data-idx'))];
      App.toggleWatchlist(it, function () { var f = el(posterHTML(it, Number(n.getAttribute('data-idx')), '')); n.replaceWith(f); Focus.set(f, true); });
      return true;
    }
    return false;
  };
  s.show = function (returning) {
    if (!returning) { loadCats(); load(true); return; }
    API.get(path + '?cat=' + encodeURIComponent(cat) + '&offset=0&limit=' + Math.min(200, items.length || 1)).then(function (d) {
      d.items.forEach(function (it, i) {
        var old = items[i]; if (!old || old.id !== it.id) return;
        items[i] = it;
        var n = grid.querySelector('[data-idx="' + i + '"]');
        if (n && (JSON.stringify(old.progress) !== JSON.stringify(it.progress) || old.fav !== it.fav)) {
          var f = el(posterHTML(it, i, isVod ? (it.progress && !it.progress.done ? remainingLabel(it.progress) : '') : (it.genre || '')));
          var had = Focus.current === n; n.replaceWith(f); if (had) Focus.set(f, true);
        }
      });
    }).catch(function () {});
  };
  return s;
}

/* =====================================================================
   FICHE FILM
   ===================================================================== */
function MovieScreen(id) {
  var s = baseScreen('movie', '<div class="backdrop"></div>' + headerHTML('vod') +
    '<div class="crumb">' + ICON.back + 'Films</div><div class="detail"></div><div class="state"></div>');
  var m = null, box = $('.detail', s.el), state = $('.state', s.el);
  function load() {
    state.innerHTML = loadingHTML(); state.classList.remove('hidden');
    API.get('/api/movie?id=' + id).then(function (d) { m = d; state.classList.add('hidden'); keepFocus(s.el, render); })
      .catch(function (e) { state.innerHTML = errorHTML(e.message); state.classList.remove('hidden'); Focus.first(state); });
  }
  function render() {
    var p = m.progress, resumable = p && !p.done && p.position > 30;
    $('.backdrop', s.el).style.backgroundImage = m.backdrop ? 'url("' + API.img(m.backdrop) + '")' : '';
    var meta = [m.year, m.genre, dur(m.duration), m.rating ? '★ ' + m.rating : ''].filter(Boolean)
      .map(esc).join(' <span class="sep">|</span> ');
    box.innerHTML = '<h1>' + esc(m.name) + '</h1><div class="meta">' + meta + '</div>' +
      (m.plot ? '<p class="plot">' + esc(m.plot) + '</p>' : '') +
      (m.director || m.cast ? '<div class="meta" style="font-size:19px">' +
        esc([m.director ? 'Réalisation : ' + m.director : '', m.cast ? 'Avec : ' + m.cast : ''].filter(Boolean).join(' · ')).slice(0, 220) + '</div>' : '') +
      (resumable ? '<div style="display:flex;align-items:center;gap:16px"><div class="bar" style="width:440px"><i style="width:' + p.pct + '%"></i></div>' +
        '<span class="meta" style="font-size:19px">' + esc(remainingLabel(p)) + '</span></div>' : '') +
      '<div class="actions" data-group="act"><button class="btn focusable" data-default data-act="play" data-key="play">' +
      ICON.play + (resumable ? 'Reprendre' : 'Regarder') + '</button>' +
      (resumable ? '<button class="btn focusable" data-act="restart" data-key="restart">Depuis le début</button>' : '') +
      (m.trailer ? '<button class="btn focusable" data-act="trailer" data-key="trailer">' + ICON.film + 'Bande-annonce</button>' : '') +
      '<button class="btn square focusable' + (m.watchlist ? ' on' : '') + '" data-act="later" data-key="later" aria-label="À regarder plus tard">' +
      (m.watchlist ? ICON.bookmarkFill : ICON.bookmark) + '</button>' +
      '<button class="btn square focusable' + (m.fav ? ' on' : '') + '" data-act="fav" data-key="fav" aria-label="Favori">' +
      (m.fav ? ICON.starFill : ICON.star) + '</button></div>';
  }
  s.onEnter = function (n) {
    var act = n.getAttribute('data-act');
    if (act === 'retry') return load();
    if (act === 'play') App.playMovie(m);
    if (act === 'restart') App.playMovie(m, true);
    if (act === 'trailer') openTrailer(m.trailer, m.name);
    if (act === 'later') App.toggleWatchlist(m, function () { keepFocus(s.el, render); });
    if (act === 'fav') App.toggleFav(m, function () { keepFocus(s.el, render); });
  };
  s.onKey = function (k) { if (k === KEY.YELLOW && m) { App.toggleWatchlist(m, function () { keepFocus(s.el, render); }); return true; } return false; };
  s.show = function () { load(); };
  return s;
}

/* =====================================================================
   FICHE SÉRIE
   ===================================================================== */
function SeriesScreen(id) {
  var s = baseScreen('serie', '<div class="backdrop" style="height:760px"></div>' + headerHTML('series') +
    '<div class="crumb">' + ICON.back + 'Séries</div><div class="detail"></div>' +
    '<div class="seasons"><div class="chips" data-group="seasons" data-nav-down="eps" data-nav-up="act"><div class="row"></div></div></div>' +
    '<div class="episodes scroll-x" data-group="eps" data-padx="96" data-nav-up="seasons" data-nav-down="stop"><div class="row"></div></div>' +
    '<div class="state"></div>');
  var d = null, flat = [], season = null, box = $('.detail', s.el), state = $('.state', s.el);
  function load() {
    state.innerHTML = loadingHTML(); state.classList.remove('hidden');
    API.get('/api/series/detail?id=' + id).then(function (r) {
      d = r; flat = flattenEpisodes(d); state.classList.add('hidden');
      if (season === null) season = d.resume ? d.resume.season : (d.seasons[0] ? d.seasons[0].season : null);
      keepFocus(s.el, render);
    }).catch(function (e) { state.innerHTML = errorHTML(e.message); state.classList.remove('hidden'); Focus.first(state); });
  }
  function resumeIndex() {
    if (!d.resume) return 0;
    var i = flat.findIndex(function (e) { return e.id === d.resume.episode_id; });
    return i < 0 ? 0 : i;
  }
  function render() {
    $('.backdrop', s.el).style.backgroundImage = d.backdrop ? 'url("' + API.img(d.backdrop) + '")' : '';
    var r = d.resume, label = r ? (r.next ? 'Regarder' : 'Reprendre') + ' S' + r.season + ' · É' + r.episode : 'Regarder';
    var meta = [d.seasons.length ? d.seasons.length + (d.seasons.length > 1 ? ' saisons' : ' saison') : '', d.genre,
      d.rating ? '★ ' + d.rating : ''].filter(Boolean).map(esc).join(' <span class="sep">|</span> ');
    box.innerHTML = '<h1 style="font-size:64px">' + esc(d.name) + '</h1><div class="meta">' + meta + '</div>' +
      (d.plot ? '<p class="plot" style="-webkit-line-clamp:2">' + esc(d.plot) + '</p>' : '') +
      '<div class="actions" data-group="act" data-nav-down="seasons">' +
      (flat.length ? '<button class="btn focusable" data-default data-act="play" data-key="play">' + ICON.play + esc(label) + '</button>' : '') +
      (r ? '<button class="btn focusable" data-act="restart" data-key="restart">Depuis le début</button>' : '') +
      (d.trailer ? '<button class="btn focusable" data-act="trailer" data-key="trailer">' + ICON.film + 'Bande-annonce</button>' : '') +
      '<button class="btn square focusable' + (d.watchlist ? ' on' : '') + '" data-act="later" data-key="later" aria-label="À regarder plus tard">' +
      (d.watchlist ? ICON.bookmarkFill : ICON.bookmark) + '</button>' +
      '<button class="btn square focusable' + (d.fav ? ' on' : '') + '" data-act="fav" data-key="fav" aria-label="Favori">' +
      (d.fav ? ICON.starFill : ICON.star) + '</button></div>';
    $('.seasons .row', s.el).innerHTML = d.seasons.map(function (x) {
      return '<div class="chip focusable' + (x.season === season ? ' active' : '') + '" data-season="' + x.season + '" data-key="season:' + x.season + '">Saison ' + x.season + '</div>';
    }).join('');
    renderEpisodes();
    if (!flat.length) { state.innerHTML = 'Aucun épisode disponible pour l’instant.'; state.classList.remove('hidden'); }
  }
  function renderEpisodes() {
    var sea = d.seasons.filter(function (x) { return x.season === season; })[0];
    var row = $('.episodes .row', s.el);
    $('.episodes', s.el).scrollLeft = 0;
    row.innerHTML = sea ? sea.episodes.map(function (e) {
      var p = e.progress, cur = d.resume && d.resume.episode_id === e.id;
      return '<div class="ep focusable' + (cur ? ' current' : '') + '" data-ep="' + e.id + '" data-key="ep:' + e.id + '">' +
        '<div class="art" style="background:' + tint(e.id) + '"><span class="num">' + e.episode + '</span>' +
        (e.thumb ? '<img loading="lazy" src="' + esc(API.img(e.thumb)) + '" alt="" onerror="this.remove()">' : '') +
        (p ? '<div class="bar"><i style="width:' + p.pct + '%"></i></div>' : '') + '</div>' +
        '<div class="t1">É' + e.episode + ' · ' + esc(e.title || ('Épisode ' + e.episode)) + '</div>' +
        '<div class="t2">' + esc(p && p.done ? 'Vu' + (e.duration ? ' · ' + dur(e.duration) : '') : p ? remainingLabel(p) : dur(e.duration)) + '</div></div>';
    }).join('') : '';
  }
  s.el.addEventListener('focused', function (e) {
    var n = e.target;
    if (n.hasAttribute('data-season')) {
      var sn = Number(n.getAttribute('data-season'));
      if (sn !== season) {
        season = sn;
        $$('.seasons .chip', s.el).forEach(function (c) { c.classList.toggle('active', c === n); });
        renderEpisodes();
      }
    }
  });
  function series() { return { id: d.id, name: d.name, backdrop: d.backdrop }; }
  s.onEnter = function (n) {
    var act = n.getAttribute('data-act');
    if (act === 'retry') return load();
    if (act === 'play') return App.playEpisodes(series(), flat, resumeIndex());
    if (act === 'restart') return App.playEpisodes(series(), flat, 0, true);
    if (act === 'trailer') return openTrailer(d.trailer, d.name);
    if (act === 'later') return App.toggleWatchlist(d, function () { keepFocus(s.el, render); });
    if (act === 'fav') return App.toggleFav(d, function () { keepFocus(s.el, render); });
    if (n.hasAttribute('data-ep')) {
      var epId = Number(n.getAttribute('data-ep'));
      var i = flat.findIndex(function (e) { return e.id === epId; });
      App.playEpisodes(series(), flat, i, !!(flat[i].progress && flat[i].progress.done));
    }
  };
  s.onKey = function (k) { if (k === KEY.YELLOW && d) { App.toggleWatchlist(d, function () { keepFocus(s.el, render); }); return true; } return false; };
  s.show = function () { load(); };
  return s;
}

/* =====================================================================
   HISTORIQUE
   ===================================================================== */
function HistoryScreen(initial) {
  var FILTERS = [['all', 'Tout'], ['progress', 'En cours'], ['done', 'Terminés'], ['movies', 'Films'], ['series', 'Séries']];
  var s = baseScreen('history', headerHTML('') +
    '<div class="page-top"><div class="icon-btn focusable" data-act="back" aria-label="Retour">' + ICON.back + '</div>' +
    '<div class="tile-icon" style="width:52px;height:52px">' + ICON.history + '</div><h1>Historique</h1>' +
    '<div class="chips" data-group="chips" data-nav-down="grid"><div class="row">' + FILTERS.map(function (f) {
      return '<div class="chip focusable' + (f[0] === initial ? ' active' : '') + '" data-filter="' + f[0] + '" data-key="f:' + f[0] + '">' + f[1] + '</div>';
    }).join('') + '</div></div>' +
    '<div class="btn focusable" data-act="clear" style="height:56px;font-size:20px">' + ICON.trash + 'Effacer</div></div>' +
    '<div class="grid-wrap scroll-y" data-pad="80"><div class="grid" data-group="grid" data-nav-up="chips"></div></div>' +
    '<div class="state hidden"></div>' +
    '<div class="hints right"><span class="hint"><span class="key">OK</span>Reprendre</span>' +
    '<span class="hint"><span class="key red">Rouge</span>Retirer</span></div>');
  var filter = initial || 'all', items = [], grid = $('.grid', s.el), state = $('.state', s.el);
  function sub(it) {
    var where = it.kind === 'series' && it.season ? 'S' + it.season + ' · É' + it.episode + ' · ' : (it.kind === 'movie' ? 'Film · ' : '');
    var p = it.progress;
    return where + (p.done ? 'terminé ' : (p.remaining ? dur(p.remaining) + ' restantes · ' : '')) + dayLabel(it.updated);
  }
  function load() {
    state.innerHTML = loadingHTML(); state.classList.remove('hidden');
    API.get('/api/history?filter=' + filter).then(function (d) {
      items = d.items; state.classList.add('hidden'); keepFocus(s.el, render);
    }).catch(function (e) { state.innerHTML = errorHTML(e.message); state.classList.remove('hidden'); Focus.first(state); });
  }
  function render() {
    var week = nowSec() - 7 * 86400, html = '', lastGroup = null;
    items.forEach(function (it, i) {
      var g = it.updated >= week ? 'Cette semaine' : 'Plus tôt';
      if (g !== lastGroup) { html += '<div class="grid-title">' + g + '</div>'; lastGroup = g; }
      html += posterHTML(it, i, sub(it)).replace('data-key="', 'data-key="h-');
    });
    grid.innerHTML = html;
    var f0 = grid.querySelector('.poster'); if (f0) f0.setAttribute('data-default', '');
    if (!items.length) { state.innerHTML = 'Rien dans l’historique pour l’instant.'; state.classList.remove('hidden'); }
  }
  s.onEnter = function (n) {
    var act = n.getAttribute('data-act');
    if (act === 'retry') return load();
    if (act === 'back') return Router.back();
    if (act === 'clear') {
      return confirmDialog('Effacer l’historique ?', 'Toute la progression de lecture sera supprimée. Les listes et favoris sont conservés.', 'Effacer', function () {
        API.del('/api/history').then(function () { Toast.show('Historique effacé'); load(); }).catch(function (e) { Toast.show(e.message); });
      });
    }
    if (n.hasAttribute('data-filter')) {
      filter = n.getAttribute('data-filter');
      $$('.chip', s.el).forEach(function (c) { c.classList.toggle('active', c === n); });
      return load();
    }
    if (act === 'open') {
      var it = items[Number(n.getAttribute('data-idx'))]; if (!it) return;
      if (it.kind === 'movie') App.playMovie(it, it.progress.done); else App.resumeSeries(it.id);
    }
  };
  s.onKey = function (k) {
    var n = Focus.current;
    if (k === KEY.RED && n && n.getAttribute('data-act') === 'open') {
      var it = items[Number(n.getAttribute('data-idx'))];
      API.del('/api/history?kind=' + it.kind + '&id=' + it.id).then(function () {
        Toast.show('« ' + it.name + ' » retiré de l’historique');
        items.splice(items.indexOf(it), 1);
        render();
        if (!Focus.valid()) Focus.first();
      }).catch(function (e) { Toast.show(e.message); });
      return true;
    }
    return false;
  };
  s.show = function () { load(); };
  return s;
}

/* =====================================================================
   À REGARDER PLUS TARD
   ===================================================================== */
function WatchlistScreen(initial) {
  var FILTERS = [['all', 'Tout'], ['fav', 'Favoris'], ['movies', 'Films'], ['series', 'Séries']];
  var s = baseScreen('later', headerHTML('') +
    '<div class="page-top"><div class="icon-btn focusable" data-act="back" aria-label="Retour">' + ICON.back + '</div>' +
    '<div class="tile-icon" style="width:52px;height:52px">' + ICON.bookmark + '</div><h1>À regarder plus tard</h1>' +
    '<div class="chips" data-group="chips" data-nav-down="grid"><div class="row">' + FILTERS.map(function (f) {
      return '<div class="chip focusable' + (f[0] === initial ? ' active' : '') + '" data-filter="' + f[0] + '" data-key="f:' + f[0] + '">' + f[1] + '</div>';
    }).join('') + '</div></div>' +
    '<div class="btn focusable" data-act="sort" style="height:56px;font-size:20px">' + ICON.sort + '<span id="sortlbl"></span></div></div>' +
    '<div class="grid-wrap scroll-y" data-pad="80"><div class="grid" data-group="grid" data-nav-up="chips"></div></div>' +
    '<div class="state hidden"></div>' +
    '<div class="hints right"><span class="hint"><span class="key">OK</span>Ouvrir</span>' +
    '<span class="hint"><span class="key yellow">Jaune</span>Favori</span>' +
    '<span class="hint"><span class="key red">Rouge</span>Retirer</span></div>');
  var filter = initial || 'all', sort = Store.get('laterSort', 'added'), items = [], grid = $('.grid', s.el), state = $('.state', s.el);
  function label() { $('#sortlbl', s.el).textContent = sort === 'added' ? 'Date d’ajout' : 'Titre (A-Z)'; }
  function load() {
    label();
    state.innerHTML = loadingHTML(); state.classList.remove('hidden');
    API.get('/api/watchlist?filter=' + filter + '&sort=' + sort).then(function (d) {
      items = d.items; state.classList.add('hidden'); keepFocus(s.el, render);
    }).catch(function (e) { state.innerHTML = errorHTML(e.message); state.classList.remove('hidden'); Focus.first(state); });
  }
  function render() {
    grid.innerHTML = items.map(function (it, i) {
      it.watchlist = true;
      return posterHTML(it, i, (it.kind === 'movie' ? 'Film' : 'Série') + ' · ajouté ' + dayLabel(it.added));
    }).join('');
    var f0 = grid.querySelector('.poster'); if (f0) f0.setAttribute('data-default', '');
    if (!items.length) {
      state.innerHTML = 'Votre liste est vide. Sur une fiche, choisissez le signet ou appuyez sur la touche jaune.';
      state.classList.remove('hidden');
    }
  }
  s.onEnter = function (n) {
    var act = n.getAttribute('data-act');
    if (act === 'retry') return load();
    if (act === 'back') return Router.back();
    if (act === 'sort') { sort = sort === 'added' ? 'name' : 'added'; Store.set('laterSort', sort); return load(); }
    if (n.hasAttribute('data-filter')) {
      filter = n.getAttribute('data-filter');
      $$('.chip', s.el).forEach(function (c) { c.classList.toggle('active', c === n); });
      return load();
    }
    if (act === 'open') { var it = items[Number(n.getAttribute('data-idx'))]; if (it) App.open(it.kind, it.id); }
  };
  s.onKey = function (k) {
    var n = Focus.current;
    if (!n || n.getAttribute('data-act') !== 'open') return false;
    var it = items[Number(n.getAttribute('data-idx'))];
    if (k === KEY.YELLOW) { App.toggleFav(it, function () { if (filter === 'fav' && !it.fav) load(); else keepFocus(s.el, render); }); return true; }
    if (k === KEY.RED) {
      API.del('/api/watchlist?kind=' + it.kind + '&id=' + it.id).then(function () {
        Toast.show('« ' + it.name + ' » retiré de la liste'); load();
      }).catch(function (e) { Toast.show(e.message); });
      return true;
    }
    return false;
  };
  s.show = function () { load(); };
  return s;
}

/* =====================================================================
   RECHERCHE
   ===================================================================== */
function SearchScreen() {
  var s = baseScreen('search', headerHTML('search') +
    '<div class="search-box"><input class="input focusable" id="q" data-default placeholder="Chaîne, film ou série…" autocomplete="off" spellcheck="false" style="width:100%"></div>' +
    '<div class="search-results scroll-y" data-pad="60"><div class="inner"></div></div>');
  var input = $('#q', s.el), out = $('.search-results .inner', s.el), res = null, my = 0;
  var run = debounce(function () {
    var q = input.value.trim();
    if (q.length < 2) { out.innerHTML = '<div class="state" style="position:static;margin-top:80px">Tapez au moins deux lettres. Les accents ne comptent pas.</div>'; return; }
    var id = ++my;
    API.get('/api/search?q=' + encodeURIComponent(q)).then(function (d) {
      if (id !== my) return;
      res = d;
      var html = '';
      if (d.live.length) html += '<div class="section"><h2>Chaînes</h2><div class="strip" data-group="s-live"><div class="row">' + d.live.map(chCardHTML).join('') + '</div></div></div>';
      if (d.vod.length) html += '<div class="section"><h2>Films</h2><div class="strip" data-group="s-vod"><div class="row">' + d.vod.map(function (it, i) { return posterHTML(it, i); }).join('') + '</div></div></div>';
      if (d.series.length) html += '<div class="section"><h2>Séries</h2><div class="strip" data-group="s-series"><div class="row">' + d.series.map(function (it, i) { return posterHTML(it, i); }).join('') + '</div></div></div>';
      out.innerHTML = html || '<div class="state" style="position:static;margin-top:80px">Aucun résultat pour « ' + esc(q) + ' ».</div>';
    }).catch(function (e) { out.innerHTML = '<div class="state" style="position:static;margin-top:80px">' + esc(e.message) + '</div>'; });
  }, 450);
  input.addEventListener('input', run);
  s.onEnter = function (n) {
    if (n === input) { input.focus(); return; }
    var idx = Number(n.getAttribute('data-idx')), g = n.closest('[data-group]').getAttribute('data-group');
    if (g === 's-live') App.playLive(res.live, idx);
    else if (g === 's-vod') App.open('movie', res.vod[idx].id);
    else if (g === 's-series') App.open('series', res.series[idx].id);
  };
  s.onKey = function (k) {
    var n = Focus.current;
    if (k === KEY.INFO && n && n.getAttribute('data-act') === 'channel') {
      App.open('channel', res.live[Number(n.getAttribute('data-idx'))].id); return true;
    }
    return false;
  };
  s.show = function (returning) { if (!returning) run(); };
  return s;
}

/* =====================================================================
   RÉGLAGES
   ===================================================================== */
function SettingsScreen() {
  var s = baseScreen('settings', headerHTML('settings') +
    '<div class="page-top"><h1>Réglages</h1></div><div class="settings" data-group="set"></div>');
  var box = $('.settings', s.el), st = null;
  function render() {
    var prev = Store.get('preview', true);
    var when = st && st.catalog_sync ? dayLabel(st.catalog_sync) + ' à ' + hhmm(st.catalog_sync) : 'jamais';
    box.innerHTML =
      '<div class="set-row focusable" data-default data-act="server" data-key="server"><div>Serveur LUMEN<small>Adresse du serveur sur votre Proxmox</small></div>' +
      '<span class="val">' + esc(API.base.replace(/^http:\/\//, '')) + '</span></div>' +
      '<div class="set-row focusable" data-act="preview" data-key="preview"><div>Aperçu vidéo dans le guide<small>Lance la chaîne en fond quand vous vous arrêtez dessus</small></div>' +
      '<span class="toggle' + (prev ? ' on' : '') + '"></span></div>' +
      '<div class="set-row focusable" data-act="sync" data-key="sync"><div>Mettre à jour le catalogue maintenant<small>' +
      (st ? (st.syncing ? 'Mise à jour en cours…' : 'Dernière mise à jour : ' + esc(when)) : 'État inconnu') + '</small></div>' +
      '<span class="val">' + (st ? st.counts.live + ' chaînes · ' + st.counts.vod + ' films · ' + st.counts.series + ' séries' : '') + '</span></div>' +
      '<div class="set-row"><div>Bouquets, noms, numéros et guide<small>Depuis le navigateur d’un ordinateur : ' + esc(API.base) + '/reglages</small></div></div>' +
      '<div class="set-row"><div>LUMEN 2.4<small>OK valider · Retour revenir · jaune favori · vert replay · bleu modifier · Info la chaîne · 0-9 numéro</small></div></div>';
  }
  function status() {
    API.get('/api/status').then(function (d) {
      st = d; keepFocus(s.el, render);
      if (d.syncing) setTimeout(function () { if (Router.screen() === s) status(); }, 4000);
    }).catch(function (e) { st = null; keepFocus(s.el, render); Toast.show(e.message); });
  }
  s.onEnter = function (n) {
    var act = n.getAttribute('data-act');
    if (act === 'server') Router.push(SetupScreen(false));
    if (act === 'preview') { Store.set('preview', !Store.get('preview', true)); keepFocus(s.el, render); }
    if (act === 'sync') API.post('/api/sync').then(function () { Toast.show('Mise à jour lancée'); status(); }).catch(function (e) { Toast.show(e.message); });
  };
  s.show = function () { render(); status(); };
  return s;
}

/* =====================================================================
   BANDE-ANNONCE
   ===================================================================== */
function openTrailer(videoId, title) {
  var src = API.base + '/trailer?v=' + encodeURIComponent(videoId) + (API.token ? '&token=' + encodeURIComponent(API.token) : '');
  var ov = { el: el('<div class="trailer" aria-label="Bande-annonce ' + esc(title) + '">' +
    '<iframe src="' + esc(src) + '" allow="autoplay; encrypted-media" tabindex="-1" title="Bande-annonce"></iframe>' +
    '<div class="trailer-msg"><div class="spinner"></div></div>' +
    '<div class="trailer-hint"><span class="hint"><span class="key">OK</span>Pause</span>' +
    '<span class="hint"><span class="key">← →</span>Reculer, avancer</span>' +
    '<span class="hint"><span class="key">Retour</span>Fermer</span></div></div>') };
  var frame = $('iframe', ov.el), msg = $('.trailer-msg', ov.el), hint = $('.trailer-hint', ov.el), started = false;
  function cmd(c, extra) { try { frame.contentWindow.postMessage(Object.assign({ cmd: c }, extra || {}), '*'); } catch (e) { /* cadre pas prêt */ } }
  function onMsg(e) {
    var m = e.data || {};
    if (m.lumen !== 'trailer') return;
    if (m.type === 'state' && m.data === 1) { started = true; msg.classList.add('hidden'); setTimeout(function () { hint.classList.add('faded'); }, 4000); }
    if (m.type === 'error') msg.innerHTML = '<div>Bande-annonce indisponible (vidéo retirée ou non autorisée hors de YouTube).</div>';
  }
  window.addEventListener('message', onMsg);
  var slow = setTimeout(function () { if (!started) msg.innerHTML = '<div>Appuyez sur OK pour lancer la bande-annonce.</div>'; }, 7000);
  ov.onKey = function (k) {
    hint.classList.remove('faded');
    if (k === KEY.ENTER || k === KEY.PLAYPAUSE || k === KEY.PLAY || k === KEY.PAUSE) { cmd('toggle'); return true; }
    if (k === KEY.LEFT || k === KEY.RW) { cmd('seek', { by: -10 }); return true; }
    if (k === KEY.RIGHT || k === KEY.FF) { cmd('seek', { by: 10 }); return true; }
    if (k === KEY.STOP) { Router.closeOverlay(); return true; }
    return k !== KEY.BACK;
  };
  ov.onClose = function () { window.removeEventListener('message', onMsg); clearTimeout(slow); cmd('stop'); frame.src = 'about:blank'; };
  Router.overlay(ov);
}

/* =====================================================================
   RENOMMER, RENUMÉROTER
   ===================================================================== */
function editDialog(title, fields, onSave, resetLabel, onReset) {
  var ov = { el: el('<div class="dialog-back"><div class="dialog" role="dialog" aria-label="' + esc(title) + '"><h2>' + esc(title) + '</h2>' +
    fields.map(function (f) {
      return '<div class="field"><label for="ed-' + f.id + '">' + esc(f.label) + '</label>' +
        '<input id="ed-' + f.id + '" class="input focusable" data-field="' + f.id + '"' + (f.numeric ? ' inputmode="numeric"' : '') +
        ' value="' + esc(f.value) + '" autocomplete="off" spellcheck="false">' +
        (f.hint ? '<small style="color:var(--muted);font-size:18px">' + esc(f.hint) + '</small>' : '') + '</div>';
    }).join('') +
    '<div class="error" id="ed-err"></div><div class="actions" style="flex-wrap:wrap">' +
    '<button class="btn focusable" data-act="save">Enregistrer</button>' +
    (onReset ? '<button class="btn focusable" data-act="reset">' + esc(resetLabel) + '</button>' : '') +
    '<button class="btn focusable" data-act="cancel">Annuler</button></div></div></div>') };
  ov.onEnter = function (n) {
    if (n.tagName === 'INPUT') { n.focus(); return; }
    var act = n.getAttribute('data-act');
    if (act === 'cancel') { Router.closeOverlay(); return; }
    var done = function () { Router.closeOverlay(); };
    var fail = function (e) { $('#ed-err', ov.el).textContent = e.message; };
    if (act === 'reset') { onReset().then(done, fail); return; }
    if (act === 'save') {
      var vals = {};
      $$('[data-field]', ov.el).forEach(function (i) { vals[i.getAttribute('data-field')] = i.value.trim(); });
      onSave(vals).then(done, fail);
    }
  };
  Router.overlay(ov);
}
function editChannel(ch, after) {
  editDialog('Modifier la chaîne', [
    { id: 'num', label: 'Numéro', value: ch.num, numeric: true, hint: 'Numéro du fournisseur : ' + ch.orig_num },
    { id: 'name', label: 'Nom', value: ch.name, hint: 'Nom du fournisseur : ' + ch.orig_name }
  ], function (v) {
    if (v.num && !/^\d+$/.test(v.num)) return Promise.reject(new Error('Le numéro doit être un nombre.'));
    return API.post('/api/channels/edit', {
      id: ch.id, name: v.name === ch.orig_name ? null : v.name, num: v.num === String(ch.orig_num) ? null : v.num
    }).then(function (r) {
      Toast.show(r.same_number ? 'Enregistré. Attention : « ' + r.same_number + ' » a le même numéro.' : 'Chaîne modifiée', 3500);
      if (after) after();
    });
  }, 'Valeurs du fournisseur', function () {
    return API.post('/api/channels/edit', { id: ch.id, name: null, num: null })
      .then(function () { Toast.show('Valeurs du fournisseur rétablies'); if (after) after(); });
  });
}
function renameCategory(kind, c, after) {
  editDialog('Renommer le bouquet', [{ id: 'name', label: 'Nom', value: c.name, hint: 'Nom du fournisseur : ' + c.orig_name }], function (v) {
    return API.post('/api/categories/rename', { kind: kind, id: c.id, name: v.name === c.orig_name ? null : v.name })
      .then(function () { Toast.show('Bouquet renommé'); if (after) after(); });
  }, 'Nom du fournisseur', function () {
    return API.post('/api/categories/rename', { kind: kind, id: c.id, name: null }).then(function () { if (after) after(); });
  });
}
