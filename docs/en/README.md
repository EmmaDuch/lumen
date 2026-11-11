# LUMEN documentation

[Français](../) · [← Back to the repository](../../README.en.md)

## Getting started

1. [Install the server](installation.md) — the container, the configuration, the first sync
2. [Install the app on the television](installation-tv.md) — developer mode and the `.wgt` file
3. [Troubleshooting](troubleshooting.md) — common failures and where to start

## Still French only

LUMEN's own interface is in French, and so are the pages below. They are being translated; the three pages above are what you need to get running.

| Page | What it covers |
| --- | --- |
| [Bouquets, noms et numéros](../bouquets-et-noms.md) | Personal bouquets, name cleaning rules, renaming and renumbering channels |
| [Corriger les fiches et les logos](../fiches-et-logos.md) | Editing titles, synopses, posters, backdrops and channel logos |
| [La médiathèque](../mediatheque.md) | Local and SMB media, recognised and dressed up by TMDB |
| [Le guide des programmes](../guide.md) | The seven-day guide, external XMLTV sources, catch-up |
| [Démarrer LUMEN avec le téléviseur](../demarrage-automatique.md) | Opening LUMEN at power-on instead of Samsung TV Plus |
| [Comment c'est fait](../architecture.md) | Where the data lives, what talks to what |

Translations are welcome — see [CONTRIBUTING.md](../../CONTRIBUTING.md).

## One rule, everywhere

Your IPTV credentials, your TMDB key and the television's token live in `/etc/lumen/config.toml`, on your own machine. They belong nowhere else: not in an issue, not in a screenshot, not in a log you publish.
