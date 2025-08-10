# Contributing to hdisplay

Thanks for your interest in contributing! This project aims to be easy to run, hack on, and extend.

- Developer guide for automations and humans: see `.github/copilot-instructions.md`
- Template authoring guide: see `TEMPLATES.md`
- Product overview and contracts: see `PRD.md` and `README.md`

## Quick start

- Node.js >= 18
- Install and run
  - `npm install`
  - `npm start` (server at http://localhost:3000)
  - Optional (macOS): `./scripts/mac-preview.sh`

## Code style & quality

- ESLint + Prettier are authoritative
  - Lint: `npm run lint`
  - Format: `npm run format`
- Tests
  - Unit/integration (Jest + Supertest): `npm test`
  - E2E: don’t modify Playwright config or tests right now

## Contribution rules of thumb

- Keep diffs focused; avoid unrelated refactors or formatting churn
- Don’t change public HTTP API or CLI flags without updating docs and tests
- Ask before adding new dependencies (runtime or dev)
- Don’t add CI (GitHub Actions) unless requested
- It’s fine to commit refreshed captures under `captures/`

## Templates

- Add template HTML under `templates/<id>.html`
- Optional validator under `templates/_validators/<id>.js`
- Add/adjust tests in `test/` for validation and API behavior
- Update README examples and regenerate captures if user-facing

## Media & uploads

- Keep `/uploads` static serving and deletion behavior intact
- See `README.md` for CLI examples

## Playlists

- Respect the documented rotation & override semantics
- State persists under `data/state.json` (no DB)

Thank you for contributing!
