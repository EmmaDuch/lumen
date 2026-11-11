/* LUMEN — page de réglages du serveur */
(function () {
  'use strict';
  var token = new URLSearchParams(location.search).get('token') || '';
  var $ = function (id) { return document.getElementById(id); };
  var tab = 'bq', catKind = 'live', filter = '';
  var bqs = [], curBq = null, bqChans = [], chans = [], cats = [], srcs = [], maps = [];

  /* ---------- outils ---------- */
  function api(method, path, body) {
    var o = { method: method, headers: {} };
    if (token) o.headers['X-Lumen-Token'] = token;
    if (body) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch(path, o).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || ('erreur ' + r.status)); return d; });
    });
  }
  function mk(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function norm(s) { return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function img(u) { return u ? u + (token ? '&token=' + encodeURIComponent(token) : '') : ''; }
  function say(id, text, bad) { var n = $(id); n.textContent = ''; n.append(mk('span', bad ? 'msg' : '', text)); }
  function fail(id) { return function (e) { say(id, 'Erreur : ' + e.message, true); }; }
  function logoNode(c) {
    var i = mk('img', 'chlogo'); i.alt = ''; i.loading = 'lazy';
    if (c.logo) { i.src = img(c.logo); i.onerror = function () { i.style.visibility = 'hidden'; }; }
    else i.style.visibility = 'hidden';
    return i;
  }
  function posterNode(c) {
    var i = mk('img', 'poster-mini'); i.alt = ''; i.loading = 'lazy';
    if (c.poster) { i.src = img(c.poster); i.onerror = function () { i.style.visibility = 'hidden'; }; }
    else i.style.visibility = 'hidden';
    return i;
  }
  function tags(c) {
    var out = [];
    if (c.quality) out.push(mk('span', 'tag q', c.quality));
    if (c.archive) out.push(mk('span', 'tag replay', 'Replay'));
    return out;
  }

  /* ---------- boîte de dialogue ---------- */
  /* « dlg » est la fenêtre courante ; « dlg2 » sert quand une fenêtre doit en ouvrir une autre
     (choisir une jaquette depuis l'éditeur de fiche, par exemple). */
  function dialog(title, buildBody, onOk, okLabel, which) {
    var p = which || 'dlg', d = $(p);
    $(p + '-title').textContent = title;
    $(p + '-body').textContent = '';
    $(p + '-ok').textContent = okLabel || 'Valider';
    var ctx = buildBody($(p + '-body'));
    d.showModal();
    var first = $(p + '-body').querySelector('input, select, button');
    if (first) setTimeout(function () { first.focus(); if (first.select) first.select(); }, 30);
    function close() { d.close(); $(p + '-ok').onclick = null; $(p + '-cancel').onclick = null; }
    // sans rien à valider (une fenêtre où l'on choisit), un seul bouton suffit
    $(p + '-cancel').style.display = onOk ? '' : 'none';
    $(p + '-cancel').onclick = close;
    $(p + '-ok').onclick = function () {
      var r = onOk && onOk(ctx);
      if (r && r.then) r.then(close, function (e) { alert(e.message); }); else close();
    };
    return close;
  }
  function askText(title, label, value, onOk, okLabel, which) {
    dialog(title, function (box) {
      box.append(mk('label', 'lbl', label));
      var i = mk('input', 'edit w100'); i.type = 'text'; i.value = value || '';
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') $((which || 'dlg') + '-ok').click(); });
      box.append(i);
      return i;
    }, function (i) { return onOk(i.value.trim()); }, okLabel, which);
  }
  function confirmBox(title, text, onOk, okLabel) {
    dialog(title, function (box) { box.append(mk('p', '', text)); return null; }, function () { return onOk(); }, okLabel || 'Confirmer');
  }

  /* ---------- glisser-déposer ---------- */
  function makeSortable(list, onDrop) {
    var dragged = null;
    list.addEventListener('dragstart', function (e) {
      var li = e.target.closest('li'); if (!li) return;
      dragged = li; li.classList.add('drag'); e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', ''); } catch (err) { /* Firefox */ }
    });
    list.addEventListener('dragend', function () {
      if (dragged) dragged.classList.remove('drag');
      Array.prototype.forEach.call(list.children, function (n) { n.classList.remove('over'); });
      dragged = null;
    });
    list.addEventListener('dragover', function (e) {
      e.preventDefault();
      var li = e.target.closest('li');
      if (!li || li === dragged) return;
      Array.prototype.forEach.call(list.children, function (n) { n.classList.remove('over'); });
      li.classList.add('over');
    });
    list.addEventListener('drop', function (e) {
      e.preventDefault();
      var li = e.target.closest('li');
      if (!li || !dragged || li === dragged) return;
      var items = Array.prototype.slice.call(list.children);
      var from = items.indexOf(dragged), to = items.indexOf(li);
      list.insertBefore(dragged, from < to ? li.nextSibling : li);
      onDrop(from, to);
    });
  }

  /* ================= MES BOUQUETS ================= */
  var bqKind = 'live';
  var KIND_LABEL = { live: 'chaînes', vod: 'films', series: 'séries' };
  function bqUnit() { return KIND_LABEL[bqKind]; }

  function loadBouquets(keep) {
    return api('GET', '/api/bouquets?kind=' + bqKind).then(function (d) {
      bqs = d.bouquets;
      if (!keep || !bqs.some(function (b) { return b.bouquet === curBq; })) curBq = bqs.length ? bqs[0].bouquet : null;
      renderBouquets();
      return curBq ? loadBqChannels() : renderBqChannels();
    }).catch(fail('bq-sum'));
  }
  function renderBouquets() {
    var ul = $('bqlist'); ul.textContent = '';
    if (!bqs.length) { ul.append(mk('li', 'empty', 'Aucun bouquet pour l’instant.')); return; }
    bqs.forEach(function (b, i) {
      var li = mk('li', 'stack' + (b.bouquet === curBq ? ' sel' : ''));
      var top = mk('div', 'top');
      top.append(mk('span', 'handle', '☰'));
      var n = mk('button', 'name link'); n.style.cssText = 'text-align:left;color:inherit;padding:0;font-size:16px';
      n.append(document.createTextNode(b.name));
      n.onclick = function () { curBq = b.bouquet; renderBouquets(); loadBqChannels(); };
      top.append(n, mk('span', 'count', b.count + ' ' + (bqKind === 'live' ? 'ch.' : '')));
      li.append(top);
      var acts = mk('div', 'acts'); li.append(acts);
      var up = mk('button', 'link', '▲'); up.title = 'Monter'; up.disabled = i === 0;
      up.onclick = function () { api('POST', '/api/bouquets/move', { id: b.bouquet, delta: -1 }).then(function () { loadBouquets(true); }); };
      var dn = mk('button', 'link', '▼'); dn.title = 'Descendre'; dn.disabled = i === bqs.length - 1;
      dn.onclick = function () { api('POST', '/api/bouquets/move', { id: b.bouquet, delta: 1 }).then(function () { loadBouquets(true); }); };
      var rn = mk('button', 'link', 'Renommer');
      rn.onclick = function () {
        askText('Renommer le bouquet', 'Nom', b.name, function (v) {
          return api('POST', '/api/bouquets/rename', { id: b.bouquet, name: v }).then(function () { loadBouquets(true); });
        });
      };
      var del = mk('button', 'link', 'Supprimer'); del.style.color = '#FF9DA1';
      del.onclick = function () {
        confirmBox('Supprimer « ' + b.name + ' » ?', 'Le bouquet disparaît de la TV. Le contenu lui-même n’est pas touché.', function () {
          return api('DELETE', '/api/bouquets?id=' + b.bouquet).then(function () { curBq = null; loadBouquets(); });
        }, 'Supprimer');
      };
      acts.append(up, dn, rn, del);
      ul.append(li);
    });
  }
  function loadBqChannels() {
    var path = bqKind === 'live' ? '/api/live?cat=b' + curBq
             : (bqKind === 'vod' ? '/api/vod?cat=b' + curBq + '&limit=200' : '/api/series?cat=b' + curBq + '&limit=200');
    return api('GET', path).then(function (d) {
      bqChans = d.channels || d.items || []; renderBqChannels();
    }).catch(fail('bq-sum'));
  }
  function renderBqChannels() {
    var ul = $('bqchans'); ul.textContent = '';
    $('bq-sum').textContent = bqChans.length + ' ' + bqUnit();
    var b = bqs.filter(function (x) { return x.bouquet === curBq; })[0];
    $('bq-title').textContent = b ? b.name : 'Contenu';
    $('bq-add').disabled = !b;
    $('bq-renum').disabled = !b || bqKind !== 'live';
    $('bq-renum').classList.toggle('hidden', bqKind !== 'live');
    $('bq-add').textContent = 'Ajouter des ' + bqUnit();
    $('bq-hint').textContent = bqKind === 'live'
      ? "Glissez les lignes pour changer l'ordre. Cet ordre sert aussi à la renumérotation."
      : "Glissez les lignes pour changer l'ordre d'affichage sur la TV.";
    if (!b) { ul.append(mk('li', 'empty', 'Créez un bouquet pour commencer.')); $('bq-sum').textContent = ''; return; }
    if (!bqChans.length) { ul.append(mk('li', 'empty', 'Bouquet vide. Utilisez « Ajouter des ' + bqUnit() + ' ».')); }
    bqChans.forEach(function (c) {
      var li = mk('li'); li.draggable = true;
      li.append(mk('span', 'handle', '☰'));
      if (bqKind === 'live') li.append(mk('span', 'count', String(c.num)), logoNode(c));
      else li.append(posterNode(c));
      var n = mk('span', 'name'); n.append(document.createTextNode(c.name));
      if (c.orig_name && c.orig_name !== c.name) n.append(mk('small', '', 'Fournisseur : ' + c.orig_name));
      li.append(n);
      if (bqKind === 'live') tags(c).forEach(function (t) { li.append(t); });
      var rm = mk('button', 'link', 'Retirer'); rm.style.color = '#FF9DA1';
      rm.onclick = function () {
        api('POST', '/api/bouquets/remove', { id: curBq, channels: [c.id] }).then(function () { loadBouquets(true); });
      };
      li.append(rm);
      ul.append(li);
    });

  }
  makeSortable($('bqchans'), function () {
    var ids = Array.prototype.map.call($('bqchans').children, function (li, i) { return bqChans[i] && bqChans[i].id; });
    // l'ordre du DOM a changé : on relit les identifiants dans leur nouvel ordre
    var order = [], nodes = Array.prototype.slice.call($('bqchans').children);
    var before = bqChans.slice();
    nodes.forEach(function (node) {
      var name = node.querySelector('.name') ? node.querySelector('.name').firstChild.textContent : '';
      var idx = before.findIndex(function (c) { return c && c.name === name; });
      if (idx >= 0) { order.push(before[idx].id); before[idx] = null; }
    });
    if (order.length !== bqChans.length) { loadBqChannels(); return; }
    api('POST', '/api/bouquets/items', { id: curBq, channels: order })
      .then(function () { say('bq-sum', 'Ordre enregistré'); loadBqChannels(); }).catch(fail('bq-sum'));
    void ids;
  });
  document.querySelectorAll('[data-bqk]').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('[data-bqk]').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      bqKind = b.dataset.bqk; curBq = null;
      loadBouquets();
    };
  });
  $('bq-new').onclick = function () {
    askText('Nouveau bouquet', 'Nom', '', function (v) {
      return api('POST', '/api/bouquets/create', { name: v || 'Nouveau bouquet', kind: bqKind })
        .then(function (r) { curBq = r.id; return loadBouquets(true); });
    }, 'Créer');
  };
  $('bq-from-cat').onclick = function () {
    api('GET', '/api/categories?all=1&kind=' + bqKind).then(function (d) {
      var provider = d.filter(function (c) { return !c.own; });
      dialog('Créer depuis une catégorie du fournisseur', function (box) {
        box.append(mk('label', 'lbl', 'Catégorie'));
        var sel = mk('select', 'w100');
        provider.forEach(function (c) { var o = mk('option', '', c.name + ' (' + c.count + ')'); o.value = c.id; sel.append(o); });
        box.append(sel);
        box.append(mk('label', 'lbl', 'Nom du bouquet'));
        var i = mk('input', 'edit w100'); i.type = 'text';
        i.value = provider.length ? provider[0].name : '';
        sel.onchange = function () { i.value = provider.filter(function (c) { return c.id === sel.value; })[0].name; };
        box.append(i);
        return { sel: sel, i: i };
      }, function (c) {
        return api('POST', '/api/bouquets/create', { name: c.i.value.trim(), cats: [c.sel.value], kind: bqKind })
          .then(function (r) { curBq = r.id; return loadBouquets(true); });
      }, 'Créer');
    });
  };
  $('bq-renum').onclick = function () {
    dialog('Renuméroter « ' + ($('bq-title').textContent) + ' »', function (box) {
      box.append(mk('p', 'help', 'Les chaînes du bouquet sont renumérotées dans leur ordre actuel.'));
      box.append(mk('label', 'lbl', 'Premier numéro'));
      var i = mk('input', 'edit'); i.type = 'text'; i.inputMode = 'numeric'; i.value = '1'; box.append(i);
      box.append(mk('label', 'lbl', 'Pas'));
      var s = mk('input', 'edit'); s.type = 'text'; s.inputMode = 'numeric'; s.value = '1'; box.append(s);
      return { i: i, s: s };
    }, function (c) {
      return api('POST', '/api/bouquets/renumber', { id: curBq, start: c.i.value, step: c.s.value })
        .then(function (r) { say('bq-sum', r.renumbered + ' chaînes renumérotées'); return loadBqChannels(); });
    }, 'Renuméroter');
  };
  $('bq-add').onclick = function () {
    api('GET', '/api/categories?all=1&kind=' + bqKind).then(function (d) {
      var provider = d.filter(function (c) { return !c.own; });
      dialog('Ajouter des ' + bqUnit(), function (box) {
        var tools = mk('div', 'tools');
        var q = mk('input'); q.type = 'search'; q.placeholder = 'Rechercher'; q.className = 'grow';
        var sel = mk('select');
        var optAll = mk('option', '', 'Toutes les catégories'); optAll.value = 'all'; sel.append(optAll);
        provider.forEach(function (c) { var o = mk('option', '', c.name); o.value = c.id; sel.append(o); });
        var all = mk('button', 'btn small', 'Tout cocher');
        tools.append(q, sel, all); box.append(tools);
        var ul = mk('ul', 'scroll'); ul.style.maxHeight = '320px'; box.append(ul);
        var info = mk('p', 'help', ''); box.append(info);
        var current = [];
        function load() {
          var url = bqKind === 'live'
            ? '/api/channels/admin?cat=' + encodeURIComponent(sel.value || 'all') + '&q=' + encodeURIComponent(q.value)
            : (sel.value && sel.value !== 'all'
                ? '/api/' + (bqKind === 'vod' ? 'vod' : 'series') + '?cat=' + encodeURIComponent(sel.value) + '&limit=200&sort=nom'
                : '/api/search?q=' + encodeURIComponent(q.value));
          api('GET', url).then(function (res) {
            var list = bqKind === 'live' ? res
                     : (res.items || (bqKind === 'vod' ? res.vod : res.series) || []);
            var have = {};
            bqChans.forEach(function (c) { have[c.id] = 1; });
            var term = q.value.trim().toLowerCase();
            current = list.filter(function (c) {
              if (have[c.id]) return false;
              if (bqKind !== 'live' && term && c.name.toLowerCase().indexOf(term) < 0) return false;
              return true;
            });
            ul.textContent = '';
            if (!current.length) ul.append(mk('li', 'empty', bqKind === 'live' ? 'Aucune chaîne à ajouter ici.'
              : 'Rien à ajouter ici. Choisissez un bouquet, ou tapez au moins deux lettres.'));
            current.forEach(function (c) {
              var li = mk('li');
              var cb = mk('input'); cb.type = 'checkbox'; cb.value = c.id; cb.className = 'pick';
              li.append(cb);
              if (bqKind === 'live') li.append(logoNode(c), mk('span', 'count', String(c.num)));
              else li.append(posterNode(c));
              li.append(mk('span', 'name', c.name));
              if (bqKind === 'live') tags(c).forEach(function (t) { li.append(t); });
              ul.append(li);
            });
            info.textContent = current.length + ' ' + bqUnit() + ' disponibles';
          });
        }
        var t; q.oninput = function () { clearTimeout(t); t = setTimeout(load, 300); };
        sel.onchange = load;
        all.onclick = function () {
          var boxes = ul.querySelectorAll('.pick'), on = !boxes[0] || !boxes[0].checked;
          Array.prototype.forEach.call(boxes, function (b) { b.checked = on; });
        };
        load();
        return ul;
      }, function (ul) {
        var ids = Array.prototype.map.call(ul.querySelectorAll('.pick:checked'), function (b) { return Number(b.value); });
        if (!ids.length) return Promise.resolve();
        return api('POST', '/api/bouquets/add', { id: curBq, channels: ids })
          .then(function (r) { say('bq-sum', r.added + ' ' + bqUnit() + ' ajoutés'); return loadBouquets(true); });
      }, 'Ajouter');
    });
  };

  /* ================= CHAÎNES ================= */
  function fillCatSelect(id, kind) {
    return api('GET', '/api/categories?all=1&kind=' + (kind || 'live')).then(function (d) {
      var sel = $(id), cur = sel.value; sel.length = 1;
      d.forEach(function (c) {
        var o = mk('option', '', (c.own ? '★ ' : '') + c.name + (c.hidden ? ' (masqué)' : ''));
        o.value = c.id; sel.append(o);
      });
      sel.value = cur;
    });
  }
  function loadChans() {
    return api('GET', '/api/channels/admin?cat=' + encodeURIComponent($('ccat').value) + '&q=' + encodeURIComponent($('cq').value.trim()))
      .then(function (d) { chans = d; renderChans(); }).catch(fail('csummary'));
  }
  function renderChans() {
    var ul = $('clist'); ul.textContent = '';
    var used = {}; chans.forEach(function (c) { used[c.num] = (used[c.num] || 0) + 1; });
    if (!chans.length) ul.append(mk('li', 'empty', 'Aucune chaîne.'));
    chans.forEach(function (c) {
      var li = mk('li', c.hidden ? 'off' : '');
      var num = mk('input', 'edit num'); num.inputMode = 'numeric'; num.value = c.num;
      num.setAttribute('aria-label', 'Numéro de ' + c.name);
      if (used[c.num] > 1) { num.style.color = '#FFB37A'; num.title = 'Ce numéro est utilisé par plusieurs chaînes'; }
      var wrap = mk('div'); wrap.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:3px';
      var name = mk('input', 'edit title'); name.value = c.name; name.setAttribute('aria-label', 'Nom de la chaîne');
      wrap.append(name, mk('span', 'orig', 'Fournisseur : n° ' + c.orig_num + ' · ' + c.orig_name + (c.cat_name ? ' · ' + c.cat_name : '')));
      var state = mk('span', 'ok', '');
      li.append(logoNode(c), num, wrap);
      tags(c).forEach(function (t) { li.append(t); });
      if (c.epg) { var e = mk('span', 'tag epg', 'Guide'); e.title = c.epg; li.append(e); }
      li.append(state);
      var lg = mk('button', 'btn small', 'Logo');
      lg.onclick = function () { editLogo(c); };
      li.append(lg);
      if (c.custom) {
        var r = mk('button', 'link', 'Rétablir');
        r.onclick = function () { send(c, null, null, state); };
        li.append(r);
      }
      function commit() {
        var n = num.value.trim(), t = name.value.trim();
        if (String(c.num) === n && c.name === t) return;
        send(c, t === c.orig_name ? null : t, n === String(c.orig_num) ? null : n, state);
      }
      [num, name].forEach(function (inp) {
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') inp.blur();
          if (e.key === 'Escape') { num.value = c.num; name.value = c.name; inp.blur(); }
        });
        inp.addEventListener('change', commit);
      });
      ul.append(li);
    });
    $('csummary').textContent = chans.length + ' chaînes' + (chans.length >= 3000 ? ' (affinez la recherche)' : '');
  }
  function editLogo(c) {
    var ctx = { kind: 'live', id: c.id, data: { logo: c.logo, name: c.name } };
    dialog('Logo de ' + c.name, function (box) {
      box.append(mk('p', 'help', 'Collez une adresse web, ou choisissez un fichier sur votre PC. '
        + 'L’image est copiée sur le serveur ; « Rétablir » revient au logo du fournisseur.'));
      artBox(box, 'Logo', 'logo', ctx);
      return null;
    }, null, 'Fermer');
  }
  function send(c, name, num, state) {
    api('POST', '/api/channels/edit', { id: c.id, name: name, num: num }).then(function (r) {
      state.textContent = '✓ Enregistré';
      if (r.same_number) say('csummary', 'Attention : ce numéro est aussi celui de « ' + r.same_number + ' ».', true);
      setTimeout(loadChans, 600);
    }).catch(function (e) { state.textContent = ''; fail('csummary')(e); });
  }
  $('num-reset').onclick = function () {
    confirmBox('Numéros d’origine', 'Tous les numéros que vous avez choisis seront oubliés. Les noms sont conservés.', function () {
      return api('POST', '/api/numbers/reset', {}).then(loadChans);
    }, 'Rétablir');
  };

  /* ================= MÉDIATHÈQUE ================= */
  var mKind = 'movie', mTimer = null, mItems = [];

  function loadMedias() {
    return api('GET', '/api/medias').then(function (d) {
      var ul = $('mroots'); ul.textContent = '';
      if (!d.roots.length) ul.append(mk('li', 'empty', 'Aucun dossier déclaré.'));
      d.roots.forEach(function (r) {
        var li = mk('li');
        var wrap = mk('div'); wrap.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:3px';
        wrap.append(mk('span', 'title', r.name || r.path),
                    mk('span', 'orig', r.path + ' · ' + ({ films: 'films', series: 'séries', auto: 'détection auto' }[r.kind] || r.kind) +
                       (r.count ? ' · ' + r.count + ' fichiers' : '') + (r.status ? ' · ' + r.status : '')));
        var del = mk('button', 'link danger', 'Retirer');
        del.onclick = function () {
          confirmBox('Retirer ce dossier', 'Ses films et épisodes quittent le catalogue. Les fichiers ne sont pas touchés.', function () {
            api('POST', '/api/medias/remove', { id: r.id }).then(loadMedias).then(loadMediaItems).catch(fail('msummary'));
          });
        };
        li.append(wrap, del);
        ul.append(li);
      });
      var bits = [];
      bits.push(d.tmdb ? 'Fiches TMDB activées' : 'Aucune clé TMDB : pas de jaquettes ni de résumés');
      bits.push(d.ffprobe ? 'Analyse des pistes disponible' : 'ffprobe absent : compatibilité non vérifiée');
      $('msummary').textContent = bits.join(' · ');
      var st = $('mstate');
      if (d.running) {
        st.textContent = 'Analyse en cours…';
        clearTimeout(mTimer); mTimer = setTimeout(function () { loadMedias(); loadMediaItems(); }, 3000);
      } else if (d.last) {
        st.textContent = d.last.seen + ' fichiers vus · ' + d.last.films + ' films et ' + d.last.series +
          ' séries publiés' + (d.last.films_sans_fiche || d.last.series_sans_fiche
            ? ' · ' + (d.last.films_sans_fiche + d.last.series_sans_fiche) + ' sans fiche' : '');
      } else {
        st.textContent = '';
      }
    }).catch(fail('msummary'));
  }

  function loadMediaItems() {
    return api('GET', '/api/medias/items?kind=' + mKind + '&q=' + encodeURIComponent($('mq').value.trim()))
      .then(function (d) { mItems = d.items; renderMediaItems(); }).catch(fail('mcount'));
  }

  function renderMediaItems() {
    var ul = $('mlist'); ul.textContent = '';
    if (!mItems.length) ul.append(mk('li', 'empty', 'Rien à afficher.'));
    mItems.forEach(function (it) {
      var li = mk('li');
      var wrap = mk('div'); wrap.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:3px';
      var title = it.title + (it.year ? ' (' + it.year + ')' : '') +
        (it.kind === 'episode' ? ' · S' + (it.season || 0) + 'E' + (it.episode || 0) : '');
      var tech = [];
      if (it.height) tech.push(it.height + 'p');
      if (it.video) tech.push(it.video);
      if (it.audio) tech.push(it.audio);
      if (it.size) tech.push(Math.round(it.size / 1048576) + ' Mo');
      wrap.append(mk('span', 'title', it.published || title));
      if (it.published && it.published !== title) wrap.append(mk('span', 'orig', 'fichier : ' + title));
      wrap.append(mk('span', 'orig', it.path));
      if (tech.length) wrap.append(mk('span', 'orig', tech.join(' · ')));
      li.append(wrap);
      if (!it.playable) li.append(mk('span', 'tag danger', 'illisible'));
      else if (!it.matched) li.append(mk('span', 'tag', 'sans fiche'));
      var fix = mk('button', 'link', 'Corriger la fiche');
      fix.onclick = function () { pickMatch(it); };
      li.append(fix);
      if (it.note) ul.append(li), ul.append(mk('li', 'empty', it.note));
      else ul.append(li);
    });
    $('mcount').textContent = mItems.length + ' éléments' + (mItems.length >= 400 ? ' (affinez la recherche)' : '');
  }

  /* recherche TMDB pour rattacher le bon film ou la bonne série */
  function pickMatch(it) {
    var kind = it.kind === 'episode' ? 'tv' : 'movie';
    askText('Corriger la fiche', 'Titre à chercher sur TMDB', it.title || '', function (term) {
      if (!term) return;
      return api('GET', '/api/medias/search?kind=' + kind + '&q=' + encodeURIComponent(term))
        .then(function (d) {
          if (!d.results.length) throw new Error('aucun résultat sur TMDB');
          var chosen = null;
          setTimeout(function () {
            dialog('Choisir la fiche', function (box) {
              d.results.forEach(function (r) {
                var b = mk('button', 'btn wide', (r.title || '') + (r.year ? ' (' + r.year + ')' : ''));
                b.onclick = function () { chosen = r.id; $('dlg-ok').click(); };
                if (r.plot) b.title = r.plot;
                box.append(b);
              });
              return null;
            }, function () {
              if (!chosen) return;
              var body = kind === 'tv' ? { kind: 'tv', show: it.show || 0, tmdb: chosen }
                                       : { kind: 'movie', id: it.id, tmdb: chosen };
              return api('POST', '/api/medias/match', body).then(loadMediaItems);
            }, 'Annuler');
          }, 60);
        });
    });
  }

  document.querySelectorAll('[data-mk]').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('[data-mk]').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      mKind = b.dataset.mk;
      loadMediaItems();
    };
  });
  var mqt; $('mq').oninput = function () { clearTimeout(mqt); mqt = setTimeout(loadMediaItems, 300); };
  $('madd').onclick = function () {
    var path = $('mpath').value.trim();
    if (!path) return;
    api('POST', '/api/medias/add', { path: path, kind: $('mkind').value })
      .then(function () { $('mpath').value = ''; return loadMedias(); }).catch(fail('msummary'));
  };
  $('mscan').onclick = function () {
    api('POST', '/api/medias/scan', {}).then(function () { $('mstate').textContent = 'Analyse en cours…'; loadMedias(); })
      .catch(fail('msummary'));
  };
  $('mforce').onclick = function () {
    confirmBox('Tout réanalyser', 'Les fiches sont redemandées à TMDB pour l’ensemble de la médiathèque. Vos corrections manuelles sont conservées.', function () {
      api('POST', '/api/medias/scan', { force: true }).then(function () { $('mstate').textContent = 'Analyse en cours…'; loadMedias(); })
        .catch(fail('msummary'));
    });
  };

  /* ================= FILMS ET SÉRIES ================= */
  var iKind = 'vod', items = [];
  function loadItems() {
    return api('GET', '/api/items?kind=' + iKind + '&cat=' + encodeURIComponent($('icat').value) +
                      '&q=' + encodeURIComponent($('iq').value.trim()))
      .then(function (d) { items = d.items; renderItems(); }).catch(fail('isummary'));
  }
  function renderItems() {
    var ul = $('ilist'); ul.textContent = '';
    if (!items.length) ul.append(mk('li', 'empty', iKind === 'vod' ? 'Aucun film.' : 'Aucune série.'));
    items.forEach(function (it) {
      var li = mk('li');
      li.append(posterNode(it));
      var wrap = mk('div'); wrap.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:3px';
      var name = mk('input', 'edit title'); name.value = it.name;
      name.setAttribute('aria-label', 'Titre');
      wrap.append(name, mk('span', 'orig', 'Fournisseur : ' + it.orig_name + (it.cat_name ? ' · ' + it.cat_name : '')));
      var state = mk('span', 'ok', '');
      li.append(wrap);
      if (it.manual) li.append(mk('span', 'tag', 'à la main'));
      if (it.edited) li.append(mk('span', 'tag', 'fiche corrigée'));
      li.append(state);
      var ed = mk('button', 'btn small', 'Modifier');
      ed.onclick = function () { editItem(it); };
      li.append(ed);
      if (it.manual) {
        var r = mk('button', 'link', 'Rétablir');
        r.onclick = function () { sendItem(it, null, state); };
        li.append(r);
      }
      name.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') name.blur();
        if (e.key === 'Escape') { name.value = it.name; name.blur(); }
      });
      name.addEventListener('change', function () {
        var t = name.value.trim();
        if (t === it.name) return;
        sendItem(it, t || null, state);
      });
      ul.append(li);
    });
    $('isummary').textContent = items.length + (iKind === 'vod' ? ' films' : ' séries') +
      (items.length >= 400 ? ' (affinez la recherche)' : '');
  }
  /* ---------- éditeur de fiche ---------- */
  function artBox(box, label, slot, ctx) {
    var wrap = mk('div', 'artslot');
    wrap.append(mk('span', 'lbl', label));
    var node = mk('img', slot === 'backdrop' ? 'art wide' : 'art');
    node.alt = ''; node.loading = 'lazy';
    bust(node, ctx.data[slot]);
    var acts = mk('div', 'tools');
    var web = mk('button', 'btn small', 'Adresse web');
    web.onclick = function () { askArtUrl(ctx, slot, node); };
    var pc = mk('button', 'btn small', 'Depuis le PC');
    var file = mk('input'); file.type = 'file'; file.accept = 'image/*'; file.style.display = 'none';
    pc.onclick = function () { file.click(); };
    file.onchange = function () { if (file.files[0]) sendArtFile(ctx, slot, file.files[0], node); file.value = ''; };
    acts.append(web, pc, file);
    if (ctx.kind !== 'live') {
      var tm = mk('button', 'btn small', 'TMDB');
      tm.onclick = function () { pickTmdb(ctx, slot, node); };
      acts.append(tm);
    }
    var off = mk('button', 'link', 'Rétablir');
    off.onclick = function () {
      api('POST', '/api/art/reset', { kind: ctx.kind, id: ctx.id, slot: slot })
        .then(function (d) { refreshArt(ctx, slot, node, d); }).catch(function (e) { alert(e.message); });
    };
    acts.append(off);
    wrap.append(node, acts);
    box.append(wrap);
    return node;
  }
  function bust(node, src) {
    if (!src) { node.removeAttribute('src'); node.style.visibility = 'hidden'; return; }
    node.style.visibility = '';
    node.src = img(src) + '&r=' + Date.now();   // l'image a changé : on court-circuite le cache
  }
  function refreshArt(ctx, slot, node, d) {
    ctx.data[slot] = d.img;
    bust(node, d.img);
    // la liste derrière la fenêtre montre la même image : on la remet à jour aussi
    setTimeout(ctx.kind === 'live' ? loadChans : loadItems, 400);
  }
  function sendArtFile(ctx, slot, file, node) {
    var o = { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file };
    if (token) o.headers['X-Lumen-Token'] = token;
    fetch('/api/art/upload?kind=' + ctx.kind + '&id=' + ctx.id + '&slot=' + slot, o)
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error); return d; }); })
      .then(function (d) { refreshArt(ctx, slot, node, d); })
      .catch(function (e) { alert('Image refusée : ' + e.message); });
  }
  function askArtUrl(ctx, slot, node) {
    askText('Adresse de l’image', 'Collez l’adresse web de l’image (elle sera copiée sur le serveur).', '',
      function (url) {
        if (!url) return;
        return api('POST', '/api/art/fetch', { kind: ctx.kind, id: ctx.id, slot: slot, url: url })
          .then(function (d) { refreshArt(ctx, slot, node, d); });
      }, 'Utiliser cette image', 'dlg2');
  }
  function pickTmdb(ctx, slot, node) {
    dialog('Chercher sur TMDB', function (box) {
      var q = mk('input', 'edit w100'); q.type = 'search'; q.value = ctx.data.name || '';
      var res = mk('div', 'tmdb'); var state = mk('p', 'help', '');
      function run() {
        state.textContent = 'Recherche…'; res.textContent = '';
        api('GET', '/api/art/search?kind=' + ctx.kind + '&q=' + encodeURIComponent(q.value.trim()))
          .then(function (d) {
            state.textContent = d.results.length ? '' : 'Rien trouvé sous ce titre.';
            d.results.forEach(function (r) {
              var url = slot === 'backdrop' ? r.backdrop_url : r.poster_url;
              if (!url) return;
              var c = mk('button', 'tcard');
              var i = mk('img'); i.alt = ''; i.loading = 'lazy';
              i.src = img(slot === 'backdrop' ? r.backdrop : r.poster);
              c.append(i, mk('span', '', r.title + (r.year ? ' (' + r.year + ')' : '')));
              c.onclick = function () {
                api('POST', '/api/art/fetch', { kind: ctx.kind, id: ctx.id, slot: slot, url: url })
                  .then(function (d) { $('dlg2-cancel').click(); refreshArt(ctx, slot, node, d); })
                  .catch(function (e) { alert(e.message); });
              };
              res.append(c);
            });
          }).catch(function (e) { state.textContent = 'Erreur : ' + e.message; });
      }
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); run(); } });
      var go = mk('button', 'btn small', 'Chercher'); go.onclick = run;
      var tools = mk('div', 'tools'); tools.append(go);
      box.append(mk('label', 'lbl', 'Titre à chercher'), q, tools, state, res);
      run();
      return null;
    }, null, 'Fermer', 'dlg2');
  }
  function editItem(it) {
    api('GET', '/api/items/detail?kind=' + iKind + '&id=' + it.id).then(function (d) {
      var ctx = { kind: iKind, id: it.id, data: d };
      dialog('Modifier la fiche', function (box) {
        box.append(mk('label', 'lbl', 'Titre'));
        var name = mk('input', 'edit w100'); name.type = 'text'; name.value = d.name || '';
        box.append(name);
        if (d.orig_name && d.orig_name !== d.name) box.append(mk('p', 'help', 'Fournisseur : ' + d.orig_name));
        box.append(mk('label', 'lbl', 'Résumé'));
        var plot = mk('textarea', 'edit w100'); plot.rows = 6; plot.value = d.plot || '';
        box.append(plot);
        var arts = mk('div', 'arts');
        box.append(arts);
        ctx.poster = artBox(arts, 'Jaquette', 'poster', ctx);
        ctx.backdrop = artBox(arts, 'Fond', 'backdrop', ctx);
        return { name: name, plot: plot };
      }, function (c) {
        return api('POST', '/api/items/edit', {
          kind: iKind, id: it.id, name: c.name.value.trim(), plot: c.plot.value.trim()
        }).then(loadItems);
      }, 'Enregistrer');
    }).catch(fail('isummary'));
  }

  function sendItem(it, name, state) {
    api('POST', '/api/items/rename', { kind: iKind, id: it.id, name: name }).then(function () {
      state.textContent = '✓ Enregistré';
      setTimeout(loadItems, 600);
    }).catch(function (e) { state.textContent = ''; fail('isummary')(e); });
  }
  document.querySelectorAll('[data-ikind]').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('[data-ikind]').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      iKind = b.dataset.ikind;
      $('icat').length = 1; $('icat').value = 'all';
      fillCatSelect('icat', iKind).then(loadItems);
    };
  });
  var it_; $('iq').oninput = function () { clearTimeout(it_); it_ = setTimeout(loadItems, 300); };
  $('icat').onchange = loadItems;

  /* ================= NOMS ================= */
  var prevKind = 'live';
  function loadRules() {
    return api('GET', '/api/rules?preview=' + prevKind).then(function (d) {
      var ul = $('rules'); ul.textContent = '';
      d.rules.forEach(function (r) {
        var li = mk('li');
        var cb = mk('input'); cb.type = 'checkbox'; cb.checked = r.enabled;
        cb.setAttribute('aria-label', 'Activer la règle');
        cb.onchange = function () { api('POST', '/api/rules', { id: r.id, enabled: cb.checked }).then(loadRules); };
        var n = mk('span', 'name');
        n.append(document.createTextNode(r.label || r.pattern));
        if (r.label) n.append(mk('small', '', r.pattern + (r.repl ? '  →  « ' + r.repl + ' »' : '')));
        li.append(cb, n);
        if (!r.builtin) {
          var ed = mk('button', 'link', 'Modifier');
          ed.onclick = function () {
            askText('Modifier la règle', 'Motif (expression régulière)', r.pattern, function (v) {
              return api('POST', '/api/rules', { id: r.id, pattern: v, repl: r.repl }).then(loadRules);
            });
          };
          var del = mk('button', 'link', 'Supprimer'); del.style.color = '#FF9DA1';
          del.onclick = function () { api('DELETE', '/api/rules?id=' + r.id).then(loadRules); };
          li.append(ed, del);
        } else li.append(mk('span', 'tag', 'livrée'));
        ul.append(li);
      });
      var box = $('preview'); box.textContent = '';
      d.preview.changed.forEach(function (p) {
        box.append(mk('div', 'b', p.before), mk('div', '', '→'), mk('div', 'a', p.after + (p.manual ? '  (nom à la main)' : '')));
      });
      if (!d.preview.changed.length) box.append(mk('div', 'empty', 'Aucun nom modifié par les règles.'));
      $('prevsum').textContent = d.preview.changed.length + ' noms modifiés · ' + d.preview.unchanged + ' inchangés';
    }).catch(fail('prevsum'));
  }
  document.querySelectorAll('[data-prev]').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('[data-prev]').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      prevKind = b.dataset.prev;
      loadRules();
    };
  });
  $('rule-new').onclick = function () {
    dialog('Nouvelle règle', function (box) {
      box.append(mk('p', 'help', 'Le motif est une expression régulière, insensible à la casse. Exemple : \\|FR\\| pour enlever |FR|.'));
      box.append(mk('label', 'lbl', 'Motif'));
      var p = mk('input', 'edit w100'); p.type = 'text'; p.placeholder = '\\|FR\\|'; box.append(p);
      box.append(mk('label', 'lbl', 'Remplacer par (vide = supprimer)'));
      var r = mk('input', 'edit w100'); r.type = 'text'; box.append(r);
      return { p: p, r: r };
    }, function (c) {
      return api('POST', '/api/rules', { pattern: c.p.value, repl: c.r.value }).then(loadRules);
    }, 'Ajouter');
  };
  $('names-reset').onclick = function () {
    confirmBox('Noms d’origine', 'Tous les noms tapés à la main seront oubliés : chaînes, films, séries et bouquets. Les règles et les numéros restent.', function () {
      return api('POST', '/api/names/reset', {}).then(loadRules);
    }, 'Rétablir');
  };

  /* ================= GUIDE ================= */
  function loadGuide() {
    return api('GET', '/api/epg/sources').then(function (d) {
      srcs = d.sources;
      var ul = $('srclist'); ul.textContent = '';
      if (!srcs.length) ul.append(mk('li', 'empty', 'Aucune source. Le guide du fournisseur est utilisé seul.'));
      srcs.forEach(function (s) {
        var li = mk('li', s.enabled ? '' : 'off');
        var cb = mk('input'); cb.type = 'checkbox'; cb.checked = s.enabled; cb.setAttribute('aria-label', 'Activer');
        cb.onchange = function () { api('POST', '/api/epg/sources/set', { id: s.id, enabled: cb.checked }).then(loadGuide); };
        var n = mk('span', 'name');
        n.append(document.createTextNode(s.name || s.url));
        var info = s.last ? new Date(s.last * 1000).toLocaleString('fr-BE') + ' · ' + s.count + ' programmes' : 'jamais téléchargée';
        n.append(mk('small', '', (s.name ? s.url + ' · ' : '') + info + (s.status && s.status !== 'ok' ? ' · ' + s.status : '')));
        li.append(cb, n);
        var del = mk('button', 'link', 'Supprimer'); del.style.color = '#FF9DA1';
        del.onclick = function () {
          confirmBox('Supprimer cette source ?', 'Ses programmes seront effacés du guide.', function () {
            return api('DELETE', '/api/epg/sources?id=' + s.id).then(loadGuide);
          }, 'Supprimer');
        };
        li.append(del);
        ul.append(li);
      });
      var st = d.status;
      $('epgsum').textContent = st.mapped + ' chaînes sur ' + st.channels + ' associées à un guide externe (dont ' +
        st.manual + ' à la main) · ' + st.programmes_with_image + ' programmes avec vignette';
    }).then(loadMapping).catch(fail('epgsum'));
  }
  function loadMapping() {
    return api('GET', '/api/channels/admin?cat=all&q=' + encodeURIComponent($('mq').value.trim())).then(function (d) {
      maps = $('only-unmapped').checked ? d.filter(function (c) { return !c.epg; }) : d;
      var ul = $('maplist'); ul.textContent = '';
      if (!maps.length) ul.append(mk('li', 'empty', 'Toutes les chaînes ont un guide externe.'));
      maps.slice(0, 300).forEach(function (c) {
        var li = mk('li');
        li.append(logoNode(c), mk('span', 'count', String(c.num)));
        var n = mk('span', 'name');
        n.append(document.createTextNode(c.name));
        n.append(mk('small', '', c.epg ? 'Guide : ' + c.epg + (c.epg_manual ? ' (à la main)' : '') : 'Guide du fournisseur seulement'));
        li.append(n);
        var b = mk('button', 'link', c.epg ? 'Changer' : 'Associer');
        b.onclick = function () { mapDialog(c); };
        li.append(b);
        if (c.epg_manual) {
          var a = mk('button', 'link', 'Auto');
          a.onclick = function () { api('POST', '/api/epg/map', { chan: c.id, auto: true }).then(loadGuide); };
          li.append(a);
        }
        ul.append(li);
      });
    });
  }
  function mapDialog(c) {
    dialog('Guide pour « ' + c.name + ' »', function (box) {
      var q = mk('input', 'edit w100'); q.type = 'search'; q.value = c.name; q.placeholder = 'Nom dans le guide';
      box.append(q);
      var ul = mk('ul', 'scroll'); ul.style.cssText = 'max-height:300px;margin-top:12px'; box.append(ul);
      var chosen = { src: null, xid: null };
      function search() {
        api('GET', '/api/epg/search?q=' + encodeURIComponent(q.value)).then(function (d) {
          ul.textContent = '';
          if (!d.results.length) ul.append(mk('li', 'empty', 'Rien trouvé dans les sources.'));
          d.results.forEach(function (r) {
            var li = mk('li');
            var rb = mk('input'); rb.type = 'radio'; rb.name = 'xid';
            rb.onchange = function () { chosen = { src: r.src, xid: r.xid }; };
            var n = mk('span', 'name'); n.append(document.createTextNode(r.name));
            n.append(mk('small', '', r.source + ' · ' + r.xid));
            li.append(rb, n); ul.append(li);
          });
        });
      }
      var t; q.oninput = function () { clearTimeout(t); t = setTimeout(search, 300); };
      search();
      var none = mk('button', 'btn small', 'Aucun (guide du fournisseur)');
      none.style.marginTop = '12px';
      none.onclick = function () { chosen = { src: null, xid: null }; $('dlg-ok').click(); };
      box.append(none);
      return function () { return chosen; };
    }, function (get) {
      var c2 = get();
      return api('POST', '/api/epg/map', { chan: c.id, src: c2.src, xid: c2.xid }).then(loadGuide);
    }, 'Associer');
  }
  $('src-add').onclick = function () {
    var url = $('srcurl').value.trim();
    if (!url) return;
    api('POST', '/api/epg/sources', { url: url, name: $('srcname').value.trim() }).then(function () {
      $('srcurl').value = ''; $('srcname').value = '';
      say('epgsum', 'Source ajoutée. Cliquez sur « Télécharger maintenant ».');
      loadGuide();
    }).catch(fail('epgsum'));
  };
  $('epg-refresh').onclick = function () {
    api('POST', '/api/epg/refresh', {}).then(function () {
      say('epgsum', 'Téléchargement en cours… cela peut prendre quelques minutes.');
      setTimeout(loadGuide, 8000);
    }).catch(fail('epgsum'));
  };
  $('epg-automap').onclick = function () {
    api('POST', '/api/epg/automap', {}).then(function (r) {
      say('epgsum', r.mapped + ' chaînes associées'); loadGuide();
    }).catch(fail('epgsum'));
  };
  var mt; $('mq').oninput = function () { clearTimeout(mt); mt = setTimeout(loadMapping, 300); };
  $('only-unmapped').onchange = loadMapping;

  /* ================= BOUQUETS DU FOURNISSEUR ================= */
  function shown() { return cats.filter(function (c) { return norm(c.name + ' ' + c.orig_name).indexOf(filter) > -1; }); }
  function loadCats() {
    return api('GET', '/api/categories?all=1&kind=' + catKind).then(function (d) {
      cats = d.filter(function (c) { return !c.own; }); renderCats();
    }).catch(fail('summary'));
  }
  function renderCats() {
    var ul = $('list'), rows = shown(); ul.textContent = '';
    rows.forEach(function (c) {
      var li = mk('li', c.hidden ? 'off' : '');
      var box = mk('input'); box.type = 'checkbox'; box.checked = !c.hidden;
      box.setAttribute('aria-label', 'Afficher ' + c.name);
      box.onchange = function () { saveVis([c.id], !box.checked); };
      var name = mk('button', 'name link');
      name.style.cssText = 'text-align:left;color:inherit;padding:0;font-size:16px'; name.title = 'Renommer';
      name.append(document.createTextNode(c.name));
      if (c.name !== c.orig_name) name.append(mk('small', '', 'Fournisseur : ' + c.orig_name));
      name.onclick = function () {
        askText('Renommer le bouquet', 'Nom', c.name, function (v) {
          return api('POST', '/api/categories/rename', { kind: catKind, id: c.id, name: v }).then(loadCats);
        });
      };
      li.append(box, name, mk('span', 'count', c.count + ' titres'));
      if (c.name !== c.orig_name) {
        var r = mk('button', 'link', 'Nom d’origine');
        r.onclick = function () { api('POST', '/api/categories/rename', { kind: catKind, id: c.id, name: null }).then(loadCats); };
        li.append(r);
      }
      if (c.manual) {
        var reset = mk('button', 'link', 'Règle auto'); reset.title = 'Revenir aux règles de config.toml';
        reset.onclick = function () { saveVis([c.id], null); };
        li.append(reset);
      } else if (c.hidden) li.append(mk('span', 'tag', 'masqué par une règle'));
      ul.append(li);
    });
    var vis = cats.filter(function (c) { return !c.hidden; }).length;
    $('summary').textContent = vis + ' bouquets visibles sur ' + cats.length + (filter ? ' · ' + rows.length + ' affichés' : '');
  }
  function saveVis(ids, hidden) { return api('POST', '/api/categories/visibility', { kind: catKind, ids: ids, hidden: hidden }).then(loadCats); }
  $('q').oninput = function (e) { filter = norm(e.target.value.trim()); renderCats(); };
  $('showAll').onclick = function () { saveVis(shown().map(function (c) { return c.id; }), false); };
  $('hideAll').onclick = function () { saveVis(shown().map(function (c) { return c.id; }), true); };
  document.querySelectorAll('[data-kind]').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('[data-kind]').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      catKind = b.dataset.kind; loadCats();
    };
  });

  /* ================= téléviseur : démarrage automatique ================= */
  var tvPoll = null;

  function tvWords(d) {
    var etat = d.state === 'on' ? 'allumé' : (d.state === 'standby' ? 'en veille'
      : (d.state ? d.state : 'injoignable'));
    var out = ['Téléviseur : ' + etat];
    if (d.state === 'on' && d.front === true) out.push('LUMEN est à l’écran');
    else if (d.state === 'on' && d.front === false) out.push('LUMEN n’est pas à l’écran');
    out.push(d.paired ? 'autorisé' : 'pas encore autorisé');
    if (d.enabled) out.push(d.watching ? 'surveillance active' : 'surveillance à redémarrer');
    if (d.busy) out.push('lancement en cours…');
    if (d.last) out.push('dernier réveil : ' + d.last);
    return out.join(' · ');
  }

  function loadTv() {
    clearTimeout(tvPoll);
    return api('GET', '/api/tv').then(function (d) {
      if (document.activeElement !== $('tvhost')) $('tvhost').value = d.host || '';
      if (document.activeElement !== $('tvapp')) $('tvapp').value = d.app || '';
      if (document.activeElement !== $('tvdelai')) $('tvdelai').value = d.delay;
      if (document.activeElement !== $('tvessais')) $('tvessais').value = d.tries;
      $('tvauto').checked = !!d.enabled;
      $('tvstate').textContent = tvWords(d);
      $('tvpaired').textContent = d.paired ? 'Le serveur est autorisé sur ce téléviseur.' : '';
      if (tab === 'tv') tvPoll = setTimeout(loadTv, 15000);
    }).catch(fail('tvstate'));
  }

  function tvSave() {
    return api('POST', '/api/tv/set', {
      host: $('tvhost').value.trim(), app: $('tvapp').value.trim(),
      delai: $('tvdelai').value, essais: $('tvessais').value, auto: $('tvauto').checked
    }).then(function (d) { $('tvstate').textContent = 'Enregistré. ' + tvWords(d); }).catch(fail('tvstate'));
  }

  $('tvsave').onclick = tvSave;
  $('tvauto').onchange = tvSave;

  $('tvtest').onclick = function () {
    $('tvstate').textContent = 'Lancement demandé…';
    tvSave().then(function () { return api('POST', '/api/tv/test', {}); }).then(function (r) {
      $('tvstate').textContent = 'Demandé par ' + r.how +
        (r.front === true ? ', LUMEN est à l’écran.' : (r.front === false
          ? ', mais LUMEN n’est pas à l’écran — augmentez le nombre d’essais.'
          : '. Le téléviseur ne confirme pas ; regardez l’écran.'));
      setTimeout(loadTv, 4000);
    }).catch(fail('tvstate'));
  };

  $('tvpair').onclick = function () {
    $('tvpaired').textContent = 'Regardez le téléviseur et acceptez la demande…';
    $('tvapps').textContent = '';
    tvSave().then(function () { return api('POST', '/api/tv/pair', {}); }).then(function (d) {
      $('tvpaired').textContent = (d.paired ? 'Autorisation obtenue. ' : '') +
        d.apps.length + ' application' + (d.apps.length > 1 ? 's' : '') + ' installée' +
        (d.apps.length > 1 ? 's' : '') + ' :';
      d.apps.forEach(function (a) {
        var li = mk('li', 'line');
        li.append(mk('span', 'nm', a.name || '(sans nom)'), mk('code', '', a.id));
        var use = mk('button', 'btn small', 'Choisir');
        use.onclick = function () { $('tvapp').value = a.id; tvSave(); };
        li.append(use);
        $('tvapps').append(li);
      });
      loadTv();
    }).catch(fail('tvpaired'));
  };

  /* ================= onglets et état ================= */
  var LOAD = {
    bq: function () { return loadBouquets(true); },
    chans: function () { return fillCatSelect('ccat').then(loadChans); },
    items: function () { return fillCatSelect('icat', iKind).then(loadItems); },
    medias: function () { return loadMedias().then(loadMediaItems); },
    tv: loadTv,
    names: loadRules, guide: loadGuide, cats: loadCats
  };
  document.querySelectorAll('[data-tab]').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('[data-tab]').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      tab = b.dataset.tab;
      ['bq', 'chans', 'items', 'medias', 'tv', 'names', 'guide', 'cats'].forEach(function (t) { $('t-' + t).hidden = t !== tab; });
      LOAD[tab]();
    };
  });
  var ct; $('cq').oninput = function () { clearTimeout(ct); ct = setTimeout(loadChans, 300); };
  $('ccat').onchange = loadChans;

  function status() {
    api('GET', '/api/status').then(function (s) {
      var d = s.catalog_sync ? new Date(s.catalog_sync * 1000).toLocaleString('fr-BE') : 'jamais';
      $('status').textContent = (s.syncing ? 'Synchronisation en cours… ' : 'Dernière synchronisation : ' + d) +
        ' · ' + s.counts.live + ' chaînes, ' + s.counts.vod + ' films, ' + s.counts.series + ' séries';
      if (s.syncing) setTimeout(function () { status(); if (LOAD[tab]) LOAD[tab](); }, 4000);
    }).catch(function () {});
  }
  $('sync').onclick = function () { api('POST', '/api/sync', {}).then(status); };

  loadBouquets();
  status();
})();
