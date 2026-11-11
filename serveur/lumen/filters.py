"""Bouquets visibles ou masqués.

Deux sources, la seconde l'emporte :
1. les règles automatiques de config.toml, section [filtres] (motifs avec *) ;
2. les choix faits à la main sur la page /reglages (table cat_override).
"""
import fnmatch

from .common import norm

PREFIX = {"live": "direct", "vod": "films", "series": "series"}


def _patterns(cfg, key):
    values = cfg.get("filtres", {}).get(key, [])
    if isinstance(values, str):
        values = [values]
    return [norm(v).strip() for v in values if str(v).strip()]


def auto_hidden(cfg, kind, name):
    n = norm(name).strip()
    keep = _patterns(cfg, PREFIX[kind] + "_garder")
    hide = _patterns(cfg, PREFIX[kind] + "_masquer")
    if keep and not any(fnmatch.fnmatchcase(n, k) for k in keep):
        return True
    return any(fnmatch.fnmatchcase(n, h) for h in hide)


def apply(db, cfg):
    over = {(r["kind"], r["id"]): r["hidden"] for r in db.execute("SELECT kind, id, hidden FROM cat_override")}
    updates = []
    # les règles portent sur le nom donné par le fournisseur, même si le bouquet a été renommé
    for r in db.execute("SELECT kind, id, COALESCE(orig_name, name) AS name FROM categories"):
        key = (r["kind"], r["id"])
        hidden = over[key] if key in over else auto_hidden(cfg, r["kind"], r["name"])
        updates.append((1 if hidden else 0, r["kind"], r["id"]))
    with db:
        db.executemany("UPDATE categories SET hidden=? WHERE kind=? AND id=?", updates)


def visible(kind, column="cat"):
    """Fragment SQL : seulement les titres des bouquets visibles."""
    assert kind in PREFIX
    return f"{column} NOT IN (SELECT id FROM categories WHERE kind='{kind}' AND hidden=1)"
