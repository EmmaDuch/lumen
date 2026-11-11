"""Synchronisation : catalogue Xtream + guide des programmes (XMLTV).

Lancement : python3 -m lumen.sync   (le timer systemd le fait toutes les 6 h)
"""
import fcntl
import gzip
import json
import logging
import os
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET

from . import custom, epg_ext, filters, medias
from .common import connect, load_config, merge_hosts, norm, now, to_float, to_int, xmltv_time
from .xtream import Xtream, XtreamError

log = logging.getLogger("lumen.sync")

def _first(value):
    if isinstance(value, list):
        return value[0] if value else ""
    return value or ""


def _host(url):
    try:
        return urllib.parse.urlsplit(url).hostname
    except ValueError:
        return None


def sync_catalog(db, xt, cfg):
    info = xt.login()
    tz = (info.get("server_info") or {}).get("timezone") or ""
    hosts = set()
    cats = []
    for kind, action in (("live", "get_live_categories"), ("vod", "get_vod_categories"),
                         ("series", "get_series_categories")):
        for pos, c in enumerate(xt.api(action) or []):
            name = c.get("category_name") or ""
            cats.append((kind, str(c.get("category_id")), name, pos, name))

    live = []
    for s in xt.api("get_live_streams") or []:
        logo = s.get("stream_icon") or ""
        hosts.add(_host(logo))
        archive = 1 if str(s.get("tv_archive")) == "1" else 0
        live.append((to_int(s.get("stream_id")), to_int(s.get("num")), s.get("name") or "", norm(s.get("name")),
                     logo, str(s.get("category_id")), s.get("epg_channel_id") or "",
                     archive, to_int(s.get("tv_archive_duration")) if archive else 0,
                     s.get("name") or "", to_int(s.get("num")), logo))

    vod = []
    for s in xt.api("get_vod_streams") or []:
        poster = s.get("stream_icon") or ""
        hosts.add(_host(poster))
        vod.append((to_int(s.get("stream_id")), s.get("name") or "", norm(s.get("name")), poster,
                    str(s.get("category_id")), to_float(s.get("rating")), to_int(s.get("added")),
                    s.get("container_extension") or "mp4", s.get("name") or "", poster))

    series = []
    for s in xt.api("get_series") or []:
        poster = s.get("cover") or ""
        backdrop = _first(s.get("backdrop_path"))
        hosts.update((_host(poster), _host(backdrop)))
        series.append((to_int(s.get("series_id")), s.get("name") or "", norm(s.get("name")), poster, backdrop,
                       str(s.get("category_id")), s.get("plot") or "", s.get("genre") or "",
                       to_float(s.get("rating")), to_int(s.get("last_modified")), s.get("name") or "",
                       poster, backdrop, s.get("plot") or ""))

    with db:
        db.execute("DELETE FROM categories WHERE id <> 'local'")
        db.executemany("INSERT OR REPLACE INTO categories(kind, id, name, pos, orig_name) VALUES (?,?,?,?,?)", cats)
        db.execute("DELETE FROM live")
        db.executemany("INSERT OR REPLACE INTO live(id, num, name, norm, logo, cat, epg_id, archive, archive_days, "
                       "orig_name, orig_num, orig_logo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", live)
        db.execute("INSERT OR REPLACE INTO meta VALUES ('server_tz', ?)", (tz,))
        db.execute("DELETE FROM vod WHERE id < ?", (medias.BASE,))
        db.executemany("INSERT OR REPLACE INTO vod(id, name, norm, poster, cat, rating, added, ext, orig_name, "
                       "orig_poster) VALUES (?,?,?,?,?,?,?,?,?,?)", vod)
        db.execute("DELETE FROM series WHERE id < ?", (medias.BASE,))
        db.executemany("INSERT OR REPLACE INTO series(id, name, norm, poster, backdrop, cat, plot, genre, rating, "
                       "updated, orig_name, orig_poster, orig_backdrop, orig_plot) "
                       "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", series)
        # les fiches détaillées seront relues à la demande
        db.execute("DELETE FROM info_cache WHERE id < ? AND fetched < ? AND NOT (kind = 'series' AND id IN (SELECT series_id FROM progress WHERE kind = 'episode'))", (medias.BASE, now() - 86400,))
        hosts.discard(None)
        hosts.discard("")
        merge_hosts(db, hosts)
        db.execute("INSERT OR REPLACE INTO meta VALUES ('catalog_sync', ?)", (str(now()),))
    filters.apply(db, cfg)
    custom.apply(db)
    epg_ext.apply_map(db)
    log.info("catalogue : %d chaînes, %d films, %d séries", len(live), len(vod), len(series))


def sync_epg(db, xt, hours):
    wanted = {r["epg_id"] for r in db.execute(
        f"SELECT DISTINCT epg_id FROM live WHERE epg_id != '' AND ({filters.visible('live')} "
        "OR id IN (SELECT id FROM fav_channels))")}
    if not wanted:
        log.info("guide : aucune chaîne n'a d'identifiant de guide, rien à faire")
        return
    lo, hi = now() - 3 * 3600, now() + hours * 3600
    # chaînes avec replay : on garde aussi les programmes passés (7 jours au plus)
    past = {r["epg_id"]: now() - min(7, max(1, r["d"])) * 86400 for r in db.execute(
        "SELECT epg_id, MAX(archive_days) AS d FROM live WHERE archive = 1 AND epg_id != '' GROUP BY epg_id")}
    rows = []
    with xt.open_epg() as r:
        stream = r
        head = r.peek(2) if hasattr(r, "peek") else b""
        if head[:2] == b"\x1f\x8b":
            stream = gzip.GzipFile(fileobj=r)
        for _, el in ET.iterparse(stream, events=("end",)):
            if el.tag != "programme":
                if el.tag == "channel":
                    el.clear()
                continue
            ch = el.get("channel")
            if ch in wanted:
                start, stop = xmltv_time(el.get("start")), xmltv_time(el.get("stop"))
                if start and stop and stop > past.get(ch, lo) and start < hi:
                    rows.append((ch, start, stop, (el.findtext("title") or "").strip(),
                                 (el.findtext("desc") or "").strip()[:600]))
            el.clear()
    with db:
        db.execute("DELETE FROM epg WHERE src = 0")
        db.executemany("INSERT INTO epg(channel, start, stop, title, descr, src) VALUES (?,?,?,?,?,0)", rows)
        db.execute("INSERT OR REPLACE INTO meta VALUES ('epg_sync', ?)", (str(now()),))
    log.info("guide : %d programmes", len(rows))


def run(cfg):
    lock_path = os.path.join(cfg["server"]["data_dir"], "sync.lock")
    with open(lock_path, "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            log.info("une synchronisation est déjà en cours")
            return True
        db = connect(cfg)
        xt = Xtream(cfg)
        ok = True
        try:
            sync_catalog(db, xt, cfg)
        except XtreamError as e:
            log.error("catalogue non mis à jour (l'ancien est conservé) : %s", e)
            db.close()
            return False
        try:
            sync_epg(db, xt, cfg["sync"]["epg_hours"])
        except Exception as e:
            log.error("guide du fournisseur non mis à jour : %s", e)
            ok = False
        try:
            total, errors = epg_ext.fetch_all(db, cfg["sync"]["epg_hours"], cfg["sync"]["timeout"] * 3)
            if total:
                log.info("guide externe : %d programmes", total)
            if errors:
                ok = False
        except Exception as e:
            log.error("guide externe non mis à jour : %s", e)
            ok = False
        try:
            if db.execute("SELECT 1 FROM media_root WHERE enabled=1 LIMIT 1").fetchone():
                medias.refresh(db, cfg)
        except Exception as e:
            log.error("médiathèque non mise à jour : %s", e)
            ok = False
        db.close()
        return ok


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    sys.exit(0 if run(load_config()) else 1)


if __name__ == "__main__":
    main()
