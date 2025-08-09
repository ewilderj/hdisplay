# hdisplay

A lightweight display system for a 1280×400 USB monitor (or any browser) with a simple local server and CLI. Shows HTML content, notifications, templates (animated marquee, image/video carousel), and supports asset uploads and instant push of media.

## Features
- Local Express server with real-time updates via WebSocket
- Fullscreen browser client (Chromium kiosk on Raspberry Pi)
- CLI for control (status, set HTML, notify, templates)
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

## Quick Start
1. Install dependencies
   - npm install
2. Start the server (default: http://localhost:3000)
   - npm start
3. Preview (macOS optional)
   - ./scripts/mac-preview.sh
4. Discover and set CLI target (on the same LAN)
   - node cli/index.js discover --set
5. Check server status
   - node cli/index.js status

## Displaying Content
- Set raw HTML
  - node cli/index.js set '<b>Hello</b>'
- Send a notification (auto-dismiss)
  - node cli/index.js notify 'Heads up' -l warn -d 2000
- Clear display
  - node cli/index.js clear

## Templates
Templates live in `templates/` and are applied via the API or CLI with data.

- List templates
  - node cli/index.js templates
- Apply a template with data (JSON)
  - node cli/index.js template message-banner --data '{"title":"Hello","subtitle":"World"}'

### Animated marquee (scrolling text)
- CLI (preferred velocity in pixels/second)
  - node cli/index.js show:marquee --text 'Hello world' --velocity 120
- Legacy (seconds per loop)
  - node cli/index.js show:marquee --text 'Legacy speed' --speed 12

Notes:
- Velocity is objective: higher = faster, independent of text length.
- Starts fully offscreen on the right and exits fully on the left, auto-resizes.

### Image/Video carousel
You can pass either `/uploads/...` paths or absolute `http(s)://` URLs; both work, and you can mix them in one list.
- CLI
  - Using uploaded files served by this server
    - node cli/index.js show:carousel --items '["/uploads/a.jpg","/uploads/b.mp4","/uploads/c.jpg"]' --duration 3000
  - Using absolute/remote URLs (you can mix with uploads)
    - node cli/index.js show:carousel --items '["http://localhost:3000/uploads/a.jpg","https://picsum.photos/seed/alpha/1280/400","https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"]' --duration 4000

Notes:
- Sources can be either:
  - Paths under `/uploads` (e.g., `/uploads/xyz.jpg`) served by this server
  - Absolute `http(s)://` URLs to remote content
- Relative paths starting with `/` are resolved against the display server origin.
- You can mix uploads and URLs in the same carousel.
- Videos play while visible.
- `--duration` is per-slide time in ms.

### Message banner
- CLI
  - node cli/index.js template message-banner --data '{"title":"hdisplay","subtitle":"example banner"}'

### Snake (auto-play)
- CLI
  - node cli/index.js template snake --data '{"cellSize":20,"tickMs":100}'
- Notes
  - Auto-plays with safe pathing; optional wrap mode via data `{ "wrap": true }`.

### TimeLeft (meeting countdown)
- CLI
  - node cli/index.js template timeleft --data '{"minutes":15,"label":"Time left"}'
  - node cli/index.js template timeleft --data '{"minutes":135,"label":"Time left","theme":{"labelColor":"#fff"}}'
- Rules
  - >90 minutes shows `Hh Mm`; otherwise `Xm`
  - Color thresholds: >8 green, >4 amber, ≤4 red (value only); label uses `theme.labelColor` (default white)

## Assets & Media
### Upload and show
- Upload a file (returns a URL under `/uploads/...`)
  - node cli/index.js assets:upload ./examples/banner.svg
- List uploaded assets
  - node cli/index.js assets:list
- Display an uploaded image
  - node cli/index.js show:image http://localhost:3000/uploads/<filename>
- Display a video
  - node cli/index.js show:video http://localhost:3000/uploads/<filename>
- Delete an upload
  - node cli/index.js assets:delete <filename>

### Push and display immediately (no persistence by default)
- Image from local file (served from memory)
  - node cli/index.js push:image --file ./examples/banner.svg
- Image from URL
  - node cli/index.js push:image --url http://example.local/pic.jpg
- Persist to disk instead of in-memory (when using --file)
  - node cli/index.js push:image --file ./examples/banner.svg --persist
- Video (file or URL)
  - node cli/index.js push:video --url http://example.local/clip.mp4

Ephemeral files are kept in-memory for ~10 minutes by default.

## Discovery
- Advertised on LAN as mDNS service `_hdisplay._tcp`
- CLI to discover and set default target
  - node cli/index.js discover --set

## API Reference (Local)
- GET `/` – Display client
- GET `/api/status` – Current state
- POST `/api/content` – Body: `{ content: string }`
- POST `/api/notification` – Body: `{ message: string, duration?: number, level?: 'info'|'warn'|'error'|'success' }`
- POST `/api/clear`
- GET `/api/templates` – List templates and placeholders
- POST `/api/template/:id` – Body: `{ data?: object }`
- POST `/api/upload` – multipart form field `file`
- GET `/api/uploads` – List files `{ files: [{ name, url }] }`
- DELETE `/api/uploads/:name`
- POST `/api/push/image` – multipart `file` OR JSON `{ url }`, query/body `persist=true|false`
- POST `/api/push/video` – same as above
- GET `/ephemeral/:id` – Serve in-memory pushed content (short-lived)

## Raspberry Pi Setup (Debian/RPi OS)
On the Pi:
- curl -sSL https://raw.githubusercontent.com/ewilderj/hdisplay/main/scripts/setup-pi.sh | bash

This installs Node.js and Chromium, sets up the server as a systemd service, and configures Chromium to auto-launch in kiosk mode pointing at http://localhost:3000.

## Run with Docker

Build and run:
- docker build -t hdisplay .
- docker run --rm -p 3000:3000 \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/data:/app/data \
  --name hdisplay hdisplay

Docker quickstart (alternate port 3001):
- docker run --rm -d -p 3001:3000 \
  -v "$(pwd)/uploads:/app/uploads" \
  -v "$(pwd)/data:/app/data" \
  --name hdisplay-3001 hdisplay
- curl -fsS http://localhost:3001/healthz
- node cli/index.js config --server http://localhost:3001
- node cli/index.js show:marquee --text "Hello from Docker" --velocity 120
- node cli/index.js status
- macOS preview (optional): PORT=3001 ./scripts/mac-preview.sh

Notes:
- uploads/ and data/ are mounted as volumes so content and state persist across container restarts.
- If port 3000 is in use on your host, map another port (e.g., 3001:3000) and point the CLI to it.

Or with docker-compose (see docker-compose.yml):
- docker compose up --build

## Configuration
Environment variables:
- `PORT` – Server port (default 3000)
- `HDS_UPLOADS_DIR` – Uploads directory (default `<repo>/uploads`)
- `HDS_EPHEMERAL_TTL_MS` – Ephemeral in-memory file TTL in ms (default ~600k)

CLI config is stored at `~/.hdisplay.json` (set via `hdisplay config --server <url>` or discover `--set`).

## Development
- Start server: npm start
- Dev open browser (macOS): ./scripts/mac-preview.sh
- Run tests: npm test

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
