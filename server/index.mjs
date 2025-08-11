#!/usr/bin/env node
import { pathToFileURL } from 'url';
import os from 'os';
import BonjourModule from 'bonjour-service';
import srv from './index.js';

export const app = srv.app;
export const UPLOADS_DIR = srv.UPLOADS_DIR;
export const server = srv.server;
export default srv;

const PORT = process.env.PORT || 3000;

async function start() {
  const Bonjour = (BonjourModule && (BonjourModule.default || BonjourModule.Bonjour)) || BonjourModule;
  const bonjour = new Bonjour();
  let bonjourService;

  server.listen(PORT, () => {
    console.log(`[hdisplay] server listening on :${PORT}`);
    try {
      bonjourService = bonjour.publish({
        name: `hdisplay@${os.hostname()}`,
        type: 'hdisplay',
        port: Number(PORT),
        txt: { version: '0.1.0' },
      });
      bonjourService.start();
      console.log('[hdisplay] mDNS service published: _hdisplay._tcp');
    } catch (e) {
      console.warn('[hdisplay] mDNS publish failed:', e.message);
    }
  });

  function shutdown() {
    console.log('\n[hdisplay] shutting down...');
    if (bonjourService) {
      try { bonjourService.stop(); } catch {}
    }
    try { bonjour.destroy(); } catch {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  start();
}
