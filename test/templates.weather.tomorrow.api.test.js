const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

jest.mock('axios');
const axios = require('axios');

describe('Weather API - Tomorrow.io provider', () => {
  let app;
  let tmpDir;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdisplay-weather-tio-'));
    process.env.HDS_UPLOADS_DIR = tmpDir;
    // point to temp config.json that sets provider and api key
    const cfgPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({ weather: { provider: 'tomorrowio' }, apiKeys: { tomorrowio: 'x-key' } })
    );
    process.env.HDS_CONFIG_PATH = cfgPath;

    axios.get.mockImplementation((url, { params } = {}) => {
      if (url.includes('api.tomorrow.io/v4/weather/forecast')) {
        return Promise.resolve({
          data: {
            timelines: {
              daily: [
                {
                  time: '2025-01-01T00:00:00Z',
                  values: { temperatureMin: 10, temperatureMax: 18, weatherCodeFullDay: 1000 },
                },
                {
                  time: '2025-01-02T00:00:00Z',
                  values: { temperatureMin: 11, temperatureMax: 17, weatherCodeFullDay: 1100 },
                },
              ],
            },
          },
        });
      }
      return Promise.reject(new Error('unexpected axios url ' + url));
    });

    ({ app } = require('../server/index'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    delete process.env.HDS_UPLOADS_DIR;
    delete process.env.HDS_CONFIG_PATH;
    delete process.env.TOMORROW_API_KEY;
    delete process.env.TOMORROWIO_API_KEY;
  });

  test('returns aggregated days from Tomorrow.io', async () => {
    const res = await request(app)
      .get('/api/weather')
      .query({ location: '37.7749,-122.4194', units: 'C', refresh: 30 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.days)).toBe(true);
    expect(res.body.days.length).toBeGreaterThan(0);
    expect(['C', 'F']).toContain(res.body.units);
  });
});
