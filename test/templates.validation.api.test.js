const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

let app;
let tmpDir;

describe('Templates API validation', () => {
  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdisplay-templates-val-'));
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

  test('animated-text requires non-empty text', async () => {
    const res1 = await request(app).post('/api/template/animated-text').send({ data: {} });
    expect(res1.status).toBe(400);
    const res2 = await request(app)
      .post('/api/template/animated-text')
      .send({ data: { text: '' } });
    expect(res2.status).toBe(400);
    const res3 = await request(app)
      .post('/api/template/animated-text')
      .send({ data: { text: 'ok', velocity: -1 } });
    expect(res3.status).toBe(400);
    const res4 = await request(app)
      .post('/api/template/animated-text')
      .send({ data: { text: 'ok', speed: 0 } });
    expect(res4.status).toBe(400);
  });

  test('timeleft requires non-negative minutes and string label', async () => {
    const r1 = await request(app).post('/api/template/timeleft').send({ data: {} });
    expect(r1.status).toBe(400);
    const r2 = await request(app)
      .post('/api/template/timeleft')
      .send({ data: { minutes: -5 } });
    expect(r2.status).toBe(400);
    const r3 = await request(app)
      .post('/api/template/timeleft')
      .send({ data: { minutes: 10, label: 123 } });
    expect(r3.status).toBe(400);
  });

  test('weather requires location, units and valid refreshInterval', async () => {
    const w1 = await request(app).post('/api/template/weather').send({ data: {} });
    expect(w1.status).toBe(400);
    const w2 = await request(app)
      .post('/api/template/weather')
      .send({ data: { location: 'Paris' } });
    expect(w2.status).toBe(400);
    const w3 = await request(app)
      .post('/api/template/weather')
      .send({ data: { location: 'Paris', units: 'X' } });
    expect(w3.status).toBe(400);
    const w4 = await request(app)
      .post('/api/template/weather')
      .send({ data: { location: 'Paris', units: 'C', refreshInterval: 5 } });
    expect(w4.status).toBe(400);
    const w5 = await request(app)
      .post('/api/template/weather')
      .send({ data: { location: 'Paris', units: 'F', refreshInterval: 999 } });
    expect(w5.status).toBe(400);
  });
});
