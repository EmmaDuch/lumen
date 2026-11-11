# Quand ça ne marche pas

Les pannes les plus courantes, et par quoi commencer.

[← Sommaire](README.md) · [Documentation en anglais](en/)

---

## D'abord : les trois commandes qui disent tout

```bash
systemctl status lumen                  # le serveur tourne-t-il ?
journalctl -u lumen -n 50 --no-pager    # qu'a-t-il dit en dernier ?
curl -s http://127.0.0.1:8765/api/status   # répond-il ?
```

Si `api/status` répond depuis la machine du serveur mais pas depuis votre PC, le problème est le réseau ou le pare-feu, pas LUMEN.

## Le serveur

| Ce que vous voyez | Ce que ça veut dire |
| --- | --- |
| `systemctl start lumen` échoue | Lisez `journalctl -xeu lumen`. Neuf fois sur dix : une faute de frappe dans `/etc/lumen/config.toml`. |
| « identifiants refusés » à la synchronisation | Vérifiez l'adresse, le nom et le mot de passe auprès de votre fournisseur. L'adresse doit contenir le port, par exemple `http://exemple.tv:8080/`. |
| La synchronisation dure très longtemps | Normal la première fois : 50 000 films, c'est long à récupérer. Les suivantes sont rapides. |
| `table X has N columns but M values` | Une mise à jour s'est installée à moitié. Ré-extrayez l'archive dans un dossier **vide** et relancez `sh install.sh`. |
| Les vignettes ne s'affichent pas | Pillow manque. `apt install python3-pil` ou `pip install Pillow`. |

## Le téléviseur

| Ce que vous voyez | Ce que ça veut dire |
| --- | --- |
| « Impossible de joindre le serveur » | Ouvrez `http://ADRESSE:8765/api/status` depuis un PC sur le même réseau. Si ça ne répond pas, le serveur ou le réseau est en cause. Si ça répond, vérifiez l'adresse tapée sur le téléviseur. |
| L'installation de l'application échoue | Le mode développeur se désactive tout seul au bout de quelques jours sur certains modèles. Repassez-le sur On, et vérifiez que l'adresse IP déclarée est bien celle de votre ordinateur. |
| L'application se ferme toute seule | Presque toujours un manque de mémoire. Redémarrez le téléviseur en le débranchant 30 secondes. |
| Une chaîne ne démarre pas | Essayez la même chaîne dans VLC avec la même adresse. Si VLC ne la lit pas non plus, c'est le flux du fournisseur. |
| L'image saccade | Le téléviseur ne sait pas décoder ce flux. Les codecs acceptés sont H.264 et H.265 ; un flux en MPEG-2 ou en AV1 passe mal. |

## Le démarrage automatique

| Ce que dit la page | Ce qu'il faut faire |
| --- | --- |
| « Téléviseur : injoignable » alors qu'il est allumé | L'adresse est fausse, ou le téléviseur n'est pas sur le même réseau. Donnez-lui une adresse fixe dans votre box. |
| « pas encore autorisé » | Cliquez sur **Demander l'autorisation** et acceptez la fenêtre sur l'écran. |
| « LUMEN n'est pas à l'écran » après le lancement | Augmentez les essais, et le délai si le téléviseur est lent à démarrer. |
| Rien ne se passe au réveil, mais « Lancer maintenant » marche | Le téléviseur se coupe du réseau en veille. Augmentez le délai. |

## Rien de tout ça ?

Ouvrez une *issue* avec :

- le modèle exact du téléviseur (Menu → Assistance → À propos) ;
- la version de LUMEN (en bas de la page de réglages) ;
- les 30 dernières lignes de `journalctl -u lumen` ;
- ce que vous faisiez, et ce qui s'est passé à la place.

> ⚠️ **Relisez ce que vous collez.** Les journaux peuvent contenir l'adresse et le nom d'utilisateur de votre abonnement. Remplacez-les par `xxx` avant de publier.
