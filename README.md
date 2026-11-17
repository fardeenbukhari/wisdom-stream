# Wisdom Stream

Watch videos together with friends, perfectly in sync.

**Live web version:** https://fardeenbukhari.github.io/wisdom-stream/

## Two versions

| | Web version (`docs/`) | Server version (`src/`) |
|---|---|---|
| Runs on | GitHub Pages, no server | Node.js / Windows .exe |
| Friends join from | Any network (peer-to-peer WebRTC via PeerJS) | Same Wi-Fi / network |
| Own video files | Paste any https link | `public/videos/` folder, works offline |

- **Watch parties**: the host plays, pauses and seeks, and everyone in the room follows (synced over WebSockets)
- **Late join sync**: friends who join mid-movie start at the host's current position
- **Live chat** inside each room
- **HLS (.m3u8) and MP4** streaming with Video.js
- **Play any link**: paste a direct `.mp4` / `.m3u8` URL
- **Offline mode**: drop `.mp4` files into `public/videos/` and they appear on the home page

> **Note:** Earlier versions scraped MX Player. MX Player's website now redirects to Prime Video
> (DRM protected), so that no longer works. The app now ships with free Blender Foundation
> open movies (Creative Commons) and supports any direct video link.

## Run it

```bash
npm install
npm start
```

Open http://localhost:9090. The terminal also prints a `http://192.168.x.x:9090` address.
Friends on the **same Wi-Fi** open that address (or the room link) to join.

Change the port with `PORT=3000 npm start`.

## Windows app (.exe)

```bash
npm install
npm run build:exe
```

This creates `dist/WisdomStream.exe`, a single file that needs no Node.js install.
Double-click it: the server starts and the browser opens automatically.
Put `.mp4` files in a `videos` folder next to the .exe to play them offline.

### Installer (Setup.exe)

```bash
sudo apt install nsis   # once (Linux), or install NSIS on Windows
npm run build:installer
```

This creates `dist/WisdomStream-Setup.exe`: installs for the current user (no admin needed),
adds Desktop + Start menu shortcuts, and appears in Settings > Apps with an uninstaller.

## How a watch party works

1. Open a movie and click **Start watch party**
2. Copy the link and send it to friends
3. Friends open the link, enter their name and click **Join party**
4. The host's play / pause / seek is mirrored for everyone, plus a sync check every 3 seconds

## Tech

Node.js, Express, EJS, `ws` (WebSockets), Video.js 8 (built-in HLS), Bootstrap 4.

## Credits

Big Buck Bunny, Sintel, Tears of Steel, Elephants Dream (c) Blender Foundation, licensed under Creative Commons.
