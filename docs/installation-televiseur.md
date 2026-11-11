# Installer LUMEN sur le téléviseur

L'application s'installe en mode développeur : c'est la façon prévue par Samsung pour poser une application qui ne vient pas de son magasin. Rien n'est débloqué ni modifié sur le téléviseur.

[← Sommaire](README.md) · [Documentation en anglais](en/)

---


Il vous faut :
- le fichier **LUMEN.wgt** (l'appli) ;
- le serveur LUMEN qui tourne sur le Proxmox (adresse `192.168.1.20`) ;
- l'outil gratuit **Apps2Samsung** sur votre ordinateur. Il crée lui-même le certificat Samsung et installe l'appli : pas besoin de Tizen Studio.

La TV et l'ordinateur doivent être sur le même réseau.

## 1. Passer la TV en mode développeur (une seule fois)

1. Allumez la TV et ouvrez **Applications** (Apps).
2. Sur la télécommande, tapez **1 2 3 4 5**. Sur la télécommande sans chiffres (SolarCell), passez par la touche **123** pour afficher le pavé.
3. Dans la fenêtre « Developer mode », mettez **On**, puis entrez l'adresse IP de votre ordinateur (commande `ip -4 addr` pour la trouver, par exemple `192.168.1.xx`).
4. Éteignez complètement la TV en **maintenant** la touche marche/arrêt jusqu'à ce que le logo Samsung apparaisse, puis attendez qu'elle redémarre.

Si la fenêtre ne s'ouvre pas, le wiki d'Apps2Samsung explique comment faire selon le modèle (rubrique FAQ « How to enable Developer Mode on your TV »).

## 2. Installer Apps2Samsung sur votre ordinateur

Téléchargez la version Linux (AppImage) sur la page des versions du projet :
https://github.com/Apps2Samsung/Apps2Samsung/releases

```sh
chmod +x Apps2Samsung*.AppImage
./Apps2Samsung*.AppImage
```

## 3. Installer LUMEN

1. Dans Apps2Samsung, choisissez votre TV dans la liste (elle est trouvée sur le réseau).
2. Choisissez **Custom WGT File** (fichier WGT personnalisé) et sélectionnez **LUMEN.wgt**.
3. Lancez l'installation. La première fois, l'outil vous demande de vous connecter à un compte Samsung pour créer le certificat de votre TV : c'est normal et gratuit.
4. LUMEN apparaît ensuite dans les applications de la TV. Vous pouvez la déplacer dans le bandeau d'accueil comme n'importe quelle appli.

## 4. Premier lancement

LUMEN demande l'adresse du serveur : laissez `192.168.1.20` (le port 8765 est ajouté tout seul) et validez **Se connecter**. Le champ mot de passe reste vide, sauf si vous avez rempli `token` dans la configuration du serveur.

## Les écrans

- **Accueil** : une grande image qui défile (reprendre la lecture, nouveautés), vos chaînes favorites en vignettes, puis les films et séries. Descendez avec la flèche du bas : les rangées remontent et l'image s'efface.
- **En direct** : le guide en grille. Les bouquets à gauche, les chaînes et leurs programmes à droite, avec le trait rouge de l'heure. Gauche et droite se déplacent dans le temps, haut et bas changent de chaîne.
- **Page d'une chaîne** (touche Info) : le logo, la résolution, « En cours » et « Programme suivant », et les chaînes voisines.
- **En plein écran** : une barre discrète en bas de l'écran donne le logo, la chaîne, le programme, les horaires et la progression, avec la résolution, le codec et le son réellement reçus. Un appui sur **OK** la développe : Accueil, Guide, Depuis le début, Replay, les icônes info / favori / sous-titres à droite, et vos **dernières chaînes regardées** en bas. **Retour** la referme.
- **Zapping rapide** : depuis la barre discrète, la flèche **gauche** ouvre la liste des chaînes avec leur logo, leur numéro et ce qui passe en ce moment. OK bascule sans quitter la lecture.
- **Fiche d'un programme** : dans la grille comme dans le panneau Guide du lecteur, OK sur un programme à venir ouvre son résumé complet. Sur un programme passé d'une chaîne avec replay, la fiche propose de le regarder.
- **Aperçu vidéo** : dans la grille, la chaîne sur laquelle vous vous arrêtez se lance au bout d'une seconde et demie dans le cadre en haut à droite. Ça se désactive dans les réglages.
- **La pastille en haut à droite** rappelle ce que vous regardez ; OK dessus y revient.

## Utilisation à la télécommande

| Touche | Action |
|---|---|
| Flèches, OK | se déplacer, valider |
| OK en plein écran | ouvrir le bandeau complet (Retour pour le refermer) |
| Gauche en plein écran | ouvrir le zapping rapide |
| Retour | revenir ; sur l'accueil, deux fois pour quitter |
| Haut / Bas ou CH +/– en plein écran | changer de chaîne |
| 0 à 9 | aller directement à un numéro de chaîne |
| Jaune | Guide : chaîne favorite · Films, Séries : à regarder plus tard · Liste : favori |
| Vert | Guide : replay de la chaîne |
| Bleu | Guide : renommer et renuméroter une chaîne · sur un bouquet : le renommer |
| Info | Ouvrir la page de la chaîne |
| Rouge | retirer de l'historique ou de la liste |
| Lecture / Pause, avance et retour rapides | pendant un film ou un épisode |

Les touches de couleur se trouvent sous la touche **123** sur les télécommandes sans boutons de couleur.

## Replay et bandes-annonces

- Dans le guide, un programme déjà passé s'ouvre directement en replay quand la chaîne en a un (étiquette REPLAY sur le bloc). La catégorie « Avec replay » regroupe ces chaînes, et la touche verte ouvre la liste complète.
- En plein écran, le bouton **Depuis le début** relance l'émission en cours depuis son début.
- Pendant un replay, ← → reculent ou avancent d'une minute, les touches retour/avance rapide de 5 minutes.
- Les fiches de films et de séries affichent un bouton **Bande-annonce** quand le fournisseur en propose une (vidéo YouTube : la TV doit avoir accès à Internet).

## Mettre à jour l'appli

Réinstallez simplement le nouveau `LUMEN.wgt` de la même façon avec Apps2Samsung. Votre historique, vos listes et vos favoris sont sur le serveur : rien n'est perdu. Il faudra peut-être retaper l'adresse du serveur.

## Essayer l'appli sur l'ordinateur

Ouvrez `index.html` dans Chrome ou Firefox : l'appli s'affiche comme sur la TV (flèches, Entrée, Échap pour Retour, touche J pour le jaune, R pour le rouge). La vidéo, elle, ne se lit que sur la TV, car le navigateur ne sait pas lire les flux IPTV.

## En cas de souci

- **« Impossible de joindre … »** au premier lancement : vérifiez que `http://192.168.1.20:8765/api/status` s'ouvre depuis l'ordinateur.
- **Une chaîne ne démarre pas** : essayez `live_format = "m3u8"` dans `/etc/lumen/config.toml` sur le serveur, puis `systemctl restart lumen`.
- **L'aperçu du Direct ralentit la navigation** : désactivez-le dans Réglages › Aperçu vidéo dans le Direct.
- **Apps2Samsung ne trouve pas la TV** : vérifiez que le mode développeur est bien activé avec l'adresse IP de l'ordinateur, et que la TV a été redémarrée.
