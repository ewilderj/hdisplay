#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const UPLOADS_DIR = process.env.HDS_UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// In-memory state
const state = {
  content: '<div class="center">hdisplay ready</div>',
  notification: null,
  updatedAt: new Date().toISOString(),
  lastTemplate: null
};

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// Serve static assets
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR, { fallthrough: true }));

// Multer storage
const multer = require('multer');
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOADS_DIR); },
  filename: function (req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({ storage });
// Memory storage for ephemeral pushes
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// Ephemeral store served from memory (no disk persistence)
const crypto = require('crypto');
const EPHEMERAL_TTL_MS = Number(process.env.HDS_EPHEMERAL_TTL_MS || 10 * 60 * 1000);
const ephemeralStore = new Map(); // id -> { buffer, contentType, createdAt }

app.get('/ephemeral/:id', (req, res) => {
  const item = ephemeralStore.get(req.params.id);
  if (!item) return res.status(404).end();
  res.setHeader('Content-Type', item.contentType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.send(item.buffer);
});

setInterval(() => {
  const now = Date.now();
  for (const [id, v] of ephemeralStore.entries()) {
    if ((now - v.createdAt) > EPHEMERAL_TTL_MS) ephemeralStore.delete(id);
  }
}, Math.min(EPHEMERAL_TTL_MS, 60 * 1000)).unref();

function sanitizeName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function setImageContentURL(url) {
  const html = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000;"><img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain"/></div>`;
  state.content = html;
  state.updatedAt = new Date().toISOString();
  io.emit('content:update', { content: state.content, updatedAt: state.updatedAt });
}
function setVideoContentURL(url) {
  const html = `<video src="${url}" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover;background:#000"></video>`;
  state.content = html;
  state.updatedAt = new Date().toISOString();
  io.emit('content:update', { content: state.content, updatedAt: state.updatedAt });
}

// Render template
function renderTemplate(content, data={}) {
  return content.replace(/{{\s*([a-zA-Z0-9_\.]+)\s*}}/g, (_, key) => {
    const val = key.split('.').reduce((o,k)=> (o && typeof o === 'object') ? o[k] : undefined, data);
    if (val === undefined || val === null) return '';
    if (typeof val === 'object') {
      try { return JSON.stringify(val); } catch { return ''; }
    }
    return String(val);
  });
}

// Helpers for templates
function listTemplateFiles() {
  try {
    const names = fs.readdirSync(TEMPLATES_DIR);
    return names.filter(n => n.toLowerCase().endsWith('.html')).sort();
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

// API routes
app.get('/api/status', (req, res) => {
  res.json({
    content: state.content,
    notification: state.notification,
    updatedAt: state.updatedAt
  });
});

app.post('/api/content', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string' || content.length === 0) {
    return res.status(400).json({ error: 'content (string) required' });
  }
  state.content = content;
  state.updatedAt = new Date().toISOString();
  io.emit('content:update', { content: state.content, updatedAt: state.updatedAt });
  res.json({ ok: true });
});

app.get('/api/templates', (req, res) => {
  const files = listTemplateFiles();
  const templates = files.map(f => {
    const full = path.join(TEMPLATES_DIR, f);
    let placeholders = [];
    try { const c = fs.readFileSync(full,'utf8'); placeholders = parseTemplatePlaceholders(c); } catch {}
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
    const raw = fs.readFileSync(full,'utf8');
    const html = renderTemplate(raw, req.body.data || {});
    state.content = html;
    state.lastTemplate = { id, appliedAt: new Date().toISOString(), data: req.body.data || {} };
    state.updatedAt = new Date().toISOString();
    io.emit('content:update', { content: state.content, updatedAt: state.updatedAt, template: state.lastTemplate });
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
  state.content = '';
  state.notification = null;
  state.updatedAt = new Date().toISOString();
  io.emit('content:update', { content: state.content, updatedAt: state.updatedAt });
  io.emit('notification:clear');
  res.json({ ok: true });
});

// Upload endpoints
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file field required' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ ok: true, file: { name: req.file.originalname, url, size: req.file.size, type: req.file.mimetype } });
});

app.get('/api/uploads', (req, res) => {
  const files = fs.readdirSync(UPLOADS_DIR).map(name => ({ name, url: `/uploads/${name}` }));
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
      const id = crypto.randomUUID();
      ephemeralStore.set(id, { buffer: req.file.buffer, contentType: req.file.mimetype, createdAt: Date.now() });
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
      const id = crypto.randomUUID();
      ephemeralStore.set(id, { buffer: req.file.buffer, contentType: req.file.mimetype, createdAt: Date.now() });
      url = `/ephemeral/${id}`;
    }
  }
  if (!url) return res.status(400).json({ error: 'file or url required' });
  setVideoContentURL(url);
  res.json({ ok: true, url });
});

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
  const Bonjour = (BonjourModule && (BonjourModule.default || BonjourModule.Bonjour)) || BonjourModule;
  const bonjour = new Bonjour();
  let bonjourService;

  server.listen(PORT, () => {
    console.log(`[hdisplay] server listening on :${PORT}`);
    try {
      bonjourService = bonjour.publish({ name: `hdisplay@${require('os').hostname()}`, type: 'hdisplay', port: Number(PORT), txt: { version: '0.1.0' } });
      bonjourService.start();
      console.log('[hdisplay] mDNS service published: _hdisplay._tcp');
    } catch (e) {
      console.warn('[hdisplay] mDNS publish failed:', e.message);
    }
  });

  function shutdown() {
    console.log('\n[hdisplay] shutting down...');
    if (bonjourService) { try { bonjourService.stop(); } catch {} }
    try { bonjour.destroy(); } catch {}
    server.close(()=> process.exit(0));
    setTimeout(()=> process.exit(0), 1000).unref();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { app, UPLOADS_DIR };
