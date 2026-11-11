# Corriger les fiches et les logos

Quand le fournisseur se trompe de jaquette, oublie un résumé ou n'a pas de logo, tout se corrige depuis la page de réglages.

[← Sommaire](README.md) · [Documentation en anglais](en/)

---

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
