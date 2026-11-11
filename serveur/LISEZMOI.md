# LUMEN – serveur IPTV pour la TV

Ce petit serveur tourne dans un conteneur LXC Debian 13 sur Proxmox. Il fait tout le travail lourd à la place de la TV :

- toutes les 6 heures, il récupère le catalogue de l'abonnement Xtream (direct, films, séries) et le guide des programmes ;
- il redimensionne les affiches et les logos à la taille de l'écran, et les garde en cache ;
- il retient l'historique, la progression de lecture, la liste « À regarder plus tard », les favoris et les chaînes favorites ;
- il répond à l'appli TV avec de petites réponses JSON prêtes à afficher.

Il n'utilise que Python et Pillow, qui sont dans les paquets Debian. Rien à installer avec pip.

**Mise à jour depuis une version précédente** : décompressez la nouvelle archive dans le conteneur et relancez `sh install.sh`. La configuration, l'historique, les listes et vos choix de bouquets sont conservés ; la base est mise à niveau toute seule.

## 1. Créer le conteneur (sur l'hôte Proxmox)

Dans le shell de l'hôte Proxmox (adaptez le numéro 105 et le stockage `local-lvm` si besoin) :

```sh
pveam update
pveam available --section system | grep debian-13
pveam download local debian-13-standard_XXX_amd64.tar.zst      # le nom exact affiché juste avant

pct create 105 local:vztmpl/debian-13-standard_XXX_amd64.tar.zst \
  --hostname lumen --cores 2 --memory 1024 --swap 512 \
  --rootfs local-lvm:8 --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 --features nesting=1 --onboot 1
pct start 105
```

Ensuite, dans la FRITZ!Box, réservez une adresse fixe pour le conteneur « lumen ». La TV doit toujours le retrouver à la même adresse.

## 2. Copier et installer

Depuis l'Arch, envoyez l'archive sur l'hôte Proxmox, puis poussez-la dans le conteneur :

```sh
scp lumen-server.tar.gz root@192.168.1.10:/root/
ssh root@192.168.1.10 "pct push 105 /root/lumen-server.tar.gz /root/lumen-server.tar.gz"
```

Puis, dans la console du conteneur (`pct enter 105`) :

```sh
cd /root && tar xzf lumen-server.tar.gz && cd lumen-server
sh install.sh
nano /etc/lumen/config.toml        # mettre server, username, password de l'abonnement
systemctl start lumen lumen-sync.timer
```

Au premier démarrage, le serveur lance lui-même une première synchronisation. Elle prend de quelques secondes à quelques minutes selon la taille du catalogue.

## 3. Vérifier

Depuis un navigateur sur l'Arch : `http://ADRESSE-DU-CONTENEUR:8765/api/status`

Vous devez voir le nombre de chaînes, de films, de séries et de programmes du guide. Si un compteur reste à 0, consultez le journal :

```sh
journalctl -u lumen -u lumen-sync -n 50
```

Commandes utiles :

| Action | Commande |
|---|---|
| Relancer une synchronisation tout de suite | `systemctl start lumen-sync` |
| Prochaine synchronisation prévue | `systemctl list-timers lumen-sync.timer` |
| Redémarrer le serveur | `systemctl restart lumen` |
| Mettre à jour LUMEN | décompresser la nouvelle archive puis `sh install.sh` (la configuration et les données sont conservées) |

## La page de réglages

Tout se règle depuis le navigateur d'un ordinateur : `http://ADRESSE-DU-CONTENEUR:8765/reglages`

Cinq onglets :

| Onglet | À quoi ça sert |
|---|---|
| **Mes bouquets** | Créer vos propres bouquets, y mettre les chaînes que vous voulez, les ranger par glisser-déposer, les renuméroter |
| **Chaînes** | Changer le numéro et le nom d'une chaîne |
| **Noms** | Les règles qui enlèvent automatiquement les préfixes de pays, `HD`… avec un aperçu avant / après |
| **Guide** | Les sources XMLTV extérieures, et l'association de chaque chaîne au bon guide |
| **Bouquets du fournisseur** | Masquer ou afficher les bouquets d'origine, les renommer |

## Mes bouquets

Vous composez vos propres listes, pour le **direct**, pour les **films** et pour les **séries** — chaque sorte a ses propres bouquets, choisis par les trois boutons en haut de l'onglet. Sur la TV, ils apparaissent avant ceux du fournisseur : dans la colonne de gauche du guide pour le direct, en pastilles en haut de l'écran pour les films et les séries.

C'est ainsi qu'on sépare par exemple ses propres films de ceux des enfants : un bouquet « Films de ma fille », et on y glisse ce qu'on veut.

- **Nouveau bouquet** puis **Ajouter des chaînes** (ou des films, ou des séries) : une liste avec recherche et filtre par bouquet du fournisseur, cases à cocher.
- **Depuis une catégorie** reprend d'un coup tout un bouquet du fournisseur.
- Les lignes se réordonnent au glisser-déposer. Pour le direct seulement, **Renuméroter** attribue les numéros dans cet ordre.
- Supprimer un bouquet n'efface rien : ni les chaînes, ni les films, ni les séries.

## Nettoyer les noms

Les fournisseurs préfixent souvent leurs titres, par exemple « BE » ou « FR » entre barres verticales, et ajoutent « HD » à la fin. L'onglet **Noms** contient des règles qui enlèvent tout ça. Trois sont actives au départ (les préfixes de pays), trois autres sont prêtes mais désactivées (crochets, `HD`/`4K` en fin de nom, barres verticales).

Les règles s'appliquent à quatre choses à la fois : les **chaînes**, les **films**, les **séries** et les **noms de bouquets**. L'aperçu à droite a un onglet pour chacune, pour voir ce que ça donne avant de valider.

Vous pouvez ajouter vos propres règles : une règle est une expression régulière et son remplacement.

Un nom que vous avez tapé à la main — dans l'onglet **Chaînes**, l'onglet **Films et séries** ou sur un bouquet — n'est jamais touché par les règles.

## Renommer un film ou une série

L'onglet **Films et séries** liste tout le catalogue, avec un sélecteur Films / Séries, une recherche et un filtre par bouquet. Sous chaque titre, le nom d'origine du fournisseur reste affiché. Tapez un titre puis Entrée pour le fixer ; videz le champ ou cliquez sur « Rétablir » pour revenir aux règles de nettoyage.

Ces titres survivent aux synchronisations : LUMEN garde le nom du fournisseur de son côté et ne touche qu'à ce qui est affiché.

## Corriger une fiche de film ou de série

Onglet **Films et séries**, bouton **Modifier** sur une ligne. La fenêtre qui s'ouvre permet de changer le titre, le résumé, la jaquette et le fond.

Pour une image, trois provenances :

- **Adresse web** : collez l'adresse d'une image trouvée n'importe où. Le serveur la télécharge et en garde une copie, donc elle continuera de s'afficher même si le site disparaît.
- **TMDB** : cherchez le titre, les jaquettes proposées s'affichent, un clic suffit. Demande une clé TMDB dans la configuration.
- **Depuis le PC** : choisissez un fichier sur l'ordinateur d'où vous consultez la page. JPEG, PNG, WebP, GIF et BMP, jusqu'à 12 Mo.

**Rétablir** revient à la valeur du fournisseur, et efface la copie.

Les corrections sont rangées à part du catalogue : une synchronisation ne les écrase pas, même si le fournisseur change le titre ou l'affiche de son côté. Elles valent aussi pour les films et séries de votre médiathèque, utile quand TMDB n'a rien trouvé.

Quelques précisions :

- Le résumé d'un film vient d'ordinaire de la fiche du fournisseur. Dès que vous en écrivez un, c'est le vôtre qui s'affiche partout.
- Les images sont rangées dans `/var/lib/lumen/art`. Elles sont sauvegardées avec le conteneur.
- Une image remplacée s'affiche tout de suite, y compris sur la télé : son adresse interne change à chaque enregistrement, ce qui force le téléviseur à la redemander.

## Changer le logo d'une chaîne

Onglet **Chaînes**, bouton **Logo**. Même principe, sans TMDB : une adresse web ou un fichier du PC. **Rétablir** revient au logo du fournisseur, ou à défaut à celui du guide externe.

C'est pratique pour les chaînes dont le fournisseur ne fournit aucun logo, ou un logo de mauvaise qualité.

## Choisir les bouquets à garder

Les fournisseurs proposent souvent des centaines de bouquets. Vous gardez seulement ceux qui vous intéressent, de deux façons :

**1. À la main, depuis le navigateur du PC** : `http://ADRESSE-DU-CONTENEUR:8765/reglages`

Trois onglets (Direct, Films, Séries). Cochez ce que vous gardez, décochez le reste. Si vous masquez **tous** les bouquets du direct, « Toutes les chaînes » bascule automatiquement sur l'ensemble de vos bouquets personnels : la liste ne devient jamais vide. Une recherche filtre la liste (par exemple « BE » ou « sport »), et les boutons « Tout afficher » / « Tout masquer » s'appliquent à ce que la recherche affiche. Pour ne garder qu'une poignée de bouquets parmi des centaines, les règles ci-dessous sont plus rapides.

**2. Avec des règles automatiques**, dans `/etc/lumen/config.toml`, section `[filtres]` :

```toml
[filtres]
direct_garder  = ["BE *", "FR *"]          # seulement les bouquets qui commencent par BE ou FR
direct_masquer = ["*adult*", "*24/7*"]
films_masquer  = ["AR *", "TR *"]
```

`*` remplace n'importe quel texte. Majuscules et accents ne comptent pas. Les règles valent aussi pour les bouquets que le fournisseur ajoutera plus tard. Après une modification : `systemctl restart lumen`.

Un choix fait à la main sur la page passe toujours avant les règles. Le lien « Règle auto » à côté d'un bouquet annule ce choix manuel.

Les changements sont visibles sur la TV tout de suite. Rien n'est supprimé : un bouquet masqué peut être réaffiché à tout moment. Une chaîne favorite reste dans vos favoris même si son bouquet est masqué. Le guide des programmes ne prend que les chaînes visibles, ce qui l'allège : après avoir réaffiché un bouquet, ses programmes arrivent à la synchronisation suivante (ou tout de suite avec le bouton « Synchroniser maintenant »).

## Renommer et renuméroter

Sur la page `http://ADRESSE-DU-CONTENEUR:8765/reglages` :

- **onglets Bouquets** : cliquez sur le nom d'un bouquet pour le renommer. Le lien « Nom d'origine » revient au nom du fournisseur ;
- **onglet Chaînes** : changez le numéro ou le nom d'une chaîne, puis Entrée. Un champ vide revient à la valeur du fournisseur. La page signale si deux chaînes ont le même numéro.

C'est aussi possible depuis la TV avec la touche **bleue** (sur une chaîne ou un bouquet). Les noms et numéros choisis sont gardés à chaque synchronisation. Les règles automatiques de `[filtres]` continuent de porter sur les noms du fournisseur.

## Guide des programmes avec vignettes

Le guide du fournisseur est souvent pauvre : des titres, parfois un résumé, jamais d'image. On peut ajouter des **sources XMLTV publiques** qui, elles, fournissent un résumé et souvent une vignette par programme.

Dans l'onglet **Guide**, collez l'adresse d'un fichier XMLTV (`.xml` ou `.xml.gz`) et cliquez sur **Ajouter**, puis sur **Télécharger maintenant**. Pour les chaînes françaises et belges, le projet public **xmltvfr.fr** convient bien ; son adresse exacte est indiquée sur leur site.

- LUMEN associe chaque chaîne automatiquement, par son nom.
- Les chaînes qu'il n'a pas reconnues apparaissent dans la liste du bas : le bouton **Associer** permet de chercher la bonne à la main.
- Une chaîne sans guide externe garde le guide du fournisseur.
- Si une chaîne n'a pas de logo chez le fournisseur, celui du guide externe est utilisé.
- Les vignettes sont réduites et gardées en cache, comme les affiches.

Les sources sont retéléchargées à chaque synchronisation (toutes les 6 heures).

**Mémoire** : un gros fichier XMLTV se lit en flux, sans être chargé en entier. Si vous ajoutez plusieurs sources, 1 Go de RAM pour le conteneur est plus confortable (`pct set 105 --memory 1024`).

## Replay

Les chaînes pour lesquelles le fournisseur garde les émissions passées sont marquées « Replay ». Le serveur récupère le guide complet de la chaîne quand vous ouvrez son replay, et indique ce qui est vraiment enregistré.

Si un replay ne démarre pas :
1. essayez `replay_format = "php"` dans la configuration ;
2. si l'émission démarre avec une heure de décalage, réglez `replay_timezone` (par exemple `"Europe/Paris"` ou `"UTC"`).

Après chaque modification : `systemctl restart lumen`.

## Votre médiathèque personnelle

Vos films et séries posés sur un NAS apparaissent dans LUMEN à côté du catalogue du fournisseur, dans deux bouquets à part : **Mes films** et **Mes séries**. Le serveur lit les dossiers, déduit le titre du nom de fichier, va chercher la fiche et la jaquette sur TMDB, puis diffuse le fichier au téléviseur. Historique, reprise de lecture et liste « à regarder plus tard » fonctionnent comme pour le reste.

### 1. Monter le partage sur le serveur

Le conteneur est non privilégié, il ne peut pas monter un partage réseau lui-même. On le monte donc sur l'hôte Proxmox, puis on le passe au conteneur. **Sur l'hôte Proxmox** :

```bash
apt install -y cifs-utils
mkdir -p /mnt/medias
# identifiants du NAS, lisibles par root seulement
printf 'username=VOTRE_UTILISATEUR\npassword=VOTRE_MOT_DE_PASSE\n' > /root/.smb-nas
chmod 600 /root/.smb-nas
echo '//192.168.1.40/mon-partage /mnt/medias cifs credentials=/root/.smb-nas,ro,uid=100000,gid=100000,iocharset=utf8,vers=3.0,_netdev,nofail 0 0' >> /etc/fstab
mount -a
ls /mnt/medias/Videos     # doit lister Films, Séries…
# on passe le dossier au conteneur, en lecture seule
pct set 105 -mp0 /mnt/medias,mp=/mnt/medias,ro=1
pct reboot 105
```

`uid=100000,gid=100000` correspond à l'utilisateur root **du conteneur** vu depuis l'hôte : c'est ce qui rend les fichiers lisibles à l'intérieur. `ro` et `ro=1` montent en lecture seule — LUMEN ne modifie jamais vos fichiers. `nofail` évite que l'hôte refuse de démarrer si le NAS est éteint.

Vérifiez depuis le conteneur : `pct exec 105 -- ls /mnt/medias`.

### 2. Déclarer les dossiers

Page de réglages, onglet **Médiathèque**. Ajoutez un dossier par type, par exemple `/mnt/medias/Videos/Films` en « Films » et `/mnt/medias/Videos/Séries` en « Séries », puis cliquez sur **Analyser**. La détection automatique fonctionne aussi si tout est mélangé, mais déclarer le type donne de meilleurs résultats.

### 3. La clé TMDB, si besoin

**Si votre médiathèque est déjà rangée par tinyMediaManager, Jellyfin ou Kodi, vous n'avez besoin de rien.** LUMEN lit directement ce qui est sur le disque :

- l'identifiant TMDB inscrit dans le nom du dossier, `Film (2002) {tmdb-170}` ou `Série (2019) {tmdb-86686}` — la reconnaissance est alors exacte, sans la moindre recherche ;
- les fichiers `.nfo` : titre, résumé, année, genres, durée, réalisation, distribution, note ;
- les images déjà là : `-poster.jpg`, `-fanart.jpg`, `-thumb.jpg` pour les épisodes, ou `poster.jpg` et `fanart.jpg` dans le dossier d'une série.

Les images locales sont toujours préférées : elles s'affichent instantanément, sans rien télécharger.

Une clé TMDB n'est utile que pour les fichiers **non balisés** : LUMEN cherche alors le titre sur TMDB pour récupérer fiche et jaquette. Compte gratuit sur themoviedb.org, puis *Paramètres > API*, clé **v3**, à coller dans `/etc/lumen/config.toml` :

```toml
[medias]
tmdb_key = "votre_cle"
```

puis `systemctl restart lumen`. Quand la clé est là et qu'un identifiant `{tmdb-…}` est présent, LUMEN interroge TMDB **directement par cet identifiant** pour avoir des textes à jour en français, tout en gardant vos images.

La colonne de droite liste ce qui a été trouvé, avec trois vues : Films, Épisodes, et **À vérifier** — celle-ci rassemble les fichiers sans fiche et ceux que le téléviseur ne saura pas lire. Le bouton « Corriger la fiche » permet de chercher le bon titre sur TMDB et de le rattacher à la main.

### Comment nommer ses fichiers

La reconnaissance marche d'autant mieux que les noms sont réguliers. Ce qui fonctionne bien :

```
Films/Dune (2021)/Dune (2021).mkv
Films/Le.Grand.Bain.2018.FRENCH.1080p.mkv
Series/Le Bureau des légendes (2015)/Saison 1/Le.Bureau.des.legendes.S01E01.mkv
Series/Engrenages/Season 3/Engrenages - S03E05 - Le juge.mkv
Series/Baraki/Baraki.1x01.mkv
```

Et ce qui marche encore mieux, parce qu'il n'y a plus rien à deviner :

```
Films/28 Jours plus tard (2002) {tmdb-170}/28 Jours plus tard (2002) {tmdb-170}.mkv
Séries/Creepshow (2019) {tmdb-86686}/Season 1/Creepshow - S01E01 - Matière grise.mkv
```

Les mentions techniques (1080p, MULTi, x264, WEB-DL, le nom du groupe…) sont retirées automatiquement. `S01E02`, `1x02`, `Saison 1 / Episode 2`, `Season 1` et `Livre II` sont tous compris.

### Ce que le téléviseur sait lire

Le serveur ne transcode rien : le fichier est envoyé tel quel. Le téléviseur lit du MKV ou du MP4 en H.264, H.265, MPEG-2, MPEG-4, VP9 ou AV1, avec du son AAC, AC3, EAC3, MP3, Opus ou FLAC. Un fichier en DTS ou dans un format plus rare ne démarrera pas.

Pour que LUMEN vous le dise **avant** que vous lanciez la lecture, installez ffmpeg dans le conteneur :

```bash
pct exec 105 -- apt install -y ffmpeg
```

L'analyse lit alors les pistes de chaque fichier et marque « illisible » ceux qui poseront problème, visibles dans l'onglet *À vérifier*. Sans ffmpeg, tout fonctionne, mais la compatibilité n'est pas vérifiée à l'avance.

### Sous-titres

Les sous-titres intégrés dans le fichier MKV sont disponibles sur le téléviseur, par le bouton sous-titres du lecteur. Les fichiers `.srt` posés à côté du film ne sont pas encore pris en charge.

### Au quotidien

L'analyse est relancée automatiquement à chaque synchronisation du catalogue (une fois par jour). Vous pouvez la déclencher à la main depuis la page de réglages. Elle ne relit que les fichiers nouveaux ou modifiés, donc elle est rapide.

Si le NAS est éteint au moment d'une analyse, LUMEN le remarque et ne retire rien du catalogue.

## Démarrer LUMEN en même temps que la TV

Tizen ne laisse pas une application installée en mode développeur se déclarer « application de démarrage » : à l'allumage, c'est Samsung TV Plus qui se lance. On contourne cela par l'extérieur — le serveur surveille le téléviseur et, dès qu'il s'allume, lui demande d'ouvrir LUMEN.

Tout se règle dans la page de réglages, onglet **Téléviseur**.

### La première fois

1. Donnez au téléviseur une **adresse fixe** dans la FRITZ!Box. Sans cela, l'adresse changera un jour et le réveil s'arrêtera sans prévenir.
2. Allumez le téléviseur.
3. Dans l'onglet Téléviseur, saisissez son adresse, puis cliquez sur **Demander l'autorisation**.
4. Une fenêtre s'affiche sur l'écran du téléviseur : acceptez-la avec la télécommande. Elle ne revient plus ensuite.
5. La liste des applications installées apparaît alors dans la page. Vérifiez que LUMEN y figure, et cliquez sur **Choisir** à côté pour reprendre son identifiant exact.
6. Cliquez sur **Lancer maintenant** : LUMEN doit s'ouvrir sur le téléviseur. La page vous dit par quel chemin la demande est passée et si LUMEN est bien arrivé à l'écran.
7. Cochez enfin **Ouvrir LUMEN quand le téléviseur s'allume**.

L'autorisation est rangée dans `/var/lib/lumen/tv-token.json`, lisible par root seulement.

### Ce que fait le serveur

Il interroge le téléviseur toutes les trois secondes quand il est éteint, toutes les quinze quand il est allumé — une simple question d'état, rien de lourd. Au passage éteint → allumé, il attend le **délai** indiqué (le temps que le téléviseur finisse de démarrer), demande l'ouverture de LUMEN, puis vérifie quatre secondes plus tard que LUMEN est bien devant. Si TV Plus a repris la main, il redemande, jusqu'au nombre d'**essais** fixé.

Deux chemins sont essayés dans l'ordre : l'interface HTTP du téléviseur, puis sa liaison WebSocket. Sur les modèles récents, seul le premier ouvre vraiment l'application ; le second sert de secours.

Entre l'allumage et l'arrivée de LUMEN, TV Plus se voit et s'entend quelques secondes. Pour raccourcir ce moment, baissez le délai à 3 ou 2 secondes : les premières demandes tomberont parfois trop tôt, mais les essais suivants rattrapent, et LUMEN arrive plus vite. Si le téléviseur se met à bouder (écran noir, retour à TV Plus), remontez d'une seconde.

### Si ça ne marche pas

| Ce que dit la page | Ce qu'il faut faire |
| --- | --- |
| « Téléviseur : injoignable » alors qu'il est allumé | l'adresse est fausse, ou le téléviseur n'est pas sur le même réseau que le conteneur |
| « pas encore autorisé » | cliquez sur **Demander l'autorisation** et acceptez la fenêtre sur l'écran |
| « LUMEN n'est pas à l'écran » après le lancement | augmentez les **essais**, et le **délai** si le téléviseur est lent à démarrer |
| rien ne se passe au réveil, mais « Lancer maintenant » fonctionne | le téléviseur se coupe du réseau en veille : augmentez le délai, il répond parfois tard |

Le réglage se change à tout moment : décocher la case suffit à arrêter la surveillance, sans redémarrer le serveur.

## Bandes-annonces

Quand le fournisseur indique une bande-annonce YouTube pour un film ou une série, la fiche affiche un bouton « Bande-annonce ». Elle est lue depuis la page `/trailer` du serveur, car YouTube exige une vraie adresse web pour ses lecteurs intégrés.

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
