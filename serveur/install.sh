#!/bin/sh
# Installation du serveur LUMEN dans un conteneur LXC Debian 13.
# À lancer en root, depuis le dossier décompressé : sh install.sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
    echo "Lancez ce script en root." >&2
    exit 1
fi
cd "$(dirname "$0")"

echo "== Paquets"
apt-get update -q
apt-get install -y -q python3 python3-pil ca-certificates tzdata

echo "== Utilisateur et dossiers"
id lumen >/dev/null 2>&1 || useradd --system --home-dir /var/lib/lumen --shell /usr/sbin/nologin lumen
install -d -o lumen -g lumen -m 750 /var/lib/lumen
install -d -m 755 /opt/lumen /opt/lumen/lumen
install -m 644 lumen/*.py lumen/*.html lumen/*.js /opt/lumen/lumen/

install -d -m 750 -g lumen /etc/lumen
if [ ! -f /etc/lumen/config.toml ]; then
    install -m 640 -g lumen config.example.toml /etc/lumen/config.toml
    NEW_CONFIG=1
else
    NEW_CONFIG=0
fi

echo "== Services"
install -m 644 systemd/lumen.service systemd/lumen-sync.service systemd/lumen-sync.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable lumen-sync.timer >/dev/null
systemctl enable lumen.service >/dev/null

IP=$(hostname -I | awk '{print $1}')
if [ "$NEW_CONFIG" = 1 ]; then
    echo
    echo "Installé. Il reste à mettre vos identifiants Xtream :"
    echo "    nano /etc/lumen/config.toml"
    echo "puis à démarrer :"
    echo "    systemctl start lumen lumen-sync.timer"
else
    systemctl restart lumen
    systemctl start lumen-sync.timer
    echo
    echo "Mis à jour et redémarré."
fi
echo "Vérification : http://$IP:8765/api/status"
echo "Choix des bouquets : http://$IP:8765/reglages"
