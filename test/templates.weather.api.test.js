const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

jest.mock('axios');
const axios = require('axios');

let app;
let tmpDir;
let nextDaily;

function setMockGeocode(name = 'San Francisco', lat = 37.7749, lon = -122.4194) {
  // no-op; geocode handled in global axios.get impl below using these defaults via closure
}

function setMockDaily(days = [
  { min: 10, max: 18, icon: '01d', description: 'clear sky', dt: 1735689600 },
  { min: 11, max: 17, icon: '02d', description: 'few clouds', dt: 1735776000 },
  { min: 9, max: 15, icon: '10d', description: 'rain', dt: 1735862400 },
]) {
  nextDaily = days.map((t) => ({
    dt: t.dt,
    temp: { min: t.min, max: t.max },
    weather: [{ icon: t.icon, description: t.description }],
  }));
}

function setEnvKey() {
  process.env.OPENWEATHERMAP_API_KEY = 'test-key';
}

function clearEnvKey() {
  delete process.env.OPENWEATHERMAP_API_KEY;
}

describe('Weather API', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdisplay-weather-'));
    process.env.HDS_UPLOADS_DIR = tmpDir;
  // Ensure server uses OpenWeatherMap provider explicitly for this suite
  const cfgPath = path.join(tmpDir, 'config.json');
  fs.writeFileSync(cfgPath, JSON.stringify({ weather: { provider: 'openweathermap' } }));
  process.env.HDS_CONFIG_PATH = cfgPath;
    setEnvKey();
    nextDaily = undefined;
    // Provide a default axios.get implementation for both endpoints
    axios.get.mockImplementation((url, { params } = {}) => {
      // debug
      // eslint-disable-next-line no-console
      console.log('[axios-mock]', url);
      if (url.includes('/geo/1.0/direct')) {
        return Promise.resolve({ data: [{ name: 'San Francisco', country: 'US', lat: 37.7749, lon: -122.4194 }] });
      }
      if (url.includes('/data/3.0/onecall')) {
        const daily = Array.isArray(nextDaily)
          ? nextDaily
          : [
              { dt: 1735689600, temp: { min: 10, max: 18 }, weather: [{ icon: '01d', description: 'clear sky' }] },
              { dt: 1735776000, temp: { min: 11, max: 17 }, weather: [{ icon: '02d', description: 'few clouds' }] },
              { dt: 1735862400, temp: { min: 9, max: 15 }, weather: [{ icon: '10d', description: 'rain' }] },
            ];
        return Promise.resolve({ data: { daily } });
      }
      return Promise.reject(new Error('unexpected axios url ' + url));
    });
    ({ app } = require('../server/index'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.HDS_UPLOADS_DIR;
  delete process.env.HDS_CONFIG_PATH;
    clearEnvKey();
  });

  test('400 when missing api key', async () => {
    clearEnvKey();
  jest.resetModules();
  ({ app } = require('../server/index'));
    const res = await request(app).get('/api/weather').query({ location: 'Paris', units: 'C' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/api key/i);
  });

  test('400 when missing location', async () => {
    const res = await request(app).get('/api/weather').query({ units: 'C' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Location required/);
  });

  test('returns aggregated 3 days from OWM', async () => {
    setMockDaily();
    const res = await request(app)
      .get('/api/weather')
      .query({ location: '37.7749,-122.4194', units: 'F', refresh: 30 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.days)).toBe(true);
    expect(res.body.days.length).toBeGreaterThan(0);
    expect(['C', 'F']).toContain(res.body.units);
  });

  test('uses cache on repeat within refresh window', async () => {
    setMockDaily();
    const r1 = await request(app)
      .get('/api/weather')
      .query({ location: '37.7749,-122.4194', units: 'C', refresh: 60 });
    expect(r1.status).toBe(200);
    // second call should not trigger axios
    const callsBefore = axios.get.mock.calls.length;
    const r2 = await request(app)
      .get('/api/weather')
  .query({ location: '37.7749,-122.4194', units: 'C', refresh: 60 });
    const callsAfter = axios.get.mock.calls.length;
    expect(r2.status).toBe(200);
    expect(callsAfter).toBe(callsBefore);
    expect(r2.body.cached).toBe(true);
  });
});
