const path = require('path');
const fs = require('fs');

// Use a temp config file so tests never touch ~/.hdisplay.json
const tmpCfg = path.join(__dirname, 'fixtures', 'jest.hdisplay.json');
process.env.HDISPLAY_CONFIG_PATH = tmpCfg;

try {
  fs.mkdirSync(path.join(__dirname, 'fixtures'), { recursive: true });
} catch {}

// Default discover impl returns empty list to avoid mDNS scans during tests
if (!process.env.HDISPLAY_DISCOVER_IMPL) {
  process.env.HDISPLAY_DISCOVER_IMPL = path.join(__dirname, 'fixtures', 'empty-discover.js');
}
