## hdisplay – Copilot developer instructions

Purpose: This file teaches GitHub Copilot how to work as a contributor in this repository. It captures the tech stack, run/test commands, coding conventions, and the safe ways to add features, fix bugs, and update docs.

Audience: Automated assistants and humans alike. Be concise, deterministic, and verify with tests where possible.

---

## Quick facts

- Runtime: Node.js >= 18 (Docker uses Node 20 alpine)
- Web: Express 4 + Socket.io 4 (server) + vanilla JS client
- CLI: Commander.js, Axios, Chalk
- Tests: Jest + Supertest (API/unit), Playwright (E2E, optional for captures)
- Media/capture: Playwright, Sharp, ffmpeg (optional for MP4)
- State: JSON file at `data/state.json` (no DB)
- Templates: Simple HTML files in `templates/` with `{{placeholder}}` replacement, optional validators

## Commands you should run

- Start server: npm start
- Dev preview (macOS): ./scripts/mac-preview.sh
- CLI from repo: npm link, then hdisplay ...
- Unit/integration tests: npm test
- Playwright E2E: npm run test:e2e (ensure a server is running; default Playwright baseURL is http://localhost:3100)
- Lint: npm run lint
- Format: npm run format
- Docker: docker compose up --build
- Captures: hdisplay capture:all and hdisplay capture:gallery

Notes
- Keep ports consistent: server defaults to 3000; E2E config defaults to 3100 via BASE_URL.
- Uploads and data are persisted under ./uploads and ./data; Docker maps these as volumes.

## Repository structure

- server/ – Express app entry at server/index.js, static client in server/public/
- cli/ – CLI entry at cli/index.js and subcommands
- templates/ – HTML templates; validators under templates/_validators/
- capture/ and capture-profiles/ – Black-box capture system
- test/ – Jest tests; tests-e2e/ – Playwright tests
- uploads/, data/ – runtime persistence

## Coding conventions and constraints

- Language/style
	- Use modern JS (Node 18+). No TypeScript here unless the repo adds it explicitly.
	- Prefer small, widely used dependencies; pin versions and respect existing package.json patterns.
	- Keep changes minimal and localized; avoid broad refactors in feature PRs.
- APIs and compatibility
	- Don’t break the public HTTP API or CLI flags without updating README and tests.
	- Playlist behavior is intentional: rotation, overrides, delay clamping, and persistence to data/state.json.
	- Keep crossfade behavior client-side intact (no server coupling to transitions).
- Security and safety
	- Service is LAN-only by design. Do not add auth unless asked; do add minimal headers sensibly if working on hardening.
	- Never ship secrets in code; prefer env vars.
- Performance
	- Raspberry Pi friendly: avoid per-frame allocations; keep CPU modest.
- Tests/docs
	- Update or add Jest tests when changing server behavior or CLI parsing.
	- If you add/modify templates, add or update validator tests in test/.
	- If you update screenshots/videos in README, regenerate with capture commands.

Project decisions (maintainer-provided)
- Lint/Prettier: Check in ESLint and Prettier configs and keep them authoritative.
- Playwright: Don’t modify Playwright config or tests right now.
- Dependencies: Ask before adding any new dependencies (runtime or dev). Keep the current set unless approved.
- CI: Don’t add GitHub Actions/CI until requested.
- Captures: It’s fine to commit refreshed captures under `captures/`.

## Template system contract

- Files: templates/<id>.html
- Placeholders: {{ key }} and dotted paths (e.g., {{ a.b }})
- Validators (optional but recommended):
	- Preferred locations: templates/_validators/<id>.js or templates/<id>.validator.js
	- Return shapes: true | { ok: true } for success; { ok: false, error } for failure
- Reserved parameter names: top-level data keys must not collide with CLI globals: server, timeout, quiet, help, h, data, data-file (and dataFile)
- API to apply: POST /api/template/:id { data }

When adding a template
1) Create templates/<id>.html
2) Add templates/_validators/<id>.js (enforce required fields, bounds)
3) Add README usage snippet under Templates section if user-facing
4) Add/adjust test in test/templates.validation.api.test.js (or adjacent)
5) Optionally add a capture profile capture-profiles/<id>.yaml and regenerate captures

## CLI data mapping (no-JSON flags)

- The CLI maps flags to template data:
	- Scalars: --text "Hello" → { text: "Hello" }
	- Numbers auto-coerced: --velocity 120 → { velocity: 120 }
	- Arrays: repeated flags build arrays: --items A --items B → { items: ["A","B"] }
	- Nested: dot paths: --theme.bg '#000' → { theme: { bg: "#000" } }
	- Booleans: --wrap = true; --no-wrap = false
- Flags override any JSON provided via --data/--data-file/stdin.
- Reserved/global flags are excluded from data (see cli/flags.js).

## Playlist behavior (server contract)

- State shape persisted under state.json:
	{
		playlist: { delayMs: number, items: [ { id, data? } ] }
	}
- delayMs is clamped to [2000, 300000]
- Rotation rules
	- 0 items: do nothing
	- 1 item: render and do not auto-rotate
	- 2+ items: rotate every delayMs
- Overrides
	- Applying content via set/template/push interrupts rotation for exactly delayMs, then resume at next item
	- Clearing clears playlist and stops rotation
- API: GET/PUT /api/playlist, POST /api/playlist/items, DELETE /api/playlist/items/:index, DELETE /api/playlist/items/by-id/:id, POST /api/playlist/delay

## Quality gates – green before done

Run locally before pushing:
- Build/Start: npm start boots and /healthz returns ok
- Lint/Format: npm run lint and npm run format (format can change files; commit them)
- Unit/Integration tests: npm test is green

PR checklist (what Copilot should produce)
- Code + tests
- Minimal docs updates (README sections and/or TEMPLATES.md if applicable)
- No breaking changes without docs and tests
- Keep diffs focused and avoid unrelated formatting changes

## Common tasks playbook

Add a new template
- Files: templates/<id>.html and templates/_validators/<id>.js
- Tests: add failure (bad/missing data) and success cases
- Docs: add usage to README Templates section
- Optional: capture profile and regenerated assets

Add a new CLI command
- Implement in cli/index.js; keep global options compatible
- Update README with usage and examples
- Add a Jest test that exercises the command via the API

Modify playlist logic
- Respect override semantics and delay clamping
- Update test/playlist.api.test.js as needed

Uploads/media changes
- Keep /uploads static serving and deletion behavior intact
- Update tests in upload.test.js and uploads.static.delete.test.js if behavior changes

## Pitfalls and tips

- zsh quoting for JSON: prefer single quotes around JSON, escape inner double-quotes
- E2E baseURL: Playwright defaults to http://localhost:3100; set BASE_URL env var if needed
- ffmpeg optional: WEBM produced; MP4 best-effort
- mDNS: bonjour-service must not crash server when unavailable; errors are caught

## Minimal ask-policy for Copilot

- Prefer doing the work if you can infer missing details from repo patterns
- Ask only when blocked; keep questions specific and few
