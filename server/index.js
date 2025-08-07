#!/usr/bin/env node
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;

// In-memory state
const state = {
  content: '<div class="center">hdisplay ready</div>',
  notification: null,
  updatedAt: new Date().toISOString()
};

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false }));

// Serve static assets
app.use('/', express.static(path.join(__dirname, 'public')));

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

app.post('/api/notification', (req, res) => {
  const { message, duration = 5000 } = req.body;
  if (typeof message !== 'string' || message.length === 0) {
    return res.status(400).json({ error: 'message (string) required' });
  }
  state.notification = { message, duration, createdAt: Date.now() };
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

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  socket.emit('content:update', { content: state.content, updatedAt: state.updatedAt });
  if (state.notification) socket.emit('notification', state.notification);
});

server.listen(PORT, () => {
  console.log(`[hdisplay] server listening on :${PORT}`);
});
