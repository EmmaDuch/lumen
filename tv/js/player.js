/* LUMEN — lecteur vidéo.
 * Sur la TV : lecteur matériel Samsung (webapis.avplay), décodage par la puce de la TV.
 * Sur un PC (tests) : élément <video> du navigateur, à titre de repli. */
'use strict';

var Player = {
  av: null, video: null, url: '', state: 'idle', cb: {}, rect: null,
  durationSec: 0, posSec: 0, subTimer: null, prepareTimer: null,

  init: function () {
    var layer = $('#video-layer');
    if (window.webapis && webapis.avplay) {
      this.av = webapis.avplay;
      var obj = document.createElement('object');
      obj.type = 'application/avplayer';
      layer.appendChild(obj);
    } else {
      this.video = document.createElement('video');
      this.video.setAttribute('playsinline', '');
      layer.appendChild(this.video);
      var v = this.video, self = this;
      v.addEventListener('timeupdate', function () { self.posSec = v.currentTime; if (self.cb.onTime) self.cb.onTime(v.currentTime); });
      v.addEventListener('waiting', function () { if (self.cb.onBuffering) self.cb.onBuffering(true); });
      v.addEventListener('playing', function () { self.state = 'playing'; if (self.cb.onBuffering) self.cb.onBuffering(false); });
      v.addEventListener('ended', function () { if (self.cb.onEnd) self.cb.onEnd(); });
      v.addEventListener('error', function () { if (self.url && self.cb.onError) self.cb.onError('lecture impossible dans ce navigateur'); });
    }
    layer.style.display = 'none';
  },

  /* rect : {x, y, w, h} en pixels de l'écran 1920×1080 */
  play: function (url, opts) {
    var self = this;
    opts = opts || {};
    this.stop();
    this.url = url; this.cb = opts; this.posSec = 0; this.durationSec = 0;
    this.rect = opts.rect || { x: 0, y: 0, w: 1920, h: 1080 };
    $('#video-layer').style.display = '';
    this.state = 'loading';
    if (opts.onBuffering) opts.onBuffering(true);
    if (this.av) {
      var av = this.av;
      try {
        av.open(url);
        av.setListener({
          onbufferingstart: function () { if (self.cb.onBuffering) self.cb.onBuffering(true); },
          onbufferingprogress: function () {},
          onbufferingcomplete: function () { if (self.cb.onBuffering) self.cb.onBuffering(false); },
          oncurrentplaytime: function (ms) { self.posSec = ms / 1000; if (self.cb.onTime) self.cb.onTime(self.posSec); },
          onstreamcompleted: function () { if (self.cb.onEnd) self.cb.onEnd(); },
          onerror: function (e) { if (self.cb.onError) self.cb.onError(String(e)); },
          onevent: function () {},
          onsubtitlechange: function (duration, text) { self.showSubtitle(text, duration); },
          ondrmevent: function () {}
        });
        this._applyRect();
        av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
        if (opts.live) {
          try { av.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', 3); } catch (e) { /* optionnel */ }
          try { av.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', 5); } catch (e) { /* optionnel */ }
        }
        // certains flux ne rappellent jamais prepareAsync : on abandonne au bout de 25 s
        var myUrl = url;
        this.prepareTimer = setTimeout(function () {
          if (self.url === myUrl && self.state === 'loading' && self.cb.onError) self.cb.onError('le flux ne démarre pas');
        }, 25000);
        av.prepareAsync(function () {
          if (self.url !== myUrl) return;
          clearTimeout(self.prepareTimer);
          self.durationSec = (av.getDuration() || 0) / 1000;
          var start = function () {
            av.play(); self.state = 'playing';
            if (self.cb.onBuffering) self.cb.onBuffering(false);
            if (self.cb.onReady) self.cb.onReady(self.durationSec);
          };
          if (opts.start > 5 && !opts.live) {
            try { av.seekTo(Math.floor(opts.start * 1000), start, start); } catch (e) { start(); }
          } else start();
        }, function (e) {
          clearTimeout(self.prepareTimer);
          if (self.url === myUrl && self.cb.onError) self.cb.onError(String(e && e.name || e));
        });
      } catch (e) {
        if (opts.onError) opts.onError(String(e && e.message || e));
      }
    } else {
      var v = this.video;
      this._applyRect();
      v.src = url;
      v.onloadedmetadata = function () {
        self.durationSec = isFinite(v.duration) ? v.duration : 0;
        if (opts.start > 5 && !opts.live) v.currentTime = opts.start;
        self.state = 'playing';
        if (self.cb.onReady) self.cb.onReady(self.durationSec);
      };
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    }
  },

  setRect: function (rect) { this.rect = rect; this._applyRect(); },
  _applyRect: function () {
    var r = this.rect;
    if (this.av) {
      try { this.av.setDisplayRect(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)); } catch (e) { /* état */ }
    } else if (this.video) {
      var s = this.video.style; s.left = r.x + 'px'; s.top = r.y + 'px'; s.width = r.w + 'px'; s.height = r.h + 'px';
    }
  },

  isPlaying: function () {
    if (this.av) { try { return this.av.getState() === 'PLAYING'; } catch (e) { return false; } }
    return this.video && !this.video.paused;
  },
  pause: function () {
    if (this.av) { try { this.av.pause(); } catch (e) { /* état */ } } else if (this.video) this.video.pause();
  },
  resume: function () {
    if (this.av) { try { this.av.play(); } catch (e) { /* état */ } } else if (this.video) this.video.play();
  },
  toggle: function () { if (this.isPlaying()) this.pause(); else this.resume(); return this.isPlaying(); },
  seekTo: function (sec) {
    sec = Math.max(0, Math.min(sec, (this.durationSec || sec) - 2));
    this.posSec = sec;
    if (this.av) { try { this.av.seekTo(Math.floor(sec * 1000)); } catch (e) { /* état */ } }
    else if (this.video) this.video.currentTime = sec;
  },
  position: function () {
    if (this.av) { try { return this.av.getCurrentTime() / 1000; } catch (e) { return this.posSec; } }
    return this.video ? this.video.currentTime : 0;
  },
  duration: function () { return this.durationSec; },

  stop: function () {
    clearTimeout(this.prepareTimer);
    this.url = ''; this.state = 'idle'; this.cb = {};
    this.showSubtitle('', 0);
    if (this.av) {
      try { this.av.stop(); } catch (e) { /* déjà arrêté */ }
      try { this.av.close(); } catch (e) { /* déjà fermé */ }
    } else if (this.video) {
      this.video.removeAttribute('src');
      try { this.video.load(); } catch (e) { /* rien */ }
    }
    $('#video-layer').style.display = 'none';
  },

  /* résolution et codecs réellement reçus, une fois la lecture lancée */
  videoInfo: function () {
    var out = { width: 0, height: 0, codec: '', audio: '', label: '' };
    if (this.av) {
      try {
        this.av.getCurrentStreamInfo().forEach(function (t) {
          var x = {};
          try { x = JSON.parse(t.extra_info || '{}'); } catch (e) { /* format inattendu */ }
          if (t.type === 'VIDEO') {
            out.width = Number(x.Width || x.width || 0);
            out.height = Number(x.Height || x.height || 0);
            out.codec = String(x.fourCC || x.Codec || x.codec || '').trim();
          }
          if (t.type === 'AUDIO') {
            var ch = Number(x.Channels || x.channels || 0);
            out.audio = ch >= 6 ? '5.1' : (ch === 2 ? 'Stéréo' : (ch === 1 ? 'Mono' : ''));
          }
        });
      } catch (e) { /* lecteur pas prêt */ }
    } else if (this.video && this.video.videoHeight) {
      out.width = this.video.videoWidth; out.height = this.video.videoHeight;
    }
    out.label = resLabel(out.height, out.width);
    return out;
  },

  /* pistes audio et sous-titres */
  tracks: function () {
    var out = { audio: [], text: [], curAudio: -1, curText: -1 };
    if (!this.av) return out;
    try {
      this.av.getTotalTrackInfo().forEach(function (t) {
        var info = {};
        try { info = JSON.parse(t.extra_info || '{}'); } catch (e) { /* format inattendu */ }
        var lang = info.language || info.track_lang || '';
        if (t.type === 'AUDIO') out.audio.push({ index: t.index, label: langName(lang) || ('Piste ' + (out.audio.length + 1)) });
        if (t.type === 'TEXT') out.text.push({ index: t.index, label: langName(lang) || ('Sous-titres ' + (out.text.length + 1)) });
      });
      this.av.getCurrentStreamInfo().forEach(function (t) {
        if (t.type === 'AUDIO') out.curAudio = t.index;
        if (t.type === 'TEXT') out.curText = t.index;
      });
    } catch (e) { /* lecteur pas prêt */ }
    if (this.subsOff) out.curText = -1;
    return out;
  },
  selectAudio: function (index) { try { this.av.setSelectTrack('AUDIO', index); } catch (e) { Toast.show('Piste audio indisponible'); } },
  selectText: function (index) {
    if (!this.av) return;
    try {
      if (index < 0) { this.av.setSilentSubtitle(true); this.subsOff = true; this.showSubtitle('', 0); return; }
      this.av.setSelectTrack('TEXT', index); this.av.setSilentSubtitle(false); this.subsOff = false;
    } catch (e) { Toast.show('Sous-titres indisponibles'); }
  },
  showSubtitle: function (text, ms) {
    var box = $('#subtitles'); if (!box) return;
    clearTimeout(this.subTimer);
    box.textContent = (text || '').replace(/<[^>]+>/g, '');
    if (text && ms) this.subTimer = setTimeout(function () { box.textContent = ''; }, ms);
  },

  /* la TV met l'appli en arrière-plan (touche Home, source…) */
  suspend: function () { if (this.av) { try { this.av.suspend(); } catch (e) { /* état */ } } else if (this.video) this.video.pause(); },
  restore: function () { if (this.av) { try { this.av.restore(); } catch (e) { /* état */ } } }
};

function resLabel(h, w) {
  if (!h) return '';
  if (h >= 1600 || w >= 3000) return '4K';
  if (h >= 1000) return 'FHD 1080p';
  if (h >= 700) return 'HD 720p';
  if (h >= 500) return '576p';
  return h + 'p';
}
var CODECS = { avc1: 'H.264', h264: 'H.264', hvc1: 'H.265', hev1: 'H.265', h265: 'H.265', hevc: 'H.265',
  mpeg2: 'MPEG-2', mp2v: 'MPEG-2', vp09: 'VP9', av01: 'AV1' };
function codecName(c) {
  c = String(c || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // certains téléviseurs renvoient « VIDEO/X-H264 » : on enlève le préfixe avant de traduire
  c = c.replace(/^(?:video|audio)/, '').replace(/^x/, '');
  for (var k in CODECS) if (c.indexOf(k) === 0) return CODECS[k];
  return c ? c.toUpperCase() : '';
}

var LANGS = { fr: 'Français', fre: 'Français', fra: 'Français', en: 'Anglais', eng: 'Anglais', nl: 'Néerlandais', dut: 'Néerlandais',
  nld: 'Néerlandais', de: 'Allemand', ger: 'Allemand', deu: 'Allemand', es: 'Espagnol', spa: 'Espagnol', it: 'Italien', ita: 'Italien',
  pt: 'Portugais', por: 'Portugais', ar: 'Arabe', ara: 'Arabe', tr: 'Turc', tur: 'Turc', und: '' };
function langName(code) {
  code = String(code || '').toLowerCase();
  return LANGS[code] !== undefined ? LANGS[code] : code.toUpperCase();
}
