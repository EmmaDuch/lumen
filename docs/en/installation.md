# Installing the LUMEN server

The server can live anywhere: an LXC container on Proxmox, a Raspberry Pi, an old laptop. It needs Python 3.11 or newer, and to stay switched on.

[← Contents](README.md) · [Documentation en français](../)

---

## What you need

- Your IPTV credentials: server address, username, password.
- A machine on the same network as the television.
- Python 3.11 or newer, and Pillow for thumbnails.

> ⚠️ **Your credentials belong in `/etc/lumen/config.toml` and nowhere else.** Never put them in an issue, a screenshot, or a log you publish.

## On Proxmox: create the container

*Installing on something other than a Proxmox container? Skip to the next section.*

```bash
pct create 105 local:vztmpl/debian-13-standard_13.0-1_amd64.tar.zst \
  --hostname lumen --cores 2 --memory 1024 --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp --unprivileged 1 --features nesting=1
pct start 105
pct exec 105 -- apt update
pct exec 105 -- apt install -y python3 python3-pil
```

Give the container a fixed address in your router, so it does not move later.

## Copy and install

From your own computer:

```bash
scp lumen-server.tar.gz root@PROXMOX-HOST:/root/
ssh root@PROXMOX-HOST "pct push 105 /root/lumen-server.tar.gz /root/lumen-server.tar.gz"
```

Then inside the container (or straight on the machine, if it is not a container):

```bash
mkdir -p /tmp/lumen && cd /tmp/lumen
tar xzf /root/lumen-server.tar.gz
sh install.sh
```

The script installs the files under `/opt/lumen`, creates `/etc/lumen/config.toml`, and registers two systemd services: `lumen` (the server) and `lumen-sync` (the nightly catalogue refresh).

Always extract into an **empty** directory. An archive unpacked over an older copy is the most common cause of odd failures.

## Fill in your credentials

```bash
nano /etc/lumen/config.toml
```

```toml
[xtream]
server = "http://your-provider.example:8080/"
username = "your-username"
password = "your-password"
```

The address must include the port, and end with a slash.

```bash
systemctl restart lumen
systemctl start lumen-sync      # first sync; it takes a while
```

The first sync pulls the whole catalogue — tens of thousands of entries. Fifteen minutes is not unusual. Later ones are quick.

## Check that it runs

```bash
systemctl status lumen
curl -s http://127.0.0.1:8765/api/status
```

Then from any computer on the network, open:

```
http://SERVER-ADDRESS:8765/reglages
```

That settings page is where everything is configured. It is in French, like the application itself.

## A password on the server (optional)

By default anyone on your network can reach the server. To require a password, add it to the configuration:

```toml
[server]
token = "something-long-and-random"
```

The television then asks for it once, on its first connection.

## Next

- [Install the app on the television](installation-tv.md)
- [Troubleshooting](troubleshooting.md)
