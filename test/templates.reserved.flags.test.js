const request = require('supertest');

// Import reserved names from CLI source to avoid drift
const { RESERVED_PARAM_NAMES } = require('../cli/flags');

const toCamel = (s) => String(s).replace(/-([a-zA-Z0-9])/g, (_, c) => c.toUpperCase());

function normalizeCandidates(name) {
  const n = String(name).trim();
  const parts = n.split('.');
  const top = parts[0];
  const out = new Set([n, toCamel(n), top, toCamel(top)]);
  return out;
}

describe('Template placeholders must not collide with reserved global flags', () => {
  test('no placeholders match reserved flag names (full or top-level segment)', async () => {
    const { app } = require('../server');
    const res = await request(app).get('/api/templates').expect(200);
    const templates = (res.body && res.body.templates) || [];

    const offenders = [];
    for (const t of templates) {
      const placeholders = Array.isArray(t.placeholders) ? t.placeholders : [];
      for (const ph of placeholders) {
        const cands = normalizeCandidates(ph);
        for (const cand of cands) {
          if (RESERVED_PARAM_NAMES.has(cand)) {
            offenders.push({ id: t.id, placeholder: ph, conflict: cand });
            break;
          }
        }
      }
    }

    if (offenders.length) {
      const msg = offenders.map(o => `${o.id}: placeholder "${o.placeholder}" conflicts with reserved flag "${o.conflict}"`).join('\n');
      throw new Error(`Reserved flag name collision(s) detected:\n${msg}`);
    }
  });
});
