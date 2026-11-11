# Documentation de LUMEN

[English](en/) · [← Retour au dépôt](../README.md)

## Pour commencer

1. [Installer le serveur](installation.md) — le conteneur, la configuration, la première synchronisation
2. [Installer l'application sur le téléviseur](installation-televiseur.md) — mode développeur et fichier `.wgt`

## Au quotidien

- [Bouquets, noms et numéros](bouquets-et-noms.md) — ne garder que ce qui vous intéresse
- [Corriger les fiches et les logos](fiches-et-logos.md) — titres, résumés, jaquettes, fonds, logos
- [La médiathèque](mediatheque.md) — vos fichiers locaux ou SMB, habillés par TMDB
- [Le guide des programmes](guide.md) — sept jours de programmes, vignettes et replay
- [Démarrer LUMEN avec le téléviseur](demarrage-automatique.md) — à la place de Samsung TV Plus

## Quand ça coince

- [Dépannage](depannage.md) — les pannes courantes et par quoi commencer
- [Comment c'est fait](architecture.md) — où vivent les données, qui parle à qui

## Une règle, partout

Vos identifiants IPTV, votre clé TMDB et le jeton du téléviseur vivent dans `/etc/lumen/config.toml`, sur votre machine. Ils ne doivent apparaître nulle part ailleurs : ni dans une *issue*, ni dans une capture d'écran, ni dans un journal que vous publiez.
