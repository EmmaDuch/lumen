# Installer le serveur LUMEN

Le serveur peut vivre n'importe où : un conteneur LXC sur Proxmox, un Raspberry Pi, un vieux portable. Il lui faut Python 3.11 ou plus récent, et de rester allumé.

[← Sommaire](README.md) · [Documentation en anglais](en/)

---

## Ce dont vous avez besoin

- Les identifiants de votre abonnement IPTV : l'adresse du serveur, un nom d'utilisateur, un mot de passe.
- Une machine sur le même réseau que le téléviseur.
- Python 3.11 ou plus récent, et Pillow pour les vignettes.

> ⚠️ **Vos identifiants ne vont que dans `/etc/lumen/config.toml`,** sur votre serveur. Ne les mettez jamais dans une *issue*, une capture d'écran ou un message public.

## Sur Proxmox : créer le conteneur

*Si vous installez sur autre chose qu'un conteneur Proxmox, passez directement à la section suivante.*

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

## Copier et installer

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

## Vérifier que ça tourne

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

## La suite

- [Installer l'application sur le téléviseur](installation-televiseur.md)
- [Faire le tri dans les chaînes](bouquets-et-noms.md)
- [Ajouter votre médiathèque](mediatheque.md)
