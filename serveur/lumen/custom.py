"""Noms et numéros personnalisés, et règles de nettoyage des noms de chaînes.

Le fournisseur garde ses valeurs dans orig_name / orig_num ; ce qui s'affiche (name / num)
est recalculé ici après chaque synchronisation et après chaque modification.

Ordre de décision pour le nom d'une chaîne :
  1. le nom que vous avez tapé à la main (chan_override.name) ;
  2. sinon le nom du fournisseur passé dans les règles de nettoyage ;
  3. sinon le nom du fournisseur tel quel.
"""
import re

from .common import norm, now

# Règles livrées à la première mise en route. « enabled = 0 » : présente mais désactivée.
BUILTIN_RULES = [
    (r"^\s*\|\s*[A-Z]{2,3}\s*\|\s*", "", 1, "Enlever |FR| |BE| … au début"),
    (r"^\s*[A-Z]{2,3}\s*[:\-]\s+", "", 1, "Enlever FR: BE- … au début"),
    (r"^\s*\(\s*[A-Z]{2,3}\s*\)\s*", "", 1, "Enlever (FR) (BE) … au début"),
    (r"\s*\[[^\]]*\]\s*", " ", 0, "Enlever ce qui est entre crochets"),
    (r"\s+(FHD|UHD|4K|HD|SD|HEVC|H265|H\.265)\s*$", "", 0, "Enlever HD, FHD, 4K … à la fin"),
    (r"\s*\|\s*", " ", 0, "Remplacer les barres | par une espace"),
]
_TRIM = re.compile(r"^[\s|:,\-–—]+|[\s|:,\-–—]+$")
_SPACES = re.compile(r"\s{2,}")


def seed_rules(db):
    """Crée les règles livrées, une seule fois."""
    if db.execute("SELECT 1 FROM name_rules LIMIT 1").fetchone():
        return
    with db:
        db.executemany("INSERT INTO name_rules(pattern, repl, pos, enabled, builtin) VALUES (?,?,?,?,1)",
                       [(p, r, i, e) for i, (p, r, e, _) in enumerate(BUILTIN_RULES)])


def rules(db):
    out = []
    for r in db.execute("SELECT * FROM name_rules WHERE enabled = 1 ORDER BY pos, id"):
        try:
            out.append((re.compile(r["pattern"], re.IGNORECASE), r["repl"] or ""))
        except re.error:
            continue  # règle mal écrite : on l'ignore plutôt que de tout casser
    return out


def clean(name, compiled):
    """Applique les règles puis nettoie les espaces et séparateurs qui traînent."""
    out = name or ""
    for rx, repl in compiled:
        try:
            out = rx.sub(repl, out)
        except re.error:
            continue
    out = _SPACES.sub(" ", _TRIM.sub("", out)).strip()
    return out or (name or "")


def apply(db):
    """Recalcule ce qui s'affiche : noms, numéros, jaquettes, fonds, résumés, logos."""
    seed_rules(db)
    compiled = rules(db)
    over = {r["id"]: r for r in db.execute("SELECT id, name, num, logo FROM chan_override")}
    updates = []
    for r in db.execute("SELECT id, name, num, logo, orig_name, orig_num, orig_logo FROM live"):
        o = over.get(r["id"])
        name = (o["name"] if o and o["name"] else None) or clean(r["orig_name"], compiled)
        num = o["num"] if o and o["num"] is not None else r["orig_num"]
        logo = (o["logo"] if o and o["logo"] else None) or r["orig_logo"]
        if name != r["name"] or num != r["num"] or logo != r["logo"]:
            updates.append((name, norm(name), num, logo, r["id"]))

    # films et séries : mêmes règles pour le nom, et les corrections manuelles l'emportent
    # sur le fournisseur pour la jaquette, le fond et le résumé
    items = {}
    for kind in ("vod", "series"):
        man = {r["id"]: r for r in db.execute(
            "SELECT id, name, plot, poster, backdrop FROM item_override WHERE kind=?", (kind,))}
        cols = ("id, name, orig_name, poster, orig_poster, backdrop, plot, "
                + ("orig_backdrop, orig_plot" if kind == "series" else "NULL AS orig_backdrop, NULL AS orig_plot"))
        rows = []
        for r in db.execute(f"SELECT {cols} FROM {kind}"):
            o = man.get(r["id"])
            name = (o["name"] if o and o["name"] else None) or clean(r["orig_name"], compiled)
            poster = (o["poster"] if o and o["poster"] else None) or r["orig_poster"]
            backdrop = (o["backdrop"] if o and o["backdrop"] else None) or r["orig_backdrop"]
            plot = (o["plot"] if o and o["plot"] else None) or r["orig_plot"]
            if (name != r["name"] or poster != r["poster"] or backdrop != r["backdrop"]
                    or plot != r["plot"]):
                rows.append((name, norm(name), poster, backdrop, plot, r["id"]))
        items[kind] = rows

    # bouquets du fournisseur : règles aussi, sauf si un nom a été tapé à la main
    renamed = {(r["kind"], r["id"]): r["name"] for r in db.execute("SELECT kind, id, name FROM cat_rename")}
    cats = []
    for r in db.execute("SELECT kind, id, name, orig_name FROM categories"):
        name = renamed.get((r["kind"], r["id"])) or clean(r["orig_name"] or r["name"], compiled)
        if name != r["name"]:
            cats.append((name, r["kind"], r["id"]))

    with db:
        db.executemany("UPDATE live SET name=?, norm=?, num=?, logo=? WHERE id=?", updates)
        for kind, rows in items.items():
            db.executemany(f"UPDATE {kind} SET name=?, norm=?, poster=?, backdrop=?, plot=? WHERE id=?", rows)
        db.executemany("UPDATE categories SET name=? WHERE kind=? AND id=?", cats)


# ce que chaque sorte d'élément apporte à l'aperçu : table, tri, table des noms manuels
_KINDS = {"live": ("live", "orig_num, orig_name", "SELECT id FROM chan_override WHERE name IS NOT NULL"),
          "vod": ("vod", "orig_name", "SELECT id FROM item_override WHERE kind='vod' AND name IS NOT NULL"),
          "series": ("series", "orig_name", "SELECT id FROM item_override WHERE kind='series' AND name IS NOT NULL"),
          "cat": ("categories", "kind, pos", None)}


def preview(db, limit=40, kind="live"):
    """Exemples avant / après, pour la page de réglages."""
    if kind not in _KINDS:
        kind = "live"
    table, order, man_sql = _KINDS[kind]
    compiled = rules(db)
    manual = {r["id"] for r in db.execute(man_sql)} if man_sql else set()
    if kind == "cat":
        manual = {r["id"] for r in db.execute("SELECT id FROM cat_rename")}
    out, same = [], 0
    cols = "kind, id, orig_name, name" if kind == "cat" else "id, orig_name"
    for r in db.execute(f"SELECT {cols} FROM {table} ORDER BY {order}"):
        before = r["orig_name"] or (r["name"] if kind == "cat" else "")
        after = clean(before, compiled)
        if after == before:
            same += 1
            continue
        if len(out) < limit:
            out.append({"id": r["id"], "before": before, "after": after, "manual": r["id"] in manual})
    return {"changed": out, "unchanged": same}


_ITEM_FIELDS = ("name", "plot", "poster", "backdrop")


def edit_item(db, kind, item_id, **changes):
    """Corrige une fiche. Chaque champ passé à vide revient à la valeur du fournisseur ;
    un champ absent n'est pas touché. Champs : name, plot, poster, backdrop."""
    if kind not in ("vod", "series"):
        raise ValueError("kind doit valoir vod ou series")
    bad = set(changes) - set(_ITEM_FIELDS)
    if bad:
        raise ValueError("champ inconnu : " + ", ".join(sorted(bad)))
    with db:
        db.execute("INSERT OR IGNORE INTO item_override(kind, id) VALUES (?,?)", (kind, item_id))
        for field, value in changes.items():
            value = (value or "").strip() or None
            db.execute(f"UPDATE item_override SET {field}=? WHERE kind=? AND id=?", (value, kind, item_id))
        # plus rien de personnel : la ligne n'a plus de raison d'exister
        db.execute("DELETE FROM item_override WHERE kind=? AND id=? AND name IS NULL AND plot IS NULL "
                   "AND poster IS NULL AND backdrop IS NULL", (kind, item_id))
    apply(db)


def rename_item(db, kind, item_id, name=None):
    """Renomme un film ou une série ; nom vide : retour aux règles de nettoyage."""
    edit_item(db, kind, item_id, name=name)


def item_override(db, kind, item_id):
    r = db.execute("SELECT name, plot, poster, backdrop FROM item_override WHERE kind=? AND id=?",
                   (kind, item_id)).fetchone()
    return {k: (r[k] if r else None) for k in _ITEM_FIELDS}


def edit_channel(db, chan_id, name=None, num=None, logo=None, with_logo=False):
    """name / num / logo vides : on revient à la valeur du fournisseur.
    Le logo n'est touché que si with_logo est vrai, pour ne pas l'effacer en renommant."""
    name = (name or "").strip() or None
    num = int(num) if num not in (None, "") else None
    logo = (logo or "").strip() or None
    with db:
        db.execute("INSERT OR IGNORE INTO chan_override(id) VALUES (?)", (chan_id,))
        db.execute("UPDATE chan_override SET name=?, num=? WHERE id=?", (name, num, chan_id))
        if with_logo:
            db.execute("UPDATE chan_override SET logo=? WHERE id=?", (logo, chan_id))
        db.execute("DELETE FROM chan_override WHERE id=? AND name IS NULL AND num IS NULL AND logo IS NULL",
                   (chan_id,))
    apply(db)


def set_channel_logo(db, chan_id, logo=None):
    """Logo vide : retour à celui du fournisseur (ou du guide externe)."""
    logo = (logo or "").strip() or None
    with db:
        db.execute("INSERT OR IGNORE INTO chan_override(id) VALUES (?)", (chan_id,))
        db.execute("UPDATE chan_override SET logo=? WHERE id=?", (logo, chan_id))
        db.execute("DELETE FROM chan_override WHERE id=? AND name IS NULL AND num IS NULL AND logo IS NULL",
                   (chan_id,))
    apply(db)


def rename_category(db, kind, cat_id, name=None):
    name = (name or "").strip() or None
    with db:
        if name is None:
            db.execute("DELETE FROM cat_rename WHERE kind=? AND id=?", (kind, cat_id))
        else:
            db.execute("INSERT OR REPLACE INTO cat_rename VALUES (?,?,?)", (kind, cat_id, name))
    apply(db)


# ---------- règles de nettoyage ----------
def list_rules(db):
    seed_rules(db)
    labels = {p: lbl for p, _, _, lbl in BUILTIN_RULES}
    return [{"id": r["id"], "pattern": r["pattern"], "repl": r["repl"] or "", "enabled": bool(r["enabled"]),
             "builtin": bool(r["builtin"]), "label": labels.get(r["pattern"], "")}
            for r in db.execute("SELECT * FROM name_rules ORDER BY pos, id")]


def set_rule(db, rule_id=None, pattern=None, repl=None, enabled=None):
    if pattern is not None:
        re.compile(pattern)  # lève re.error si la règle est mal écrite
    with db:
        if rule_id:
            if pattern is not None:
                db.execute("UPDATE name_rules SET pattern=?, repl=? WHERE id=?", (pattern, repl or "", rule_id))
            if enabled is not None:
                db.execute("UPDATE name_rules SET enabled=? WHERE id=?", (1 if enabled else 0, rule_id))
        else:
            pos = db.execute("SELECT COALESCE(MAX(pos), 0) + 1 FROM name_rules").fetchone()[0]
            db.execute("INSERT INTO name_rules(pattern, repl, pos, enabled, builtin) VALUES (?,?,?,?,0)",
                       (pattern or "", repl or "", pos, 1 if enabled is None else (1 if enabled else 0)))
    apply(db)


def delete_rule(db, rule_id):
    with db:
        db.execute("DELETE FROM name_rules WHERE id=?", (rule_id,))
    apply(db)


def reset_names(db, kind="all"):
    """Oublie les noms tapés à la main. Numéros, logos, jaquettes et résumés restent."""
    with db:
        if kind in ("all", "live"):
            db.execute("UPDATE chan_override SET name = NULL")
            db.execute("DELETE FROM chan_override WHERE name IS NULL AND num IS NULL AND logo IS NULL")
        if kind in ("all", "vod", "series"):
            where = "" if kind == "all" else " WHERE kind='%s'" % kind
            db.execute("UPDATE item_override SET name = NULL" + where)
            db.execute("DELETE FROM item_override WHERE name IS NULL AND plot IS NULL AND poster IS NULL "
                       "AND backdrop IS NULL")
        if kind in ("all", "cat"):
            db.execute("DELETE FROM cat_rename")
    apply(db)
    return now()
