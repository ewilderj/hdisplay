# Authoring Templates and Validators for hdisplay

This guide explains how to create display templates and (optionally) validate their input data.

## Where templates live

- Directory: `templates/`
- Each template is a single HTML file named `<id>.html` (the `<id>` is used on the API path `/api/template/<id>`).
- Example files in this repo:
  - `templates/animated-text.html`
  - `templates/carousel.html`
  - `templates/timeleft.html`

## Placeholders and data rendering

Templates can include placeholders that will be replaced by values you send in the API call. Use double-curly braces:

- Basic: `{{ key }}`
- Nested paths: `{{ user.name }}`

Rules at render time:
- Missing/undefined values render as an empty string.
- Non-string objects are stringified as JSON.
- Placeholder keys are case-sensitive.
- The server substitutes values via a simple replacer; there’s no logic or loops.

Discovering placeholders:
- `GET /api/templates` returns all templates and their root-level placeholder keys it detected by scanning the HTML. Nested paths are supported at render time, but the placeholder list only includes the root keys before the first dot.

## Applying a template

- HTTP: `POST /api/template/<id>` with JSON body `{ "data": { ... } }`
- CLI: `hdisplay template <id> --data '{"k":"v"}'`

Example:
```
POST /api/template/animated-text
{ "data": { "text": "Hello", "velocity": 120 } }
```

If successful, the display updates immediately and the server remembers the last template and its data in state.

## Adding validation (optional but recommended)

You can define a validator per template to verify and normalize its `data` payload. Validators are automatically discovered using this order:

1) `templates/_validators/<id>.js`
2) `templates/<id>.validator.js`

A validator can be:
- A function `function (data) { ... }` that returns one of:
  - `true` or `{ ok: true }` → valid
  - `{ ok: false, error: "message" }` or a plain error `"message"` → invalid
- Or an object `{ validate(data) { ... } }` returning the same shapes

If there is no validator, the data is accepted by default.

### Example: animated-text

File: `templates/_validators/animated-text.js`
```
module.exports = function validateAnimatedText(data = {}) {
  const text = data.text;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, error: 'animated-text requires data.text (non-empty string)' };
  }
  if (data.velocity !== undefined) {
    const v = Number(data.velocity);
    if (!Number.isFinite(v) || v <= 0) {
      return { ok: false, error: 'animated-text: velocity must be a positive number' };
    }
  }
  if (data.speed !== undefined) {
    const s = Number(data.speed);
    if (!Number.isFinite(s) || s <= 0) {
      return { ok: false, error: 'animated-text: speed must be a positive number' };
    }
  }
  return { ok: true };
};
```

### Example: timeleft

File: `templates/_validators/timeleft.js`
```
module.exports = function validateTimeleft(data = {}) {
  const m = Number(data.minutes);
  if (!Number.isFinite(m) || m < 0) {
    return { ok: false, error: 'timeleft requires data.minutes (non-negative number)' };
  }
  if (data.label !== undefined && typeof data.label !== 'string') {
    return { ok: false, error: 'timeleft: label must be a string' };
  }
  return { ok: true };
};
```

## Testing your template

Quick checks:
- List templates: `hdisplay templates`
- Apply: `hdisplay template <id> --data '{"k":"v"}'`
- HTTP with curl: `curl -XPOST localhost:3000/api/template/<id> -H 'Content-Type: application/json' -d '{"data":{...}}'`

Automated tests:
- Add API tests in `test/` (see `templates.validation.api.test.js`).
- Validate error cases (missing fields, wrong types) and success path.

## Best practices

- Keep HTML self-contained; avoid external networks for fonts/scripts where possible.
- Prefer CSS animations and GPU-friendly transforms for smooth motion.
- For dynamic scripts, note the client re-executes inline `<script>` tags when content updates.
- Avoid large per-frame allocations; reuse DOM nodes or use CSS where possible for animations.
- Keep validator error messages concise and user-facing; they are returned as HTTP 400 responses.

### Smooth transitions with animations

The display client crossfades between the previous and next template using a ~500ms opacity transition on two layers. Your template’s scripts are re-executed on the incoming (hidden at first) layer. To avoid flashes of static layout and to ensure animations restart cleanly:

- Initialize immediately. Templates are injected after page load; don’t rely on `window.onload` to start logic.
- Hide until ready. Use the global helper available on the client:
  - `window.hdisplay.hiddenUntilReady(el, initFn)` hides `el`, runs `initFn` on the next animation frame for stable layout, then reveals the element.
  - Example usage: call it on the element that animates (e.g., a track div or the template root) and pass your setup function.
- Restart CSS animations deterministically:
  - Add a `paused` class to halt the animation, force a reflow (`void el.offsetWidth;`), then remove `paused` to start from the beginning.
  - Optionally listen for `animationstart` and reveal at that moment to prevent any pre-animation flash.
- Measure after layout/fonts if sizing depends on text:
  - Compute widths in `requestAnimationFrame`.
  - If needed, wait on `document.fonts.ready` before measuring; don’t block reveal indefinitely—prefer a best-effort approach.
- For carousels/videos:
  - Hide the root until the first slide is activated, then reveal.
  - For videos, reset `currentTime = 0` and call `play()` when the slide becomes active.

These patterns are demonstrated in the built-in `animated-text.html` and `carousel.html` templates.

## Advanced (optional)

- You can implement validators using JSON Schema with a library like Ajv if your template data is complex. Wrap the schema validation inside your validator module and map failures to a concise `error` string.

## Troubleshooting

- 404 `template not found`: ensure your file `templates/<id>.html` exists and is readable.
- 400 `invalid data`: your validator rejected the payload; check the `error` string.
- Placeholders not replaced: confirm the keys in `data` match the `{{ ... }}` placeholders (case-sensitive). Nested values like `{{ a.b.c }}` require `data = { a: { b: { c: ... } } }`.
