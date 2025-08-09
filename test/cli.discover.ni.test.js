const path = require('path');
const { spawnSync } = require('child_process');

const CLI = (args, opts={}) => spawnSync('node', ['cli/index.js', ...args], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, ...opts.env },
  encoding: 'utf8'
});

describe('CLI discover non-interactive', () => {
  test('--non-interactive selects first with --set', () => {
    const fakeImpl = path.join(__dirname, 'fixtures', 'fake-discover.js');
    const tmpCfg = path.join(__dirname, 'fixtures', 'tmp.hdisplay.json');
    const res = CLI(['discover', '--set', '--non-interactive', '--timeout', '1000'], {
      env: { HDISPLAY_DISCOVER_IMPL: fakeImpl, HDISPLAY_CONFIG_PATH: tmpCfg }
    });
    try { require('fs').unlinkSync(tmpCfg); } catch {}
    expect(res.status).toBe(0);
    expect(res.stderr).toBe('');
    expect(res.stdout).toMatch(/Configured server:/);
  });
});
