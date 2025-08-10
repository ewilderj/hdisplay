# TODO Roadmap

Concise, prioritized tasks to harden the server, improve DX, and ship user-facing wins. Check items off as we go.

## Must-do next

- [ ] Lint/format baseline
  - [ ] Fix remaining lint warnings and ensure `npm run lint` passes clean
  - Acceptance: repo lints clean or has explicit TODOs for intentional gaps

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

## Template UX and docs
 - [ ] Author minimal `CAPTURES.md` or section in README describing how to regenerate captures and ffmpeg requirement
   - Acceptance: contributor can run `hdisplay capture:all` and see outputs; README links remain valid

## Small server/CLI improvements
 - [ ] Add `playlist:add` examples using schema-aware flags (mirrors template examples)
 - [ ] Optional: CLI flag to skip post-capture clear during capture runs

## Optional quick wins

_(add more here as they come up)_

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
  - Node 18+/20 slim image, expose 3000, volumes for `uploads/` and `data/`
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
