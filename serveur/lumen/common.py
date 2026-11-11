"""Configuration, base de données et petites fonctions partagées."""
import calendar
import json
import os
import re
import sqlite3
import time
import tomllib
import unicodedata

CONFIG_PATH = os.environ.get("LUMEN_CONFIG", "/etc/lumen/config.toml")

DEFAULTS = {
    "xtream": {"server": "", "username": "", "password": "", "epg_url": "", "live_format": "ts",
               "replay_format": "path", "replay_timezone": ""},
    "server": {"listen": "0.0.0.0", "port": 8765, "token": "", "data_dir": "/var/lib/lumen"},
    "sync": {"epg_hours": 36, "timeout": 60},
    "medias": {"tmdb_key": "", "langue": "fr-FR", "timeout": 20, "tmdb_api": "", "tmdb_img": ""},
    "tv": {"host": "", "app": "LumenTVapp.Lumen", "demarrage_auto": False, "delai": 6,
           "essais": 6, "nom": "LUMEN", "timeout": 8},
    "filtres": {k: [] for k in ("direct_garder", "direct_masquer", "films_garder",
                                "films_masquer", "series_garder", "series_masquer")},
}


def load_config(path=None):
    path = path or CONFIG_PATH
    with open(path, "rb") as f:
        user = tomllib.load(f)
    cfg = {}
    for section, values in DEFAULTS.items():
        cfg[section] = dict(values)
        cfg[section].update(user.get(section, {}))
    x = cfg["xtream"]
    x["server"] = x["server"].rstrip("/")
    if not x["server"] or not x["username"]:
        raise SystemExit("config.toml : renseignez [xtream] server, username et password")
    if x["replay_format"] not in ("path", "php"):
        raise SystemExit("config.toml : replay_format doit valoir \"path\" ou \"php\"")
    if x["live_format"] not in ("ts", "m3u8"):
        raise SystemExit("config.toml : live_format doit valoir \"ts\" ou \"m3u8\"")
    os.makedirs(cfg["server"]["data_dir"], exist_ok=True)
    return cfg


SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS categories(kind TEXT, id TEXT, name TEXT, pos INT, hidden INT DEFAULT 0,
                                      PRIMARY KEY(kind, id));
CREATE TABLE IF NOT EXISTS cat_override(kind TEXT, id TEXT, hidden INT, PRIMARY KEY(kind, id));
CREATE TABLE IF NOT EXISTS live(id INT PRIMARY KEY, num INT, name TEXT, norm TEXT, logo TEXT, cat TEXT, epg_id TEXT,
                                archive INT DEFAULT 0, archive_days INT DEFAULT 0, orig_name TEXT, orig_num INT,
                                epg_key TEXT, alt_logo TEXT);
-- Personnalisation : noms et numéros choisis par l'utilisateur, jamais effacés par la synchronisation
CREATE TABLE IF NOT EXISTS chan_override(id INT PRIMARY KEY, name TEXT, num INT, logo TEXT);
-- Bouquets créés par l'utilisateur (prioritaires sur ceux du fournisseur)
CREATE TABLE IF NOT EXISTS bouquets(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, pos INT, created INT,
                                    kind TEXT DEFAULT 'live');
CREATE TABLE IF NOT EXISTS bouquet_items(bouquet INT, chan INT, pos INT, PRIMARY KEY(bouquet, chan));
CREATE INDEX IF NOT EXISTS bq_pos ON bouquet_items(bouquet, pos);
-- Règles de nettoyage des noms de chaînes
CREATE TABLE IF NOT EXISTS name_rules(id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT, repl TEXT, pos INT,
                                      enabled INT DEFAULT 1, builtin INT DEFAULT 0);
-- Guide externe : sources et association des chaînes
CREATE TABLE IF NOT EXISTS epg_src(id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT, name TEXT, pos INT,
                                   enabled INT DEFAULT 1, last INT, count INT, status TEXT);
CREATE TABLE IF NOT EXISTS epg_chan(src INT, xid TEXT, name TEXT, norm TEXT, icon TEXT,
                                   PRIMARY KEY(src, xid, norm));
CREATE INDEX IF NOT EXISTS epg_chan_norm ON epg_chan(norm);
CREATE TABLE IF NOT EXISTS epg_map(chan INT PRIMARY KEY, src INT, xid TEXT, auto INT DEFAULT 1);
CREATE TABLE IF NOT EXISTS cat_rename(kind TEXT, id TEXT, name TEXT, PRIMARY KEY(kind, id));
CREATE TABLE IF NOT EXISTS vod(id INT PRIMARY KEY, name TEXT, norm TEXT, poster TEXT, cat TEXT, rating REAL, added INT, ext TEXT,
                               orig_name TEXT, orig_poster TEXT, backdrop TEXT, plot TEXT);
-- Fiches corrigées à la main : nom, résumé, jaquette, fond. Prioritaires sur le fournisseur,
-- et jamais effacées par la synchronisation.
CREATE TABLE IF NOT EXISTS item_override(kind TEXT, id INT, name TEXT, plot TEXT, poster TEXT, backdrop TEXT,
                                         PRIMARY KEY(kind, id));
CREATE TABLE IF NOT EXISTS series(id INT PRIMARY KEY, name TEXT, norm TEXT, poster TEXT, backdrop TEXT, cat TEXT,
                                  plot TEXT, genre TEXT, rating REAL, updated INT, orig_name TEXT,
                                  orig_poster TEXT, orig_backdrop TEXT, orig_plot TEXT);
CREATE TABLE IF NOT EXISTS info_cache(kind TEXT, id INT, json TEXT, fetched INT, PRIMARY KEY(kind, id));
CREATE TABLE IF NOT EXISTS epg(channel TEXT, start INT, stop INT, title TEXT, descr TEXT,
                               icon TEXT, categ TEXT, src INT DEFAULT 0);
CREATE INDEX IF NOT EXISTS epg_ch ON epg(channel, start);
CREATE INDEX IF NOT EXISTS live_cat ON live(cat);
CREATE INDEX IF NOT EXISTS vod_cat ON vod(cat);
CREATE INDEX IF NOT EXISTS series_cat ON series(cat);

-- Données personnelles : jamais effacées par la synchronisation
CREATE TABLE IF NOT EXISTS progress(kind TEXT, id INT, series_id INT, season INT, episode INT, title TEXT,
                                    position REAL, duration REAL, done INT, updated INT, PRIMARY KEY(kind, id));
CREATE INDEX IF NOT EXISTS progress_series ON progress(series_id, updated);
CREATE TABLE IF NOT EXISTS watchlist(kind TEXT, id INT, fav INT, added INT, PRIMARY KEY(kind, id));
CREATE TABLE IF NOT EXISTS fav_channels(id INT PRIMARY KEY, pos INT);

-- Médiathèque personnelle : dossiers déclarés, fichiers trouvés, séries reconstituées
CREATE TABLE IF NOT EXISTS media_root(id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT UNIQUE, kind TEXT, name TEXT,
                                      enabled INT DEFAULT 1, last INT, count INT, status TEXT);
CREATE TABLE IF NOT EXISTS media_show(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, norm TEXT, year INT,
                                      tmdb INT, matched INT DEFAULT 0, folder TEXT);
CREATE TABLE IF NOT EXISTS media_file(id INTEGER PRIMARY KEY AUTOINCREMENT, root INT, path TEXT UNIQUE,
                                      size INT, mtime INT, kind TEXT, title TEXT, year INT,
                                      season INT, episode INT, eptitle TEXT, show INT,
                                      vcodec TEXT, acodec TEXT, width INT, height INT, dur REAL,
                                      playable INT DEFAULT 1, note TEXT, scanned INT,
                                      matched INT DEFAULT 0, tmdb INT);
CREATE INDEX IF NOT EXISTS media_show_idx ON media_file(show, season, episode);
CREATE INDEX IF NOT EXISTS media_show_norm ON media_show(norm);
-- Correspondance forcée à la main quand la reconnaissance se trompe
CREATE TABLE IF NOT EXISTS media_match(path TEXT PRIMARY KEY, tmdb INT, kind TEXT, title TEXT, year INT);
"""


def connect(cfg):
    path = os.path.join(cfg["server"]["data_dir"], "lumen.db")
    db = sqlite3.connect(path, timeout=30, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    # bases créées par une version précédente : on ajoute les colonnes manquantes
    for table, col, decl in (("categories", "hidden", "INT DEFAULT 0"), ("categories", "orig_name", "TEXT"),
                             ("live", "archive", "INT DEFAULT 0"), ("live", "archive_days", "INT DEFAULT 0"),
                             ("live", "orig_name", "TEXT"), ("live", "orig_num", "INT"),
                             ("live", "epg_key", "TEXT"), ("live", "alt_logo", "TEXT"),
                             ("epg", "icon", "TEXT"), ("epg", "categ", "TEXT"),
                             ("epg", "src", "INT DEFAULT 0"),
                             ("vod", "orig_name", "TEXT"), ("series", "orig_name", "TEXT"),
                             ("media_show", "folder", "TEXT"), ("bouquets", "kind", "TEXT DEFAULT 'live'"),
                             ("live", "orig_logo", "TEXT"), ("chan_override", "logo", "TEXT"),
                             ("item_override", "plot", "TEXT"), ("item_override", "poster", "TEXT"),
                             ("item_override", "backdrop", "TEXT"),
                             ("vod", "orig_poster", "TEXT"), ("vod", "backdrop", "TEXT"), ("vod", "plot", "TEXT"),
                             ("series", "orig_poster", "TEXT"), ("series", "orig_backdrop", "TEXT"),
                             ("series", "orig_plot", "TEXT")):
        cols = {r[1] for r in db.execute(f"PRAGMA table_info({table})")}
        if col not in cols:
            db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
    db.execute("UPDATE categories SET orig_name = name WHERE orig_name IS NULL")
    db.execute("UPDATE live SET orig_name = name, orig_num = num WHERE orig_name IS NULL")
    db.execute("UPDATE live SET epg_key = epg_id WHERE epg_key IS NULL")
    db.execute("UPDATE bouquets SET kind = 'live' WHERE kind IS NULL OR kind = ''")
    db.execute("UPDATE vod SET orig_name = name WHERE orig_name IS NULL")
    db.execute("UPDATE series SET orig_name = name WHERE orig_name IS NULL")
    # les valeurs du fournisseur sont mises de côté : ce qui s'affiche peut être corrigé à la main
    db.execute("UPDATE live SET orig_logo = logo WHERE orig_logo IS NULL AND logo IS NOT NULL")
    db.execute("UPDATE vod SET orig_poster = poster WHERE orig_poster IS NULL AND poster IS NOT NULL")
    db.execute("UPDATE series SET orig_poster = poster WHERE orig_poster IS NULL AND poster IS NOT NULL")
    db.execute("UPDATE series SET orig_backdrop = backdrop WHERE orig_backdrop IS NULL AND backdrop IS NOT NULL")
    db.execute("UPDATE series SET orig_plot = plot WHERE orig_plot IS NULL AND plot IS NOT NULL")
    db.commit()
    return db


def norm(text):
    """Minuscules sans accents, pour la recherche."""
    text = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in text if not unicodedata.combining(c)).lower()


def now():
    return int(time.time())


def to_int(value, default=0):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def to_float(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


_TZ = re.compile(r"^(\d{14})\s*([+-]\d{4})?")


def xmltv_time(value):
    """'20261108203000 +0100' -> horodatage Unix."""
    m = _TZ.match(value or "")
    if not m:
        return None
    t = time.strptime(m.group(1), "%Y%m%d%H%M%S")
    ts = calendar.timegm(t)
    off = m.group(2)
    if off:
        sign = 1 if off[0] == "+" else -1
        ts -= sign * (int(off[1:3]) * 3600 + int(off[3:5]) * 60)
    return ts


def merge_hosts(db, hosts):
    """Ajoute des serveurs d'images à la liste autorisée pour le cache."""
    hosts = {h for h in hosts if h}
    row = db.execute("SELECT v FROM meta WHERE k='image_hosts'").fetchone()
    known = set(json.loads(row["v"])) if row else set()
    if hosts - known:
        db.execute("INSERT OR REPLACE INTO meta VALUES ('image_hosts', ?)", (json.dumps(sorted(known | hosts)),))
