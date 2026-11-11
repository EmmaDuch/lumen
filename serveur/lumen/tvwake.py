"""Démarrage automatique : quand le téléviseur s'allume, LUMEN se lance.

Tizen ne laisse pas une application installée en mode développeur se déclarer
« application de démarrage ». On passe donc par l'extérieur : le serveur surveille
le téléviseur et, dès qu'il s'allume, lui demande d'ouvrir LUMEN.

Le téléviseur expose pour cela deux interfaces sur son réseau local :
  - une API REST sur le port 8001, qui suffit souvent à lancer une application ;
  - une liaison WebSocket sur le port 8002, chiffrée, qui demande un appairage
    (une fenêtre s'affiche sur le téléviseur la première fois) et qui sert aussi
    à lister les applications installées.

Tout est écrit avec la bibliothèque standard : pas de dépendance à installer.
"""
import base64
import hashlib
import json
import logging
import os
import socket
import ssl
import struct
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from .common import now, to_int

log = logging.getLogger("lumen.tv")

CLIENT_NAME = "LUMEN"


# ---------------------------------------------------------------- WebSocket minimal

class WsError(Exception):
    pass


class Ws:
    """Client WebSocket réduit à ce dont on a besoin : se connecter, envoyer, lire."""

    def __init__(self, url, timeout=10):
        parts = urllib.parse.urlsplit(url)
        self.secure = parts.scheme == "wss"
        self.host = parts.hostname
        self.port = parts.port or (443 if self.secure else 80)
        self.path = parts.path + (("?" + parts.query) if parts.query else "")
        self.timeout = timeout
        self.sock = None
        self._buf = b""

    def connect(self):
        raw = socket.create_connection((self.host, self.port), timeout=self.timeout)
        if self.secure:
            # le téléviseur présente un certificat auto-signé : on chiffre sans vérifier,
            # la liaison ne sort pas du réseau local
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            raw = ctx.wrap_socket(raw, server_hostname=self.host)
        self.sock = raw
        key = base64.b64encode(os.urandom(16)).decode()
        req = ("GET %s HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
               "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n"
               % (self.path, self.host, self.port, key))
        self.sock.sendall(req.encode())
        head = self._read_until(b"\r\n\r\n")
        if b" 101 " not in head.split(b"\r\n")[0]:
            raise WsError("le téléviseur a refusé la liaison : " + head.split(b"\r\n")[0].decode("latin1"))
        want = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest())
        if want.lower() not in head.lower():
            raise WsError("réponse d'appairage incorrecte")
        return self

    def _read_until(self, marker):
        while marker not in self._buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise WsError("liaison fermée par le téléviseur")
            self._buf += chunk
        i = self._buf.index(marker) + len(marker)
        head, self._buf = self._buf[:i], self._buf[i:]
        return head

    def _recv(self, n):
        while len(self._buf) < n:
            chunk = self.sock.recv(max(4096, n - len(self._buf)))
            if not chunk:
                raise WsError("liaison fermée par le téléviseur")
            self._buf += chunk
        out, self._buf = self._buf[:n], self._buf[n:]
        return out

    def send(self, text):
        data = text.encode()
        head = bytearray([0x81])                      # trame texte, finale
        mask = os.urandom(4)
        n = len(data)
        if n < 126:
            head.append(0x80 | n)
        elif n < 65536:
            head.append(0x80 | 126); head += struct.pack(">H", n)
        else:
            head.append(0x80 | 127); head += struct.pack(">Q", n)
        head += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        self.sock.sendall(bytes(head) + masked)

    def recv(self):
        """Renvoie le prochain message texte, ou None si la liaison se ferme."""
        while True:
            b1, b2 = self._recv(2)
            op = b1 & 0x0F
            n = b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._recv(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._recv(8))[0]
            if b2 & 0x80:                              # le serveur ne devrait pas masquer
                mask = self._recv(4)
                payload = bytes(c ^ mask[i % 4] for i, c in enumerate(self._recv(n)))
            else:
                payload = self._recv(n)
            if op == 0x8:
                return None                            # fermeture
            if op == 0x9:                              # ping : on répond
                self.sock.sendall(b"\x8a\x80" + os.urandom(4))
                continue
            if op in (0x1, 0x2):
                return payload.decode("utf-8", "replace")

    def close(self):
        try:
            if self.sock:
                self.sock.close()
        except OSError:
            pass
        self.sock = None


# ---------------------------------------------------------------- dialogue avec le téléviseur

def _yes(v):
    return str(v).strip().lower() in ("1", "true", "oui", "on", "yes")


def reglages(cfg, db=None):
    """Réglages du téléviseur : la configuration donne les valeurs de départ,
    la page de réglages peut les changer et ses choix sont rangés dans la base."""
    tv = cfg.get("tv", {}) or {}
    out = {"host": (tv.get("host") or "").strip(),
           "app": (tv.get("app") or "LumenTVapp.Lumen").strip(),
           "nom": tv.get("nom") or CLIENT_NAME,
           "delai": max(0, to_int(tv.get("delai"), 6)),
           "essais": max(1, to_int(tv.get("essais"), 6)),
           "timeout": max(3, to_int(tv.get("timeout"), 8)),
           "auto": bool(tv.get("demarrage_auto"))}
    if db is not None:
        try:
            rows = db.execute("SELECT k, v FROM meta WHERE k LIKE 'tv_%'").fetchall()
        except Exception:
            rows = []
        for r in rows:
            key = r["k"][3:]
            if key in ("host", "app", "nom"):
                out[key] = (r["v"] or "").strip()
            elif key in ("delai", "essais", "timeout"):
                out[key] = to_int(r["v"], out[key])
            elif key == "auto":
                out["auto"] = _yes(r["v"])
    return out


def enregistrer(db, values):
    """Range dans la base les réglages venus de la page web."""
    with db:
        for k, v in values.items():
            if k == "auto":
                v = "1" if v else "0"
            db.execute("INSERT OR REPLACE INTO meta VALUES (?, ?)", ("tv_" + k, str(v)))


class Tv:
    def __init__(self, cfg, data_dir, db=None):
        r = reglages(cfg, db)
        self.host = r["host"]
        self.app = r["app"]
        self.name = r["nom"]
        self.delay = r["delai"]
        self.tries = r["essais"]
        self.enabled = r["auto"]
        self.timeout = r["timeout"]
        self.token_file = os.path.join(data_dir, "tv-token.json")

    # ----- jeton d'appairage -----
    def token(self):
        try:
            with open(self.token_file) as fh:
                return json.load(fh).get("token") or ""
        except (OSError, ValueError):
            return ""

    def save_token(self, token):
        try:
            with open(self.token_file, "w") as fh:
                json.dump({"token": token, "saved": now()}, fh)
            os.chmod(self.token_file, 0o600)
        except OSError as e:
            log.warning("jeton du téléviseur non enregistré : %s", e)

    # ----- REST, port 8001 -----
    def _rest(self, path, method="GET", timeout=None):
        url = "http://%s:8001%s" % (self.host, path)
        req = urllib.request.Request(url, method=method)
        with urllib.request.urlopen(req, timeout=timeout or self.timeout) as r:
            body = r.read()
        try:
            return json.loads(body or b"{}")
        except ValueError:
            return {}

    def info(self, timeout=3):
        """Fiche du téléviseur ; lève une exception s'il ne répond pas."""
        return self._rest("/api/v2/", timeout=timeout)

    def power_state(self):
        """'on', 'standby' ou None si le téléviseur ne le dit pas."""
        try:
            d = self.info()
        except Exception:
            return "off"
        st = ((d.get("device") or {}).get("PowerState") or "").lower()
        return st or "on"          # joignable sans état déclaré : on le considère allumé

    # ----- WebSocket, port 8002 -----
    def _ws(self):
        if not self.host:
            raise WsError("aucune adresse de téléviseur dans la configuration")
        name = base64.b64encode(self.name.encode()).decode()
        url = "wss://%s:8002/api/v2/channels/samsung.remote.control?name=%s" % (self.host, name)
        tok = self.token()
        if tok:
            url += "&token=" + urllib.parse.quote(tok)
        ws = Ws(url, timeout=self.timeout).connect()
        # premier message : ms.channel.connect, avec parfois un nouveau jeton
        msg = ws.recv()
        if msg:
            try:
                d = json.loads(msg)
            except ValueError:
                d = {}
            new = ((d.get("data") or {}).get("token"))
            if new and new != tok:
                self.save_token(new)
            if d.get("event") == "ms.channel.unauthorized":
                ws.close()
                raise WsError("appairage refusé sur le téléviseur")
        return ws

    def apps(self):
        """Applications installées, telles que le téléviseur les déclare."""
        ws = self._ws()
        try:
            ws.send(json.dumps({"method": "ms.channel.emit",
                                "params": {"event": "ed.installedApp.get", "to": "host"}}))
            deadline = time.monotonic() + self.timeout
            while time.monotonic() < deadline:
                msg = ws.recv()
                if msg is None:
                    break
                try:
                    d = json.loads(msg)
                except ValueError:
                    continue
                if d.get("event") == "ed.installedApp.get":
                    items = (d.get("data") or {}).get("data") or []
                    return [{"id": a.get("appId") or "", "name": a.get("name") or "",
                             "type": a.get("app_type")} for a in items]
            raise WsError("le téléviseur n'a pas répondu la liste des applications")
        finally:
            ws.close()

    def launch(self, app_id=None):
        """Ouvre une application. Trois façons, essayées dans l'ordre."""
        app_id = (app_id or self.app or "").strip()
        if not app_id:
            raise WsError("aucune application à lancer dans la configuration")
        tried = []
        # 1. REST : la plus simple, suffit sur beaucoup de modèles
        try:
            self._rest("/api/v2/applications/" + urllib.parse.quote(app_id), method="POST")
            return "rest"
        except Exception as e:
            tried.append("REST (%s)" % _short(e))
        # 2. WebSocket, lancement d'une application installée
        for action in ("DEEP_LINK", "NATIVE_LAUNCH"):
            try:
                ws = self._ws()
                try:
                    ws.send(json.dumps({"method": "ms.channel.emit",
                                        "params": {"event": "ed.apps.launch", "to": "host",
                                                   "data": {"appId": app_id, "action_type": action}}}))
                    time.sleep(0.6)
                finally:
                    ws.close()
                return "websocket/" + action
            except Exception as e:
                tried.append("%s (%s)" % (action, _short(e)))
        raise WsError("lancement impossible — " + " ; ".join(tried))

    def au_premier_plan(self, app_id=None):
        """Vrai si l'application est affichée, Faux si non, None si le téléviseur ne le dit pas."""
        app_id = (app_id or self.app or "").strip()
        if not app_id:
            return None
        try:
            d = self._rest("/api/v2/applications/" + urllib.parse.quote(app_id), timeout=4)
        except Exception:
            return None
        if not isinstance(d, dict) or not d:
            return None
        if "visible" in d or "running" in d:
            return bool(d.get("visible") or d.get("running"))
        return None

    def reveil(self, stop=None, log_line=None):
        """Séquence d'allumage : on insiste jusqu'à voir LUMEN à l'écran.

        Le téléviseur répond au réseau avant d'avoir fini de démarrer, et Samsung TV Plus
        reprend parfois la main une seconde après nous. On redemande donc plusieurs fois,
        en vérifiant à chaque tour si LUMEN est bien devant.
        """
        def attendre(s):
            if stop is not None:
                return stop.wait(s)
            time.sleep(s)
            return False

        if attendre(self.delay):
            return "interrompu"
        dernier = ""
        for essai in range(1, self.tries + 1):
            try:
                how = self.launch()
                dernier = "lancé (%s)" % how
            except Exception as e:
                dernier = "échec : " + _short(e)
                log.warning("lancement sur le téléviseur, essai %d : %s", essai, e)
                if attendre(3):
                    return dernier
                continue
            if attendre(4):
                return dernier
            devant = self.au_premier_plan()
            if devant:
                return "%s, à l'écran après %d essai%s" % (dernier, essai, "s" if essai > 1 else "")
            if devant is None and essai >= 2:
                # le téléviseur ne sait pas nous répondre : deux demandes valent mieux qu'une
                return "%s, sans accusé du téléviseur" % dernier
            if log_line:
                log_line("essai %d : LUMEN n'est pas devant, on redemande" % essai)
        return dernier + (", LUMEN n'est pas resté devant après %d essais" % self.tries)


def _short(e):
    s = str(e) or e.__class__.__name__
    return s[:80]


# ---------------------------------------------------------------- surveillance

class Watcher(threading.Thread):
    """Surveille l'alimentation du téléviseur et lance LUMEN à l'allumage."""

    def __init__(self, cfg, data_dir, db=None, interval=3):
        super().__init__(name="tvwake", daemon=True)
        self.cfg, self.data_dir, self.db, self.interval = cfg, data_dir, db, interval
        self.stop_flag = threading.Event()
        self.last_state = None
        self.last_result = ""
        self.busy = False

    def run(self):
        log.info("surveillance du téléviseur démarrée")
        while not self.stop_flag.is_set():
            # les réglages sont relus à chaque tour : changer l'adresse ou décocher
            # la case dans la page web prend effet tout de suite, sans redémarrage
            tv = Tv(self.cfg, self.data_dir, self.db)
            if not tv.enabled or not tv.host or not tv.app:
                self.last_state = None
                self.stop_flag.wait(10)
                continue
            try:
                state = tv.power_state()
                if state == "on" and self.last_state in ("off", "standby"):
                    log.info("le téléviseur vient de s'allumer")
                    self.busy = True
                    try:
                        self.last_result = "%s — %s" % (time.strftime("%H:%M:%S"),
                                                        tv.reveil(self.stop_flag))
                        log.info("réveil : %s", self.last_result)
                    finally:
                        self.busy = False
                self.last_state = state
            except Exception as e:                      # jamais interrompre la surveillance
                log.debug("surveillance du téléviseur : %s", e)
                state = None
            # téléviseur éteint : on guette de près, c'est le moment qui nous intéresse.
            # téléviseur allumé : il n'y a plus rien à attendre, on l'interroge moins souvent.
            self.stop_flag.wait(self.interval * 5 if self.last_state == "on" else self.interval)

    def stop(self):
        self.stop_flag.set()


def status(cfg, data_dir, db=None, watcher=None):
    tv = Tv(cfg, data_dir, db)
    out = {"host": tv.host, "app": tv.app, "enabled": tv.enabled, "delay": tv.delay,
           "tries": tv.tries, "paired": bool(tv.token()), "state": None,
           "last": watcher.last_result if watcher else "",
           "busy": bool(watcher and watcher.busy),
           "watching": bool(watcher and watcher.is_alive())}
    if tv.host:
        out["state"] = tv.power_state()
        if out["state"] == "on":
            out["front"] = tv.au_premier_plan()
    return out


def main():
    """Petit outil en ligne de commande : lumen-tv [apps|launch|state]."""
    import sys
    from .common import load_config
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    cfg = load_config()
    tv = Tv(cfg, cfg["server"]["data_dir"])
    cmd = sys.argv[1] if len(sys.argv) > 1 else "state"
    if not tv.host:
        print("Renseignez d'abord l'adresse du téléviseur dans [tv] host de la configuration.")
        return 1
    if cmd == "state":
        print("téléviseur %s : %s" % (tv.host, tv.power_state()))
        print("appairé :", "oui" if tv.token() else "non")
        return 0
    if cmd == "apps":
        print("Si une fenêtre s'affiche sur le téléviseur, acceptez-la.")
        for a in sorted(tv.apps(), key=lambda x: x["name"].lower()):
            print("  %-42s %s" % (a["id"], a["name"]))
        return 0
    if cmd == "launch":
        app = sys.argv[2] if len(sys.argv) > 2 else None
        print("lancé par", tv.launch(app))
        return 0
    print("usage : python3 -m lumen.tvwake [state|apps|launch [appId]]")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
