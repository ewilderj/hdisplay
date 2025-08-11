#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const UPLOADS_DIR = process.env.HDS_UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Persistent state path (override with HDS_DATA_DIR for tests/alt deployments)
const DATA_DIR = process.env.HDS_DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

// In-memory state
const state = {
  content: '<div class="center">hdisplay ready</div>',
  notification: null,
  updatedAt: new Date().toISOString(),
  lastTemplate: null,
  playlist: {
    delayMs: 20000,
    items: [],
  },
};

// Playlist runtime (not persisted)
let playlistIndex = 0;
let rotationTimer = null;
let overrideTimer = null;
let overrideActive = false;

function saveState() {
  // Persist only selected fields
  const snapshot = {
    content: state.content,
    updatedAt: state.updatedAt,
    lastTemplate: state.lastTemplate,
    playlist: {
      delayMs: clampDelay(state.playlist?.delayMs),
      items: Array.isArray(state.playlist?.items) ? state.playlist.items : [],
    },
  };
  try {
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    // Non-fatal
    console.warn('[hdisplay] failed to save state:', e.message);
  }
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const s = JSON.parse(raw);
    if (s && typeof s === 'object') {
      if (typeof s.content === 'string') state.content = s.content;
      if (typeof s.updatedAt === 'string') state.updatedAt = s.updatedAt;
      if (s.lastTemplate && typeof s.lastTemplate === 'object') state.lastTemplate = s.lastTemplate;
      if (s.playlist && typeof s.playlist === 'object') {
        state.playlist.delayMs = clampDelay(Number(s.playlist.delayMs) || 20000);
        state.playlist.items = Array.isArray(s.playlist.items)
          ? s.playlist.items.filter(Boolean)
          : [];
      }
    }
  } catch {
    // ignore if missing or invalid
  }
}

// Load persisted state at startup (best effort)
loadState();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// Serve static assets
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR, { fallthrough: true }));

// Multer storage
const multer = require('multer');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({ storage });
// Memory storage for ephemeral pushes
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// Ephemeral store served from memory (no disk persistence)
const nodeCrypto = require('crypto');
const EPHEMERAL_TTL_MS = Number(process.env.HDS_EPHEMERAL_TTL_MS || 10 * 60 * 1000);
const ephemeralStore = new Map(); // id -> { buffer, contentType, createdAt }

app.get('/ephemeral/:id', (req, res) => {
  const item = ephemeralStore.get(req.params.id);
  if (!item) return res.status(404).end();
  res.setHeader('Content-Type', item.contentType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.send(item.buffer);
});

setInterval(
  () => {
    const now = Date.now();
    for (const [id, v] of ephemeralStore.entries()) {
      if (now - v.createdAt > EPHEMERAL_TTL_MS) ephemeralStore.delete(id);
    }
  },
  Math.min(EPHEMERAL_TTL_MS, 60 * 1000)
).unref();

function sanitizeName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function setImageContentURL(url) {
  const html = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000;"><img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain"/></div>`;
  applyContentUpdate({ html });
}
function setVideoContentURL(url) {
  const html = `<video src="${url}" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover;background:#000"></video>`;
  applyContentUpdate({ html });
}

// Render template
function renderTemplate(content, data = {}) {
  return content.replace(/{{\s*([a-zA-Z0-9_\.]+)\s*}}/g, (_, key) => {
    const val = key
      .split('.')
      .reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), data);
    if (val === undefined || val === null) return '';
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val);
      } catch {
        return '';
      }
    }
    return String(val);
  });
}

// Helpers for templates
function listTemplateFiles() {
  try {
    const names = fs.readdirSync(TEMPLATES_DIR);
    return names.filter((n) => n.toLowerCase().endsWith('.html')).sort();
  } catch {
    return [];
  }
}

function parseTemplatePlaceholders(content) {
  if (typeof content !== 'string' || !content) return [];
  const re = /{{\s*([a-zA-Z0-9_\.]+)\s*}}/g;
  const set = new Set();
  let m;
  while ((m = re.exec(content))) {
    // Only keep the root key before any dot path
    const k = String(m[1] || '').split('.')[0];
    if (k) set.add(k);
  }
  return Array.from(set);
}

// Delay bounds
function clampDelay(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 20000;
  return Math.max(2000, Math.min(300000, Math.floor(v)));
}

function emitContentUpdate(payload) {
  io.emit('content:update', payload);
}

function setContentInternal(html, templateMeta) {
  state.content = html;
  if (templateMeta) state.lastTemplate = templateMeta;
  else state.lastTemplate = null;
  state.updatedAt = new Date().toISOString();
  emitContentUpdate({
    content: state.content,
    updatedAt: state.updatedAt,
    template: state.lastTemplate || undefined,
  });
  saveState();
}

// Apply a content update coming from legacy methods (not playlist): trigger override if playlist active
function applyContentUpdate({ html, template }) {
  setContentInternal(html, template || null);
  // If a playlist is active (has items), override temporarily then resume
  if (state.playlist.items.length > 0) {
    triggerOverrideAndResume();
  }
}

function triggerOverrideAndResume() {
  // Cancel any rotation and existing override timer
  if (rotationTimer) {
    clearTimeout(rotationTimer);
    rotationTimer = null;
  }
  if (overrideTimer) {
    clearTimeout(overrideTimer);
    overrideTimer = null;
  }
  overrideActive = true;
  const delay = clampDelay(state.playlist.delayMs);
  overrideTimer = setTimeout(() => {
    overrideActive = false;
    // Resume from next item
    if (state.playlist.items.length > 0) {
      playlistIndex = (playlistIndex + 1) % state.playlist.items.length;
      playCurrentPlaylistItem();
    }
  }, delay);
  overrideTimer.unref();
}

function validatePlaylistItem(item) {
  if (!item || typeof item !== 'object') return { ok: false, error: 'invalid item' };
  const id = String(item.id || '');
  if (!id) return { ok: false, error: 'id required' };
  const file = path.join(TEMPLATES_DIR, `${id}.html`);
  if (!fs.existsSync(file)) return { ok: false, error: 'template not found' };
  // Validator
  try {
    const { validateTemplateData } = require('./templates/registry');
    const v = validateTemplateData(id, item.data || {});
    if (v && v.ok === false) return { ok: false, error: v.error || 'invalid data' };
  } catch {}
  return { ok: true };
}

function playCurrentPlaylistItem() {
  if (overrideActive) return; // do not change during override
  const items = state.playlist.items;
  if (!Array.isArray(items) || items.length === 0) return;
  if (playlistIndex < 0 || playlistIndex >= items.length) playlistIndex = 0;
  const current = items[playlistIndex];
  const id = current.id;
  const fileName = id + '.html';
  const full = path.join(TEMPLATES_DIR, fileName);
  if (!fs.existsSync(full)) {
    console.warn('[hdisplay] playlist item missing on disk, skipping:', id);
    // advance to next
    playlistIndex = (playlistIndex + 1) % items.length;
    scheduleNextRotation();
    return;
  }
  try {
    // Render
    const raw = fs.readFileSync(full, 'utf8');
    const html = renderTemplate(raw, current.data || {});
    setContentInternal(html, { id, appliedAt: new Date().toISOString(), data: current.data || {} });
  } catch (e) {
    console.warn('[hdisplay] failed to render playlist item', id, e.message);
  }
  scheduleNextRotation();
}

function scheduleNextRotation() {
  if (overrideActive) return;
  if (rotationTimer) {
    clearTimeout(rotationTimer);
    rotationTimer = null;
  }
  const items = state.playlist.items || [];
  if (items.length <= 1) return; // single or empty: no rotation
  const delay = clampDelay(state.playlist.delayMs);
  rotationTimer = setTimeout(() => {
    if (!overrideActive && items.length > 0) {
      playlistIndex = (playlistIndex + 1) % items.length;
      playCurrentPlaylistItem();
    }
  }, delay);
  rotationTimer.unref();
}

function startPlaylistIfActive() {
  const items = state.playlist.items || [];
  if (items.length === 0) {
    stopPlaylist();
    return;
  }
  // Show current (or first) immediately, then schedule
  if (playlistIndex >= items.length) playlistIndex = 0;
  playCurrentPlaylistItem();
}

function stopPlaylist() {
  if (rotationTimer) {
    clearTimeout(rotationTimer);
    rotationTimer = null;
  }
  if (overrideTimer) {
    clearTimeout(overrideTimer);
    overrideTimer = null;
  }
  overrideActive = false;
}

// API routes
app.get('/api/status', (req, res) => {
  res.json({
    content: state.content,
    notification: state.notification,
    updatedAt: state.updatedAt,
  });
});

// Health/readiness endpoint
app.get('/healthz', (req, res) => {
  let version = 'unknown';
  try {
    version = require('../package.json').version || 'unknown';
  } catch {}
  res.json({ ok: true, version, uptime: process.uptime() });
});

app.post('/api/content', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string' || content.length === 0) {
    return res.status(400).json({ error: 'content (string) required' });
  }
  applyContentUpdate({ html: content });
  res.json({ ok: true });
});

app.get('/api/templates', (req, res) => {
  const files = listTemplateFiles();
  const templates = files.map((f) => {
    const full = path.join(TEMPLATES_DIR, f);
    let placeholders = [];
    try {
      const c = fs.readFileSync(full, 'utf8');
      placeholders = parseTemplatePlaceholders(c);
    } catch {}
    return { id: path.basename(f, '.html'), file: f, placeholders };
  });
  res.json({ templates });
});

app.post('/api/template/:id', (req, res) => {
  const id = req.params.id;
  const fileName = id + '.html';
  const full = path.join(TEMPLATES_DIR, fileName);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'template not found' });
  try {
    const data = req.body.data || {};
    // Delegate validation to per-template validators, if present
    try {
      const { validateTemplateData } = require('./templates/registry');
      const v = validateTemplateData(id, data);
      if (v && v.ok === false) {
        return res.status(400).json({ error: v.error || 'invalid data' });
      }
    } catch (e) {
      // If registry load fails, continue without validation (backwards compatible)
    }

    const raw = fs.readFileSync(full, 'utf8');
    const html = renderTemplate(raw, data);
    applyContentUpdate({ html, template: { id, appliedAt: new Date().toISOString(), data } });
    return res.json({ ok: true, template: state.lastTemplate });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/notification', (req, res) => {
  const { message, duration = 5000, level = 'info' } = req.body;
  if (typeof message !== 'string' || message.length === 0) {
    return res.status(400).json({ error: 'message (string) required' });
  }
  state.notification = { message, duration, level, createdAt: Date.now() };
  io.emit('notification', state.notification);
  res.json({ ok: true });
});

app.post('/api/clear', (req, res) => {
  state.notification = null;
  applyContentUpdate({ html: '' });
  io.emit('notification:clear');
  // Also clear playlist and stop rotation/overrides
  state.playlist.items = [];
  playlistIndex = 0;
  stopPlaylist();
  saveState();
  io.emit('playlist:update', {
    delayMs: clampDelay(state.playlist.delayMs),
    items: [],
    active: false,
  });
  res.json({ ok: true });
});

// Upload endpoints
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file field required' });
  const url = `/uploads/${req.file.filename}`;
  res.json({
    ok: true,
    file: { name: req.file.originalname, url, size: req.file.size, type: req.file.mimetype },
  });
});

app.get('/api/uploads', (req, res) => {
  const files = fs.readdirSync(UPLOADS_DIR).map((name) => ({ name, url: `/uploads/${name}` }));
  res.json({ files });
});

app.delete('/api/uploads/:name', (req, res) => {
  const name = req.params.name;
  const full = path.join(UPLOADS_DIR, name);
  if (!full.startsWith(UPLOADS_DIR)) return res.status(400).json({ error: 'invalid path' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'not found' });
  fs.unlinkSync(full);
  res.json({ ok: true });
});

// Push image without requiring persistence: accepts multipart 'file' or JSON body with 'url'
app.post('/api/push/image', memUpload.single('file'), (req, res) => {
  const persist = String(req.query.persist ?? req.body?.persist ?? 'false') === 'true';
  let url = req.body && req.body.url;
  if (!url && req.file) {
    if (persist) {
      const filename = `${Date.now()}_${sanitizeName(req.file.originalname)}`;
      const full = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(full, req.file.buffer);
      url = `/uploads/${filename}`;
    } else {
      const id = nodeCrypto.randomUUID();
      ephemeralStore.set(id, {
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
        createdAt: Date.now(),
      });
      url = `/ephemeral/${id}`;
    }
  }
  if (!url) return res.status(400).json({ error: 'file or url required' });
  setImageContentURL(url);
  res.json({ ok: true, url });
});

// Push video without requiring persistence: accepts multipart 'file' or JSON body with 'url'
app.post('/api/push/video', memUpload.single('file'), (req, res) => {
  const persist = String(req.query.persist ?? req.body?.persist ?? 'false') === 'true';
  let url = req.body && req.body.url;
  if (!url && req.file) {
    if (persist) {
      const filename = `${Date.now()}_${sanitizeName(req.file.originalname)}`;
      const full = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(full, req.file.buffer);
      url = `/uploads/${filename}`;
    } else {
      const id = nodeCrypto.randomUUID();
      ephemeralStore.set(id, {
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
        createdAt: Date.now(),
      });
      url = `/ephemeral/${id}`;
    }
  }
  if (!url) return res.status(400).json({ error: 'file or url required' });
  setVideoContentURL(url);
  res.json({ ok: true, url });
});

// Playlist API
app.get('/api/playlist', (req, res) => {
  const items = Array.isArray(state.playlist.items) ? state.playlist.items : [];
  res.json({ delayMs: clampDelay(state.playlist.delayMs), items, active: items.length > 0 });
});

app.put('/api/playlist', (req, res) => {
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : state.playlist.items;
  const delayMs =
    body.delayMs !== undefined ? clampDelay(body.delayMs) : clampDelay(state.playlist.delayMs);
  // Validate all items
  for (const it of items) {
    const v = validatePlaylistItem(it);
    if (!v.ok) {
      const code = v.error === 'template not found' ? 404 : 400;
      return res.status(code).json({ error: v.error });
    }
  }
  state.playlist.items = items;
  state.playlist.delayMs = delayMs;
  playlistIndex = 0;
  saveState();
  io.emit('playlist:update', { delayMs, items, active: items.length > 0 });
  if (items.length > 0) {
    startPlaylistIfActive();
  } else {
    stopPlaylist();
  }
  res.json({ ok: true, playlist: { delayMs, items, active: items.length > 0 } });
});

app.post('/api/playlist/items', (req, res) => {
  const item = req.body || {};
  const v = validatePlaylistItem(item);
  if (!v.ok) {
    const code = v.error === 'template not found' ? 404 : 400;
    return res.status(code).json({ error: v.error });
  }
  state.playlist.items.push({ id: String(item.id), data: item.data || {} });
  saveState();
  io.emit('playlist:update', {
    delayMs: clampDelay(state.playlist.delayMs),
    items: state.playlist.items,
    active: state.playlist.items.length > 0,
  });
  if (state.playlist.items.length === 1 && !overrideActive) {
    playlistIndex = 0;
    startPlaylistIfActive();
  }
  res.json({ ok: true, index: state.playlist.items.length - 1 });
});

app.delete('/api/playlist/items/:index', (req, res) => {
  const idx = Number(req.params.index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= state.playlist.items.length) {
    return res.status(400).json({ error: 'invalid index' });
  }
  state.playlist.items.splice(idx, 1);
  if (playlistIndex >= state.playlist.items.length) playlistIndex = 0;
  saveState();
  io.emit('playlist:update', {
    delayMs: clampDelay(state.playlist.delayMs),
    items: state.playlist.items,
    active: state.playlist.items.length > 0,
  });
  if (state.playlist.items.length === 0) stopPlaylist();
  res.json({ ok: true });
});

app.delete('/api/playlist/items/by-id/:id', (req, res) => {
  const id = String(req.params.id || '');
  const idx = state.playlist.items.findIndex((it) => String(it.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  state.playlist.items.splice(idx, 1);
  if (playlistIndex >= state.playlist.items.length) playlistIndex = 0;
  saveState();
  io.emit('playlist:update', {
    delayMs: clampDelay(state.playlist.delayMs),
    items: state.playlist.items,
    active: state.playlist.items.length > 0,
  });
  if (state.playlist.items.length === 0) stopPlaylist();
  res.json({ ok: true, removedIndex: idx });
});

app.post('/api/playlist/delay', (req, res) => {
  const { delayMs } = req.body || {};
  const v = clampDelay(delayMs);
  state.playlist.delayMs = v;
  saveState();
  io.emit('playlist:update', {
    delayMs: v,
    items: state.playlist.items,
    active: state.playlist.items.length > 0,
  });
  // Restart timers if rotating
  if (!overrideActive && state.playlist.items.length > 1) {
    scheduleNextRotation();
  }
  res.json({ ok: true, delayMs: v });
});

// Weather API
try {
  const { registerWeatherRoutes } = require('./weather');
  registerWeatherRoutes(app);
} catch (e) {
  console.warn('[hdisplay] weather module not loaded:', e && e.message ? e.message : e);
}

// Create server and io, but do not listen unless run directly
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  socket.emit('content:update', { content: state.content, updatedAt: state.updatedAt });
  if (state.notification) socket.emit('notification', state.notification);
});

if (require.main === module) {
  // Lazy-require bonjour to avoid import issues in tests
  const BonjourModule = require('bonjour-service');
  const Bonjour =
    (BonjourModule && (BonjourModule.default || BonjourModule.Bonjour)) || BonjourModule;
  const bonjour = new Bonjour();
  let bonjourService;

  server.listen(PORT, () => {
    console.log(`[hdisplay] server listening on :${PORT}`);
    try {
      bonjourService = bonjour.publish({
        name: `hdisplay@${require('os').hostname()}`,
        type: 'hdisplay',
        port: Number(PORT),
        txt: { version: '0.1.0' },
      });
      bonjourService.start();
      console.log('[hdisplay] mDNS service published: _hdisplay._tcp');
    } catch (e) {
      console.warn('[hdisplay] mDNS publish failed:', e.message);
    }
    // Start playlist if present
    try {
      startPlaylistIfActive();
    } catch {}
  });

  function shutdown() {
    console.log('\n[hdisplay] shutting down...');
    if (bonjourService) {
      try {
        bonjourService.stop();
      } catch {}
    }
    try {
      bonjour.destroy();
    } catch {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { app, UPLOADS_DIR, server };
