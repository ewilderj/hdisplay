const fs = require('fs');
const path = require('path');
const request = require('supertest');

const STATE_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

function clearModule(p) {
  const id = require.resolve(p);
  delete require.cache[id];
}

describe('/healthz and state persistence', () => {
  let backup;

  beforeAll(() => {
    try { fs.mkdirSync(STATE_DIR, { recursive: true }); } catch {}
    if (fs.existsSync(STATE_FILE)) {
      backup = fs.readFileSync(STATE_FILE, 'utf8');
    }
  });

  afterAll(() => {
    if (backup !== undefined) {
      fs.writeFileSync(STATE_FILE, backup);
    } else {
      try { fs.unlinkSync(STATE_FILE); } catch {}
    }
  });

  test('GET /healthz returns ok, version, uptime', async () => {
    const { app } = require('../server');
    const pkg = require('../package.json');
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(typeof res.body.version).toBe('string');
    expect(res.body.version).toBe(pkg.version);
    expect(typeof res.body.uptime).toBe('number');
    clearModule('../server');
  });

  test('state persists to file and loads on next boot', async () => {
    // Ensure clean slate
    try { fs.unlinkSync(STATE_FILE); } catch {}
    clearModule('../server');

    // First load app, set content
    let mod = require('../server');
    const app1 = mod.app;
    const unique = `<div>persist-${Date.now()}</div>`;
    await request(app1).post('/api/content').send({ content: unique }).expect(200);

    // State file written
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    expect(saved).toHaveProperty('content', unique);
    expect(saved).toHaveProperty('updatedAt');

    // Simulate restart: reload module to trigger loadState()
    clearModule('../server');
    mod = require('../server');
    const app2 = mod.app;

    const res = await request(app2).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('content', unique);

    // Cleanup module cache
    clearModule('../server');
  });
});
