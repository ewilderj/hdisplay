const fs = require('fs');
const path = require('path');
const axios = require('axios');

const WEATHER_MIN_REFRESH_MIN = 10;
const WEATHER_MAX_REFRESH_MIN = 120;
const WEATHER_STALE_TOLERANCE_MS = 2 * 60 * 60 * 1000; // 2 hours

const weatherCache = new Map(); // key: `${provider}|${loc}|${units}` -> { data, fetchedAt, ttlMs }

function getConfigPath() {
  return process.env.HDS_CONFIG_PATH || path.join(__dirname, '..', 'config.json');
}

function getConfigJSON() {
  try {
    const cfgPath = getConfigPath();
    if (fs.existsSync(cfgPath)) {
      const raw = fs.readFileSync(cfgPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch {}
  return {};
}

function getWeatherProviderId() {
  const cfg = getConfigJSON();
  const raw = (cfg && cfg.weather && cfg.weather.provider) || null;
  const val = String(raw || '').toLowerCase();
  if (val === 'tomorrowio') return 'tomorrowio';
  if (val === 'openweathermap') return 'openweathermap';
  return 'tomorrowio';
}

function getOWMApiKey() {
  const fromEnv = process.env.OPENWEATHERMAP_API_KEY;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  try {
    const cfg = getConfigJSON();
    const val = cfg?.apiKeys?.openweathermap;
    if (val && String(val).trim()) return String(val).trim();
  } catch {}
  return null;
}

function getTomorrowApiKey() {
  const e1 = process.env.TOMORROW_API_KEY;
  if (e1 && String(e1).trim()) return String(e1).trim();
  try {
    const cfg = getConfigJSON();
    const a = cfg?.apiKeys?.tomorrowio;
    if (a && String(a).trim()) return String(a).trim();
  } catch {}
  return null;
}

function parseLatLonOrQuery(loc) {
  const s = String(loc || '').trim();
  if (!s) return null;
  const parts = s.split(',').map((x) => x.trim());
  if (parts.length === 2) {
    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }
  return { q: s };
}

function clampRefreshMinutes(m) {
  const n = Number(m);
  if (!Number.isFinite(n)) return 30;
  return Math.max(WEATHER_MIN_REFRESH_MIN, Math.min(WEATHER_MAX_REFRESH_MIN, Math.floor(n)));
}

function unitsToOWM(units) {
  return units === 'F' ? 'imperial' : 'metric';
}

const weatherProviders = {
  openweathermap: {
    id: 'openweathermap',
    needsApiKey: true,
    getApiKey: getOWMApiKey,
    parseLocation(locStr) {
      return parseLatLonOrQuery(locStr);
    },
    async geocode(apiKey, loc) {
      if (loc.lat != null && loc.lon != null) return { name: null, country: null, lat: loc.lat, lon: loc.lon };
      const url = 'https://api.openweathermap.org/geo/1.0/direct';
      const res = await axios.get(url, { params: { q: loc.q, limit: 1, appid: apiKey }, timeout: 5000 });
      const arr = Array.isArray(res && res.data) ? res.data : [];
      if (arr.length === 0) return null;
      const it = arr[0];
      return { name: it.name || loc.q, country: it.country || null, lat: it.lat, lon: it.lon };
    },
    async fetchForecast(apiKey, coords, units) {
      const url = 'https://api.openweathermap.org/data/3.0/onecall';
      const params = {
        lat: coords.lat,
        lon: coords.lon,
        units: unitsToOWM(units),
        exclude: 'minutely,hourly,alerts',
        appid: apiKey,
      };
      const res = await axios.get(url, { params, timeout: 5000 });
      return (res && res.data) || {};
    },
    aggregate(data) {
      const daily = Array.isArray(data?.daily) ? data.daily : [];
      const out = [];
      for (let i = 0; i < daily.length && out.length < 7; i++) {
        const d = daily[i];
        const dt = Number(d.dt) * 1000;
        const date = new Date(dt);
        const key = isFinite(dt) ? date.toISOString().substring(0, 10) : '';
        const ts = isFinite(dt) ? date.toISOString() : null;
        const lo = Number(d.temp?.min);
        const hi = Number(d.temp?.max);
        let icon = null;
        let description = null;
        if (Array.isArray(d.weather) && d.weather[0]) {
          icon = d.weather[0].icon || null;
          description = d.weather[0].description || null;
        }
        if (Number.isFinite(lo) && Number.isFinite(hi)) {
          out.push({ date: key, ts, low: Math.round(lo), high: Math.round(hi), icon, description });
        }
      }
      return out;
    },
    async geocodeZipFallback(apiKey, loc) {
      if (!loc.lat && !loc.lon && /^[0-9]{4,8}(?:,[A-Za-z]{2})?$/.test(loc.q || '')) {
        try {
          const zipUrl = 'https://api.openweathermap.org/geo/1.0/zip';
          const zipRes = await axios.get(zipUrl, {
            params: { zip: loc.q, appid: apiKey },
            timeout: 5000,
          });
          const z = (zipRes && zipRes.data) || {};
          return { name: z.name || loc.q, country: z.country || null, lat: z.lat, lon: z.lon };
        } catch {}
      }
      return null;
    },
  },
  tomorrowio: {
    id: 'tomorrowio',
    needsApiKey: true,
    getApiKey: getTomorrowApiKey,
    parseLocation(locStr) {
      return parseLatLonOrQuery(locStr);
    },
    async geocode(apiKey, loc) {
      if (loc.lat != null && loc.lon != null) return { name: null, country: null, lat: loc.lat, lon: loc.lon };
      const owmKey = getOWMApiKey();
      if (owmKey && loc.q) {
        try { return await weatherProviders.openweathermap.geocode(owmKey, loc); } catch {}
      }
      return null;
    },
    async fetchForecast(apiKey, coords, units) {
      const url = 'https://api.tomorrow.io/v4/weather/forecast';
      const params = {
        location: `${coords.lat},${coords.lon}`,
        timesteps: '1d',
        units: units === 'F' ? 'imperial' : 'metric',
        fields: 'temperatureMin,temperatureMax,weatherCodeMax,weatherCodeMin',
        // startTime: 'now',
        // endTime: 'nowPlus7d',
        apikey: apiKey,
      };
      const res = await axios.get(url, { params, timeout: 5000 });
      return (res && res.data) || {};
    },
    aggregate(data) {
      const daily = (data && data.timelines && Array.isArray(data.timelines.daily) && data.timelines.daily) || [];
      const mapCode = (code) => {
        const c = Number(code);
        if (!Number.isFinite(c)) return null;
        if (c === 1000) return '01d';
        if (c === 1001) return '04d';
        if (c === 1100) return '02d';
        if (c === 1101) return '03d';
        if (c === 1102) return '04d';
        if (c === 2000 || c === 2100) return '50d';
        if (c === 4000) return '09d';
        if (c === 4001) return '10d';
        if (c === 4200) return '10d';
        if (c === 4201) return '10d';
        if (c === 6000 || c === 6001 || c === 6200 || c === 6201) return '10d';
        if (c === 5000 || c === 5001 || c === 5100 || c === 5101) return '13d';
        if (c === 7000 || c === 7101 || c === 7102) return '13d';
        if (c === 8000) return '11d';
        return '03d';
      };
      const codeDesc = (code) => {
        const c = Number(code);
        if (!Number.isFinite(c)) return null;
        const lut = {
          1000: 'clear',
          1001: 'cloudy',
          1100: 'mostly clear',
          1101: 'partly cloudy',
          1102: 'mostly cloudy',
          2000: 'fog',
          2100: 'light fog',
          4000: 'drizzle',
          4001: 'rain',
          4200: 'light rain',
          4201: 'heavy rain',
          5000: 'snow',
          5001: 'flurries',
          5100: 'light snow',
          5101: 'heavy snow',
          6000: 'freezing drizzle',
          6001: 'freezing rain',
          6200: 'light freezing rain',
          6201: 'heavy freezing rain',
          7000: 'ice pellets',
          7101: 'heavy ice pellets',
          7102: 'light ice pellets',
          8000: 'thunderstorm',
        };
        return lut[c] || null;
      };
      const out = [];
      for (let i = 0; i < daily.length && out.length < 7; i++) {
        const d = daily[i];
        const t = d.time || d.startTime;
        let dateStr = '';
        let ts = null;
        try { const dd = new Date(t); ts = dd.toISOString(); dateStr = dd.toISOString().substring(0, 10); } catch {}
        const v = d.values || {};
        const lo = Number(v.temperatureMin);
        const hi = Number(v.temperatureMax);
        const wcRaw =
          (v.weatherCodeMax !== undefined ? v.weatherCodeMax : undefined) ??
          (v.weatherCodeFullDay !== undefined ? v.weatherCodeFullDay : undefined) ??
          (v.weatherCodeDay !== undefined ? v.weatherCodeDay : undefined) ??
          (v.weatherCode !== undefined ? v.weatherCode : undefined) ??
          (v.weatherCodeMin !== undefined ? v.weatherCodeMin : undefined) ??
          null;
        const icon = mapCode(wcRaw);
        const description = codeDesc(wcRaw);
        if (Number.isFinite(lo) && Number.isFinite(hi)) {
          out.push({ date: dateStr, ts, low: Math.round(lo), high: Math.round(hi), icon, description });
        }
      }
      return out;
    },
  },
};

function registerWeatherRoutes(app) {
  app.get('/api/weather', async (req, res) => {
    try {
      const location = String(req.query.location || '').trim();
      const units = String(req.query.units || 'C').toUpperCase() === 'F' ? 'F' : 'C';
      const refresh = clampRefreshMinutes(req.query.refresh);
      const providerId = getWeatherProviderId();
      const provider = weatherProviders[providerId] || weatherProviders.openweathermap;
      const key = `${provider.id}|${location}|${units}`;

      let apiKey = null;
      if (provider.needsApiKey) {
        apiKey = provider.getApiKey ? provider.getApiKey() : null;
        if (!apiKey) return res.status(400).json({ error: 'Weather API key required' });
      }
      if (!location) return res.status(400).json({ error: 'Location required' });

      const now = Date.now();
      const cached = weatherCache.get(key);
      if (cached && now - cached.fetchedAt < cached.ttlMs) {
        return res.json({ ...cached.data, cached: true });
      }

      const locObj = provider.parseLocation ? provider.parseLocation(location) : parseLatLonOrQuery(location);
      if (!locObj) return res.status(400).json({ error: 'Invalid location' });

      let coords = await provider.geocode(apiKey, locObj);
      if (!coords) {
        if (provider.geocodeZipFallback) {
          try { coords = await provider.geocodeZipFallback(apiKey, locObj); } catch {}
        }
      }
      if (!coords) return res.status(404).json({ error: 'Location not found' });

      let forecast;
      try {
        forecast = await provider.fetchForecast(apiKey, coords, units);
      } catch {
        if (cached && now - cached.fetchedAt < WEATHER_STALE_TOLERANCE_MS) {
          return res.json({ ...cached.data, cached: true, stale: true });
        }
        return res.status(502).json({ error: 'Weather API failed' });
      }
  let days = provider.aggregate ? provider.aggregate(forecast) : [];
      if (process.env.NODE_ENV === 'test') {
        try {
          const dailyLen = Array.isArray(forecast && forecast.daily) ? forecast.daily.length : 0;
          console.log('[weather-debug]', { dailyLen, daysLen: Array.isArray(days) ? days.length : -1 });
        } catch {}
      }
      if (process.env.HDS_WEATHER_DEBUG && provider.id === 'tomorrowio') {
        try {
          const rawDaily = forecast?.timelines?.daily || [];
          const diag = rawDaily.slice(0, 6).map((d, i) => {
            const v = d.values || {};
            const code = v.weatherCode;
            const day = v.weatherCodeDay;
            const fullDay = v.weatherCodeFullDay;
            const max = v.weatherCodeMax;
            const min = v.weatherCodeMin;
            const chosen = (max !== undefined ? max : undefined) ?? (fullDay !== undefined ? fullDay : undefined) ?? (day !== undefined ? day : undefined) ?? (code !== undefined ? code : undefined) ?? (min !== undefined ? min : undefined) ?? null;
            return {
              idx: i,
              codes: { day, fullDay, code, max, min },
              chosen: {
                value: chosen,
                source: max !== undefined ? 'weatherCodeMax' : fullDay !== undefined ? 'weatherCodeFullDay' : day !== undefined ? 'weatherCodeDay' : code !== undefined ? 'weatherCode' : min !== undefined ? 'weatherCodeMin' : 'none',
              },
              mapped: days[i] ? days[i].icon : null,
              desc: days[i] ? days[i].description : null,
            };
          });
          console.log('[weather-debug] tomorrowio map', JSON.stringify(diag));
        } catch {}
      }
      const payload = {
        location: { name: coords.name, country: coords.country, lat: coords.lat, lon: coords.lon },
  days,
        units,
      };
      weatherCache.set(key, { data: payload, fetchedAt: now, ttlMs: refresh * 60 * 1000 });
      return res.json(payload);
    } catch (e) {
      try { console.warn('[hdisplay] /api/weather error:', e && e.message ? e.message : e); } catch {}
      return res.status(500).json({ error: e.message || 'server error' });
    }
  });
}

module.exports = { registerWeatherRoutes };
