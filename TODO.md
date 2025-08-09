# TODO Roadmap

Concise, prioritized tasks to harden the server, improve DX, and ship user-facing wins. Check items off as we go.

## Must-do next

- [x] Persist last content across restarts
  - [x] Write state to `data/state.json` on every update (atomic write to `state.json.tmp` then rename)
  - [x] Load state on boot; tolerate missing/corrupt file
  - [x] Include `content`, `updatedAt`, `lastTemplate` (id, data, appliedAt)
  - Acceptance: restart restores the exact last screen without errors

- [x] Health/readiness endpoint
  - [x] `GET /healthz` -> `{ ok: true, version, uptime }`
  - [x] Fast path (no disk or heavy allocations)
  - Acceptance: returns 200 in <10ms and is usable by systemd/docker health checks

## Tests and quality gates

- [ ] API tests (Jest + supertest)
  - [ ] `/api/templates` lists files and placeholders
  - [ ] Apply templates happy-path: `animated-text`, `snake`, `timeleft`
  - [ ] Error cases: unknown template, bad payloads, missing fields
  - [ ] Uploads: `/api/upload` and `/api/uploads` (persist true/false paths)
  - Acceptance: all tests green locally and in CI

- [ ] Lint/format baseline
  - [ ] Add ESLint + Prettier with minimal config
  - [ ] npm scripts: `lint`, `format`
  - Acceptance: repo lints clean or has explicit TODOs for intentional gaps

## Template UX and docs

- [ ] README Templates section
  - [ ] Quick usage for `animated-text`, `snake`, `timeleft` with CLI examples
  - [ ] Document the template data schemas and common gotchas (zsh quoting)
  - Acceptance: copy-paste commands render visibly on first try

- [ ] TimeLeft polish
  - [ ] Ensure long labels wrap without clipping (line-height/white-space)
  - Acceptance: very long labels remain readable at 1280×400

## Small server/CLI improvements

- [ ] CLI discover UX
  - [ ] If multiple services are found, present an interactive pick list
  - [ ] `--set` uses the selected service and writes config
  - Acceptance: selecting among ≥2 services works and persists to config

- [ ] Headers hardening
  - [ ] Add minimal security headers (via Helmet or manual set) and permissive CORS if needed for CLI
  - Acceptance: no regressions; headers visible on `/` and APIs

## Optional quick wins

- [x] Dockerfile + compose
  - [x] Node 18+/20 slim image, expose 3000, volumes for `uploads/` and `data/`
  - [x] .dockerignore added

- [ ] Systemd unit example
  - [ ] Unit referencing `/healthz` for `Restart=on-failure` health checks

- [ ] Playwright smoke (later)
  - [ ] Simple e2e to assert that socket content swap updates DOM

## Stretch ideas (later)

- [ ] Auth (token or local network-only) for APIs
- [ ] MQTT/Home Assistant integration
- [ ] Plugin system for third-party templates/widgets

---

Quality gates when merging:
- Build/Start: PASS
- Lint/Format: PASS
- Unit/Integration tests: PASS
- Manual smoke: `hdisplay templates`, apply each sample template, upload image, push image/video (persist and ephemeral)
