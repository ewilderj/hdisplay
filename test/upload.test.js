const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');
const { app } = require('../server/index');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdisplay-uploads-'));
process.env.HDS_UPLOADS_DIR = tmpDir;

describe('Asset uploads API', () => {
  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('should reject when no file provided', async () => {
    const res = await request(app).post('/api/upload');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/file field required/i);
  });

  it('should upload a file and list it', async () => {
    const sample = Buffer.from('sample-bytes');
    const samplePath = path.join(tmpDir, 'sample.txt');
    fs.writeFileSync(samplePath, sample);

    const res = await request(app)
      .post('/api/upload')
      .attach('file', samplePath);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.file.url).toMatch(/\/uploads\//);

    const list = await request(app).get('/api/uploads');
    expect(list.statusCode).toBe(200);
    expect(Array.isArray(list.body.files)).toBe(true);
    expect(list.body.files.length).toBeGreaterThan(0);
  });
});
