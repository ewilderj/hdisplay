#!/usr/bin/env node
// Minimal CJS shim that delegates to the ESM CLI entry (index.mjs)
(async () => {
  try {
    const path = require('path');
    const { pathToFileURL } = require('url');
    const esmEntry = pathToFileURL(path.join(__dirname, 'index.mjs')).href;
    const mod = await import(esmEntry);
    const run = mod.default || mod.run || mod;
    await run(process.argv.slice(2));
  } catch (e) {
    console.error(e && e.message ? e.message : e);
    process.exit(1);
  }
})();
