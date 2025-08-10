const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

let app;
let tmpDir;

describe('Templates API (snake & timeleft)', () => {
  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdisplay-templates2-'));
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

  test('apply snake template renders expected markers', async () => {
    const res = await request(app)
      .post('/api/template/snake')
      .send({ data: { cellSize: 16, wrap: true, tickMs: 80 } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.template).toHaveProperty('id', 'snake');
    const status = await request(app).get('/api/status');
    expect(status.status).toBe(200);
    // Canvas with class="snake" should be present
    expect(status.body.content).toMatch(/<canvas[^>]*class="snake"/);
  });

  test('apply timeleft template renders expected markers and values', async () => {
    const label = 'Time left';
    const minutes = 135;
    const res = await request(app)
      .post('/api/template/timeleft')
      .send({ data: { minutes, label } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.template).toHaveProperty('id', 'timeleft');
    const status = await request(app).get('/api/status');
    expect(status.status).toBe(200);
    // Root marker exists
    expect(status.body.content).toContain('timeleft-root');
    // Minutes value is embedded in JS via String.raw backtick literal
    expect(status.body.content).toContain('String.raw`135`');
    // Label value also embedded
    expect(status.body.content).toContain('String.raw`Time left`');
  });
});
