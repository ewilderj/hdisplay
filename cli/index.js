#!/usr/bin/env node
const { Command } = require('commander');
const axios = require('axios');
// Normalize chalk import for ESM-only v5 (require returns { default: chalkFn })
const chalkImport = require('chalk');
const chalk = chalkImport.default || chalkImport;
const fs = require('fs');
const os = require('os');
const path = require('path');
const discover = require(process.env.HDISPLAY_DISCOVER_IMPL || './commands/discover');
const FormData = require('form-data');
const axiosLib = axios; // alias
const readline = require('readline');

const ALLOWED_LEVELS = new Set(['info','warn','error','success']);

const program = new Command();
const CONFIG_PATH = process.env.HDISPLAY_CONFIG_PATH || path.join(os.homedir(), '.hdisplay.json');

program
  .name('hdisplay')
  .description('CLI to control hdisplay content server')
  .version('0.1.0')
  .showHelpAfterError()
  .allowExcessArguments(false)
  .option('--server <url>', 'Override server URL (flag > env > config > default)')
  .option('--timeout <ms>', 'HTTP timeout in milliseconds', '7000')
  .option('--quiet', 'Reduce non-essential output', false)
  .configureOutput({
    outputError: (str, write) => write(chalk.red(str))
  });

function loadConfig(){
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH,'utf8')); } catch { return { server: 'http://localhost:3000' }; }
}
function saveConfig(cfg){ fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); }

function getServerBase(){
  const opts = program.opts?.() || {};
  const fromFlag = opts.server && String(opts.server);
  const fromEnv = process.env.HDISPLAY_SERVER && String(process.env.HDISPLAY_SERVER);
  const fromConfig = (loadConfig().server) || 'http://localhost:3000';
  return (fromFlag || fromEnv || fromConfig).replace(/\/$/, '');
}

function getTimeoutMs(){
  const opts = program.opts?.() || {};
  const t = Number(opts.timeout);
  return Number.isFinite(t) && t > 0 ? t : 7000;
}

function isQuiet(){
  const opts = program.opts?.() || {};
  return !!opts.quiet;
}

function successLog(...args){ if (!isQuiet()) console.log(...args); }
function infoLog(...args){ if (!isQuiet()) console.log(...args); }

async function readStdin(){
  return new Promise((resolve, reject) => {
    let data = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function promptSelectService(services) {
  // Non-interactive fallback
  if (!process.stdin.isTTY) return services[0];
  console.log(chalk.cyan('\nMultiple hdisplay servers found:'));
  services.forEach((s, i) => {
    const label = s.name ? `${s.name} (${s.url})` : s.url;
    console.log(`  [${i + 1}] ${label}`);
  });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, res));
  let choice;
  while (true) {
    const answer = (await ask(chalk.cyan('Select a server [1-' + services.length + '] (default 1): '))).trim();
    if (answer === '') { choice = 1; break; }
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= services.length) { choice = n; break; }
    console.log(chalk.yellow('Please enter a number between 1 and ' + services.length + '.'));
  }
  rl.close();
  return services[choice - 1];
}

async function api(pathname, method='get', data) {
  const base = getServerBase();
  const url = base + pathname;
  try {
    const resp = await axios({ url, method, data, timeout: getTimeoutMs() });
    return resp.data;
  } catch (e) {
    if (e.response) {
      const msg = e.response.data && (e.response.data.error || e.response.data.message);
      throw new Error(`HTTP ${e.response.status} ${e.response.statusText}${msg ? ` - ${msg}` : ''}`);
    }
    if (e.code === 'ECONNREFUSED' || e.code === 'ECONNABORTED') {
      throw new Error(`Cannot reach server at ${url}. Is it running?`);
    }
    throw e;
  }
}

async function uploadFile(filePath) {
  const url = getServerBase() + '/api/upload';
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  const headers = form.getHeaders();
  const resp = await axios.post(url, form, { headers, maxContentLength: Infinity, maxBodyLength: Infinity, timeout: getTimeoutMs() });
  return resp.data;
}

async function pushMedia(endpoint, { file, url, persist }) {
  const base = getServerBase();
  const target = `${base}${endpoint}?persist=${persist ? 'true' : 'false'}`;
  if (file) {
    const form = new FormData();
    form.append('file', fs.createReadStream(file));
    const headers = form.getHeaders();
    const res = await axiosLib.post(target, form, { headers, maxContentLength: Infinity, maxBodyLength: Infinity, timeout: getTimeoutMs() });
    return res.data;
  }
  if (url) {
    const res = await axiosLib.post(target, { url, persist: !!persist }, { timeout: getTimeoutMs() });
    return res.data;
  }
  throw new Error('file or url required');
}

program.command('config')
  .description('Show or set config')
  .option('-s, --server <url>', 'Server base URL')
  .action(opts => {
    const cfg = loadConfig();
    if (opts.server) { cfg.server = opts.server; saveConfig(cfg); console.log(chalk.green('Updated server to'), cfg.server); }
    console.log(cfg);
  });

program.command('status')
  .description('Show current display status')
  .action(async ()=>{
  try { const data = await api('/api/status'); console.log(chalk.cyan('Content length:'), data.content.length, '\nNotification:', data.notification); }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('set <html...>')
  .description('Set display content (HTML)')
  .action(async (htmlParts)=>{
    const html = (htmlParts || []).join(' ').trim();
    if (!html) { console.error(chalk.red('Error: HTML content required.')); process.exitCode = 1; return; }
  try { await api('/api/content','post',{ content: html }); successLog(chalk.green('Content updated')); }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('notify <message...>')
  .option('-d, --duration <ms>', 'Duration ms', '5000')
  .option('-l, --level <level>', 'Level info|warn|error|success', 'info')
  .description('Send a notification overlay')
  .action( async (msgParts, opts)=>{
    const message = (msgParts || []).join(' ').trim();
    const duration = parseInt(opts.duration,10);
    const level = String(opts.level || 'info');
    if (!message) { console.error(chalk.red('Error: message required.')); process.exitCode = 1; return; }
    if (!Number.isFinite(duration) || duration < 0) { console.error(chalk.red('Error: duration must be a non-negative integer.')); process.exitCode = 1; return; }
    if (!ALLOWED_LEVELS.has(level)) { console.error(chalk.red('Error: level must be one of info|warn|error|success.')); process.exitCode = 1; return; }
  try { await api('/api/notification','post',{ message, duration, level }); successLog(chalk.green('Notification sent')); }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('templates')
  .description('List available templates')
  .action(async ()=>{
    try { const data = await api('/api/templates');
      if (!data.templates || data.templates.length === 0) { console.log(chalk.yellow('No templates found. Add .html files in templates/')); return; }
      data.templates.forEach(t=> console.log(chalk.cyan(t.id), '-', (t.placeholders && t.placeholders.length ? t.placeholders.join(', ') : '(no vars)')));
    } catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('template <id> [args...]')
  .description('Apply a template with optional JSON data: --data "{\"key\":\"value\"}"')
  .option('--data <json>', 'JSON data for placeholders (or use --data - to read from stdin)')
  .option('--data-file <path>', 'Path to JSON file for placeholders')
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action(async (id, _rest, opts)=>{
    let dataPayload = {};
    // Helpers for flag-to-data parsing
    const kebabToCamel = (s) => s.replace(/-([a-zA-Z0-9])/g, (_, c) => c.toUpperCase());
    const toCamel = (s) => kebabToCamel(s.replace(/^[\s.-]+|[\s.-]+$/g, ''));
    const setDeep = (obj, pathArr, value) => {
      let cur = obj;
      for (let i = 0; i < pathArr.length - 1; i++) {
        const k = pathArr[i];
        if (typeof cur[k] !== 'object' || cur[k] === null || Array.isArray(cur[k])) cur[k] = {};
        cur = cur[k];
      }
      const last = pathArr[pathArr.length - 1];
      if (cur[last] === undefined) { cur[last] = value; return; }
      // If existing and new are arrays/scalars, handle repeats -> array
      if (Array.isArray(cur[last])) { cur[last].push(value); return; }
      cur[last] = cur[last] === undefined ? value : (cur[last] !== undefined ? (Array.isArray(value) ? value : [cur[last], value]).flat() : value);
    };
    const parseMaybeJSON = (str) => {
      const s = String(str).trim();
      if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))){
        try { return JSON.parse(s); } catch { /* fallthrough */ }
      }
      return null;
    };
    const coerce = (val, explicitBoolean = false) => {
      if (explicitBoolean) return !!val;
      if (typeof val !== 'string') return val;
      const lower = val.toLowerCase();
      if (lower === 'true') return true;
      if (lower === 'false') return false;
      const asJson = parseMaybeJSON(val);
      if (asJson !== null) return asJson;
      const n = Number(val);
      return Number.isFinite(n) ? n : val;
    };
    const mergeDeep = (base, override) => {
      if (typeof base !== 'object' || base === null) return override;
      if (typeof override !== 'object' || override === null) return override;
      const out = Array.isArray(base) ? base.slice() : { ...base };
      for (const k of Object.keys(override)){
        const bv = out[k]; const ov = override[k];
        if (bv && typeof bv === 'object' && !Array.isArray(bv) && ov && typeof ov === 'object' && !Array.isArray(ov)){
          out[k] = mergeDeep(bv, ov);
        } else {
          out[k] = ov;
        }
      }
      return out;
    };
    const parseFlagData = () => {
      // Collect flags appearing after `template <id>`
      const argv = process.argv.slice(2); // drop node and script
      const idx = argv.findIndex(t => t === 'template');
      if (idx === -1 || idx + 1 >= argv.length) return {};
      // Tokens after id
      const tokens = argv.slice(idx + 2);
      const excluded = new Set(['--data', '--data-file', '--server', '--timeout', '--quiet', '--help', '-h']);
      const data = {};
      for (let i = 0; i < tokens.length; i++){
        let tok = tokens[i];
        if (!tok.startsWith('--')) continue;
        if (tok === '--') break; // end of options
        // handle --key=value
        let key, valueProvided = false, val;
        const eqIdx = tok.indexOf('=');
        if (eqIdx !== -1){
          key = tok.slice(0, eqIdx);
          val = tok.slice(eqIdx + 1);
          valueProvided = true;
        } else {
          key = tok;
        }
        if (excluded.has(key)) {
          // skip and consume value if present as next token and not valueProvided
          if (!valueProvided && i + 1 < tokens.length && !tokens[i+1].startsWith('--')) i++;
          continue;
        }
        // Negated boolean --no-foo
        if (key.startsWith('--no-')){
          const raw = key.slice(5);
          const path = raw.split('.').map(toCamel);
          setDeep(data, path, false);
          continue;
        }
        // Normal flag
        const raw = key.slice(2);
        const path = raw.split('.').map(toCamel);
        if (valueProvided){
          setDeep(data, path, coerce(val));
        } else {
          // If next token is a value (doesn't start with --), consume it, else boolean true
          if (i + 1 < tokens.length && !tokens[i+1].startsWith('--')){
            i++;
            setDeep(data, path, coerce(tokens[i]));
          } else {
            setDeep(data, path, true);
          }
        }
      }
      return data;
    };
    try {
      if (opts.dataFile) {
        const raw = fs.readFileSync(String(opts.dataFile), 'utf8');
        dataPayload = JSON.parse(raw);
      } else if (opts.data === '-') {
        const raw = await readStdin();
        dataPayload = raw ? JSON.parse(raw) : {};
      } else if (opts.data) {
        dataPayload = JSON.parse(opts.data);
      }
    } catch {
      console.error(chalk.red('Error: Invalid JSON for --data/--data-file/stdin'));
      process.exitCode = 1; return;
    }
    // Parse additional flag-based data and merge (flags take precedence)
    const flagData = parseFlagData();
    const finalData = Object.keys(flagData).length ? mergeDeep(dataPayload, flagData) : dataPayload;
    try {
  await api(`/api/template/${id}`, 'post', { data: finalData });
  successLog(chalk.green('Template applied'), id);
    }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('clear')
  .description('Clear content & notification')
  .action(async ()=>{
  try { await api('/api/clear','post'); successLog(chalk.green('Display cleared')); }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('discover')
  .description('Discover hdisplay servers via mDNS and optionally set config')
  .option('--set', 'Set config to first discovered server')
  .option('--timeout <ms>', 'Scan duration in ms', '2000')
  .option('--non-interactive', 'Do not prompt; select first when multiple')
  .action(async (opts)=>{
    try {
      const list = await discover(parseInt(opts.timeout,10)||2000);
      if (!list.length) { console.log(chalk.yellow('No hdisplay servers found on the network.')); return; }
      if (opts.set) {
        let selected;
        if (list.length > 1) {
          selected = (opts.nonInteractive || !process.stdin.isTTY) ? list[0] : await promptSelectService(list);
        } else {
          selected = list[0];
        }
        const cfg = loadConfig();
        cfg.server = selected.url;
        saveConfig(cfg);
        successLog(chalk.green('Configured server:'), cfg.server);
      } else {
        console.log(chalk.cyan('\nDiscovered hdisplay servers:'));
        list.forEach((s, i) => console.log(`  [${i + 1}] ${s.name || 'hdisplay'} - ${s.url}`));
      }
    } catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('assets:upload <file>')
  .description('Upload an asset and return its URL')
  .action(async (file)=>{
    if (!fs.existsSync(file)) { console.error(chalk.red('Error: file not found'), file); process.exitCode = 1; return; }
    try {
      const res = await uploadFile(file);
  successLog(chalk.green('Uploaded:'), res.file.url);
    } catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('assets:list')
  .description('List uploaded assets')
  .action(async ()=>{
    try { const data = await api('/api/uploads');
  data.files.forEach(f => console.log(f.url));
    } catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('assets:delete <name>')
  .description('Delete an uploaded asset by filename')
  .action(async (name)=>{
  try { await api(`/api/uploads/${encodeURIComponent(name)}`, 'delete'); successLog(chalk.green('Deleted'), name); }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });


program.command('push:image')
  .description('Push an image (file or URL) and display immediately')
  .option('-f, --file <path>', 'Local file path to upload and display')
  .option('-u, --url <url>', 'Remote URL to display')
  .option('-p, --persist', 'Persist file to /uploads (if using --file)')
  .action(async (opts)=>{
    if (!opts.file && !opts.url) { console.error(chalk.red('Error: --file or --url required')); process.exitCode = 1; return; }
  try { const res = await pushMedia('/api/push/image', opts); successLog(chalk.green('Image displayed at'), res.url); }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('push:video')
  .description('Push a video (file or URL) and display immediately')
  .option('-f, --file <path>', 'Local file path to upload and display')
  .option('-u, --url <url>', 'Remote URL to display')
  .option('-p, --persist', 'Persist file to /uploads (if using --file)')
  .action(async (opts)=>{
    if (!opts.file && !opts.url) { console.error(chalk.red('Error: --file or --url required')); process.exitCode = 1; return; }
  try { const res = await pushMedia('/api/push/video', opts); successLog(chalk.green('Video displayed at'), res.url); }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });


// Playlist commands
program.command('playlist:list')
  .description('Show current playlist and delay')
  .action(async ()=>{
    try {
      const data = await api('/api/playlist');
      console.log(chalk.cyan('delayMs:'), data.delayMs);
      if (!data.items || data.items.length === 0) { console.log('(empty)'); return; }
      data.items.forEach((it, i) => console.log(`[${i}]`, it.id, it.data ? JSON.stringify(it.data) : ''));
    } catch(e) { console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('playlist:add <id> [args...]')
  .description('Append an item to the playlist')
  .option('--data <json>', 'Inline JSON data (or --data - to read from stdin)')
  .option('--data-file <path>', 'Path to JSON file')
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action(async (id, _rest, opts)=>{
    let dataPayload = {};
    // Reuse minimal helpers from template command
    const kebabToCamel = (s) => s.replace(/-([a-zA-Z0-9])/g, (_, c) => c.toUpperCase());
    const toCamel = (s) => kebabToCamel(s.replace(/^[\s.-]+|[\s.-]+$/g, ''));
    const setDeep = (obj, pathArr, value) => {
      let cur = obj;
      for (let i = 0; i < pathArr.length - 1; i++) {
        const k = pathArr[i];
        if (typeof cur[k] !== 'object' || cur[k] === null || Array.isArray(cur[k])) cur[k] = {};
        cur = cur[k];
      }
      const last = pathArr[pathArr.length - 1];
      if (cur[last] === undefined) { cur[last] = value; return; }
      if (Array.isArray(cur[last])) { cur[last].push(value); return; }
      cur[last] = cur[last] === undefined ? value : (cur[last] !== undefined ? (Array.isArray(value) ? value : [cur[last], value]).flat() : value);
    };
    const parseMaybeJSON = (str) => {
      const s = String(str).trim();
      if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))){
        try { return JSON.parse(s); } catch { /* ignore */ }
      }
      return null;
    };
    const coerce = (val) => {
      if (typeof val !== 'string') return val;
      const lower = val.toLowerCase();
      if (lower === 'true') return true;
      if (lower === 'false') return false;
      const asJson = parseMaybeJSON(val);
      if (asJson !== null) return asJson;
      const n = Number(val);
      return Number.isFinite(n) ? n : val;
    };
    const mergeDeep = (base, override) => {
      if (typeof base !== 'object' || base === null) return override;
      if (typeof override !== 'object' || override === null) return override;
      const out = Array.isArray(base) ? base.slice() : { ...base };
      for (const k of Object.keys(override)){
        const bv = out[k]; const ov = override[k];
        if (bv && typeof bv === 'object' && !Array.isArray(bv) && ov && typeof ov === 'object' && !Array.isArray(ov)){
          out[k] = mergeDeep(bv, ov);
        } else {
          out[k] = ov;
        }
      }
      return out;
    };
    const parseFlagData = () => {
      const argv = process.argv.slice(2);
      const idx = argv.findIndex(t => t === 'playlist:add');
      if (idx === -1 || idx + 1 >= argv.length) return {};
      const tokens = argv.slice(idx + 2); // after id
      const excluded = new Set(['--data', '--data-file', '--server', '--timeout', '--quiet', '--help', '-h']);
      const data = {};
      for (let i = 0; i < tokens.length; i++){
        let tok = tokens[i];
        if (!tok.startsWith('--')) continue;
        if (tok === '--') break;
        let key, valueProvided = false, val;
        const eqIdx = tok.indexOf('=');
        if (eqIdx !== -1){
          key = tok.slice(0, eqIdx);
          val = tok.slice(eqIdx + 1);
          valueProvided = true;
        } else {
          key = tok;
        }
        if (excluded.has(key)){
          if (!valueProvided && i + 1 < tokens.length && !tokens[i+1].startsWith('--')) i++;
          continue;
        }
        if (key.startsWith('--no-')){
          const raw = key.slice(5);
          const path = raw.split('.').map(toCamel);
          setDeep(data, path, false);
          continue;
        }
        const raw = key.slice(2);
        const path = raw.split('.').map(toCamel);
        if (valueProvided){
          setDeep(data, path, coerce(val));
        } else {
          if (i + 1 < tokens.length && !tokens[i+1].startsWith('--')){ i++; setDeep(data, path, coerce(tokens[i])); }
          else { setDeep(data, path, true); }
        }
      }
      return data;
    };
    try {
      if (opts.dataFile) {
        const raw = fs.readFileSync(String(opts.dataFile), 'utf8');
        dataPayload = JSON.parse(raw);
      } else if (opts.data === '-') {
        const raw = await readStdin();
        dataPayload = raw ? JSON.parse(raw) : {};
      } else if (opts.data) {
        dataPayload = JSON.parse(opts.data);
      }
    } catch {
      console.error(chalk.red('Error: Invalid JSON for --data/--data-file/stdin'));
      process.exitCode = 1; return;
    }
    const flagData = parseFlagData();
    const finalData = Object.keys(flagData).length ? mergeDeep(dataPayload, flagData) : dataPayload;
    try {
      const res = await api('/api/playlist/items','post',{ id, data: finalData });
      successLog(chalk.green('Added to playlist at index'), res.index);
    } catch(e) { console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('playlist:remove <indexOrId>')
  .description('Remove a playlist item by index or by id (first match)')
  .action(async (indexOrId)=>{
    try {
      const n = Number(indexOrId);
      if (Number.isInteger(n)) {
        await api(`/api/playlist/items/${n}`, 'delete');
        successLog(chalk.green('Removed index'), n);
      } else {
        await api(`/api/playlist/items/by-id/${encodeURIComponent(indexOrId)}`, 'delete');
        successLog(chalk.green('Removed id'), indexOrId);
      }
    } catch(e) { console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('playlist:clear')
  .description('Clear all playlist items')
  .action(async ()=>{
    try {
      // Replace playlist with empty list
      await api('/api/playlist','put',{ items: [] });
      successLog(chalk.green('Playlist cleared'));
    } catch(e) { console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('playlist:delay <ms>')
  .description('Set dwell per item (2000–300000 ms)')
  .action(async (ms)=>{
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) { console.error(chalk.red('Error: ms must be a positive integer')); process.exitCode = 1; return; }
    try {
      const res = await api('/api/playlist/delay','post',{ delayMs: n });
      successLog(chalk.green('delayMs set to'), res.delayMs);
    } catch(e) { console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.parse(process.argv);
