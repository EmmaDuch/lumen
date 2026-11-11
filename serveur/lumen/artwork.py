"""Jaquettes, fonds et logos choisis à la main.

Trois provenances : une adresse web, une fiche TMDB, ou un fichier du PC. Dans les
trois cas l'image est **copiée** dans /var/lib/lumen/art : une adresse web finit par
ne plus répondre, et un fichier déposé depuis le PC n'existe que le temps de l'envoi.
Ce qui est rangé en base est donc toujours un chemin local, stable.
"""
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

MAX = 12 * 1024 * 1024
SLOTS = ("poster", "backdrop", "logo")
KINDS = ("vod", "series", "live")
# ce que Pillow sait relire, et que le téléviseur sait afficher une fois redimensionné
EXTS = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp", "GIF": ".gif", "BMP": ".bmp"}
_SAFE = re.compile(r"[^a-z0-9]+")


def directory(cfg):
    path = os.path.join(cfg["server"]["data_dir"], "art")
    os.makedirs(path, exist_ok=True)
    return path


def check(kind, slot):
    if kind not in KINDS:
        raise ValueError("kind doit valoir vod, series ou live")
    if slot not in SLOTS:
        raise ValueError("slot doit valoir poster, backdrop ou logo")
    if (slot == "logo") != (kind == "live"):
        raise ValueError("une chaîne a un logo, un film ou une série a une jaquette et un fond")


def _name(kind, item_id, slot, ext):
    return "%s-%d-%s%s" % (_SAFE.sub("", kind), int(item_id), slot, ext)


def url_for(cfg, kind, item_id, slot, ext, version=None):
    """Adresse interne de l'image rangée : le cache d'images sait la relire.

    Le « ?v=… » final change à chaque remplacement. Sans lui, le téléviseur garderait
    l'ancienne image en mémoire pendant un mois : l'adresse serait restée la même.
    """
    path = os.path.join(directory(cfg), _name(kind, item_id, slot, ext))
    stamp = version if version is not None else int(time.time())
    return "file://" + urllib.parse.quote(path) + "?v=" + str(stamp)


def _verify(data):
    """Vérifie que c'est bien une image, et renvoie son extension."""
    if not data:
        raise ValueError("fichier vide")
    if len(data) > MAX:
        raise ValueError("image trop lourde (maximum %d Mo)" % (MAX // (1024 * 1024)))
    try:
        import io
        img = Image.open(io.BytesIO(data))
        img.verify()
    except Exception:
        raise ValueError("ce fichier n'est pas une image que LUMEN sait lire")
    ext = EXTS.get((img.format or "").upper())
    if not ext:
        raise ValueError("format d'image non pris en charge : %s" % (img.format or "inconnu"))
    return ext


def save(cfg, kind, item_id, slot, data):
    """Range les octets reçus et renvoie l'adresse à mettre en base."""
    check(kind, slot)
    ext = _verify(data)
    forget(cfg, kind, item_id, slot)          # une autre extension traînait peut-être
    path = os.path.join(directory(cfg), _name(kind, item_id, slot, ext))
    tmp = path + ".tmp"
    with open(tmp, "wb") as fh:
        fh.write(data)
    os.replace(tmp, path)
    return url_for(cfg, kind, item_id, slot, ext)


def fetch(url, timeout=20):
    """Télécharge une image depuis le web. Renvoie les octets."""
    url = (url or "").strip()
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("adresse invalide : il faut une adresse commençant par http:// ou https://")
    req = urllib.request.Request(url, headers={"User-Agent": "LUMEN/2.6", "Accept": "image/*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read(MAX + 1)
    except urllib.error.HTTPError as e:
        raise ValueError("le site a répondu %s" % e.code)
    except Exception as e:
        raise ValueError("image injoignable : %s" % (e,))
    return data


def forget(cfg, kind, item_id, slot):
    """Efface l'image rangée, quelle que soit son extension."""
    folder = directory(cfg)
    for ext in set(EXTS.values()):
        path = os.path.join(folder, _name(kind, item_id, slot, ext))
        if os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass


def sweep(db, cfg):
    """Efface les images dont plus aucune fiche ne se sert."""
    keep = set()
    for r in db.execute("SELECT poster, backdrop FROM item_override"):
        keep.update(x for x in (r["poster"], r["backdrop"]) if x)
    for r in db.execute("SELECT logo FROM chan_override WHERE logo IS NOT NULL"):
        keep.add(r["logo"])
    keep = {os.path.basename(urllib.parse.unquote(urllib.parse.urlsplit(u).path)) for u in keep}
    gone = 0
    folder = directory(cfg)
    for name in os.listdir(folder):
        if name.endswith(".tmp") or name in keep:
            continue
        try:
            os.remove(os.path.join(folder, name))
            gone += 1
        except OSError:
            pass
    return gone
