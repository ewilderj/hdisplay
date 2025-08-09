# Product Requirements Document: hdisplay

## Executive Summary
A lightweight display system for a 1280x400 USB monitor connected to a Raspberry Pi, featuring real-time content updates, animations, and remote control via CLI/API.

## System Architecture

### Components

1. **Display Client** (Raspberry Pi)
   - Chromium browser in kiosk mode
   - WebSocket client for real-time updates
   - Auto-recovery on connection loss
   - Runs on X11 (compatible with existing desktop environment)

2. **Display Server** 
   - Node.js + Express (excellent AI support, mature WebSocket ecosystem)
   - Socket.io for real-time bidirectional communication
   - Static file serving for web assets
   - RESTful API for content management
   - In-memory state management (no database required initially)

3. **CLI Tool**
   - Node.js-based CLI using Commander.js
   - Direct API communication
   - JSON/YAML config file support
   - Interactive and scriptable modes

## Technical Specifications

### Display Client (Browser)
- **Resolution**: 1280x400 fixed
- **Technology**: HTML5 + CSS3 + JavaScript (ES6+)
- **Framework**: Vanilla JS with Web Components for modularity
- **Features**:
  - WebSocket auto-reconnect
  - CSS animations and transitions
  - Canvas API for advanced graphics
  - Fullscreen API

### Server
- **Runtime**: Node.js 18+ 
- **Framework**: Express 4.x
- **Real-time**: Socket.io 4.x
- **Port**: 3000 (configurable)
- **Endpoints**:
  ```
  GET  /                    # Serves display client
  GET  /api/status          # Current display state
  POST /api/content         # Update content
  POST /api/notification    # Send notification
  GET  /api/templates       # List available templates
  POST /api/template/{id}   # Apply template
  WS   /socket             # WebSocket connection
  ```

### Playlist (Templates Rotation)

Goal: Allow a configurable playlist (runlist) of templates that the server rotates through automatically with a smooth transition. Default dwell per item is 20 seconds. Adding/removing items is possible via CLI/API. Legacy template activations remain supported and temporarily override the playlist.

Behavior
- Playlist is an ordered list of items: `{ id, data? }` referencing files in `templates/` with optional data payloads.
- Rotation:
   - If playlist has ≥ 2 items: rotate sequentially, each displayed for `delayMs` (default 20000 ms).
   - If playlist has exactly 1 item: render it and do not rotate/restart the same item.
   - If playlist is empty: do nothing; whatever content/template was last set via legacy methods remains until changed.
- Legacy override: Any template applied via existing methods (`POST /api/template/:id`, CLI `hdisplay template ...`, `set`, `push:*`) will
   - Immediately interrupt the current playlist item (playlist is retained in memory/persistence).
   - Remain on-screen for exactly `delayMs` (use current playlist delay), then the playlist resumes from the next item (wrap to start if at end).
   - If the playlist is empty, the override remains indefinitely (preserves legacy behavior).
- Transition: Crossfade between items (default 500 ms) implemented client-side. Outgoing content fades out while incoming fades in; swap occurs at fade start to avoid flicker. Transition duration should not reduce the effective dwell by more than 10% of `delayMs`.

State model (server)
- Persisted in `data/state.json` with existing fields:
   ```
   {
      ...,
      "playlist": {
         "delayMs": number,          // default 20000, min 2000, max 300000
         "items": [ { "id": string, "data"?: object } ],
         "active": boolean           // derived: true when items.length > 0
      }
   }
   ```
- Internal timers control dwell and are reset on playlist changes or overrides; timers should be `unref()` where appropriate.

Events (WebSocket)
- `playlist:update` – emitted on add/remove/clear/delay change.
- `content:update` – continues to fire on every playlist advance or override, as today.

API (sketch)
- `GET  /api/playlist` → `{ delayMs, items: [{id,data?}], active }`
- `PUT  /api/playlist` → replace entire playlist; body `{ delayMs?, items? }` (validates item ids + data via per-template validators)
- `POST /api/playlist/items` → append `{ id, data? }` (404 on unknown id; 400 on invalid data)
- `DELETE /api/playlist/items/:index` → remove by position
- `DELETE /api/playlist/items/by-id/:id` → remove first matching id
- `POST /api/playlist/delay` → body `{ delayMs }` clamped to [2000, 300000]

Edge cases
- Unknown template id → reject add/update with 404.
- Invalid data per validator → 400 with validator error.
- Template removed from disk → skip at runtime with warning; continue to next item.
- Empty playlist + override → override remains (legacy preserved).
- Single-item playlist → no self-rotation.
- Concurrent updates → last-writer-wins; dwell timer restarts.

Testing (high level)
- API correctness for list/add/remove/clear/delay with validation.
- Rotation: 1 item stays; 2+ items rotate at ~`delayMs` and emit updates.
- Override pauses rotation for `delayMs`, then resumes at next item.
- Client crossfade smoke test (opacity over ~500 ms) with correct content swap.

### CLI Tool
- **Commands**:
  ```bash
   hdisplay status                             # Show current display state
   hdisplay set <content>                      # Set static HTML content
   hdisplay notify <message> [--duration]      # Send notification
      hdisplay templates                          # List available templates
   hdisplay template <name> \
      [--data <json> | --data-file <path> | --data -]   # Apply template with data from JSON/file/stdin
   hdisplay clear                                      # Clear display & notification
   hdisplay config [--server]                          # Configure server URL

   # Media and content helpers (aliases for clarity)
   hdisplay push:image --url <url>
   hdisplay push:video --url <url>
   hdisplay push:image [--file <path> | --url <url>] [--persist]
   hdisplay push:video [--file <path> | --url <url>] [--persist]
   hdisplay assets:upload <file>                       # Upload a file and get its URL
   hdisplay assets:list                                # List uploaded files
   hdisplay assets:delete <filename>                   # Delete an uploaded file

   # Convenience templates
   hdisplay template animated-text --data '{"text":"Hello","velocity":120}'
   hdisplay template carousel --data '{"items":["url1","url2"],"duration":4000}'

   # Discovery
   hdisplay discover [--set] [--timeout <ms>] [--json] [--non-interactive]

   # Playlist controls
   hdisplay playlist:list                              # Show playlist items and delay
   hdisplay playlist:add <id> [--data <json>|--data-file <path>]   # Append entry
   hdisplay playlist:remove <index|id>                 # Remove by position or first matching id
   hdisplay playlist:clear                             # Remove all items
   hdisplay playlist:delay <ms>                        # Set dwell per item (2000–300000)
  ```

#### Global Options and UX
- Global flags available to all commands:
   - `--server <url>`: one-off override of server URL (precedence: flag > env > config > default).
   - `--timeout <ms>`: request timeout (defaults reasonable for LAN).
   - `--quiet`: reduce non-essential output; errors still printed to stderr.
- Environment variables:
   - `HDISPLAY_SERVER` as an alternative to config file for server URL.
- Config precedence: flag > env > config file (~/.hdisplay.json) > default (`http://localhost:3000`).

#### Data/Input Modes
- Template data can be provided via:
   - `--data '{"k":"v"}'` (inline JSON)
   - `--data-file ./data.json` (reads from file)
   - `--data -` (reads JSON from stdin)
   - On parse error, CLI prints a concise message and exits with non-zero code.

 

#### Discovery UX
- `discover` prints all found servers. If multiple:
   - Interactive chooser by default; `--non-interactive` selects the first.
   - `--set` persists the chosen server to `~/.hdisplay.json`.

#### Exit Codes
- `0` on success; `1` on errors (network, validation, HTTP 4xx/5xx). Reserved codes may be added later for specific classes.

#### Schema-aware template flags (no JSON) — Proposal
Goal: make `hdisplay template <id>` ergonomic without hand-typing JSON. Map CLI flags directly onto the template’s data object, using light type inference.

Scope (MVP)
- Keys map 1:1 to flags: `data.foo` ⇔ `--foo <value>`.
- Arrays of primitives via repeated flags: `--items A --items B` ⇔ `data.items = ["A","B"]`.
- Nested objects via dot notation: `--theme.bg '#000'` ⇔ `data.theme.bg = "#000"`.
- Booleans via presence/negation: `--wrap` ⇔ `true`, `--no-wrap` ⇔ `false`.
- Numbers auto-parsed: `--velocity 120` ⇔ `data.velocity = 120`.
- Strings kept as-is (quotes optional; shell quoting rules still apply).

Syntax rules
- Flag name normalization: kebab- or camel-case map to camelCase in data (`--font-family` or `--fontFamily` ⇒ `data.fontFamily`).
- Dot-path builds nested objects: `--a.b.c 1` ⇒ `{ a: { b: { c: 1 } } }`.
- Repeated flags accumulate into arrays (array created on second occurrence).
- Mixed single + repeated: the first scalar becomes the first array element when a repeat occurs.
- Explicit array indices not supported (no `--items[0]`). Arrays of objects out of scope for MVP.

Type inference
- Value `true|false` (case-insensitive) parsed as boolean only when supplied as a value (not presence).
- Integers/floats parsed as numbers; otherwise leave as string.
- If a value begins with `{` or `[` and parses as JSON, accept it (escape hatch for complex shapes).

Error handling
- Unknown flags are forwarded as data and validated server-side by per-template validators.
- If both `--foo` and `--no-foo` are provided, last one wins.
- If numeric parsing fails, value remains a string; server validator returns a clear error.

Help and discoverability
- `hdisplay templates` continues to list placeholders. Add short per-template usage examples to README and optionally `--help`.
- Future: extend `GET /api/templates` to include type hints so CLI can render richer help (flag suggestions).

Examples
- Animated text
   - Today (JSON): `hdisplay template animated-text --data '{"text":"Hello","velocity":120}'`
   - No-JSON: `hdisplay template animated-text --text 'Hello' --velocity 120`

- Carousel (array of URLs)
   - Today (JSON): `--data '{"items":["url1","url2"],"duration":4000}'`
   - No-JSON: `hdisplay template carousel --items url1 --items url2 --duration 4000`

- TimeLeft (nested theme)
   - Today (JSON): `--data '{"minutes":90,"theme":{"bg":"#000"}}'`
   - No-JSON: `hdisplay template timeleft --minutes 90 --theme.bg '#000'`

- WebP loop (booleans)
   - `hdisplay template webp-loop --url /uploads/anim.webp --fit contain --rendering pixelated`
   - or `hdisplay template webp-loop --url /uploads/anim.webp --pixelated` (boolean true)

Compatibility and precedence
- All existing data modes remain supported.
- Precedence when mixed for `template <id>`: flags (`--foo`, `--items`) override inline/file/stdin JSON (`--data*`), which override server defaults.

Implementation plan (CLI)
- For `template <id>` only, collect unknown options into a map without failing.
- Normalize names (kebab/camel → camelCase), build dot-path objects, coerce booleans (presence toggles), parse numbers, optionally parse JSON when value begins with `{` or `[`.
- Aggregate repeated flags into arrays.
- Merge with any provided JSON (`--data*`), with flag-data winning.
- POST to `/api/template/:id` as today; rely on existing validators.

Out of scope (MVP)
- Arrays of objects (e.g., `[{ url, duration }]`). If needed later, consider `--items-json` or repeated grouped prefixes like `--item.url`/`--item.duration` with an index.
- Rich enum validation on the CLI (keep on server).

## Content Types

1. **Static HTML** - Direct HTML/CSS content
2. **Templates** - Predefined layouts with variable data
3. **Notifications** - Temporary overlays with auto-dismiss
4. **Media** - Images, videos, animated GIFs
5. **Charts** - Real-time data visualization

## Development Setup

### Directory Structure
```
hdisplay/
├── server/
│   ├── index.js           # Express server
│   ├── api/               # API routes
│   ├── sockets/           # WebSocket handlers
│   └── public/            # Static files
│       ├── index.html     # Display client
│       ├── app.js         # Client JavaScript
│       └── styles.css     # Base styles
├── cli/
│   ├── index.js           # CLI entry point
│   └── commands/          # Command implementations
├── templates/             # Display templates
├── scripts/
│   ├── setup-pi.sh        # Raspberry Pi setup
│   └── dev-server.sh      # Development server
└── examples/              # Example content
```

### Installation Process

#### Raspberry Pi Setup
```bash
# One-line installer
curl -sSL https://raw.githubusercontent.com/ewilderj/hdisplay/main/scripts/setup-pi.sh | bash
```

This script will:
1. Install Node.js and Chromium
2. Configure Chromium kiosk mode
3. Set up systemd service for auto-start
4. Configure display resolution
5. Install and start hdisplay server

#### Mac Development Setup
```bash
# Clone and install
git clone https://github.com/ewilderj/hdisplay.git
cd hdisplay
npm install
npm run dev  # Starts server + opens browser at 1280x400
```

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [x] Repository setup
- [x] Basic Express server
- [x] WebSocket connection
- [x] Simple HTML display client
- [x] Basic CLI with set/clear commands

### Phase 2: Content Management (Week 2)
- [x] Template system
- [x] Notification overlay
- [x] Enhanced CLI commands

### Phase 3: Polish & Features (Week 3)
- [x] Animations and transitions (initial via templates)
- [x] Error recovery (basic: socket.io auto-reconnect, state persistence)
- [x] Configuration management (CLI config + env)
- [x] Example templates and content

### Phase 4: Raspberry Pi Integration (Week 4)
- [x] Setup script
- [x] Systemd service
- [ ] Performance optimization
- [x] Documentation (initial)

## Testing Strategy

1. **Local Development** (Mac)
   - Browser window constrained to 1280x400
   - Mock data generators
   - Hot reload for rapid iteration

2. **Integration Testing**
   - Docker container for CI/CD
   - Automated browser testing with Playwright
   - API endpoint testing

3. **Hardware Testing**
   - Real Raspberry Pi validation
   - Performance monitoring
   - Long-running stability tests

## Performance Requirements

- **Startup Time**: < 10 seconds from power-on
- **Update Latency**: < 100ms for content changes
- **Memory Usage**: < 200MB for server process
- **CPU Usage**: < 10% idle, < 30% during updates
- **Network**: Minimal bandwidth, WebSocket keep-alive

## Future Enhancements

- Multiple display support
- Mobile control app
- Plugin system for custom templates
- MQTT integration
- Home Assistant integration
- Authentication and multi-user support
- Cloud sync for configurations

## Success Metrics

- Display runs 24/7 without crashes
- Content updates are instantaneous
- Setup takes < 5 minutes
- Works identically on Mac and Raspberry Pi
- Community can easily create custom templates

## Template Specifications

For instructions on creating templates and writing validators, see `TEMPLATES.md`.

### Snake (auto-play)

Goal: Provide a high-contrast, kinetic visual using the classic Snake game that plays itself autonomously. No user input; the snake continuously seeks fruit and avoids self-collision. Suitable as an ambient animation for the 1280x400 display.

ID: snake

Type: Template (HTML + CSS + JS, Canvas2D rendering)

Apply: `POST /api/template/snake` with optional JSON `data` payload

Rendering and Layout
- Canvas 2D on black background. No external assets.
- Default cell size: 20px. Grid derived from viewport: widthCells=⌊1280/20⌋=64, heightCells=⌊400/20⌋=20.
- Responsive: recompute on resize; keep cells square; letterbox the canvas if needed to avoid fractional cells.
- Frame pacing: game tick every 100ms by default (10 FPS logical), render at requestAnimationFrame.

Gameplay Rules (Autonomous)
- Start: snake length 5, initial heading right, spawn at grid center.
- Fruit: one fruit at a time, placed uniformly at random on any free cell (not on snake).
- Movement: on each tick the head advances by one cell; when eating fruit, grow by 1 and increment score; otherwise remove tail.
- Walls: solid by default (collision = game over). Optional wrap mode via config.
- Auto-play AI: deterministic, safe-first policy.
   - Primary: shortest-path to fruit using BFS on the current grid (obstacle = snake body). Recompute each tick.
   - Fallback safety: if no safe path exists (or would create a trap), follow a precomputed Hamiltonian-like traversal pattern that visits all cells cyclically until a safe BFS appears again. This guarantees no self-collision while circling.
- Game over: if collision occurs, auto-restart after 1s and reset score.

Data Schema (placeholders)
```
{
   "cellSize": number,         // px, default 20, min 8, max 40
   "tickMs": number,           // game tick in ms, default 100 (higher = slower)
   "wrap": boolean,            // default false; true enables toroidal wrapping
   "seed": number,             // optional RNG seed for reproducibility
   "colors": {
      "bg": string,             // CSS color, default "#000"
      "snake": string,          // default "#00ff6a"
      "snakeHead": string,      // default "#9cffce"
      "fruit": string,          // default "#ff3366"
      "grid": string            // optional subtle grid line, default "transparent"
   },
   "hud": {
      "showScore": boolean,     // default true
      "position": "left|center|right" // default right
   }
}
```

Visual/HUD
- Minimal HUD showing score and speed on the top-right by default. Use device pixel ratio for crisp text.
- Optional subtle grid lines at low alpha to fit brand aesthetic.

Performance Constraints
- Maintain smooth animation on Raspberry Pi: avoid per-frame allocations; reuse arrays.
- BFS limited to grid (≤ 64×20 by default) is fast; throttle to once per tick.
- Precompute a Hamiltonian-ish path once per grid; store as indexable sequence.

Edge Cases and Safety
- If grid is too small to place a fruit (snake occupies all cells), auto-restart.
- If cellSize doesn’t divide viewport cleanly, center canvas and clamp to whole cells.
- If tickMs < 30ms, cap to 30ms to avoid CPU spikes on Pi.

API Examples
- CLI: `hdisplay template snake --data '{"cellSize":20,"tickMs":100}'`
- HTTP: `POST /api/template/snake` body `{ "data": { "wrap": true, "colors": { "snake": "#39e" } } }`

Success Criteria
- Never freezes or self-collides while in fallback traversal.
- Continuous motion with stable CPU on Pi (<30% during updates).
- Template loads with no external dependencies and recovers after resize.

### TimeLeft (meeting countdown)

Goal: Provide a friendly, high-visibility reminder showing how much time remains in the current meeting. The client sends the time left in minutes; minutes-only display with simple color coding.

ID: timeleft

Type: Template (HTML + CSS + JS, lightweight; no external deps required)

Apply: `POST /api/template/timeleft` with JSON `data` payload

Input/Data Schema (placeholders)
```
{
   "minutes": number,        // required; whole minutes left
   "theme": {
      "bg": string,           // CSS color; default "#000"
      "green": string,        // default "#2ecc71"
      "amber": string,        // default "#ffbf00"
      "red": string,          // default "#ff3b30"
      "text": string,         // optional; default auto = use same as state color
      "fontFamily": string    // optional; default "'Dot Matrix', system-ui, sans-serif" (fallbacks ok)
   },
   "label": string           // optional; small friendly caption, e.g., "Time left"
}
```

Display Rules
- Formatting:
   - If minutes > 90, display as hours and minutes: e.g., `2h 15m`.
   - Otherwise, display minutes only: `12m`.
- Colors (priority by thresholds of current remaining time):
   - > 8 minutes: green
   - > 4 minutes: amber
   - ≤ 4 minutes: red
- Layout: Large, centered digits sized to the 1280×400 viewport. Minimal chrome. Optional friendly label above or below in smaller type.
- Font: Use a dot-matrix style if available (via fontFamily). If the specific face isn’t available, fall back to system fonts while keeping letter-spacing to suggest an LED display.

Behavior
- Stateless render: no internal countdown, no seconds, and no animations/transitions. To update the display, the client re-applies the template with a new `minutes` value.
- When minutes ≤ 0, clamp display to `0m` and keep the red color.

Accessibility & Performance
- High contrast text; avoid thin strokes.
- No per-frame allocations; update DOM only when values change.
- Resize-aware: keep the main value scaled and centered on window resize.

Examples
- CLI: `hdisplay template timeleft --data '{"minutes":15}'`
- HTTP: `POST /api/template/timeleft` body `{ "data": { "minutes": 3, "theme": { "bg": "#000" } } }`

Success Criteria
- Correct formatting (hours+minutes when >90m; minutes otherwise).
- Color selection matches thresholds (>8 green, >4 amber, ≤4 red).
- Visible at a glance on 1280×400; reads comfortably from a distance.