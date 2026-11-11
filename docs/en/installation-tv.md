# Installing LUMEN on the television

The app is installed through developer mode: Samsung's own way of putting an application on a set when it does not come from the store. Nothing is unlocked and nothing is modified on the television.

[← Contents](README.md) · [Documentation en français](../installation-televiseur.md)

---

You need:

- the **LUMEN.wgt** file (the app);
- the LUMEN server running and reachable on your network;
- **Apps2Samsung**, free, on your computer. It creates the Samsung certificate itself and installs the app, so Tizen Studio is not needed.

The television and the computer must be on the same network.

## 1. Put the television into developer mode (once)

1. Switch the television on and open **Apps**.
2. On the remote, type **1 2 3 4 5**. On a remote without a number pad (SolarCell), press **123** first to bring up the keypad.
3. In the "Developer mode" window, set it to **On**, then enter your computer's IP address (`ip -4 addr` on Linux, `ipconfig` on Windows).
4. Switch the television fully off by **holding** the power button until the Samsung logo appears, then wait for it to come back.

If the window does not open, the Apps2Samsung wiki covers the variations between models, under the FAQ entry "How to enable Developer Mode on your TV".

## 2. Install Apps2Samsung

Download it from the project's releases page:
https://github.com/Apps2Samsung/Apps2Samsung/releases

```sh
chmod +x Apps2Samsung*.AppImage
./Apps2Samsung*.AppImage
```

## 3. Install LUMEN

1. In Apps2Samsung, pick your television from the list — it is found on the network.
2. Choose **Custom WGT File** and select **LUMEN.wgt**.
3. Start the installation. The first time, the tool asks you to sign in to a Samsung account so it can create your television's certificate. That is normal and free.
4. LUMEN then appears among the television's apps, and can be moved around like any other.

## 4. First launch

LUMEN asks for the server address. Type the address of the machine running the server — port 8765 is added for you — and confirm with **Se connecter** (connect). Leave the password field empty unless you set `token` in the server configuration.

## Using the remote

| Key | What it does |
| --- | --- |
| Arrows | Move around |
| OK | Open, or expand the info bar during playback |
| Return | Go back, or close the info bar |
| Left (on the info bar) | Quick channel list |
| Info | Channel page |
| Guide | Programme guide |
| Ch+ / Ch− | Next / previous channel |
| Yellow | Add or remove a favourite |
| Blue | Catch-up, where the channel offers it |

## Updating the app

Install the new `.wgt` over the old one with Apps2Samsung. Your settings, favourites and playback positions live on the server, so nothing is lost.

## Trying it without a television

The app is plain HTML and JavaScript. Served over HTTP, it runs in Chrome, with a `<video>` element standing in for the television's player. Useful for looking at the interface; not for testing playback.

## If something goes wrong

See [troubleshooting](troubleshooting.md).
