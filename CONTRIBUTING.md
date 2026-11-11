# Participer à LUMEN

*[English below](#contributing-to-lumen)*

LUMEN a été écrit pour un téléviseur, un fournisseur et un réseau. Tout ce qui le confronte à d'autres est précieux.

## Ce qui aide le plus

**Dire que ça marche.** Si LUMEN tourne sur votre téléviseur, ouvrez une *issue* avec le modèle exact et la génération. La liste des modèles qui fonctionnent est ce qui manque le plus, et personne ne peut la constituer seul.

**Dire que ça ne marche pas.** Avec le modèle, la version de LUMEN, les 30 dernières lignes de `journalctl -u lumen`, ce que vous faisiez et ce qui s'est passé à la place.

**Traduire.** L'interface est en français. Les textes sont dans une poignée de fichiers : `tv/js/screens.js`, `serveur/lumen/reglages.html` et `reglages.js`. Il n'y a pas encore de système de traduction — si vous voulez en poser un, dites-le dans une *issue* avant de vous lancer, qu'on en discute.

## Avant d'ouvrir une issue

> ⚠️ **Relisez ce que vous collez.** Les journaux et les captures d'écran contiennent souvent l'adresse et le nom d'utilisateur de votre abonnement IPTV. Remplacez-les par `xxx`.

Ne joignez jamais votre `config.toml`, ni une capture de la page de réglages montrant vos identifiants.

## Le code

**Le serveur** n'utilise que la bibliothèque standard de Python, plus Pillow. C'est volontaire : il doit tourner dix ans dans un conteneur sans qu'une dépendance casse. Une contribution qui ajoute une bibliothèque doit expliquer pourquoi elle est indispensable.

**L'application TV** est du JavaScript sans cadre applicatif, sans étape de construction. Le téléviseur est lent et sa mémoire est petite ; chaque kilo-octet compte.

**Le français** est la langue du code et des commentaires. Les commentaires disent *pourquoi*, pas *quoi* : le code dit déjà quoi.

Avant d'envoyer une *pull request*, vérifiez que le serveur démarre, que la page de réglages s'ouvre sans erreur dans la console du navigateur, et que l'application se lance sur un téléviseur ou dans Chrome.

## Ce qui ne sera pas accepté

- Tout ce qui concerne l'accès à des contenus sans y avoir droit. LUMEN est un lecteur ; il ne fournit aucune chaîne, aucune liste, aucun identifiant, et n'en fournira pas.
- Des listes de fournisseurs, des identifiants d'exemple qui fonctionnent, des liens vers des flux.
- De la télémétrie, des statistiques d'usage, des appels vers l'extérieur que l'utilisateur n'a pas demandés.

---

# Contributing to LUMEN

LUMEN was written for one television, one provider and one network. Anything that tests it against others is valuable.

## What helps most

**Saying it works.** If LUMEN runs on your set, open an issue with the exact model and generation. A list of televisions that work is what is missing most, and nobody can build it alone.

**Saying it doesn't.** With the model, the LUMEN version, the last 30 lines of `journalctl -u lumen`, what you were doing and what happened instead.

**Translating.** The interface is in French. The strings sit in a handful of files: `tv/js/screens.js`, `serveur/lumen/reglages.html` and `reglages.js`. There is no translation system yet — if you want to put one in, say so in an issue first so we can talk it through.

## Before opening an issue

> ⚠️ **Read what you paste.** Logs and screenshots often carry your IPTV subscription's address and username. Replace them with `xxx`.

Never attach your `config.toml`, or a screenshot of the settings page showing your credentials.

## The code

**The server** uses nothing but the Python standard library, plus Pillow. That is deliberate: it has to run for ten years in a container without a dependency breaking. A contribution that adds a library must say why it is indispensable.

**The TV app** is framework-free JavaScript with no build step. The television is slow and short of memory; every kilobyte counts.

**French** is the language of the code and the comments. Comments say *why*, not *what*: the code already says what.

Before sending a pull request, check that the server starts, that the settings page opens with no console errors, and that the app launches on a television or in Chrome.

## What will not be accepted

- Anything to do with reaching content you have no right to. LUMEN is a player; it supplies no channels, no playlists, no credentials, and it never will.
- Provider lists, working example credentials, links to streams.
- Telemetry, usage statistics, or any call outward the user did not ask for.
