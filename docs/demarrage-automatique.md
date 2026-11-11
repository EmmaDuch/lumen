# Démarrer LUMEN avec le téléviseur

LUMEN s'ouvre tout seul à l'allumage, à la place de Samsung TV Plus.

[← Sommaire](README.md) · [Documentation en anglais](en/)

---

## Démarrer LUMEN en même temps que la TV

Tizen ne laisse pas une application installée en mode développeur se déclarer « application de démarrage » : à l'allumage, c'est Samsung TV Plus qui se lance. On contourne cela par l'extérieur — le serveur surveille le téléviseur et, dès qu'il s'allume, lui demande d'ouvrir LUMEN.

Tout se règle dans la page de réglages, onglet **Téléviseur**.

### La première fois

1. Donnez au téléviseur une **adresse fixe** dans la FRITZ!Box. Sans cela, l'adresse changera un jour et le réveil s'arrêtera sans prévenir.
2. Allumez le téléviseur.
3. Dans l'onglet Téléviseur, saisissez son adresse, puis cliquez sur **Demander l'autorisation**.
4. Une fenêtre s'affiche sur l'écran du téléviseur : acceptez-la avec la télécommande. Elle ne revient plus ensuite.
5. La liste des applications installées apparaît alors dans la page. Vérifiez que LUMEN y figure, et cliquez sur **Choisir** à côté pour reprendre son identifiant exact.
6. Cliquez sur **Lancer maintenant** : LUMEN doit s'ouvrir sur le téléviseur. La page vous dit par quel chemin la demande est passée et si LUMEN est bien arrivé à l'écran.
7. Cochez enfin **Ouvrir LUMEN quand le téléviseur s'allume**.

L'autorisation est rangée dans `/var/lib/lumen/tv-token.json`, lisible par root seulement.

### Ce que fait le serveur

Il interroge le téléviseur toutes les trois secondes quand il est éteint, toutes les quinze quand il est allumé — une simple question d'état, rien de lourd. Au passage éteint → allumé, il attend le **délai** indiqué (le temps que le téléviseur finisse de démarrer), demande l'ouverture de LUMEN, puis vérifie quatre secondes plus tard que LUMEN est bien devant. Si TV Plus a repris la main, il redemande, jusqu'au nombre d'**essais** fixé.

Deux chemins sont essayés dans l'ordre : l'interface HTTP du téléviseur, puis sa liaison WebSocket. Sur les modèles récents, seul le premier ouvre vraiment l'application ; le second sert de secours.

Entre l'allumage et l'arrivée de LUMEN, TV Plus se voit et s'entend quelques secondes. Pour raccourcir ce moment, baissez le délai à 3 ou 2 secondes : les premières demandes tomberont parfois trop tôt, mais les essais suivants rattrapent, et LUMEN arrive plus vite. Si le téléviseur se met à bouder (écran noir, retour à TV Plus), remontez d'une seconde.

### Si ça ne marche pas

| Ce que dit la page | Ce qu'il faut faire |
| --- | --- |
| « Téléviseur : injoignable » alors qu'il est allumé | l'adresse est fausse, ou le téléviseur n'est pas sur le même réseau que le conteneur |
| « pas encore autorisé » | cliquez sur **Demander l'autorisation** et acceptez la fenêtre sur l'écran |
| « LUMEN n'est pas à l'écran » après le lancement | augmentez les **essais**, et le **délai** si le téléviseur est lent à démarrer |
| rien ne se passe au réveil, mais « Lancer maintenant » fonctionne | le téléviseur se coupe du réseau en veille : augmentez le délai, il répond parfois tard |

Le réglage se change à tout moment : décocher la case suffit à arrêter la surveillance, sans redémarrer le serveur.
