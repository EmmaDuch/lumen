"""Guide des programmes venu de sources extérieures (fichiers XMLTV publics).

Beaucoup de fournisseurs IPTV donnent un guide pauvre et sans images. On peut ajouter ici
une ou plusieurs sources XMLTV publiques (par exemple xmltvfr.fr pour les chaînes françaises
et belges), qui fournissent souvent un résumé et une vignette par programme.

Chaque chaîne est associée automatiquement par son nom ; l'association peut être corrigée à la main.
Les clés du guide externe sont préfixées « s<source>: » pour ne jamais se mélanger
avec les identifiants du fournisseur.
"""
import gzip
import logging
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from .common import merge_hosts, norm, now, xmltv_time

log = logging.getLogger("lumen.epg")

UA = "LUMEN/1.2"
_CLEAN = re.compile(r"(?:\b(?:hd|fhd|uhd|sd|4k|hevc|h265|tv|tnt)\b|[^a-z0-9]+)")


def key_for(src, xid):
    return "s%d:%s" % (int(src), xid)


def match_key(name):
    """Clé de rapprochement : minuscules, sans accents, sans HD/TV ni ponctuation."""
    return _CLEAN.sub("", norm(name or ""))


# ---------- sources ----------
def list_sources(db):
    return [{"id": r["id"], "url": r["url"], "name": r["name"] or "", "enabled": bool(r["enabled"]),
             "last": r["last"], "count": r["count"] or 0, "status": r["status"] or ""}
            for r in db.execute("SELECT * FROM epg_src ORDER BY pos, id")]


def add_source(db, url, name=""):
    url = (url or "").strip()
    if not urllib.parse.urlsplit(url).scheme in ("http", "https"):
        raise ValueError("l'adresse doit commencer par http:// ou https://")
    with db:
        pos = db.execute("SELECT COALESCE(MAX(pos), 0) + 1 FROM epg_src").fetchone()[0]
        cur = db.execute("INSERT INTO epg_src(url, name, pos, enabled) VALUES (?,?,?,1)",
                         (url, (name or "").strip(), pos))
    return cur.lastrowid


def set_source(db, src_id, enabled=None, name=None, url=None):
    with db:
        if enabled is not None:
            db.execute("UPDATE epg_src SET enabled=? WHERE id=?", (1 if enabled else 0, src_id))
        if name is not None:
            db.execute("UPDATE epg_src SET name=? WHERE id=?", ((name or "").strip(), src_id))
        if url is not None:
            db.execute("UPDATE epg_src SET url=? WHERE id=?", ((url or "").strip(), src_id))


def delete_source(db, src_id):
    with db:
        db.execute("DELETE FROM epg WHERE src=?", (src_id,))
        db.execute("DELETE FROM epg_chan WHERE src=?", (src_id,))
        db.execute("DELETE FROM epg_map WHERE src=?", (src_id,))
        db.execute("DELETE FROM epg_src WHERE id=?", (src_id,))
    apply_map(db)


# ---------- association chaîne <-> guide ----------
def automap(db):
    """Associe chaque chaîne non réglée à la main à la meilleure chaîne du guide."""
    cands = {}
    for r in db.execute("SELECT c.src, c.xid, c.norm FROM epg_chan c JOIN epg_src s ON s.id = c.src "
                        "WHERE s.enabled = 1 ORDER BY s.pos, s.id"):
        cands.setdefault(r["norm"], (r["src"], r["xid"]))  # la première source gagne
    manual = {r["chan"] for r in db.execute("SELECT chan FROM epg_map WHERE auto = 0")}
    rows = []
    for r in db.execute("SELECT id, name, orig_name FROM live"):
        if r["id"] in manual:
            continue
        hit = cands.get(match_key(r["name"])) or cands.get(match_key(r["orig_name"]))
        if hit:
            rows.append((r["id"], hit[0], hit[1]))
    with db:
        db.execute("DELETE FROM epg_map WHERE auto = 1")
        db.executemany("INSERT OR REPLACE INTO epg_map(chan, src, xid, auto) VALUES (?,?,?,1)", rows)
    apply_map(db)
    return len(rows)


def set_map(db, chan_id, src=None, xid=None):
    """src / xid vides : on revient au guide du fournisseur pour cette chaîne."""
    with db:
        if not xid:
            db.execute("INSERT OR REPLACE INTO epg_map(chan, src, xid, auto) VALUES (?, NULL, NULL, 0)", (chan_id,))
        else:
            db.execute("INSERT OR REPLACE INTO epg_map(chan, src, xid, auto) VALUES (?,?,?,0)",
                       (chan_id, int(src), xid))
    apply_map(db)


def clear_map(db, chan_id):
    """Repasse cette chaîne en association automatique."""
    with db:
        db.execute("DELETE FROM epg_map WHERE chan=?", (chan_id,))
    automap(db)


def apply_map(db):
    """Recalcule, pour chaque chaîne, la clé du guide à utiliser, et le logo de secours."""
    with db:
        db.execute("UPDATE live SET epg_key = epg_id, alt_logo = NULL")
        db.execute("UPDATE live SET epg_key = (SELECT 's' || m.src || ':' || m.xid FROM epg_map m "
                   "WHERE m.chan = live.id AND m.xid IS NOT NULL) "
                   "WHERE id IN (SELECT chan FROM epg_map WHERE xid IS NOT NULL)")
        db.execute("UPDATE live SET alt_logo = (SELECT c.icon FROM epg_map m JOIN epg_chan c "
                   "ON c.src = m.src AND c.xid = m.xid WHERE m.chan = live.id) "
                   "WHERE (logo IS NULL OR logo = '')")


def map_status(db):
    total = db.execute("SELECT COUNT(*) FROM live").fetchone()[0]
    mapped = db.execute("SELECT COUNT(*) FROM epg_map WHERE xid IS NOT NULL").fetchone()[0]
    manual = db.execute("SELECT COUNT(*) FROM epg_map WHERE auto = 0 AND xid IS NOT NULL").fetchone()[0]
    with_icons = db.execute("SELECT COUNT(*) FROM epg WHERE icon IS NOT NULL AND icon != ''").fetchone()[0]
    return {"channels": total, "mapped": mapped, "manual": manual, "programmes_with_image": with_icons}


def search_channels(db, term, limit=40):
    term = norm(term).strip()
    like = "%" + term.replace("%", "") + "%"
    rows = db.execute("SELECT c.src, c.xid, MIN(c.name) AS name, MIN(c.icon) AS icon, s.name AS src_name "
                      "FROM epg_chan c JOIN epg_src s ON s.id = c.src WHERE c.norm LIKE ? "
                      "GROUP BY c.src, c.xid ORDER BY LENGTH(MIN(c.name)) LIMIT ?", (like, limit))
    return [{"src": r["src"], "xid": r["xid"], "name": r["name"], "icon": r["icon"] or "",
             "source": r["src_name"] or ("Source %d" % r["src"])} for r in rows]


# ---------- téléchargement ----------
def _open(url, timeout):
    """Flux de lecture : le fichier n'est jamais chargé en entier en mémoire."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
    r = urllib.request.urlopen(req, timeout=timeout)
    head = r.peek(2)[:2] if hasattr(r, "peek") else b""
    if head == b"\x1f\x8b" or url.endswith(".gz"):
        return gzip.GzipFile(fileobj=r)
    return r


def fetch(db, src_id, hours, timeout=180):
    """Télécharge une source et garde les programmes des chaînes associées."""
    row = db.execute("SELECT * FROM epg_src WHERE id=?", (src_id,)).fetchone()
    if not row:
        return 0
    lo, hi = now() - 7 * 86400, now() + hours * 3600
    chans, rows, wanted, hosts = [], [], None, set()
    stream = _open(row["url"], timeout)
    for _, el in ET.iterparse(stream, events=("end",)):
        if el.tag == "channel":
            xid = el.get("id") or ""
            names = [t.text for t in el.findall("display-name") if t.text]
            icon = (el.find("icon").get("src") if el.find("icon") is not None else "") or ""
            if xid and names:
                chans.append((src_id, xid, names[0].strip(), match_key(names[0]), icon))
                hosts.add(urllib.parse.urlsplit(icon).hostname)
                for extra in names[1:4]:  # certains fichiers donnent plusieurs libellés
                    chans.append((src_id, xid, extra.strip(), match_key(extra), icon))
            el.clear()
            continue
        if el.tag != "programme":
            if el.tag in ("tv",):
                el.clear()
            continue
        if wanted is None:
            # les chaînes sont toutes lues : on enregistre et on calcule l'association
            _save_channels(db, src_id, chans, hosts)
            automap(db)
            wanted = {r["xid"] for r in db.execute("SELECT xid FROM epg_map WHERE src=? AND xid IS NOT NULL",
                                                   (src_id,))}
            log.info("source %d : %d chaînes dans le fichier, %d associées", src_id, len(chans), len(wanted))
        ch = el.get("channel")
        if ch in wanted:
            start, stop = xmltv_time(el.get("start")), xmltv_time(el.get("stop"))
            if start and stop and stop > lo and start < hi and len(rows) < 600000:
                icon_el = el.find("icon")
                icon = (icon_el.get("src") if icon_el is not None else "") or ""
                if icon:
                    hosts.add(urllib.parse.urlsplit(icon).hostname)
                rows.append((key_for(src_id, ch), start, stop, (el.findtext("title") or "").strip(),
                             (el.findtext("desc") or "").strip()[:600], icon,
                             (el.findtext("category") or "").strip()[:60], src_id))
        el.clear()
    if wanted is None:  # fichier sans programme
        _save_channels(db, src_id, chans, hosts)
        automap(db)
    hosts.discard(None)
    hosts.discard("")
    with db:
        db.execute("DELETE FROM epg WHERE src=?", (src_id,))
        db.executemany("INSERT INTO epg(channel, start, stop, title, descr, icon, categ, src) "
                       "VALUES (?,?,?,?,?,?,?,?)", rows)
        merge_hosts(db, hosts)
        db.execute("UPDATE epg_src SET last=?, count=?, status='ok' WHERE id=?", (now(), len(rows), src_id))
    apply_map(db)
    return len(rows)


def _save_channels(db, src_id, chans, hosts):
    hosts.discard(None)
    hosts.discard("")
    with db:
        db.execute("DELETE FROM epg_chan WHERE src=?", (src_id,))
        db.executemany("INSERT OR REPLACE INTO epg_chan(src, xid, name, norm, icon) VALUES (?,?,?,?,?)", chans)
        merge_hosts(db, hosts)


def fetch_all(db, hours, timeout=180):
    total, errors = 0, []
    for r in db.execute("SELECT id, url FROM epg_src WHERE enabled = 1 ORDER BY pos, id").fetchall():
        try:
            total += fetch(db, r["id"], hours, timeout)
        except Exception as e:
            msg = str(e)[:200]
            log.error("source %s non mise à jour : %s", r["url"], msg)
            errors.append(msg)
            with db:
                db.execute("UPDATE epg_src SET status=? WHERE id=?", ("erreur : " + msg, r["id"]))
    return total, errors
