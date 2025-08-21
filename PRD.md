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

#### Schema-aware template flags (no JSON) — Implemented

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

Status: Implemented for `template <id>` and `playlist:add`.

Implementation notes (CLI)

- Collect unknown options into a data map without failing (Commander.js unknown option passthrough for these commands).
- Normalize names (kebab/camel → camelCase), build dot-path objects, coerce booleans (presence toggles), parse numbers; escape hatch: if a value starts with `{` or `[` and parses as JSON, accept it.
- Aggregate repeated flags into arrays (arrays of primitives only).
- Merge with any provided JSON (`--data*`), with flag-data winning.
- Post to `/api/template/:id` as today and validate server-side; `playlist:add` packages `{ id, data }` likewise.
- Safeguard: reserved/global CLI flags are excluded from data; a test ensures templates don’t collide with reserved names.

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

### Capture & Preview Automation

To keep documentation up to date with real visuals, we use a black-box capture system:

- Tooling: Playwright (Chromium) drives the display client and records both screenshots and short videos per template.
- Profiles: per-template YAML files in `capture-profiles/` define readiness strategies, sample data, optional screenshot delay, video duration, and per-template trimming (`video.trim_ms`). Profiles override heuristic defaults.
- Orchestration: apply a template via API, wait for an externally observable ready signal (document title), then capture; a clear command is sent after each capture to avoid recording transitions.
- Video processing: Playwright records raw WebM; we transcode to VP9 WebM and H.264 MP4 using `ffmpeg`, trimming a small amount from the start (default 150ms; e.g., carousel uses 2000ms) to eliminate initial white flashes.
- Outputs: screenshots saved under `captures/screenshots/`, videos under `captures/videos/`. An HTML gallery can be generated for quick review.
- CLI: developer commands exist to capture all templates, a single template, or regenerate the gallery.

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

### Weather

Weather (3-day forecast)
Goal: Display a clean, glanceable 3-day weather forecast split into equal panels across the 1280×400 display. Shows today plus two future days with high/low temperatures, day names, and clear weather condition icons.

ID: weather

Type: Template (HTML + CSS + JS, uses OpenWeatherMap API)

Apply: POST /api/template/weather with JSON data payload

Rendering and Layout

Three equal panels (≈426px each) arranged horizontally
Each panel contains:

- Day name (e.g., "Today", "Tomorrow", or weekday name)
- Weather icon/graphic (large, centered)
- High/Low temperatures
- Optional: brief condition text (e.g., "Partly Cloudy")
  High contrast design optimized for readability at a distance
  Responsive to 1280×400 viewport with consistent spacing

Data Schema (placeholders)

```
{
   "location": string,         // required; city name, zip code, or lat,lon coordinates
   "units": "C" | "F",        // required; temperature units (Celsius or Fahrenheit)
   "apiKey": string,          // optional; OpenWeatherMap API key (falls back to server config)
   "theme": {
      "bg": string,            // CSS color; default "#000"
      "text": string,          // default "#fff"
      "accent": string,        // default "#00a8ff" (for highlights)
      "divider": string,       // default "rgba(255,255,255,0.1)" (panel separators)
      "fontFamily": string     // optional; default "system-ui, sans-serif"
   },
   "showConditionText": boolean,  // default true; show text description below icon
   "refreshInterval": number       // minutes between API updates; default 30, min 10, max 120
}
```

Weather Icons and Conditions

Use OpenWeatherMap icon codes mapped to high-contrast visuals:

- Clear (01d/01n): ☀️ or sun icon
- Few clouds (02d/02n): ⛅ or sun with cloud
- Scattered clouds (03d/03n): ☁️ or cloud icon
- Broken clouds (04d/04n): ☁️ or cloud icon
- Shower rain (09d/09n): 🌧️ or rain drops
- Rain (10d/10n): 🌧️ or rain drops
- Thunderstorm (11d/11n): ⛈️ or cloud with lightning
- Snow (13d/13n): ❄️ or snowflake
- Mist (50d/50n): 🌫️ or fog lines
  Icons should be large (≈120px) and centered in each panel
  Fallback to text description if icon rendering fails

Temperature Display

- Format: "72° / 58°" (with proper degree symbol)
- High temp in warmer color (default white or light)
- Low temp in cooler color (default gray or muted)
- Large, readable font size (≈32px for temps)

Day Labels

Today: "Today"
Tomorrow: "Tomorrow"
Day after: Full weekday name (e.g., "Wednesday")
Font size ≈24px, positioned at top of each panel

OpenWeatherMap Integration

Server-side API calls to protect API keys
Endpoints used:

- Geocoding: /geo/1.0/direct for city names
- Forecast: /data/2.5/forecast for 5-day/3-hour forecast data
  API key source priority:
- Template data apiKey field
- Server environment variable OPENWEATHERMAP_API_KEY
- Server config file config.apiKeys.openweathermap
- Cache results for refreshInterval minutes (default 30)
  Location resolution:
- City names: "San Francisco" or "San Francisco,CA,US" → geocode → forecast
- Zip codes: "94107" or "94107,US" → geocode → forecast
- Coordinates: "37.7749,-122.4194" → direct forecast lookup
  Data aggregation: Group forecast entries by day, extract min/max temps

Error Handling

Invalid location: Display "Location not found" message
Missing API key: Display "Weather API key required" message
API failure: Show cached data if available (within 2 hours), otherwise error state
Rate limiting (60 calls/minute, 1M calls/month): Cache aggressively, min refresh 10 minutes
Network timeout: 5 second timeout for API calls

Performance Considerations

Initial render with loading state while fetching
Smooth fade-in when data arrives (300ms)
Server-side caching shared across all clients
Client polls server for updates at refreshInterval
No direct API calls from browser

Examples

CLI:

```
hdisplay template weather --location "San Francisco" --units F
hdisplay template weather --location "London,UK" --units C --theme.bg "#1a1a2e"
hdisplay template weather --location "94107,US" --units F --refreshInterval 60
hdisplay template weather --location "37.7749,-122.4194" --units C
```

HTTP: `POST /api/template/weather` body:

```
{
  "data": {
    "location": "San Francisco,CA,US",
    "units": "F",
    "refreshInterval": 60
  }
}
```

Testing

Write tests that use mock API returns so an API key is not needed for testing.
Also write an E2E test that does need an API key.

Success Criteria

- Clean, readable 3-panel layout fits perfectly in 1280×400
- Temperature and conditions clearly visible from across a room
- Graceful error messages when API is unavailable or misconfigured
- Updates automatically at specified interval without flicker
- Supports both Celsius and Fahrenheit units
- Works with city names, zip codes, and coordinates
- Respects OpenWeatherMap rate limits through caching

### Aquarium Template Specification

An autonomous aquarium simulation featuring a variety of marine life with smooth, natural movement patterns. The template creates a serene underwater environment with realistic behaviors while maintaining visual appeal through clean, modern aesthetics.

Visual Design

Style: Elegant and refined, avoiding cartoon-like elements
Color palette: Deep ocean blues (#001f3f to #0074D9) with subtle gradients
Lighting: Caustic light patterns on the sea floor, gentle ambient glow
Particles: Occasional bubbles rising to surface, subtle floating particulates for depth
Marine Life Varieties

Fish Types (minimum 5 species)

School fish (e.g., neon tetras) - move in coordinated groups of 8-15
Angelfish - solo or pairs, graceful vertical swimming patterns
Bottom feeders (e.g., catfish) - stay near bottom, occasional darting
Predator fish (e.g., barracuda) - patrol territory, faster movement
Jellyfish - gentle pulsing motion, semi-transparent with glow effect

Other Creatures

Sea turtle - slow, majestic movement across entire screen
Octopus - color-changing camouflage, tentacle animation
Starfish - static on rocks/coral with subtle movement
Crab - sideways scuttling along bottom
Seahorse - vertical orientation, tail-wrapping behavior near plants

Behavioral Systems

Movement Patterns
* Flocking algorithm for school fish (cohesion, alignment, separation)
* Territorial zones for certain species
* Depth preferences (surface, mid-water, bottom dwellers)
* Speed variation based on species and context
* Smooth bezier curves for direction changes, no abrupt turns

Interactions
* Avoidance: Smaller fish flee from predators within proximity
* Schooling: Fish dynamically join/leave schools
* Feeding: Occasional food particles trigger gathering behavior
* Resting: Some fish pause near coral/rocks periodically

Environment Elements

Background Layers
* Far background: Dark gradient suggesting ocean depth
* Mid-ground: Coral reef silhouettes, rock formations
* Foreground: Detailed coral, swaying seaweed (subtle animation)
Dynamic Elements
* Light rays: Animated caustic patterns from surface
* Bubbles: Rise from random points, accelerate near surface
* Current simulation: Gentle horizontal drift affecting all creatures
* Day/night cycle: Optional ambient light shifting over time

Template parameters
```javascript
{
  // Population control
  fishCount: 30,           // Total creatures (distributed by species)
  schoolSize: 12,          // Fish per school
  diversity: 0.8,          // Species variety (0-1)
  
  // Behavior tuning  
  speed: 1.0,              // Global speed multiplier
  interactionRadius: 100,  // Pixel radius for creature awareness
  schoolingStrength: 0.7,  // Cohesion factor for schools
  
  // Visual settings
  bubbles: true,           // Enable bubble particles
  caustics: true,          // Enable light patterns
  dayNight: false,         // Enable day/night cycle
  cycleMinutes: 10,        // Day/night cycle duration
  
  // Color overrides
  colors: {
    water: '#001f3f',      // Base water color
    waterGradient: '#0074D9', // Gradient end color
    coral: '#FF851B',      // Coral/rock accent
    light: '#7FDBFF'       // Caustic light color
  },
  
  // Performance
  quality: 'high',         // 'low', 'medium', 'high' (affects particles, shadows)
  targetFPS: 30            // Frame rate target for older devices
}
```

Technical Implementation Notes

Rendering
* Canvas-based with requestAnimationFrame
* Layered rendering for depth (background → creatures → foreground → effects)
* Sprite-based creatures with CSS transforms for rotation
* GPU acceleration via CSS will-change for smooth movement

Performance Optimization
* Spatial partitioning for collision/interaction checks
* LOD system: Reduce detail for distant/numerous creatures
* Batch rendering: Group similar sprites
* Adaptive quality: Auto-adjust particle count based on frame rate

Autonomous Behaviors
* No user interaction required - fully self-running
* Emergent behaviors from simple rules create variety
* Periodic events (feeding time, turtle appearance) for interest
* Memory efficient - creature states use minimal properties

Accessibility Considerations
* Reduced motion mode: Slower, gentler movements
* High contrast option: Stronger silhouettes for visibility
* No flashing/strobing effects
* Smooth transitions prevent motion sickness

Example Usage

`hdisplay set aquarium --fishCount 40 --diversity 0.9 --bubbles --dayNight --cycleMinutes 5`

#### Aquarium Template Phased Implementation Plan
Phase 1: Pi-Optimized MVP
Goal: Functional aquarium with smooth performance on Raspberry Pi

Implementation

Canvas 2D rendering only (no WebGL/GPU features)
8-12 fish with simple shapes (ellipses for bodies, triangles for tails)
3 species with distinct behaviors:
* School fish (5-6) with basic flocking
* Solo swimmer with sine-wave pattern
* Bottom feeder with horizontal movement
Static gradient background with 2-3 coral silhouettes
Fixed 20-25 FPS target with frame skipping
Simple spatial grid (4x3) for neighbor checks
5-10 bubble particles with pooling

Performance Targets
* CPU usage < 25% on Pi 4
* Smooth animation at 1280x400
* No memory leaks over 24h runtime

Data Schema (MVP)


```javascript
{
  fishCount: 10,         // Conservative default
  schoolSize: 5,         // Small schools
  bubbles: true,         // Limited count
  quality: 'low',        // Pi default
  renderMode: 'canvas2d'
}
```
Phase 2: Enhanced Ecosystem


Goal: Richer variety and interactions without breaking Pi performance

Features
Additional creatures (15-20 total):
* Jellyfish with pulsing animation (2-3)
* Sea turtle (1, updates every 5th frame)
* Crab (1-2, bottom only)

Depth-based behaviors:
* Surface, mid-water, bottom zones
* Size scaling for depth perception

Simple day/night cycle (CSS filter on canvas)
Feeding event every 2-3 minutes (fish converge)
Improved flocking with collision avoidance

Optimizations
* LOD system: Distant fish update less frequently
* Staggered updates: Spread creature processing across frames
* Event queue: Handle interactions over multiple frames
* Auto-quality adjustment based on frame timing:

```javascript
// ...existing code...
let frameTime = 0;
const qualityLevels = {
  low: { fishCount: 10, bubbles: 5, updateRate: 1 },
  medium: { fishCount: 15, bubbles: 10, updateRate: 0.8 },
  high: { fishCount: 20, bubbles: 15, updateRate: 0.6 }
};

function adaptQuality() {
  if (frameTime > 50) { // Below 20 FPS
    currentQuality = 'low';
  } else if (frameTime < 35 && currentQuality !== 'high') { // Above 28 FPS
    currentQuality = 'medium';
  }
  applyQualitySettings(qualityLevels[currentQuality]);
}
```

Phase 3: Optional GPU Features (Progressive Enhancement)
Goal: Enhanced visuals when hardware permits, graceful degradation on Pi

Detection & Fallback

```javascript
// ...existing code...
const gpuAvailable = 'WebGLRenderingContext' in window && 
                    !navigator.userAgent.includes('Raspbian');
const features = {
  caustics: gpuAvailable,
  smoothPaths: gpuAvailable,
  glowEffects: gpuAvailable,
  maxFish: gpuAvailable ? 30 : 15,
  maxBubbles: gpuAvailable ? 50 : 10
};
```
Optional Features (auto-disabled on Pi)


Caustic light patterns (WebGL shader or CSS animation)
Smooth bezier paths for all fish movement
Glow effects on jellyfish (CSS filter)
Water distortion (subtle CSS transform)
Enhanced particles (50+ bubbles with size variation)
Shadow layers for depth

Performance Safeguards

Features test individually and disable if frame rate drops
Settings persist in localStorage with hardware fingerprint
Fallback always available (Phase 1 rendering)

Platform Defaults

```javascript
module.exports = function validate(data = {}) {
  const isPi = detectRaspberryPi(); // Via user agent or server flag
  
  const defaults = isPi ? {
    // Pi-optimized settings
    fishCount: 10,
    schoolSize: 5,
    diversity: 0.5,
    bubbles: true,
    caustics: false,
    dayNight: true,
    quality: 'low',
    targetFPS: 20
  } : {
    // Desktop/modern browser settings
    fishCount: 25,
    schoolSize: 10,
    diversity: 0.8,
    bubbles: true,
    caustics: true,
    dayNight: true,
    quality: 'auto',
    targetFPS: 30
  };
  
  return { ok: true, data: { ...defaults, ...data } };
};
```

Testing Matrix
```
Phase	Pi Zero W	Pi 3B+	Pi 4	Desktop
1 (MVP)	15 FPS	25 FPS	25 FPS	60 FPS
2 (Enhanced)	12 FPS	20 FPS	22 FPS	60 FPS
3 (GPU)	Disabled	Disabled	18 FPS*	60 FPS
```


### Mandelbrot Explorer

Goal: Showcase interesting regions of the Mandelbrot set in a looping, ambient visualization that crossfades between curated points of interest. Optimized to remain smooth on Raspberry Pi while looking crisp on desktop.

ID: mandelbrot

Type: Template (HTML + CSS + JS, Canvas2D; optional Web Worker for computation)

Apply: `POST /api/template/mandelbrot` with optional JSON `data` payload

Rendering and Layout

- Full-viewport Canvas 2D at 1280×400 with device-pixel-ratio awareness.
- Double-buffered crossfades: two stacked canvases, fade incoming over 2s while next view renders progressively.
- Optional subtle zoom per view (±5% over dwell) for liveliness without motion sickness.

Navigation & Transitions

- Dwell per view: default 10,000 ms (configurable).
- Transition: default 2,000 ms crossfade (configurable).
- Order: sequential by default; optional random shuffle.
- Resilience: if rendering of the next view is not yet “ready enough,” delay transition by up to 1s to avoid flashing low-quality frames.

Curated Points of Interest (default set)

Provide a built-in list of 8–12 varied regions; each has a center and nominal scale (approximate zoom), optionally an iteration hint:

1. Classic overview – bounds (−2.5..1, −1..1)
2. Seahorse Valley – center (−0.75, 0.10), scale 0.01
3. Elephant Valley – center (0.275, 0.007), scale 0.01
4. Triple Spiral – center (−0.088, 0.654), scale 0.005
5. Mini Mandelbrot – center (−0.7533, 0.1138), scale 0.002
6. Dendrite Forest – center (−0.7, 0.27015), scale 0.008
7. Spiral Galaxy – center (−0.7269, 0.1889), scale 0.0005
8. Lightning Branches – center (0.432539, 0.226118), scale 0.004
9. Jeweled Necklace – center (−1.25066, 0.02012), scale 0.006
10. Feather Tip – center (−0.748, 0.1), scale 0.008

Rendering Strategy

- Progressive passes: start at quarter-res, then half-res, then full-res as time allows during the dwell.
- Scanline or tile-based renderer: compute in horizontal bands or small tiles to show visible progress quickly.
- Adaptive iterations: base on zoom level and available time (e.g., 50–500); raise iterations as refinement increases.
- Smooth coloring: log-smoothed escape-time to eliminate banding.
- Optional Web Worker: offload pixel math when available; fall back to main thread if unsupported.

Data Schema (placeholders)

```
{
  // Timing
  "duration": 10000,          // ms per view, default 10000
  "transitionMs": 2000,       // crossfade duration in ms

  // Navigation
  "locations": "default",    // "default" | "custom"
  "shuffle": false,           // randomize order when true
  "zoom": false,              // gentle per-view zoom (±5%)

  // Appearance
  "colorScheme": "ocean",    // ocean | fire | forest | mono | rainbow
  "brightness": 1.0,          // display multiplier
  "contrast": 1.0,            // display multiplier

  // Performance
  "quality": "auto",         // low | medium | high | auto
  "maxIterations": 100,       // base iteration count (adapted at runtime)
  "progressive": true,        // enable progressive refinement

  // Custom locations (used when locations = "custom")
  "customLocations": [
    {
      "name": "Seahorse",
      "centerX": -0.75,
      "centerY": 0.10,
      "scale": 0.01,        // smaller = deeper zoom
      "iterations": 150     // optional per-location override
    }
  ]
}
```

Color Schemes

- ocean (blues/teals), fire (reds/oranges), forest (greens), mono (grayscale), rainbow (full spectrum). Allow per-pixel mapping via palette functions with smooth interpolation.

Performance & Adaptation (Pi-friendly)

- Target ≥10 FPS on Raspberry Pi 4 while refining; prefer visible progress over blocking the UI.
- Auto-quality: if a full-res pass exceeds budget (e.g., >100 ms per tile batch), reduce resolution or iterations for the next batch.
- Clamp antialiasing and heavy filter usage; prefer raw pixel writes via `putImageData` or `ImageData` buffers.
- Avoid per-pixel object allocations; reuse typed arrays.

Accessibility

- Reduced motion: when enabled, disable per-view zoom and shorten crossfade to 500 ms (or use hard cuts if requested).
- High contrast: optional palette presets with increased contrast.

Examples

```
# Default curated tour
hdisplay template mandelbrot

# Faster cycling with rainbow palette
hdisplay template mandelbrot --duration 5000 --colorScheme rainbow

# Custom deep-zoom location
hdisplay template mandelbrot --locations custom \
  --customLocations '[{"name":"Deep","centerX":-0.7269,"centerY":0.1889,"scale":0.00001,"iterations":300}]'

# Pi-optimized
hdisplay template mandelbrot --quality low --progressive false --maxIterations 50
```

Testing

- Ensure dwell ≈ duration and crossfades complete in transitionMs without dropping frames.
- Validate that progressive refinement never blocks input or transitions.
- Memory remains stable over 24h (no unbounded arrays or workers).

Success Criteria

- Smooth rotation through all default points of interest with clear visual detail.
- Crossfades are clean with no visible flicker or white flashes.
- Runs acceptably on Raspberry Pi 4 (≥10 FPS during refinement) and fluid on desktop.


## Self-Playing Pac-Man Template

### Overview
A self-playing Pac-Man game that runs autonomously in the browser, featuring Pac-Man navigating a maze to collect pellets while avoiding ghosts.

### Game Components

#### Maze
- **Size**: 19x21 grid
- **Generation**: Randomly generated using recursive backtracking
- **Symmetry**: Horizontally symmetric for visual balance
- **Connectivity**: Must be fully traversable with multiple paths between any two points
- **Loop Density**: At least 40% of potential connections should exist to create multiple routes and prevent trivial trapping
- **Wall Appearance**: Blue walls on black background
- **Border**: Solid walls around the entire perimeter

#### Pac-Man
- **Starting Position**: Center of the maze
- **Movement Speed**: 2.5 tiles per second
- **Behavior**: 
  - Uses A* pathfinding to navigate to the nearest pellet
  - Recalculates path when current target is consumed
  - When a ghost is within 4 tiles, switches to escape mode
  - In escape mode, evaluates all possible moves and chooses the one that maximizes distance from all nearby threats
  - Returns to pellet-seeking mode when safe
- **Appearance**: Yellow circle with animated mouth that opens/closes based on movement direction

#### Ghosts
- **Count**: 2 ghosts (Red "Blinky" and Pink "Pinky")
- **Starting Positions**: Opposite corners of the maze (top-left and top-right)
- **Movement Speed**: 2 tiles per second (slightly slower than Pac-Man)
- **Behavior**:
  - Move randomly through the maze
  - Cannot reverse direction unless at a dead end
  - 60% chance to continue straight when possible (for more natural movement)
  - Each ghost operates independently
- **Appearance**: Classic ghost shape with eyes that look in movement direction

#### Pellets
- **Distribution**: One pellet in every non-wall tile at game start
- **Appearance**: Small yellow dots
- **Collection**: Disappear when Pac-Man passes over them

### Game Rules
1. **Objective**: Pac-Man attempts to collect all pellets while avoiding ghosts
2. **Collision**: Game resets when Pac-Man touches a ghost
3. **Victory**: Game resets with a new maze when all pellets are collected
4. **Continuous Play**: Game runs indefinitely, generating new mazes after each round

### Technical Requirements
- **Frame Rate**: 60 FPS target
- **Responsive**: Scales to fit viewport while maintaining aspect ratio
- **Self-Contained**: All logic in a single HTML file
- **No External Dependencies**: Pure JavaScript, no libraries required

### Movement Mechanics
- **Grid Alignment**: Entities can only change direction when aligned with grid centers (within 0.1 units)
- **Smooth Movement**: Entities move continuously between grid positions
- **Wall Detection**: Check ahead to prevent moving into walls
- **Corner Cutting**: Entities should handle corners smoothly without getting stuck

### AI Implementation Details
- **Pathfinding**: Use A* or BFS for optimal path calculation
- **Decision Frequency**: AI decisions made only at grid intersections
- **Ghost Randomness**: Use Math.random() with seed-independent behavior
- **Collision Detection**: Check Manhattan distance < 0.5 tiles

### Visual Specifications
- **Background**: Pure black (#000000)
- **Walls**: Blue (#0000FF)
- **Pac-Man**: Yellow (#FFFF00)
- **Pellets**: Yellow (#FFFF00)
- **Blinky**: Red (#FF0000)
- **Pinky**: Pink (#FFB8FF)
- **Canvas Border**: 2px solid blue

// ...existing code...