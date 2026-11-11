#!/bin/sh
# Fabrique les deux fichiers à joindre à une Release GitHub :
#   lumen-server.tar.gz  — le serveur
#   LUMEN.wgt            — l'application du téléviseur
#
# Usage :  sh construire.sh
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir dist

# --- le serveur ---------------------------------------------------------
# On exclut tout ce qui pourrait contenir des identifiants ou des données.
tar czf dist/lumen-server.tar.gz -C serveur \
    --exclude=__pycache__ --exclude='*.pyc' \
    --exclude='config.toml' --exclude='*.db' --exclude='*.log' \
    .
echo "  dist/lumen-server.tar.gz"

# --- l'application du téléviseur ----------------------------------------
# Un .wgt est une archive zip : config.xml doit être à la racine, non compressé.
cd tv
rm -f ../dist/LUMEN.wgt
zip -r -X -q ../dist/LUMEN.wgt config.xml icon.png index.html css js
cd ..
echo "  dist/LUMEN.wgt"

# --- vérification -------------------------------------------------------
# Un identifiant oublié dans une archive publiée ne se rattrape pas.
if tar tzf dist/lumen-server.tar.gz | grep -qx './config.toml'; then
    echo "ARRÊT : config.toml est dans l'archive. Ne la publiez pas." >&2
    exit 1
fi
# L'exemple ne doit contenir que des valeurs à remplacer : vides, ou du texte
# qui annonce clairement qu'il faut le changer.
suspect=$(tar xzfO dist/lumen-server.tar.gz ./config.example.toml 2>/dev/null \
    | grep -E '^ *(server|username|password|token|tmdb_key|host) *= *"[^"]+"' \
    | grep -viE 'votre|adresse-du|exemple|example|changez|a-remplir' || true)
if [ -n "$suspect" ]; then
    echo "ARRÊT : config.example.toml contient peut-être une vraie valeur :" >&2
    echo "$suspect" >&2
    exit 1
fi

ls -lh dist/
echo
echo "Prêt. Joignez ces deux fichiers à une Release sur GitHub."
