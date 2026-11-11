# Votre médiathèque personnelle

Vos films et vos séries, sur un disque ou un NAS, rangés à côté de ceux du fournisseur.

[← Sommaire](README.md) · [Documentation en anglais](en/)

---

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
