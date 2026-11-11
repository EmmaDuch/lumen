"""Images redimensionnées pour la TV, mises en cache sur disque."""
import hashlib
import io
import json
import os
import threading
import urllib.parse
import urllib.request

from PIL import Image

WIDTHS = (64, 128, 240, 320, 480, 640, 1280, 1920)
MAX_SOURCE = 15 * 1024 * 1024


class ImageCache:
    def __init__(self, cfg, get_db):
        self.dir = os.path.join(cfg["server"]["data_dir"], "img")
        os.makedirs(self.dir, exist_ok=True)
        # les jaquettes et logos choisis à la main sont toujours autorisés : c'est notre dossier
        self.art = os.path.realpath(os.path.join(cfg["server"]["data_dir"], "art"))
        os.makedirs(self.art, exist_ok=True)
        self.get_db = get_db  # une connexion par fil d'exécution
        self._hosts = None
        self._hosts_stamp = None

    def local_path(self, url):
        """Chemin d'une image de la médiathèque, si elle est bien sous un dossier déclaré.

        Une adresse peut porter « ?v=… » : c'est la date de la dernière modification,
        qui force navigateurs et téléviseur à redemander l'image quand elle change.
        """
        if not url.startswith("file://"):
            return None
        parts = urllib.parse.urlsplit(url)
        path = os.path.realpath(urllib.parse.unquote(parts.path))
        row = self.get_db().execute("SELECT v FROM meta WHERE k='media_paths'").fetchone()
        for root in [self.art] + (json.loads(row["v"]) if row else []):
            root = os.path.realpath(root)
            if path == root or path.startswith(root + os.sep):
                return path if os.path.isfile(path) else None
        return None

    def allowed(self, url):
        row = self.get_db().execute("SELECT v FROM meta WHERE k='image_hosts'").fetchone()
        stamp = row["v"] if row else "[]"
        if stamp != self._hosts_stamp:
            self._hosts, self._hosts_stamp = set(json.loads(stamp)), stamp
        parts = urllib.parse.urlsplit(url)
        return parts.scheme in ("http", "https") and parts.hostname in self._hosts

    def get(self, url, width):
        """Renvoie (chemin, type MIME) ou None."""
        width = next((w for w in WIDTHS if w >= width), WIDTHS[-1])
        key = hashlib.sha1(url.encode()).hexdigest()
        for ext, mime in (("jpg", "image/jpeg"), ("png", "image/png")):
            path = os.path.join(self.dir, key[:2], f"{key}-{width}.{ext}")
            if os.path.exists(path):
                return path, mime
        local = self.local_path(url)
        if not local and not self.allowed(url):
            return None
        try:
            if local:
                with open(local, "rb") as fh:
                    data = fh.read(MAX_SOURCE + 1)
            else:
                req = urllib.request.Request(url, headers={"User-Agent": "LUMEN/1.0"})
                with urllib.request.urlopen(req, timeout=15) as r:
                    data = r.read(MAX_SOURCE + 1)
            if len(data) > MAX_SOURCE:
                return None
            img = Image.open(io.BytesIO(data))
            img.draft("RGB", (width, width * 2))  # décodage JPEG plus rapide
            img.load()
        except Exception:
            return None
        if img.width > width:
            img.thumbnail((width, round(img.height * width / img.width)), Image.LANCZOS)
        alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
        os.makedirs(os.path.join(self.dir, key[:2]), exist_ok=True)
        if alpha:
            path, mime = os.path.join(self.dir, key[:2], f"{key}-{width}.png"), "image/png"
            tmp = f"{path}.{threading.get_ident()}.tmp"
            img.convert("RGBA").save(tmp, "PNG", optimize=True)
        else:
            path, mime = os.path.join(self.dir, key[:2], f"{key}-{width}.jpg"), "image/jpeg"
            tmp = f"{path}.{threading.get_ident()}.tmp"
            img.convert("RGB").save(tmp, "JPEG", quality=82, optimize=True)
        os.replace(tmp, path)
        return path, mime
