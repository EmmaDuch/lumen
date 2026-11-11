# Comment c'est fait

Où vivent les données, comment le téléviseur parle au serveur, et pourquoi c'est découpé comme ça.

[← Sommaire](README.md) · [Documentation en anglais](en/)

---

## Où sont les données

- `/etc/lumen/config.toml` : la configuration (les identifiants de l'abonnement restent ici et ne sont jamais envoyés à la TV, sauf dans l'adresse de lecture de chaque vidéo) ;
- `/var/lib/lumen/lumen.db` : le catalogue, le guide, l'historique et les listes ;
- `/var/lib/lumen/img/` : le cache des images (il peut être supprimé sans risque, il se reconstruit) ;
- `/var/lib/lumen/art/` : les jaquettes, fonds et logos que vous avez choisis — **celui-là ne se reconstruit pas**, c'est le seul endroit où vivent vos images ;
- vos fichiers vidéo, eux, ne sont jamais copiés ni modifiés : le serveur les lit sur place, en lecture seule.

Pour sauvegarder l'historique et les listes, il suffit de sauvegarder le conteneur dans Proxmox, comme les autres.

## Bon à savoir

- Si une synchronisation échoue (fournisseur injoignable, identifiants refusés), l'ancien catalogue est conservé : la TV continue de fonctionner.
- Si certaines chaînes coupent ou ne démarrent pas, essayez `live_format = "m3u8"` dans la configuration, puis `systemctl restart lumen`.
- Le serveur n'est fait que pour le réseau de la maison. Ne l'ouvrez pas sur Internet dans la FRITZ!Box. Pour une protection en plus, mettez un mot de passe dans `token` : l'appli TV le demandera une fois.

## API (pour l'appli TV)

| Méthode | Adresse | Rôle |
|---|---|---|
| GET | `/api/status` | état, dates des dernières synchronisations, compteurs |
| POST | `/api/sync` | lance une synchronisation |
| GET | `/api/home` | accueil : reprendre, chaînes favorites, ajouts récents |
| GET | `/api/categories?kind=live\|vod\|series&all=1` | bouquets visibles (ou tous avec `all=1`) et leur nombre de titres |
| POST | `/api/categories/visibility` | `{kind, ids, hidden}` masquer (true), afficher (false), revenir aux règles (null) |
| GET | `/reglages` | page de choix des bouquets |
| GET | `/api/live?cat=all\|fav\|<id>` | chaînes avec programme en cours et suivant |
| GET | `/api/epg?id=<chaîne>&hours=24` | guide d'une chaîne |
| GET | `/api/vod?cat=&sort=recent\|name&offset=&limit=` | films |
| GET | `/api/movie?id=` | fiche film |
| GET | `/api/series?cat=&sort=&offset=&limit=` | séries |
| GET | `/api/series/detail?id=` | fiche série, saisons, épisodes, épisode à reprendre |
| GET | `/api/search?q=` | recherche sans tenir compte des accents |
| GET | `/api/play?kind=live\|movie\|episode&id=&ext=` | adresse de lecture et position de reprise |
| POST | `/api/progress` | `{kind, id, position, duration, series_id}` |
| GET / DELETE | `/api/history?filter=all\|progress\|done\|movies\|series` | historique (DELETE sans paramètre = tout effacer, ou `?kind=movie\|series&id=`) |
| GET / POST / DELETE | `/api/watchlist?filter=all\|fav\|movies\|series&sort=added\|name` | à regarder plus tard ; POST `{kind, id, fav}` |
| POST | `/api/favchannels` | `{id, on}` chaîne favorite oui / non |
| GET | `/img?u=<adresse>&w=<largeur>` | image redimensionnée (seulement celles du catalogue) |
| GET | `/api/live?cat=replay` | chaînes avec replay |
| GET | `/api/replay?id=<chaîne>` | programmes passés de la chaîne, `available` = enregistré |
| GET | `/api/play?kind=replay&id=&start=&stop=` | adresse de lecture d'un replay |
| POST | `/api/categories/rename` | `{kind, id, name}` (name vide = nom du fournisseur) |
| GET | `/api/channels/admin?cat=&q=` | toutes les chaînes avec leurs valeurs d'origine |
| POST | `/api/channels/edit` | `{id, name, num}` (vide = valeur du fournisseur) |
| GET | `/trailer?v=<id YouTube>` | page de lecture d'une bande-annonce |
| GET | `/api/guide?cat=&start=&hours=&offset=&limit=` | grille du guide : chaînes et programmes d'une tranche d'heures |
| GET | `/api/channel?id=` | page d'une chaîne : en cours, suivant, chaînes voisines |
| GET / POST / DELETE | `/api/bouquets…` | bouquets personnels (création, ordre, contenu, renumérotation) |
| GET / POST / DELETE | `/api/rules` | règles de nettoyage des noms |
| GET / POST / DELETE | `/api/epg/…` | sources du guide, association des chaînes |
