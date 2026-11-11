"""Client minimal pour l'API Xtream Codes (player_api.php)."""
import json
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

UA = "LUMEN/1.0"


class XtreamError(Exception):
    pass


class Xtream:
    def __init__(self, cfg):
        x = cfg["xtream"]
        self.server = x["server"]
        self.user = x["username"]
        self.password = x["password"]
        self.live_format = x["live_format"]
        self.replay_format = x.get("replay_format", "path")
        self.replay_tz = x.get("replay_timezone") or ""
        self.epg_url = x.get("epg_url") or ""
        self.timeout = cfg["sync"]["timeout"]

    def _open(self, url):
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
        return urllib.request.urlopen(req, timeout=self.timeout)

    def api(self, action=None, **params):
        query = {"username": self.user, "password": self.password}
        if action:
            query["action"] = action
        query.update(params)
        url = f"{self.server}/player_api.php?{urllib.parse.urlencode(query)}"
        try:
            with self._open(url) as r:
                data = r.read()
        except Exception as e:  # réseau, HTTP, délai dépassé
            raise XtreamError(f"{action or 'login'} : {e}") from None
        try:
            return json.loads(data or b"null")
        except ValueError:
            raise XtreamError(f"{action or 'login'} : réponse illisible") from None

    def login(self):
        info = self.api()
        user = (info or {}).get("user_info") or {}
        if str(user.get("auth")) != "1":
            raise XtreamError("identifiants Xtream refusés")
        return info

    def open_epg(self):
        url = self.epg_url or (f"{self.server}/xmltv.php?"
                               + urllib.parse.urlencode({"username": self.user, "password": self.password}))
        return self._open(url)

    def _path(self):
        return f"{urllib.parse.quote(self.user, safe='')}/{urllib.parse.quote(self.password, safe='')}"

    def live_url(self, stream_id):
        return f"{self.server}/live/{self._path()}/{stream_id}.{self.live_format}"

    def movie_url(self, stream_id, ext):
        return f"{self.server}/movie/{self._path()}/{stream_id}.{ext or 'mp4'}"

    def episode_url(self, episode_id, ext):
        return f"{self.server}/series/{self._path()}/{episode_id}.{ext or 'mp4'}"

    def replay_url(self, stream_id, start_ts, minutes, provider_tz=""):
        """Adresse du replay (timeshift). L'heure de début s'écrit dans le fuseau du fournisseur."""
        zone = None
        for name in (self.replay_tz, provider_tz, "Europe/Brussels"):
            try:
                zone = ZoneInfo(name)
                break
            except Exception:
                continue
        start = datetime.fromtimestamp(int(start_ts), zone).strftime("%Y-%m-%d:%H-%M")
        minutes = max(1, int(minutes))
        if self.replay_format == "php":
            q = urllib.parse.urlencode({"username": self.user, "password": self.password, "stream": stream_id,
                                        "start": start, "duration": minutes})
            return f"{self.server}/streaming/timeshift.php?{q}"
        return f"{self.server}/timeshift/{self._path()}/{minutes}/{start}/{stream_id}.ts"
