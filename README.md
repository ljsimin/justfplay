# justfplay

A simple web-based MP3/MP4/WebM player for your own music and video collection. Browse folders, see tags and cover art, search, and stream tracks straight from the browser — no accounts, no uploads.

## Setup

1. Copy the example config and edit it:

   ```
   cp .env.example .env
   ```

   - `MUSIC_PATH` — path on this machine to your music folder (subfolders are supported)
   - `HOST_PORT` — port to reach justfplay on (default `3000`)
   - `SITE_TITLE` — text shown as the page title (default `justfplay`)

2. Start it:

   ```
   docker compose up -d --build
   ```

3. Open `http://<this-machine>:<HOST_PORT>` in a browser.

`.mp3`, `.mp4`, and `.webm` files are picked up, and can be freely mixed within the same folder; other formats (including `.m4a`) are ignored. Adding or removing files under `MUSIC_PATH` is detected automatically within a few minutes — no restart needed.

## Using it

- Click a folder to open it; use the breadcrumbs at the top to go back up.
- Click a track to play it. When it finishes, the next track in the same folder plays automatically.
- Use the search box to find a track by title, artist, album, or filename across your whole library.
- The player bar at the bottom has play/pause, seek, previous/next, and volume — it controls video tracks too, which play in a video area above the listing.
- Reloading the page picks up where you left off (paused, ready to resume).

Works on both desktop and mobile browsers.
