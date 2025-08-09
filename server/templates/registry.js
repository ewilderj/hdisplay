const path = require('path');
const fs = require('fs');

// Root templates directory
const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates');

function loadValidator(id) {
  const candidates = [
    path.join(TEMPLATES_DIR, '_validators', `${id}.js`),
    path.join(TEMPLATES_DIR, `${id}.validator.js`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        const mod = require(file);
        if (typeof mod === 'function') return mod;
        if (mod && typeof mod.validate === 'function') return mod.validate.bind(mod);
      } catch (e) {
        // If a validator fails to load, treat as no validator to avoid crashing runtime
        console.warn(`[hdisplay] validator load failed for ${id}:`, e.message);
      }
    }
  }
  return null;
}

function validateTemplateData(id, data) {
  const validator = loadValidator(id);
  if (!validator) return { ok: true };
  try {
    const result = validator(data || {});
    if (result === true || result == null) return { ok: true };
    if (typeof result === 'string') return { ok: false, error: result };
    if (result && typeof result === 'object') {
      if ('ok' in result) return result;
    }
    return { ok: false, error: 'invalid data' };
  } catch (e) {
    return { ok: false, error: e.message || 'invalid data' };
  }
}

module.exports = { validateTemplateData, TEMPLATES_DIR };
