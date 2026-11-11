"""Dialogue avec un téléviseur Samsung Tizen, sans aucune dépendance.

Les téléviseurs récents demandent un appairage : à la première connexion, le
téléviseur affiche une demande d'autorisation et, une fois acceptée, renvoie un
jeton que l'on réutilise ensuite. Tout passe par une WebSocket sur le port 8002,
en TLS avec un certificat auto-signé.

Ce module implémente le strict nécessaire du protocole WebSocket (RFC 6455) :
poignée de main, trames masquées côté client, lecture des trames du serveur.
"""
import base64
import json
import logging
import os
import socket
import ssl
import struct
import urllib.error
import urllib.parse
import urllib.request

log = logging.getLogger("lumen.samsung")

NAME = "LUMEN"
REMOTE_PATH = "/api/v2/channels/samsung.remote.control"


class TvError(Exception):
    pass


# ---------------------------------------------------------------- WebSocket minimal

class WS:
    """Client WebSocket réduit à ce dont on a besoin : du texte, dans les deux sens."""

    def __init__(self, host, port, path, timeout=10, secure=True):
        self.timeout = timeout
        raw = socket.create_connection((host, port), timeout)
        if secure:
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE      # le téléviseur signe lui-même son certificat
            raw = ctx.wrap_socket(raw, server_hostname=host)
        self.sock = raw
        self.buf = b""
        self._handshake(host, port, path)

    def _handshake(self, host, port, path):
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            "GET %s HTTP/1.1\r\n"
            "Host: %s:%d\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Key: %s\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n" % (path, host, port, key)
        )
        self.sock.sendall(req.encode())
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise TvError("le téléviseur a coupé la connexion pendant la poignée de main")
            head += chunk
        line = head.split(b"\r\n", 1)[0].decode("latin-1")
        if "101" not in line:
            raise TvError("le téléviseur a refusé la WebSocket : " + line)
        self.buf = head.split(b"\r\n\r\n", 1)[1]

    def send(self, text):
        data = text.encode()
        mask = os.urandom(4)
        n = len(data)
        if n < 126:
            head = struct.pack("!BB", 0x81, 0x80 | n)
        elif n < 65536:
            head = struct.pack("!BBH", 0x81, 0x80 | 126, n)
        else:
            head = struct.pack("!BBQ", 0x81, 0x80 | 127, n)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        self.sock.sendall(head + mask + masked)

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise TvError("connexion fermée par le téléviseur")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self):
        """Renvoie le prochain message texte, ou None si le serveur ferme."""
        while True:
            b0, b1 = self._read(2)
            op, masked, n = b0 & 0x0F, b1 & 0x80, b1 & 0x7F
            if n == 126:
                n = struct.unpack("!H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack("!Q", self._read(8))[0]
            mask = self._read(4) if masked else b""
            payload = self._read(n) if n else b""
            if mask:
                payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            if op == 0x8:                     # fermeture
                return None
            if op == 0x9:                     # ping : on répond pong
                self.sock.sendall(struct.pack("!BB", 0x8A, 0x80) + os.urandom(4))
                continue
            if op in (0x1, 0x2):
                return payload.decode("utf-8", "replace")
            # continuation ou pong : on passe au suivant

    def close(self):
        try:
            self.sock.sendall(struct.pack("!BB", 0x88, 0x80) + os.urandom(4))
        except OSError:
            pass
        try:
            self.sock.close()
        except OSError:
            pass


# ---------------------------------------------------------------- téléviseur

class Tv:
    def __init__(self, host, token="", timeout=10, name=NAME):
        self.host = host
        self.token = token or ""
        self.timeout = timeout
        self.name = name

    # ---- informations, sans appairage
    def info(self):
        url = "http://%s:8001/api/v2/" % self.host
        try:
            with urllib.request.urlopen(url, timeout=self.timeout) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as e:
            raise TvError("téléviseur injoignable : %s" % e)

    def power_state(self):
        """'on', 'standby' ou None si le téléviseur ne répond pas du tout."""
        try:
            return (self.info().get("device") or {}).get("PowerState")
        except TvError:
            return None

    # ---- canal de télécommande
    def _connect(self):
        q = {"name": base64.b64encode(self.name.encode()).decode()}
        if self.token:
            q["token"] = self.token
        path = REMOTE_PATH + "?" + urllib.parse.urlencode(q)
        ws = WS(self.host, 8002, path, self.timeout)
        # le téléviseur annonce la connexion, et glisse le jeton quand il en délivre un
        while True:
            msg = ws.recv()
            if msg is None:
                ws.close()
                raise TvError("le téléviseur a fermé la connexion (autorisation refusée ?)")
            try:
                d = json.loads(msg)
            except ValueError:
                continue
            ev = d.get("event")
            if ev == "ms.channel.connect":
                tok = ((d.get("data") or {}).get("token"))
                if tok:
                    self.token = str(tok)
                return ws
            if ev == "ms.channel.unauthorized":
                ws.close()
                raise TvError("autorisation refusée sur le téléviseur")
            if ev == "ms.channel.timeOut":
                ws.close()
                raise TvError("le téléviseur n'a pas répondu à la demande d'autorisation")

    def pair(self):
        """Première connexion : le téléviseur demande l'autorisation, puis donne un jeton."""
        ws = self._connect()
        ws.close()
        return self.token

    def _emit(self, event, data, wait_event=None, tries=1):
        ws = self._connect()
        try:
            ws.send(json.dumps({"method": "ms.channel.emit",
                                "params": {"event": event, "to": "host", "data": data}}))
            if not wait_event:
                return None
            for _ in range(tries):
                msg = ws.recv()
                if msg is None:
                    return None
                try:
                    d = json.loads(msg)
                except ValueError:
                    continue
                if d.get("event") == wait_event:
                    return d.get("data")
            return None
        finally:
            ws.close()

    def apps(self):
        """Liste des applications installées, telle que le téléviseur la connaît."""
        data = self._emit("ed.installedApp.get", {}, wait_event="ed.installedApp.get", tries=6)
        return (data or {}).get("data") or []

    # Les applications web installées (comme LUMEN) veulent DEEP_LINK ;
    # les applications natives veulent NATIVE_LAUNCH. On essaie dans cet ordre.
    def launch_ws(self, app_id, action_type="DEEP_LINK"):
        """Lancement par le canal de télécommande."""
        self._emit("ed.apps.launch", {"appId": str(app_id), "action_type": action_type})
        return True

    def launch_start(self, app_id):
        """Autre méthode du même canal : ms.application.start."""
        ws = self._connect()
        try:
            ws.send(json.dumps({"method": "ms.application.start", "params": {"id": str(app_id)}}))
            # certains modèles n'accusent rien : on laisse partir et on referme
        finally:
            ws.close()
        return True

    def launch_control(self, app_id):
        """Lancement par app_control, comme le ferait une autre application du téléviseur."""
        self._emit("ed.apps.launch", {"appId": str(app_id), "action_type": "DEEP_LINK",
                                      "metaTag": ""})
        return True

    def variants(self, app_id):
        """Toutes les façons connues de demander un lancement, à essayer une par une."""
        return [
            ("websocket DEEP_LINK", lambda: self.launch_ws(app_id, "DEEP_LINK")),
            ("websocket NATIVE_LAUNCH", lambda: self.launch_ws(app_id, "NATIVE_LAUNCH")),
            ("websocket sans action_type", lambda: self._emit("ed.apps.launch", {"appId": str(app_id)})),
            ("websocket ms.application.start", lambda: self.launch_start(app_id)),
            ("HTTP POST /applications", lambda: self.launch_rest(app_id)),
        ]

    def launch_rest(self, app_id):
        """Lancement par l'ancienne interface HTTP ; certains modèles ne répondent qu'à elle."""
        url = "http://%s:8001/api/v2/applications/%s" % (self.host, urllib.parse.quote(str(app_id)))
        req = urllib.request.Request(url, data=b"", method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return 200 <= r.status < 300
        except urllib.error.HTTPError as e:
            raise TvError("réponse %s du téléviseur" % e.code)
        except Exception as e:
            raise TvError(str(e))

    def app_running(self, app_id):
        """Vrai si l'application est au premier plan, d'après l'interface HTTP."""
        url = "http://%s:8001/api/v2/applications/%s" % (self.host, urllib.parse.quote(str(app_id)))
        try:
            with urllib.request.urlopen(url, timeout=self.timeout) as r:
                d = json.loads(r.read().decode("utf-8", "replace"))
            return bool(d.get("visible") or d.get("running"))
        except Exception:
            return None

    def launch(self, app_id, method="auto"):
        """Essaie les deux méthodes, en commençant par celle qui marche le plus souvent."""
        errs = []
        if method == "ws":
            steps = [("ws", lambda: self.launch_ws(app_id, "DEEP_LINK"))]
        elif method == "rest":
            steps = [("rest", lambda: self.launch_rest(app_id))]
        else:
            steps = [("ws", lambda: self.launch_ws(app_id, "DEEP_LINK")),
                     ("ws-native", lambda: self.launch_ws(app_id, "NATIVE_LAUNCH")),
                     ("start", lambda: self.launch_start(app_id)),
                     ("rest", lambda: self.launch_rest(app_id))]
        for name, fn in steps:
            try:
                fn()
                return name
            except TvError as e:
                errs.append("%s : %s" % (name, e))
        raise TvError(" / ".join(errs) or "échec du lancement")


# ---------------------------------------------------------------- diagnostic en ligne de commande

def _main(argv):
    import argparse
    p = argparse.ArgumentParser(prog="python3 -m lumen.samsung",
                                description="Dialogue avec un téléviseur Samsung Tizen.")
    p.add_argument("host", help="adresse IP du téléviseur")
    p.add_argument("action", choices=["infos", "appairer", "applis", "lancer", "etat", "essais"],
                   help="ce qu'on demande au téléviseur")
    p.add_argument("app", nargs="?", default="LumenTVapp.Lumen", help="identifiant de l'application")
    p.add_argument("--jeton", default=os.environ.get("LUMEN_TV_TOKEN", ""), help="jeton déjà obtenu")
    p.add_argument("--methode", default="auto", choices=["auto", "ws", "rest"])
    a = p.parse_args(argv)
    tv = Tv(a.host, a.jeton)
    try:
        if a.action == "infos":
            d = tv.info().get("device") or {}
            for k in ("modelName", "PowerState", "TokenAuthSupport", "developerMode", "networkType"):
                print("  %-18s %s" % (k, d.get(k, "")))
        elif a.action == "etat":
            print("  état :", tv.power_state())
        elif a.action == "appairer":
            print("  Regardez le téléviseur : acceptez la demande d'autorisation.")
            tok = tv.pair()
            print("  jeton :", tok or "(aucun : ce téléviseur n'en délivre pas)")
        elif a.action == "applis":
            apps = tv.apps()
            if not apps:
                print("  le téléviseur n'a pas répondu la liste (certains modèles la refusent)")
            for x in apps:
                print("   %-28s %s" % (x.get("appId", ""), x.get("name", "")))
            print("  jeton :", tv.token)
        elif a.action == "lancer":
            m = tv.launch(a.app, a.methode)
            print("  lancé par :", m, "| jeton :", tv.token)
        elif a.action == "essais":
            import time
            print("  Regardez l'écran. Chaque variante est espacée de 6 secondes.")
            print("  Notez le numéro de celle qui ouvre LUMEN.\n")
            for i, (label, fn) in enumerate(tv.variants(a.app), 1):
                print("  %d. %s" % (i, label), flush=True)
                try:
                    fn()
                    print("     envoyée sans erreur")
                except TvError as e:
                    print("     refusée :", e)
                time.sleep(6)
            print("\n  Terminé. Dites-moi quel numéro a fonctionné.")
    except TvError as e:
        print("  échec :", e)
        return 1
    return 0


if __name__ == "__main__":
    import sys
    raise SystemExit(_main(sys.argv[1:]))
