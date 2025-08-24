# TODO Roadmap

Concise, prioritized tasks to harden the server, improve DX, and ship user-facing wins. Check items off as we go.

## Must-do next

<!-- Completed: lint/format baseline (moved to Done) -->

- [ ] Headers hardening
  - [ ] Add minimal security headers (via Helmet or manual set) and permissive CORS if needed for CLI
  - Acceptance: no regressions; headers visible on `/` and APIs

- [ ] Client robustness (from PRD)
  - [ ] WebSocket auto-reconnect UX: show banner on disconnect, retry/backoff, auto-hide on reconnect
  - [ ] Fullscreen API: ensure kiosk enters fullscreen and recovers if exited
  - Acceptance: display recovers seamlessly after server restarts or network loss

- [ ] Charts (from PRD)
  - [ ] Add a simple sparkline/line chart template fed via API
  - Acceptance: renders smoothly with low CPU on Pi

- [ ] Testing & CI (from PRD)
  - [ ] Hardware smoke on Raspberry Pi
  - [ ] 12h stability soak test script
  - [ ] CI workflow: Jest unit/integration, Playwright e2e smoke, capture gallery (optional), Docker build
  - Acceptance: pipeline green; soak test stable without crashes

## Tests and quality gates

- [ ] Add tests for carousel template payload validation (items array, duration bounds)
  - Acceptance: invalid payloads are rejected with 400 and clear messages

- [ ] Increase overall statement coverage from ~39% → 60% (phase 1)
  - Focus: `server/stocks.js` (currently ~6% lines, 0% branches) and `capture/` modules (capture.js, visual-detector.js, template-heuristics.js)
  - Acceptance: coverage report shows >=60% statements, stocks.js >=40% statements

- [ ] Stock API unit tests
  - Cover: provider selection (alphavantage vs finnhub), symbol parsing (stock vs forex), error handling (rate limit, invalid symbol), caching behavior, sparkline fallback generation
  - Acceptance: each branch in `fetchSymbolData` exercised; at least one test for alphavantage rate limit wait path (mock timers) and finnhub forex unsupported path

- [ ] Weather edge case tests
  - Add: geocode fallback path, stale cache reuse on provider failure, Tomorrow.io debug mapping (with mock data), units conversion
  - Acceptance: increase `server/weather.js` branch coverage from ~39% → 60%

- [ ] Capture system unit tests (pure logic)
  - Add: `VisualDetector` strategy failures/timeouts, pixel coverage threshold, visual stability diff path, text content min length fail then pass, media loading wait (mock page)
  - Acceptance: `capture/visual-detector.js` lines coverage from ~2% → 50% using mocked page object

- [ ] Template heuristics tests
  - Cover: `getSampleData` returns expected shapes per known template, fallback {} for unknown, profile generation defaults
  - Acceptance: `template-heuristics.js` statements ≥50%

- [ ] Playlist rotation timing tests
  - Simulate multi-item playlist with override and ensure rotation pauses/resumes correctly; clampDelay bounds
  - Acceptance: raise `server/index.js` branch coverage (playlist rotation paths) by +10 percentage points

- [ ] Add Jest coverage thresholds (soft gate)
  - Configure `coverageThreshold` once initial lift achieved: global { statements: 60, branches: 50, functions: 55, lines: 60 }
  - Acceptance: build fails if thresholds not met (after initial increase PR)

- [ ] Introduce selective mocking utilities
  - Create `test/utils/mockPage.js` for capture tests and `test/utils/httpMocks.js` for external API modules (stocks/weather) to keep test code DRY
  - Acceptance: duplicate mock code reduced; new utils adopted in new tests

## Template UX and docs

<!-- Completed: capture docs moved to Done -->

## Small server/CLI improvements

- [ ] Add `playlist:add` examples using schema-aware flags (mirrors template examples)
- [ ] Optional: CLI flag to skip post-capture clear during capture runs

- [ ] Server ESM migration (phase 2 – full conversion, defer for later)
  - [ ] Convert `server/index.js` implementation to ESM and keep a tiny CJS shim (`server/index.js` or `server/index.cjs`) that dynamically imports the ESM and re-exports `{ app, server, UPLOADS_DIR }` for Jest tests
  - [ ] Flip `npm start` (and systemd/docker docs) to prefer `node server/index.mjs` once stable; ensure mDNS (bonjour-service) init remains lazy in direct-run path
  - [ ] Verify tests that `require('../server/index')` continue passing via the shim; no behavior/API changes
  - [ ] Update README notes on Node 20+ and dual-entry, if needed
  - Acceptance: `npm test` green; `npm start` boots and `/healthz` ok; no regressions in playlist/weather/uploads APIs

## Optional quick wins

_(add more here as they come up)_

## New template ideas

- Headlines ticker (RSS/Atom): feedUrl[], speed, separator, theme
- Transit departures: stopId/routeId, provider URL (GTFS-RT), maxItems (allow static JSON)
- Room schedule strip: events[{title,start,end}], nowIndicator
- World clocks: cities[{label,tz}], format, showDate
- Quote/Tip rotator: items[], durationMs, randomize, theme
- Progress/Timeline bar: start, end, label, milestones[]
- Build status bar: projects[{name,status}], updatedAt (offline; colors for pass/fail)
- Leaderboard: rows[{name,score}], highlightTopN, unit
- Social wall (curated/static): posts[{avatarUrl,text,handle}], rotateMs
- QR join/info card: title, subtitle, qrText/url, logoUrl (client-side QR)
- Word clock: language, showSeconds (CSS grid)
- Sunrise/Sunset bar: lat, lon, date?, tz (compute locally)
- Ambient gauges: metrics[{label,value,unit,max}], style="arc|bar"
- Image wall (Ken Burns): items[/uploads/...], dwellMs, panZoom
- Scoreboard: home, away, scoreH, scoreA, period, clock
- Trivia flash: questions[{q,a}], rotateMs, showAnswerDelay
- System status strip: nodes[{name,cpu,mem}], updatedAt
- Mini weather sparkline: temps[], precip[] (inline SVG)
- Bokeh/Particles animator: density, hue, speed (Canvas; low CPU)

## Stretch ideas (later)

- [ ] Auth (token or local network-only) for APIs
- [ ] MQTT/Home Assistant integration
- [ ] Plugin system for third-party templates/widgets
- [ ] Multiple display support (from PRD)
- [ ] Mobile control app (from PRD)
- [ ] Cloud sync for configurations (from PRD)

---

Quality gates when merging:

- Build/Start: PASS
- Lint/Format: PASS
- Unit/Integration tests: PASS
- Manual smoke: `hdisplay templates`, apply each sample template, upload image, push image/video (persist and ephemeral)

## Done

- Lint/format baseline
  - All previous ESLint warnings (unused vars, regex escapes, switch-case lexical declarations) resolved
  - `npm run lint` now exits with zero errors and zero warnings
  - Adjusted try/catch blocks to avoid unused variables; simplified regex for placeholders
  - Acceptance: clean lint run verified on Aug 23 2025

- Persist last content across restarts
  - Write state to `data/state.json` on every update (atomic write to `state.json.tmp` then rename)
  - Load state on boot; tolerate missing/corrupt file
  - Include `content`, `updatedAt`, `lastTemplate` (id, data, appliedAt)
  - Acceptance: restart restores the exact last screen without errors

- Health/readiness endpoint
  - `GET /healthz` -> `{ ok: true, version, uptime }`
  - Fast path (no disk or heavy allocations)
  - Acceptance: returns 200 in <10ms and is usable by systemd/docker health checks

- API tests (Jest + supertest)
  - `/api/templates` lists files and placeholders
  - Apply templates happy-path: `animated-text`, `snake`, `timeleft`
  - Error cases: unknown template; bad payloads/missing fields
  - Uploads: `/api/upload` + list + static/delete, push image/video (persist true/false)
  - Acceptance: all tests green locally (CI deferred)

- README Templates section
  - Quick usage for `animated-text`, `snake`, `timeleft` with CLI examples
  - Document the template data schemas and common gotchas (zsh quoting)
  - Acceptance: copy-paste commands render visibly on first try

- TimeLeft polish
  - Ensure long labels wrap without clipping (line-height/white-space)
  - Acceptance: very long labels remain readable at 1280×400

- Small server/CLI improvements
  - If multiple services are found, present an interactive pick list
  - `--set` uses the selected service and writes config
  - Acceptance: selecting among ≥2 services works and persists to config

- Dockerfile + compose
  - Node 20+ slim image, expose 3000, volumes for `uploads/` and `data/`
  - .dockerignore added

- Systemd unit example
  - Units installed via setup script: `hdisplay@.service`, `hdisplay-health@.service`, `hdisplay-health@.timer`
  - Health timer calls `/healthz` via `scripts/healthcheck.sh`

- Playwright smoke
  - Simple e2e to assert that socket content swap updates DOM

- Schema-aware flags (no JSON)
  - Implemented for `template <id>` and `playlist:add` with dot-paths, repeated flags for arrays, and booleans; reserved-flag collision test added
  - README examples updated; server validators continue to enforce payloads

- Black-box capture system
  - Playwright-driven screenshots and videos per template; readiness detection via visual heuristics and profile strategies
  - Post-capture clear via CLI to avoid recording transitions; robust apply-and-wait using document.title
  - Video post-processing with ffmpeg to produce WEBM (VP9) and MP4 (H.264); trims initial frames (`video.trim_ms`, default 150ms; carousel 2000ms)
  - Capture README updated; main README shows per-template screenshots with MP4 links

- Capture docs (Template UX & docs)
  - Added capture/README with regeneration steps; README includes screenshots & MP4 links
  - Documented ffmpeg optional requirement (WEBM always, MP4 when available)
  - Acceptance: `hdisplay capture:all` produces assets locally; links remain valid (verified)
