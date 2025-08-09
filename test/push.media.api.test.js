const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

let app;
let tmpDir;

describe('Push media API', () => {
  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdisplay-push-'));
    process.env.HDS_UPLOADS_DIR = tmpDir;
    jest.resetModules();
    ({ app } = require('../server/index'));
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.HDS_UPLOADS_DIR;
  });

  test('push image from file (ephemeral, no persist)', async () => {
    const samplePath = path.join(tmpDir, 'img.txt');
    fs.writeFileSync(samplePath, 'img-bytes');
    const res = await request(app)
      .post('/api/push/image')
      .attach('file', samplePath);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.url).toMatch(/^\/ephemeral\//);
  });

  test('push image from file with persist true writes to uploads', async () => {
    const samplePath = path.join(tmpDir, 'img2.txt');
    fs.writeFileSync(samplePath, 'img-bytes-2');
    const res = await request(app)
      .post('/api/push/image?persist=true')
      .attach('file', samplePath);
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\//);
    const name = path.basename(res.body.url);
    expect(fs.existsSync(path.join(tmpDir, name))).toBe(true);
  });

  test('push video via URL sets content', async () => {
    const res = await request(app)
      .post('/api/push/video')
      .send({ url: 'http://example.com/video.mp4' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.url).toBe('http://example.com/video.mp4');
  });
});
