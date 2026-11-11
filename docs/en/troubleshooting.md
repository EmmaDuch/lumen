# When it does not work

The common failures, and where to start.

[← Contents](README.md) · [Documentation en français](../depannage.md)

---

## First: the three commands that tell you everything

```bash
systemctl status lumen                      # is the server running?
journalctl -u lumen -n 50 --no-pager        # what did it last say?
curl -s http://127.0.0.1:8765/api/status    # does it answer?
```

If `api/status` answers on the server machine but not from your PC, the problem is the network or a firewall, not LUMEN.

## The server

| What you see | What it means |
| --- | --- |
| `systemctl start lumen` fails | Read `journalctl -xeu lumen`. Nine times out of ten, a typo in `/etc/lumen/config.toml`. |
| "credentials refused" on sync | Check the address, username and password with your provider. The address must include the port, e.g. `http://example.tv:8080/`. |
| The sync takes a very long time | Normal the first time: 50,000 films take a while to fetch. Later ones are quick. |
| `table X has N columns but M values` | An update was installed over an older copy. Extract the archive into an **empty** directory and run `sh install.sh` again. |
| Thumbnails do not appear | Pillow is missing. `apt install python3-pil` or `pip install Pillow`. |

## The television

| What you see | What it means |
| --- | --- |
| "Impossible de joindre le serveur" (cannot reach the server) | Open `http://ADDRESS:8765/api/status` from a PC on the same network. No answer means the server or the network; an answer means the address typed on the television is wrong. |
| Installing the app fails | Developer mode switches itself off after a few days on some models. Turn it back on, and check that the declared IP address is still your computer's. |
| The app closes on its own | Almost always memory. Restart the television by unplugging it for 30 seconds. |
| A channel will not start | Try the same channel in VLC with the same URL. If VLC cannot play it either, the provider's stream is at fault. |
| The picture stutters | The television cannot decode that stream. H.264 and H.265 are fine; MPEG-2 and AV1 generally are not. |

## Automatic start

| What the settings page says | What to do |
| --- | --- |
| "Téléviseur : injoignable" while it is on | Wrong address, or the television is on another network. Give it a fixed address in your router. |
| "pas encore autorisé" (not yet authorised) | Click **Demander l'autorisation** and accept the prompt on the screen. |
| "LUMEN n'est pas à l'écran" after launching | Raise the number of attempts, and the delay if the set is slow to boot. |
| Nothing happens on wake, but "Lancer maintenant" works | The television drops off the network in standby. Raise the delay. |

## None of the above?

Open an issue with:

- the exact television model (Menu → Support → About);
- the LUMEN version (bottom of the settings page);
- the last 30 lines of `journalctl -u lumen`;
- what you were doing, and what happened instead.

> ⚠️ **Read what you paste.** Logs can contain your subscription's address and username. Replace them with `xxx` before posting.
