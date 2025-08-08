const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

let app;
let tmpDir;

describe('Uploads static serving and delete API', () => {
  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdisplay-uploads-'));
    process.env.HDS_UPLOADS_DIR = tmpDir;
    jest.resetModules();
    ({ app } = require('../server/index'));
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.HDS_UPLOADS_DIR;
  });

  it('serves an uploaded file from /uploads and deletes it', async () => {
    // Prepare a sample file to upload
    const samplePath = path.join(tmpDir, 'sample2.txt');
    fs.writeFileSync(samplePath, 'abc123');

    const uploadRes = await request(app)
      .post('/api/upload')
      .attach('file', samplePath);

    expect(uploadRes.statusCode).toBe(200);
    expect(uploadRes.body && uploadRes.body.ok).toBe(true);
    const url = uploadRes.body.file.url;
    const name = path.basename(url);

    // Static serving
    const getRes = await request(app).get(url);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.headers['content-type']).toMatch(/text\/plain/);
    expect(getRes.text).toContain('abc123');

    // Delete
    const delRes = await request(app).delete(`/api/uploads/${encodeURIComponent(name)}`);
    expect(delRes.statusCode).toBe(200);

    // List should no longer include it
    const listRes = await request(app).get('/api/uploads');
    expect(Array.isArray(listRes.body.files)).toBe(true);
    expect(listRes.body.files.find(f => f.name === name)).toBeUndefined();

    // Static should return 404 now
    const getResAfter = await request(app).get(url);
    expect(getResAfter.statusCode).toBe(404);
  });
});
