const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

let app;
let tmpDir;

describe('Templates API', () => {
  beforeAll(() => {
    // Isolate uploads dir for any side effects
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdisplay-templates-'));
    process.env.HDS_UPLOADS_DIR = tmpDir;
    jest.resetModules();
    ({ app } = require('../server/index'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    delete process.env.HDS_UPLOADS_DIR;
  });

  test('GET /api/templates lists html files and placeholders', async () => {
    const res = await request(app).get('/api/templates');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.templates)).toBe(true);
    // Expect a couple known templates to exist
    const ids = res.body.templates.map((t) => t.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual(expect.arrayContaining(['animated-text', 'carousel', 'message-banner']));
  });

  test('POST /api/template/:id applies known template', async () => {
    const res = await request(app)
      .post('/api/template/animated-text')
      .send({ data: { text: 'hi', velocity: 100 } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.template).toHaveProperty('id', 'animated-text');
    const status = await request(app).get('/api/status');
    expect(status.status).toBe(200);
    expect(typeof status.body.content).toBe('string');
    expect(status.body.content).toMatch(/hi/);
  });

  test('POST /api/template/:id 404 on unknown template', async () => {
    const res = await request(app).post('/api/template/nope');
    expect(res.status).toBe(404);
  });
});
