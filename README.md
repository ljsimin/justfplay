# justfplay

A simple web-based MP3/MP4/WebM player for your own music and video collection. Browse folders, see tags and cover art, search, and stream tracks straight from the browser — no accounts, no uploads.

## Setup

1. Copy the example config and edit it:

   ```
   cp .env.example .env
   ```

   - `MUSIC_PATH` — path on this machine to your music folder (subfolders are supported)
   - `MUSIC_PATH_2`, `MUSIC_PATH_3`, `MUSIC_PATH_4` — optional additional folders, e.g. music kept on a different drive. All configured folders are mixed together into one library as if they were a single root directory: same-named folders merge, and tracks from every folder show up side by side. Leave blank if you only have one folder; if you need more than four, add extra `volumes:`/`MUSIC_DIR` entries directly in `docker-compose.yml` following the existing pattern.
   - `HOST_PORT` — port to reach justfplay on (default `3000`)
   - `SITE_TITLE` — text shown as the page title (default `justfplay`)

2. Start it:

   ```
   docker compose up -d --build
   ```

3. Open `http://<this-machine>:<HOST_PORT>` in a browser.

`.mp3`, `.mp4`, and `.webm` files are picked up, and can be freely mixed within the same folder; other formats (including `.m4a`) are ignored. Adding or removing files under any configured music folder is detected automatically within a few minutes — no restart needed. If your music folder is a network mount (e.g. CIFS/SMB) and changes take longer than that to show up, it's usually the mount's own directory-attribute caching, not justfplay — you can force an immediate rescan without restarting the container by running `curl -X POST http://<this-machine>:<HOST_PORT>/rescan`.

## Using it

- Click a folder to open it; use the breadcrumbs at the top to go back up.
- Click a track to play it. When it finishes, the next track in the same folder plays automatically.
- Use the search box to find a track by title, artist, album, or filename across your whole library.
- The player bar at the bottom has play/pause, seek, previous/next, and volume — it controls video tracks too, which play in a video area above the listing.
- Reloading the page picks up where you left off (paused, ready to resume).

Works on both desktop and mobile browsers.

## Installing it

justfplay is an installable web app. On Chrome/Edge (desktop or Android), look for an "Install"/"Add to Home Screen" option in the browser's menu or address bar; on iOS Safari, use Share → "Add to Home Screen". Installed, it opens full-screen in its own window/icon, no browser chrome.

Note: Chrome/Edge only offer the install option over a secure context — `https://` or `localhost`. If you're reaching justfplay over plain `http://` at a LAN IP (the default setup above), install will work when browsing from the same machine (`http://localhost:<HOST_PORT>`) but not from other devices unless you put justfplay behind HTTPS (e.g. a reverse proxy). iOS Safari's "Add to Home Screen" isn't affected by this and works either way.
