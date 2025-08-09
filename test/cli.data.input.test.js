const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { spawn } = require('child_process');

let tmpDir;
let serverProcess;
let serverUrl;

const CLI = (args, opts={}) => spawnSync('node', ['cli/index.js', ...args], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, ...opts.env },
  encoding: 'utf8'
});

function startRealServer() {
  return new Promise((resolve, reject) => {
    // Create isolated tmp dir for this test
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdisplay-cli-'));
    
    // Find an available port
    const testPort = 50000 + Math.floor(Math.random() * 10000);
    serverUrl = `http://localhost:${testPort}`;
    
    // Start the server as a separate process
    serverProcess = spawn('node', ['server/index.js'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        PORT: testPort.toString(),
        HDS_UPLOADS_DIR: tmpDir,
        NODE_ENV: 'test'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let serverReady = false;
    let output = '';
    
    const timeout = setTimeout(() => {
      if (!serverReady) {
        reject(new Error(`Server didn't start within 10s. Output: ${output}`));
      }
    }, 10000);

    serverProcess.stdout.on('data', (data) => {
      output += data.toString();
      // Look for the server start message
      if (output.includes(`[hdisplay] server listening on :${testPort}`) && !serverReady) {
        serverReady = true;
        clearTimeout(timeout);
        // Give it a moment to be fully ready
        setTimeout(() => resolve(), 500);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      output += data.toString();
    });

    serverProcess.on('exit', (code) => {
      if (!serverReady) {
        reject(new Error(`Server exited early with code ${code}. Output: ${output}`));
      }
    });
  });
}

function stopRealServer() {
  return new Promise((resolve) => {
    if (!serverProcess) {
      resolve();
      return;
    }

    let exited = false;
    let forceKillTimeout;

    const onExit = () => {
      if (exited) return;
      exited = true;
      
      // Clear the force kill timeout if it exists
      if (forceKillTimeout) {
        clearTimeout(forceKillTimeout);
        forceKillTimeout = null;
      }
      
      try { 
        fs.rmSync(tmpDir, { recursive: true, force: true }); 
      } catch {}
      resolve();
    };

    serverProcess.on('exit', onExit);
    serverProcess.kill('SIGTERM');
    
    // Force kill after 2 seconds if it doesn't exit gracefully
    forceKillTimeout = setTimeout(() => {
      if (!exited && serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL');
        setTimeout(onExit, 100); // Give it a moment to actually exit
      }
    }, 2000);
  });
}

describe('CLI data input modes', () => {
  beforeAll(async () => {
    await startRealServer();
  });

  afterAll(async () => {
    await stopRealServer();
  });

  function expectOk(res) {
    if (res.status !== 0) {
      throw new Error(`CLI failed (status ${res.status})\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`);
    }
  }

  test('--data inline JSON', () => {
    const res = CLI(['--server', serverUrl, '--timeout', '10000', 'template', 'animated-text', '--data', '{"text":"Hi"}']);
    expectOk(res);
  });

  test('--data-file path JSON', () => {
    const tmp = path.join(__dirname, 'tmp.data.json');
    fs.writeFileSync(tmp, JSON.stringify({ text: 'FromFile' }));
    const res = CLI(['--server', serverUrl, '--timeout', '10000', 'template', 'animated-text', '--data-file', tmp]);
    fs.unlinkSync(tmp);
    expectOk(res);
  });

  test('--data - reads stdin', () => {
    const child = spawnSync('bash', ['-lc', `printf '{"text":"FromStdin"}' | node cli/index.js --server ${serverUrl} --timeout 10000 template animated-text --data -`], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8'
    });
    if (child.status !== 0) {
      throw new Error(`CLI failed (status ${child.status})\nSTDOUT:\n${child.stdout}\nSTDERR:\n${child.stderr}`);
    }
  });

  test('invalid JSON returns error', () => {
    const res = CLI(['--server', serverUrl, '--timeout', '5000', 'template', 'animated-text', '--data', '{bad}']);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/Invalid JSON/);
  });
});
