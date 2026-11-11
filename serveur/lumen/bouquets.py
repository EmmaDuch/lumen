"""Bouquets créés par l'utilisateur.

Ils sont indépendants des catégories du fournisseur : on y place ce que l'on veut,
dans l'ordre que l'on veut. Sur la TV, ils apparaissent avant les catégories du fournisseur.
Leur identifiant côté API est « b3 » (b + numéro), pour ne pas se confondre avec ceux du fournisseur.

Un bouquet porte une sorte : « live » pour les chaînes, « vod » pour les films,
« series » pour les séries. Les trois listes sont indépendantes.
"""
from .common import now

KINDS = ("live", "vod", "series")


def check_kind(kind):
    kind = kind or "live"
    if kind not in KINDS:
        raise ValueError("kind doit valoir live, vod ou series")
    return kind


def kind_of(db, bouquet_id):
    row = db.execute("SELECT kind FROM bouquets WHERE id=?", (bouquet_id,)).fetchone()
    return (row["kind"] or "live") if row else None


def cat_id(bouquet_id):
    return "b%d" % int(bouquet_id)


def parse_id(cat):
    """« b3 » -> 3 ; autre chose -> None (c'est une catégorie du fournisseur)."""
    cat = str(cat or "")
    if cat.startswith("b") and cat[1:].isdigit():
        return int(cat[1:])
    return None


def listing(db, kind="live"):
    kind = check_kind(kind)
    rows = db.execute(
        f"SELECT b.id, b.name, b.pos, COUNT(t.id) AS n FROM bouquets b "
        f"LEFT JOIN bouquet_items i ON i.bouquet = b.id LEFT JOIN {kind} t ON t.id = i.chan "
        f"WHERE COALESCE(b.kind, 'live') = ? GROUP BY b.id ORDER BY b.pos, b.id", (kind,))
    return [{"id": cat_id(r["id"]), "bouquet": r["id"], "name": r["name"], "count": r["n"], "kind": kind,
             "own": True, "hidden": False, "manual": False, "orig_name": r["name"]} for r in rows]


def items_sql(kind):
    """Requête des éléments d'un bouquet, dans l'ordre choisi par l'utilisateur."""
    kind = check_kind(kind)
    order = "t.num" if kind == "live" else "t.norm"
    return (f"SELECT t.* FROM bouquet_items i JOIN {kind} t ON t.id = i.chan "
            f"WHERE i.bouquet = ? ORDER BY i.pos, {order}")


def channels(db, bouquet_id, kind=None):
    kind = check_kind(kind or kind_of(db, bouquet_id))
    return db.execute(items_sql(kind), (bouquet_id,))


def create(db, name, kind="live"):
    kind = check_kind(kind)
    name = (name or "").strip() or "Nouveau bouquet"
    with db:
        pos = db.execute("SELECT COALESCE(MAX(pos), 0) + 1 FROM bouquets").fetchone()[0]
        cur = db.execute("INSERT INTO bouquets(name, pos, created, kind) VALUES (?,?,?,?)",
                         (name, pos, now(), kind))
    return cur.lastrowid


def rename(db, bouquet_id, name):
    name = (name or "").strip()
    if not name:
        raise ValueError("le nom ne peut pas être vide")
    with db:
        db.execute("UPDATE bouquets SET name=? WHERE id=?", (name, bouquet_id))


def delete(db, bouquet_id):
    """Supprime le bouquet : les chaînes elles-mêmes ne sont pas touchées."""
    with db:
        db.execute("DELETE FROM bouquet_items WHERE bouquet=?", (bouquet_id,))
        db.execute("DELETE FROM bouquets WHERE id=?", (bouquet_id,))


def move(db, bouquet_id, delta):
    rows = [r["id"] for r in db.execute("SELECT id FROM bouquets ORDER BY pos, id")]
    if bouquet_id not in rows:
        return
    i = rows.index(bouquet_id)
    j = max(0, min(len(rows) - 1, i + delta))
    rows.insert(j, rows.pop(i))
    with db:
        db.executemany("UPDATE bouquets SET pos=? WHERE id=?", [(p, b) for p, b in enumerate(rows)])


def set_items(db, bouquet_id, chan_ids):
    """Remplace tout le contenu du bouquet, dans l'ordre donné."""
    kind = check_kind(kind_of(db, bouquet_id))
    chan_ids = [int(c) for c in chan_ids]
    known = {r["id"] for r in db.execute(f"SELECT id FROM {kind}")}
    chan_ids = [c for c in chan_ids if c in known]
    with db:
        db.execute("DELETE FROM bouquet_items WHERE bouquet=?", (bouquet_id,))
        db.executemany("INSERT OR REPLACE INTO bouquet_items VALUES (?,?,?)",
                       [(bouquet_id, c, i) for i, c in enumerate(chan_ids)])
    return len(chan_ids)


def add(db, bouquet_id, chan_ids):
    kind = check_kind(kind_of(db, bouquet_id))
    have = {r["chan"] for r in db.execute("SELECT chan FROM bouquet_items WHERE bouquet=?", (bouquet_id,))}
    known = {r["id"] for r in db.execute(f"SELECT id FROM {kind}")}
    pos = db.execute("SELECT COALESCE(MAX(pos), -1) + 1 FROM bouquet_items WHERE bouquet=?", (bouquet_id,)).fetchone()[0]
    rows, added = [], 0
    for c in chan_ids:
        c = int(c)
        if c in have or c not in known:
            continue
        rows.append((bouquet_id, c, pos + added))
        have.add(c)
        added += 1
    with db:
        db.executemany("INSERT OR REPLACE INTO bouquet_items VALUES (?,?,?)", rows)
    return added


def remove(db, bouquet_id, chan_ids):
    with db:
        db.executemany("DELETE FROM bouquet_items WHERE bouquet=? AND chan=?",
                       [(bouquet_id, int(c)) for c in chan_ids])


def from_category(db, name, cat_ids, kind="live"):
    """Crée un bouquet à partir d'une ou plusieurs catégories du fournisseur."""
    kind = check_kind(kind)
    bid = create(db, name, kind)
    order = "num, name" if kind == "live" else "norm"
    ids = []
    for cat in cat_ids:
        ids += [r["id"] for r in db.execute(f"SELECT id FROM {kind} WHERE cat=? ORDER BY {order}", (str(cat),))]
    add(db, bid, ids)
    return bid


def renumber(db, bouquet_id, start=1, step=1):
    """Renumérote les chaînes du bouquet dans leur ordre, à partir de « start »."""
    from . import custom
    if kind_of(db, bouquet_id) not in (None, "live"):
        raise ValueError("la numérotation ne concerne que les bouquets de chaînes")
    rows = [r["id"] for r in db.execute("SELECT chan AS id FROM bouquet_items WHERE bouquet=? ORDER BY pos",
                                        (bouquet_id,))]
    n = int(start)
    with db:
        for chan in rows:
            db.execute("INSERT INTO chan_override(id, name, num) VALUES (?, NULL, ?) "
                       "ON CONFLICT(id) DO UPDATE SET num = excluded.num", (chan, n))
            n += int(step)
    custom.apply(db)
    return len(rows)


def reset_numbers(db):
    """Oublie tous les numéros personnalisés (les noms restent)."""
    from . import custom
    with db:
        db.execute("UPDATE chan_override SET num = NULL")
        db.execute("DELETE FROM chan_override WHERE name IS NULL AND num IS NULL AND logo IS NULL")
    custom.apply(db)
