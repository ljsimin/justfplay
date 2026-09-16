# justfplay

A simple web-based MP3/MP4/WebM player for your own music and video collection. Browse folders, see tags and cover art, search, and stream tracks straight from the browser — no accounts, no uploads.

## Setup

1. Copy the example config and edit it:

   ```
   cp .env.example .env
   ```

   - `MUSIC_PATH` — path on this machine to your music folder (subfolders are supported)
   - `MUSIC_PATH_2`, `MUSIC_PATH_3`, `MUSIC_PATH_4` — optional additional folders, e.g. music kept on a different drive. All configured folders are mixed together into one library as if they were a single root directory: same-named folders merge, and tracks from every folder show up side by side. Leave blank if you only have one folder.

   Need more than four? Copy `docker-compose.override.yml.example` to `docker-compose.override.yml` (gitignored, auto-merged by `docker compose up`) and add more `volumes:`/`MUSIC_DIR` entries there, following the example in that file — this keeps your customization out of the tracked `docker-compose.yml`, so `git pull` never conflicts with it.
   - `HOST_PORT` — port to reach justfplay on (default `3000`)
   - `SITE_TITLE` — text shown as the page title (default `justfplay`)
   - `AUTH_USER`, `AUTH_PASS` — optional HTTP Basic Auth. Leave both blank to disable (the default). Only worth enabling if this instance is reached over TLS (see [Security](#security) below).

2. Start it:

   ```
   docker compose up -d --build
   ```

3. Open `http://<this-machine>:<HOST_PORT>` in a browser.

`.mp3`, `.mp4`, and `.webm` files are picked up, and can be freely mixed within the same folder; other formats (including `.m4a`) are ignored. Symlinks inside a music folder (to a file or a whole directory, anywhere on disk) are followed, so you can fold in content that lives elsewhere without physically moving it. Adding or removing files under any configured music folder is detected automatically within a few minutes — no restart needed. If your music folder is a network mount (e.g. CIFS/SMB) and changes take longer than that to show up, it's usually the mount's own directory-attribute caching, not justfplay — click the ⟳ button in the top bar (or `curl -X POST http://<this-machine>:<HOST_PORT>/api/rescan`) to force an immediate rescan without restarting the container.

## Using it

- Click a folder to open it; use the breadcrumbs at the top to go back up.
- Click a track to play it. When it finishes, the next track in the same folder plays automatically.
- Use the search box to find a track by title, artist, album, or filename across your whole library.
- The player bar at the bottom has play/pause, seek, previous/next, and volume — it controls video tracks too, which play in a video area above the listing.
- Reloading the page picks up where you left off (paused, ready to resume).
- The ⟳ button next to the search box rescans the library on demand, without waiting for the periodic background rescan.
- If a track has no embedded cover art, justfplay looks for `.jpg`/`.png` files in the same folder: a single image is used as-is; with several, it prefers one named `cover`/`folder` (or a variation of those), then one matching the folder's own name, then a square image — otherwise it just picks one.

Works on both desktop and mobile browsers.

## Installing it

justfplay is an installable web app. On Chrome/Edge (desktop or Android), look for an "Install"/"Add to Home Screen" option in the browser's menu or address bar; on iOS Safari, use Share → "Add to Home Screen". Installed, it opens full-screen in its own window/icon, no browser chrome.

Note: Chrome/Edge only offer the install option over a secure context — `https://` or `localhost`. If you're reaching justfplay over plain `http://` at a LAN IP (the default setup above), install will work when browsing from the same machine (`http://localhost:<HOST_PORT>`) but not from other devices unless you put justfplay behind HTTPS (e.g. a reverse proxy). iOS Safari's "Add to Home Screen" isn't affected by this and works either way.

## Security

justfplay has no accounts and, by default, no authentication — anyone who can reach the port can browse and stream your library (and trigger a rescan). If you're exposing it beyond your own LAN, set `AUTH_USER`/`AUTH_PASS` in `.env` to require an HTTP Basic Auth login for every request.

This is only real protection if the instance is reached over TLS (e.g. behind a reverse proxy like Caddy, nginx, or Traefik terminating HTTPS) — over plain HTTP, Basic Auth credentials travel unencrypted on every request, which defeats the point. It's also a single shared credential with no lockout on repeated failures, so it suits personal/family use rather than anything internet-facing at scale; pair it with rate-limiting at the reverse-proxy layer if it's reachable from the open internet.
