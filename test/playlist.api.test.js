const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

let app;
let tmpDir;

describe('Playlist API', () => {
  beforeAll(() => {
    // Isolate uploads dir for any side effects
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdisplay-playlist-'));
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

  test('GET /api/playlist returns structure', async () => {
    const res = await request(app).get('/api/playlist');
    expect(res.status).toBe(200);
    expect(typeof res.body.delayMs).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.active).toBe('boolean');
  });

  test('POST /api/playlist/items validates template id and data', async () => {
    // Unknown id -> 404
    const r1 = await request(app).post('/api/playlist/items').send({ id: 'nope' });
    expect(r1.status).toBe(404);
    // Known template but missing required data -> 400 (animated-text requires text)
    const r2 = await request(app).post('/api/playlist/items').send({ id: 'animated-text' });
    expect(r2.status).toBe(400);
    // Valid add
    const r3 = await request(app)
      .post('/api/playlist/items')
      .send({ id: 'animated-text', data: { text: 'hi', velocity: 80 } });
    expect(r3.status).toBe(200);
    expect(typeof r3.body.index).toBe('number');
  });

  test('PUT /api/playlist replaces items and sets delay', async () => {
    const res = await request(app)
      .put('/api/playlist')
      .send({ items: [{ id: 'animated-text', data: { text: 'a' } }], delayMs: 5000 });
    expect(res.status).toBe(200);
    expect(res.body.playlist.delayMs).toBeGreaterThanOrEqual(2000);
    expect(res.body.playlist.items.length).toBe(1);
  });

  test('DELETE /api/playlist/items/:index and /by-id/:id remove items', async () => {
    // Seed with two items
    await request(app)
      .put('/api/playlist')
      .send({
        items: [
          { id: 'animated-text', data: { text: 'one' } },
          { id: 'animated-text', data: { text: 'two' } },
        ],
      });
    let get = await request(app).get('/api/playlist');
    expect(get.body.items.length).toBe(2);
    // Remove index 0
    const d1 = await request(app).delete('/api/playlist/items/0');
    expect(d1.status).toBe(200);
    get = await request(app).get('/api/playlist');
    expect(get.body.items.length).toBe(1);
    // Remove by id (first match)
    const d2 = await request(app).delete('/api/playlist/items/by-id/animated-text');
    expect([200, 404]).toContain(d2.status); // ok if not found if previous already removed
    get = await request(app).get('/api/playlist');
    expect(get.body.items.length).toBe(0);
  });

  test('POST /api/playlist/delay clamps and sets dwell', async () => {
    const r = await request(app).post('/api/playlist/delay').send({ delayMs: 100 }); // too low
    expect(r.status).toBe(200);
    expect(r.body.delayMs).toBeGreaterThanOrEqual(2000);
  });
});
