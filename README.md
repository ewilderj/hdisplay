# hdisplay

Control a browser-based display with a friendly CLI. Built for 1280×400 USB monitors, works in any modern browser.

## Table of contents
- What is hdisplay? (below)
- [Highlights](#highlights)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Using the CLI](#using-the-cli)
- [Templates](#templates)
  - [Template data input](#template-data-input)
  - [Animated marquee](#animated-marquee-scrolling-text)
  - [Image/Video carousel](#imagevideo-carousel)
  - [WebP loop](#webp-loop-animated-webp)
  - [Message banner](#message-banner)
  - [Snake](#snake-auto-play)
  - [TimeLeft](#timeleft-meeting-countdown)
- [Playlists](#playlists)
- [Assets & media](#assets--media)
  - [Upload and show](#upload-and-show)
  - [Push and display immediately](#push-and-display-immediately-no-persistence-by-default)
- [Discovery](#discovery)
- [Run with Docker](#run-with-docker)
- [Raspberry Pi setup](#raspberry-pi-setup-debianrpi-os)
- [Configuration](#configuration)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Appendix: API (optional)](#appendix-api-optional)
- [Development](#development)
- [Testing](#testing)
- [License](#license)

## Highlights
- Real-time updates to a fullscreen browser display (Chromium kiosk on Raspberry Pi supported)
- Simple CLI for control (status, set HTML, notifications, templates)
- Templates:
  - Animated scrolling text (velocity-based)
  - Image/video carousel with fade transitions (uploads and URLs)
  - Message banner (title/subtitle)
  - Snake (auto-play, ambient)
  - TimeLeft (meeting minutes remaining)
- Assets & media:
  - Upload/download/delete files under `/uploads`
  - Push image/video from file or URL and display immediately (ephemeral, no disk write unless requested)
- Discovery on LAN via mDNS (`_hdisplay._tcp`)
- Mac preview helper to open a 1280×400 window quickly

## Requirements
- Node.js >= 18
- macOS or Linux (Raspberry Pi OS/Debian supported)

## Quick start
1. Install dependencies
```bash
npm install
```
2. Start the server (default: http://localhost:3000)
```bash
npm start
```
3. Preview (macOS optional)
```bash
./scripts/mac-preview.sh
```
4. Discover and set CLI target (on the same LAN)
Install the CLI command (one-time, from the repo root):
```bash
npm link
```
Then:
```bash
hdisplay discover --set
```
5. Check server status
```bash
hdisplay status
```

## Using the CLI
The CLI is the primary way to control the display. Most actions are single commands.
- Set raw HTML
```bash
hdisplay set '<b>Hello</b>'
```
- Send a notification (auto-dismiss)
```bash
hdisplay notify 'Heads up' -l warn -d 2000
```
- Clear display
```bash
hdisplay clear
```

## Templates
Built-in templates render common layouts. Apply them with the CLI and pass data.

Templates live in `templates/` if you want to author your own.

Authoring guide: see `TEMPLATES.md` for how to build templates and write validators.

- List templates
```bash
hdisplay templates
```
- Apply a template with data (JSON)
```bash
hdisplay template message-banner --data '{"title":"Hello","subtitle":"World"}'
```

### Template data input
Preferred: pass data with flags — no JSON required.
- Scalars: `--text "Hello"` → `{ text: "Hello" }`
- Numbers: `--velocity 120` → `{ velocity: 120 }`
- Arrays: repeat flags `--items A --items B` → `{ items: ["A","B"] }`
- Nested: dot paths `--theme.bg '#000'` → `{ theme: { bg: "#000" } }`
- Booleans: `--wrap` = true, `--no-wrap` = false

Also supported (JSON):
- Inline: `--data '{"text":"Hello"}'`
- From file: `--data-file ./data.json`
- From stdin: `--data -` (reads JSON from stdin)

### Animated marquee (scrolling text)
```bash
hdisplay template animated-text --text "Hello world" --velocity 120
# or JSON
hdisplay template animated-text --data '{"text":"Hello world","velocity":120}'
```

Preview

https://github.com/ewilderj/hdisplay/raw/main/captures/videos/animated-text.mp4

Notes:
- Velocity is objective: higher = faster, independent of text length.
- Starts fully offscreen on the right and exits fully on the left, auto-resizes.

### Image/Video carousel
You can pass either `/uploads/...` paths or absolute `http(s)://` URLs; both work, and you can mix them in one list.
```bash
hdisplay template carousel \
  --items /uploads/a.jpg \
  --items /uploads/b.mp4 \
  --items /uploads/c.jpg \
  --duration 3000

hdisplay template carousel \
  --items http://localhost:3000/uploads/a.jpg \
  --items https://picsum.photos/seed/alpha/1280/400 \
  --items https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4 \
  --duration 4000

# or JSON
hdisplay template carousel --data '{"items":["/uploads/a.jpg","/uploads/b.mp4","/uploads/c.jpg"],"duration":3000}'
```

Preview

https://github.com/ewilderj/hdisplay/raw/main/captures/videos/carousel.mp4

Notes:
- Sources can be either:
  - Paths under `/uploads` (e.g., `/uploads/xyz.jpg`) served by this server
  - Absolute `http(s)://` URLs to remote content
- Relative paths starting with `/` are resolved against the display server origin.
- You can mix uploads and URLs in the same carousel.
- Videos play while visible.
- `--duration` is per-slide time in ms.

### Message banner
```bash
hdisplay template message-banner --title "hdisplay" --subtitle "example banner"
# or JSON
hdisplay template message-banner --data '{"title":"hdisplay","subtitle":"example banner"}'
```

Preview

https://github.com/ewilderj/hdisplay/raw/main/captures/videos/message-banner.mp4

### WebP loop (animated WebP)
```bash
hdisplay template webp-loop --url /uploads/your_anim.webp --fit cover --position "50% 50%"
```
Options
- url (required): path under /uploads or absolute URL to a .webp
- fit (optional): "cover" (default) or "contain"
- position (optional): CSS object-position (e.g., "50% 50%", "top left")
- rendering/pixelated (optional): set `rendering:"pixelated"` or `pixelated:true` to use blocky scaling for low-res sources

Examples
```bash
# Contain and keep center, pixelated upscale
hdisplay template webp-loop --url /uploads/anim.webp --fit contain --position "50% 50%" --rendering pixelated

# Default smooth scaling
hdisplay template webp-loop --url /uploads/anim.webp

# or JSON
hdisplay template webp-loop --data '{"url":"/uploads/anim.webp","fit":"contain","position":"50% 50%","rendering":"pixelated"}'
```

Preview

https://github.com/ewilderj/hdisplay/raw/main/captures/videos/webp-loop.mp4

### Snake (auto-play)
```bash
hdisplay template snake --cellSize 20 --tickMs 100
# or JSON
hdisplay template snake --data '{"cellSize":20,"tickMs":100}'
```
Notes
- Auto-plays with safe pathing; optional wrap mode via data `{ "wrap": true }`.

Preview

https://github.com/ewilderj/hdisplay/raw/main/captures/videos/snake.mp4

### TimeLeft (meeting countdown)
```bash
hdisplay template timeleft --minutes 15 --label "Time left"
hdisplay template timeleft --minutes 135 --label "Time left" --theme.labelColor "#fff"
# or JSON
hdisplay template timeleft --data '{"minutes":15,"label":"Time left"}'
hdisplay template timeleft --data '{"minutes":135,"label":"Time left","theme":{"labelColor":"#fff"}}'
```
Rules
- >90 minutes shows `Hh Mm`; otherwise `Xm`
- Color thresholds: >8 green, >4 amber, ≤4 red (value only); label uses `theme.labelColor` (default white)

Preview

https://github.com/ewilderj/hdisplay/raw/main/captures/videos/timeleft.mp4

## Playlists
Create a rotating sequence of templates. The server plays items in order, loops, and persists across restarts. Applying a one-off template or push temporarily overrides playback; rotation resumes automatically.

- Show current playlist and dwell time
```bash
hdisplay playlist:list
```

- Add items (mix different templates)
```bash
hdisplay playlist:add carousel --data '{"items":["https://picsum.photos/id/1015/1280/400","https://picsum.photos/id/1022/1280/400"],"duration":4000}'
hdisplay playlist:add animated-text --data '{"text":"Welcome to the lab","velocity":120}'
hdisplay playlist:add message-banner --data '{"title":"Meeting","subtitle":"Room A"}'
```

- Remove by index or by id (first match)
```bash
hdisplay playlist:remove 0
hdisplay playlist:remove animated-text
```

- Clear all items
```bash
hdisplay playlist:clear
```

- Set dwell per item (ms)
```bash
hdisplay playlist:delay 5000
```

Notes
- Rotation auto-starts when the playlist has items.
- `hdisplay clear` also clears the playlist and stops rotation.
- Data for each item is validated by the template’s validator.

## Assets & Media
Use uploads when you want media persisted on disk and accessible under `/uploads`. Use push for one-off, immediate display without writing to disk.
### Upload and show
- Upload a file (returns a URL under `/uploads/...`)
```bash
hdisplay assets:upload ./examples/banner.svg
```
- List uploaded assets
```bash
hdisplay assets:list
```
- Display an uploaded image or video by pushing a URL
```bash
hdisplay push:image --url http://localhost:3000/uploads/<filename>
hdisplay push:video --url http://localhost:3000/uploads/<filename>
```
- Delete an upload
```bash
hdisplay assets:delete <filename>
```

### Push and display immediately (no persistence by default)
```bash
# Image from local file (served from memory)
hdisplay push:image --file ./examples/banner.svg

# Image from URL
hdisplay push:image --url http://example.local/pic.jpg

# Persist to disk instead of in-memory (when using --file)
hdisplay push:image --file ./examples/banner.svg --persist

# Video (file or URL)
hdisplay push:video --url http://example.local/clip.mp4
```

Ephemeral files are kept in-memory for ~10 minutes by default.

## Discovery
Find the server on your LAN and set it as the default CLI target.
It advertises an mDNS service `_hdisplay._tcp`.
```bash
hdisplay discover --set
```

## Appendix: API (optional)
Most users only need the CLI. If you prefer HTTP, an unauthenticated local API mirrors the CLI. Use on trusted networks only.

- GET `/` – Display client
- GET `/api/status` – Current state
- POST `/api/content` – Body: `{ content: string }`
- POST `/api/notification` – Body: `{ message: string, duration?: number, level?: 'info'|'warn'|'error'|'success' }`
- POST `/api/clear`
- GET `/api/templates` – List templates and placeholders
- POST `/api/template/:id` – Body: `{ data?: object }`
- GET `/api/playlist` – Current playlist `{ items: Array<{ id, data }>, delayMs }`
- PUT `/api/playlist` – Replace playlist body `{ items: Array<{ id, data }>, delayMs? }`
- POST `/api/playlist/items` – Append `{ id, data? }`, returns `{ index }`
- DELETE `/api/playlist/items/:index` – Remove by index
- DELETE `/api/playlist/items/by-id/:id` – Remove first match by id
- POST `/api/playlist/delay` – Set dwell `{ delayMs }`
- POST `/api/upload` – multipart form field `file`
- GET `/api/uploads` – List files `{ files: [{ name, url }] }`
- DELETE `/api/uploads/:name`
- POST `/api/push/image` – multipart `file` OR JSON `{ url }`, query/body `persist=true|false`
- POST `/api/push/video` – same as above
- GET `/ephemeral/:id` – Serve in-memory pushed content (short-lived)

Notes
- POST `/api/clear` also clears the playlist and stops rotation.

## Raspberry Pi Setup (Debian/RPi OS)
On the Pi:
- curl -sSL https://raw.githubusercontent.com/ewilderj/hdisplay/main/scripts/setup-pi.sh | bash

This installs Node.js and Chromium, sets up the server as a systemd service, and configures Chromium to auto-launch in kiosk mode pointing at http://localhost:3000.

### Systemd units and health checks
The setup script installs templated systemd units:
- hdisplay@<user>.service – runs the server as the specified user
- hdisplay-health@<user>.service & hdisplay-health@<user>.timer – runs a periodic health probe against /healthz

Health probe script: scripts/healthcheck.sh

Manual management examples:
- sudo systemctl status hdisplay@pi.service
- sudo systemctl restart hdisplay@pi.service
- sudo systemctl status hdisplay-health@pi.timer
- sudo systemctl list-timers | grep hdisplay-health

## Run with Docker

Build and run:
```bash
docker build -t hdisplay .
docker run --rm -p 3000:3000 \
  -v "$(pwd)/uploads:/app/uploads" \
  -v "$(pwd)/data:/app/data" \
  --name hdisplay hdisplay
```

Docker quickstart (alternate port 3001):
```bash
docker run --rm -d -p 3001:3000 \
  -v "$(pwd)/uploads:/app/uploads" \
  -v "$(pwd)/data:/app/data" \
  --name hdisplay-3001 hdisplay

curl -fsS http://localhost:3001/healthz
hdisplay config --server http://localhost:3001
hdisplay template animated-text --text "Hello from Docker" --velocity 120
hdisplay status
# macOS preview (optional)
PORT=3001 ./scripts/mac-preview.sh
```

Notes:
- uploads/ and data/ are mounted as volumes so content and state persist across container restarts.
- If port 3000 is in use on your host, map another port (e.g., 3001:3000) and point the CLI to it.

Or with docker-compose (see docker-compose.yml):
```bash
docker compose up --build
```

## Configuration
Environment variables:
- `PORT` – Server port (default 3000)
- `HDS_UPLOADS_DIR` – Uploads directory (default `<repo>/uploads`)
- `HDS_EPHEMERAL_TTL_MS` – Ephemeral in-memory file TTL in ms (default ~600k)

CLI config is stored at `~/.hdisplay.json` (set via `hdisplay config --server <url>` or discover `--set`).

## Security
There is no built-in authentication, authorization, or TLS.

- Do not expose this service directly to the internet.
- Run on a trusted LAN or behind a firewall/reverse proxy.
- Anyone who can reach the server can change the display, upload files, and trigger playback.
- For remote access, put it behind a reverse proxy that adds HTTPS and authentication.

## Development
```bash
# Start server
npm start

# Dev open browser (macOS)
./scripts/mac-preview.sh

# Run tests
npm test
```

## Testing
Jest + Supertest covers the uploads API:
- Upload validation (missing file)
- Upload + list
- Static serving from `/uploads` and delete cleanup

## Troubleshooting
- CLI chalk error (TypeError chalk.red is not a function): fixed by using normalized import; ensure `npm install`.
- mDNS discovery issues: ensure same network, no firewall blocking multicast; server logs should print mDNS publish success.
- Server won’t start: check Node version (>= 18) and port availability (`PORT` in use?)
- mac-preview script: ensure Chrome app path or allow AppleScript for Safari.

## License
MIT
