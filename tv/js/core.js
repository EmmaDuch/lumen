/* LUMEN — socle : stockage, API, touches, focus, navigation entre écrans */
'use strict';

var IS_TV = typeof window.tizen !== 'undefined';
var SCALE = 1;

/* ---------- petites aides ---------- */
/* échappe une valeur pour un sélecteur d'attribut */
function cssEsc(v) { return String(v).replace(/["\\]/g, '\\$&'); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function hhmm(ts) { var d = new Date(ts * 1000); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function clockNow() { var d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function nowSec() { return Math.floor(Date.now() / 1000) + (API.skew || 0); }
function dur(sec) {
  if (!sec || sec < 0) return '';
  var m = Math.round(sec / 60);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h ' + pad2(m % 60);
}
function clock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ':' + pad2(m) : m) + ':' + pad2(s);
}
var JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function dayLabel(ts) {
  var d = new Date(ts * 1000), today = new Date();
  var start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() / 1000;
  if (ts >= start) return 'aujourd’hui';
  if (ts >= start - 86400) return 'hier';
  return 'le ' + JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()];
}
function debounce(fn, ms) {
  var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); };
}
function initials(name) {
  var w = String(name || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
  return ((w[0] || '?')[0] + ((w[1] || '')[0] || (w[0] || '')[1] || '')).toUpperCase();
}
var TINTS = ['#2B3A55', '#4A2E3B', '#2F4A3E', '#4B3F2A', '#33304F', '#24424A', '#4A3328', '#2C3444'];
function tint(id) { return TINTS[Math.abs(Number(id) || 0) % TINTS.length]; }

/* ---------- icônes (traits simples) ---------- */
var ICON = {
  play: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',
  pause: '<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  play32: '<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',
  prev: '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>',
  next: '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>',
  rw: '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 6v12L2 12zM21 6v12l-9-6z"/></svg>',
  ff: '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 6v12l9-6zM3 6v12l9-6z"/></svg>',
  search: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  settings: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  history: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>',
  bookmark: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  bookmarkFill: '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  star: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  starFill: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  guide: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/></svg>',
  subs: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 13h4M13 13h4M7 16h10"/></svg>',
  back: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  trash: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  sort: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M14 6h7M14 11h5M14 16h3"/></svg>',
  restart: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  history24: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>',
  film: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/></svg>',
  info: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  mark: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#1A1204" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
};

/* ---------- stockage local ---------- */
var Store = {
  get: function (k, d) { try { var v = localStorage.getItem('lumen.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem('lumen.' + k, JSON.stringify(v)); } catch (e) { /* plein */ } }
};

/* ---------- API du serveur LUMEN ---------- */
var API = {
  base: '', token: '', skew: 0,
  load: function () { this.base = Store.get('server', ''); this.token = Store.get('token', ''); },
  normalize: function (addr) {
    addr = String(addr || '').trim().replace(/\/+$/, '');
    if (!addr) return '';
    if (!/^https?:\/\//i.test(addr)) addr = 'http://' + addr;
    if (!/:\d+$/.test(addr.replace(/^https?:\/\//i, ''))) addr += ':8765';
    return addr;
  },
  img: function (path) {
    if (!path) return '';
    var u = this.base + path;
    if (this.token) u += '&token=' + encodeURIComponent(this.token);
    return u;
  },
  /* fichier de la médiathèque : le serveur renvoie un chemin, à nous l'adresse et le jeton */
  media: function (path) {
    if (!path) return '';
    var u = this.base + path;
    if (this.token) u += (u.indexOf('?') < 0 ? '?' : '&') + 'token=' + encodeURIComponent(this.token);
    return u;
  },
  req: function (method, path, body, base) {
    var self = this, ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    var headers = {};
    if (this.token) headers['X-Lumen-Token'] = this.token;
    if (body) headers['Content-Type'] = 'application/json';
    return fetch((base || this.base) + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.error || ('erreur ' + r.status));
          if (d && typeof d.now === 'number') self.skew = d.now - Math.floor(Date.now() / 1000);
          return d;
        });
      }, function (e) {
        throw new Error(e && e.name === 'AbortError' ? 'le serveur ne répond pas' : 'serveur injoignable');
      })
      .then(function (d) { clearTimeout(timer); return d; }, function (e) { clearTimeout(timer); throw e; });
  },
  get: function (p) { return this.req('GET', p); },
  post: function (p, b) { return this.req('POST', p, b || {}); },
  del: function (p) { return this.req('DELETE', p); }
};

/* ---------- touches de la télécommande ---------- */
var KEY = {
  LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27, BACKSPACE: 8,
  PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, FF: 417, RW: 412,
  CH_UP: 427, CH_DOWN: 428, PAGE_UP: 33, PAGE_DOWN: 34,
  RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406, INFO: 457, GUIDE: 458,
  DONE: 65376, CANCEL: 65385, SPACE: 32
};
function registerKeys() {
  if (!IS_TV || !tizen.tvinputdevice) return;
  ['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
    'ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'Info', 'Guide',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (k) {
    try { tizen.tvinputdevice.registerKey(k); } catch (e) { /* touche absente sur ce modèle */ }
  });
}
/* Sur PC, quelques équivalents clavier pour tester */
function normalizeKey(e) {
  var c = e.keyCode;
  var typing = document.activeElement && document.activeElement.tagName === 'INPUT';
  if (c === KEY.ESC) return KEY.BACK;
  if (c === KEY.BACKSPACE && !typing) return KEY.BACK;
  if (c === KEY.PAGE_UP) return KEY.CH_UP;
  if (c === KEY.PAGE_DOWN) return KEY.CH_DOWN;
  if (!typing && !IS_TV) {
    var map = { r: KEY.RED, v: KEY.GREEN, j: KEY.YELLOW, b: KEY.BLUE, i: KEY.INFO, g: KEY.GUIDE, ' ': KEY.PLAYPAUSE };
    if (map[e.key] !== undefined) return map[e.key];
  }
  if (c === KEY.SPACE && !typing) return KEY.PLAYPAUSE;
  return c;
}

/* ---------- focus à la télécommande (navigation spatiale) ---------- */
var Focus = {
  current: null, scope: null, memory: typeof WeakMap !== 'undefined' ? new WeakMap() : null,

  setScope: function (root) { this.scope = root; },
  items: function () {
    return $$('.focusable', this.scope || document).filter(function (n) {
      if (n.offsetParent === null || n.classList.contains('disabled')) return false;
      var st = window.getComputedStyle(n);
      return st.visibility !== 'hidden' && st.opacity !== '0';
    });
  },
  set: function (node, noScroll) {
    if (!node) return;
    if (this.current && this.current !== node) {
      this.current.classList.remove('focused');
      this.current.dispatchEvent(new CustomEvent('blurred', { bubbles: true }));
    }
    this.current = node;
    node.classList.add('focused');
    var g = node.closest('[data-group]');
    if (g && this.memory) this.memory.set(g, node);
    if (!noScroll) ensureVisible(node);
    node.dispatchEvent(new CustomEvent('focused', { bubbles: true }));
  },
  first: function (root) {
    var list = $$('.focusable', root || this.scope).filter(function (n) { return n.offsetParent !== null; });
    var pref = list.filter(function (n) { return n.hasAttribute('data-default'); })[0];
    this.set(pref || list[0]);
  },
  valid: function () {
    return this.current && this.current.isConnected && this.current.offsetParent !== null &&
      (!this.scope || this.scope.contains(this.current));
  },
  /* meilleur candidat dans une direction ; cone = rester dans l'axe */
  _best: function (cur, dir, list, cone) {
    var r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var best = null, bestScore = Infinity;
    list.forEach(function (n) {
      if (n === cur) return;
      var q = n.getBoundingClientRect(), qx = q.left + q.width / 2, qy = q.top + q.height / 2, main, side;
      if (dir === 'left') { if (qx >= cx - 1 || q.right > r.right) return; main = Math.max(0, r.left - q.right); side = gap(r.top, r.bottom, q.top, q.bottom); }
      else if (dir === 'right') { if (qx <= cx + 1 || q.left < r.left) return; main = Math.max(0, q.left - r.right); side = gap(r.top, r.bottom, q.top, q.bottom); }
      else if (dir === 'up') { if (qy >= cy - 1 || q.bottom > r.bottom) return; main = Math.max(0, r.top - q.bottom); side = gap(r.left, r.right, q.left, q.right); }
      else { if (qy <= cy + 1 || q.top < r.top) return; main = Math.max(0, q.top - r.bottom); side = gap(r.left, r.right, q.left, q.right); }
      if (cone && side > Math.max(main * 2.5, 260 * SCALE)) return;
      var score = main + side * 3;
      if (score < bestScore) { bestScore = score; best = n; }
    });
    return best;
  },
  /* entrer dans un groupe : dernière position, sinon l'élément actif, sinon le premier */
  enterGroup: function (g) {
    var m = this.memory && this.memory.get(g);
    if (m && m.isConnected && m.offsetParent !== null && g.contains(m)) return m;
    var vis = function (n) { return n && n.offsetParent !== null; };
    var a = g.querySelector('.focusable.active, .focusable.current, .focusable.playing');
    if (vis(a)) return a;
    return $$('.focusable', g).filter(vis)[0] || null;
  },
  /* déplacement dans une liste déclarée (data-list="h" ou "v") : par rang, pas par position */
  _inList: function (cur, dir) {
    var axis = (dir === 'left' || dir === 'right') ? 'h' : 'v';
    var box = cur.closest('[data-list="' + axis + '"]');
    if (!box || (this.scope && !this.scope.contains(box))) return null;
    var list = $$('.focusable', box).filter(function (n) {
      if (n.offsetParent === null || n.classList.contains('disabled')) return false;
      var st = window.getComputedStyle(n);
      return st.visibility !== 'hidden' && st.opacity !== '0';
    });
    var i = list.indexOf(cur);
    if (i < 0) return null;
    var next = list[i + (dir === 'right' || dir === 'down' ? 1 : -1)];
    return next || null;      // aux extrémités : on laisse la suite décider
  },
  move: function (dir) {
    if (!this.valid()) { this.first(); return true; }
    var cur = this.current, all = this.items(), best;
    var inList = this._inList(cur, dir);
    if (inList) { this.set(inList); return true; }
    // règle d'une zone : d'abord rester dedans, puis aller vers la zone indiquée
    var zone = cur.closest('[data-nav-' + dir + ']');
    if (zone && (!this.scope || this.scope.contains(zone))) {
      best = this._best(cur, dir, all.filter(function (n) { return zone.contains(n); }), true);
      if (!best) {
        var target = zone.getAttribute('data-nav-' + dir);
        if (target === 'stop') return false;
        var g = (this.scope || document).querySelector('[data-group="' + target + '"]');
        best = g && this.enterGroup(g);
        if (!best) return false;
        this.set(best);
        return true;
      }
    } else {
      best = this._best(cur, dir, all, true);
      // en vertical, on accepte un élément décalé (ex. rangée plus courte au-dessus)
      if (!best && (dir === 'up' || dir === 'down')) best = this._best(cur, dir, all, false);
    }
    if (!best) return false;
    var grp = best.closest('[data-group]');
    if (grp && !grp.contains(cur)) {
      var m = this.enterGroup(grp);
      if (m && this.memory && this.memory.get(grp) === m) best = m;
    }
    this.set(best);
    return true;
  }
};
function gap(a1, a2, b1, b2) { if (b2 < a1) return a1 - b2; if (b1 > a2) return b1 - a2; return 0; }

function ensureVisible(node) {
  var p = node.parentElement;
  while (p && p !== document.body) {
    var cl = p.classList;
    if (cl.contains('scroll-y') || cl.contains('scroll-x') || cl.contains('strip') || cl.contains('chips')) {
      var pr = p.getBoundingClientRect(), nr = node.getBoundingClientRect();
      var padY = Number(p.getAttribute('data-pad') || 80) * SCALE, padX = Number(p.getAttribute('data-padx') || 96) * SCALE;
      if (cl.contains('scroll-y')) {
        if (nr.top < pr.top + padY) p.scrollTop -= (pr.top + padY - nr.top) / SCALE;
        else if (nr.bottom > pr.bottom - padY) p.scrollTop += (nr.bottom - pr.bottom + padY) / SCALE;
      } else {
        if (nr.left < pr.left + padX) p.scrollLeft -= (pr.left + padX - nr.left) / SCALE;
        else if (nr.right > pr.right - padX) p.scrollLeft += (nr.right - pr.right + padX) / SCALE;
      }
    }
    p = p.parentElement;
  }
}

/* ---------- messages ---------- */
var Toast = {
  t: null,
  show: function (msg, ms) {
    var n = $('#toast'); n.textContent = msg; n.classList.add('show');
    clearTimeout(this.t); this.t = setTimeout(function () { n.classList.remove('show'); }, ms || 2600);
  }
};

/* ---------- écrans ---------- */
var Router = {
  stack: [], overlays: [],
  top: function () { return this.overlays[this.overlays.length - 1] || this.stack[this.stack.length - 1]; },
  screen: function () { return this.stack[this.stack.length - 1]; },
  push: function (scr) {
    var prev = this.screen();
    if (prev) { prev.savedFocus = Focus.current; prev.el.classList.add('hidden'); if (prev.hide) prev.hide(); }
    this.stack.push(scr);
    this._mount(scr);
  },
  replaceAll: function (scr) {
    while (this.stack.length) { var s = this.stack.pop(); if (s.destroy) s.destroy(); s.el.remove(); }
    this.push(scr);
  },
  back: function () {
    if (this.overlays.length) { this.closeOverlay(); return true; }
    if (this.stack.length <= 1) return false;
    var s = this.stack.pop(); if (s.destroy) s.destroy(); s.el.remove();
    var prev = this.screen();
    prev.el.classList.remove('hidden');
    Focus.setScope(prev.el);
    if (prev.show) prev.show(true);
    if (prev.savedFocus && prev.savedFocus.isConnected) Focus.set(prev.savedFocus); else Focus.first();
    return true;
  },
  _mount: function (scr) {
    $('#screens').appendChild(scr.el);
    Focus.setScope(scr.el);
    Focus.current = null;
    if (scr.show) scr.show(false);
    if (!Focus.valid()) Focus.first();
  },
  overlay: function (ov) {
    ov.prevFocus = Focus.current;
    this.overlays.push(ov);
    $('#overlay').appendChild(ov.el);
    Focus.setScope(ov.el);
    Focus.current = null;
    Focus.first(ov.el);
  },
  closeOverlay: function () {
    var ov = this.overlays.pop(); if (!ov) return;
    ov.el.remove(); if (ov.onClose) ov.onClose();
    var t = this.top();
    Focus.setScope(t.el);
    if (ov.prevFocus && ov.prevFocus.isConnected) Focus.set(ov.prevFocus, true); else Focus.first();
  }
};

function confirmDialog(title, text, okLabel, onOk) {
  var ov = { el: el('<div class="dialog-back"><div class="dialog" role="dialog" aria-label="' + esc(title) + '">' +
    '<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p><div class="actions">' +
    '<button class="btn primary focusable" data-act="ok">' + esc(okLabel) + '</button>' +
    '<button class="btn focusable" data-default data-act="cancel">Annuler</button></div></div></div>') };
  ov.onEnter = function (n) {
    var act = n.getAttribute('data-act');
    Router.closeOverlay();
    if (act === 'ok') onOk();
  };
  Router.overlay(ov);
}

/* ---------- en-tête commun ---------- */
var NAV = [['home', 'Accueil'], ['live', 'En direct'], ['vod', 'Films'], ['series', 'Séries']];

/* Ce qui est en train d'être regardé : sert à la pastille en haut à droite. */
var Now = {
  channel: null, prog: null,
  set: function (ch, prog) { this.channel = ch; this.prog = prog || ch && ch.now || null; refreshNowPill(); },
  clear: function () { this.channel = null; this.prog = null; refreshNowPill(); }
};
function nowPillHTML() {
  if (!Now.channel) return '';
  var p = Now.prog, ch = Now.channel;
  return '<div class="nowpill focusable" data-nav="resume" data-key="nowpill">' + logoHTML(ch, 'round') +
    '<span class="t">' + esc(p ? p.title : ch.name) + '</span>' +
    (p ? '<span class="h">' + hhmm(p.start) + '–' + hhmm(p.stop) + '</span>' : '') +
    '<span class="bars"><i></i><i></i><i></i><i></i></span></div>';
}
function refreshNowPill() {
  $$('.hdr').forEach(function (h) {
    var old = $('.nowpill', h), had = old && old.classList.contains('focused');
    if (old) old.remove();
    if (!Now.channel) return;
    var n = el(nowPillHTML());
    h.appendChild(n);
    if (had) Focus.set(n, true);
  });
}
function headerHTML(active) {
  return '<header class="hdr" data-group="nav">' +
    '<div class="brand"><div class="brand-mark">' + ICON.mark + '</div><span class="brand-name">LUMEN</span></div>' +
    '<nav class="pills" data-group="pills" data-list="h" data-nav-right="tools" data-nav-left="stop">' + NAV.map(function (n) {
      return '<div class="pill focusable' + (n[0] === active ? ' active' : '') + '" data-nav="' + n[0] + '">' + n[1] + '</div>';
    }).join('') + '</nav>' +
    '<div class="hdr-tools" data-group="tools" data-list="h" data-nav-left="pills" data-nav-right="stop">' +
    '<div class="icon-btn focusable' + (active === 'search' ? ' active' : '') + '" data-nav="search" aria-label="Rechercher">' + ICON.search + '</div>' +
    '<div class="icon-btn focusable' + (active === 'settings' ? ' active' : '') + '" data-nav="settings" aria-label="Réglages">' + ICON.settings + '</div>' +
    '<span class="clock">' + clockNow() + '</span></div>' + nowPillHTML() + '</header>';
}

/* logo d'une chaîne, avec repli sur les initiales */
function logoHTML(ch, extra) {
  var ini = esc(initials(ch.name));
  var cls = 'logo' + (extra ? ' ' + extra : '');
  if (!ch.logo) return '<div class="' + cls + '" style="background:' + tint(ch.id) + '">' + ini + '</div>';
  return '<div class="' + cls + '" data-ini="' + ini + '"><img loading="lazy" src="' + esc(API.img(ch.logo)) + '" alt="" ' +
    'onerror="var p=this.parentNode;p.style.background=\'' + tint(ch.id) + '\';p.textContent=p.getAttribute(\'data-ini\')"></div>';
}
