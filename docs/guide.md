# Le guide des programmes

Sept jours de programmes, avec les vignettes, et le replay sur les chaînes qui le proposent.

[← Sommaire](README.md) · [Documentation en anglais](en/)

---

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
