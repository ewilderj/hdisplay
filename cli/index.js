#!/usr/bin/env node
const { Command } = require('commander');
const axios = require('axios');
// Normalize chalk import for ESM-only v5 (require returns { default: chalkFn })
const chalkImport = require('chalk');
const chalk = chalkImport.default || chalkImport;
const fs = require('fs');
const os = require('os');
const path = require('path');
const discover = require('./commands/discover');
const FormData = require('form-data');
const axiosLib = axios; // alias

const ALLOWED_LEVELS = new Set(['info','warn','error','success']);

const program = new Command();
const CONFIG_PATH = path.join(os.homedir(), '.hdisplay.json');

program
  .name('hdisplay')
  .description('CLI to control hdisplay content server')
  .version('0.1.0')
  .showHelpAfterError()
  .allowExcessArguments(false)
  .configureOutput({
    outputError: (str, write) => write(chalk.red(str))
  });

function loadConfig(){
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH,'utf8')); } catch { return { server: 'http://localhost:3000' }; }
}
function saveConfig(cfg){ fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); }

async function api(pathname, method='get', data) {
  const cfg = loadConfig();
  const url = cfg.server.replace(/\/$/, '') + pathname;
  try {
    const resp = await axios({ url, method, data, timeout: 7000 });
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
  const cfg = loadConfig();
  const url = cfg.server.replace(/\/$/, '') + '/api/upload';
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  const headers = form.getHeaders();
  const resp = await axios.post(url, form, { headers, maxContentLength: Infinity, maxBodyLength: Infinity });
  return resp.data;
}

async function pushMedia(endpoint, { file, url, persist }) {
  const cfg = loadConfig();
  const base = cfg.server.replace(/\/$/, '');
  const target = `${base}${endpoint}?persist=${persist ? 'true' : 'false'}`;
  if (file) {
    const form = new FormData();
    form.append('file', fs.createReadStream(file));
    const headers = form.getHeaders();
    const res = await axiosLib.post(target, form, { headers, maxContentLength: Infinity, maxBodyLength: Infinity });
    return res.data;
  }
  if (url) {
    const res = await axiosLib.post(target, { url, persist: !!persist });
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
    try { await api('/api/content','post',{ content: html }); console.log(chalk.green('Content updated')); }
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
    try { await api('/api/notification','post',{ message, duration, level }); console.log(chalk.green('Notification sent')); }
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

program.command('template <id>')
  .description('Apply a template with optional JSON data: --data "{\"key\":\"value\"}"')
  .option('--data <json>', 'JSON data for placeholders')
  .allowExcessArguments(false)
  .action(async (id, opts)=>{
    let dataPayload = {};
    if (opts.data) {
      try { dataPayload = JSON.parse(opts.data); }
      catch { console.error(chalk.red('Error: Invalid JSON for --data')); process.exitCode = 1; return; }
    }
    try {
      // Validate template exists for friendly error
      const list = await api('/api/templates');
      const exists = list.templates && list.templates.some(t=> t.id === id);
      if (!exists) {
        console.error(chalk.red(`Error: template '${id}' not found.`));
        if (list.templates && list.templates.length) {
          console.error('Available:', list.templates.map(t=>t.id).join(', '));
        }
        process.exitCode = 1; return;
      }
      await api(`/api/template/${id}`, 'post', { data: dataPayload });
      console.log(chalk.green('Template applied'), id);
    }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('clear')
  .description('Clear content & notification')
  .action(async ()=>{
    try { await api('/api/clear','post'); console.log(chalk.green('Display cleared')); }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('discover')
  .description('Discover hdisplay servers via mDNS and optionally set config')
  .option('--set', 'Set config to first discovered server')
  .option('--timeout <ms>', 'Scan duration in ms', '2000')
  .action(async (opts)=>{
    try {
      const list = await discover(parseInt(opts.timeout,10)||2000);
      if (!list.length) { console.log(chalk.yellow('No hdisplay servers found on the network.')); return; }
      if (opts.set) {
        const cfg = loadConfig();
        cfg.server = list[0].url;
        saveConfig(cfg);
        console.log(chalk.green('Configured server:'), cfg.server);
      }
    } catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('assets:upload <file>')
  .description('Upload an asset and return its URL')
  .action(async (file)=>{
    if (!fs.existsSync(file)) { console.error(chalk.red('Error: file not found'), file); process.exitCode = 1; return; }
    try {
      const res = await uploadFile(file);
      console.log(chalk.green('Uploaded:'), res.file.url);
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
    try { await api(`/api/uploads/${encodeURIComponent(name)}`, 'delete'); console.log(chalk.green('Deleted'), name); }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('show:image <url>')
  .description('Set content to display an image URL')
  .action(async (url)=>{
    const html = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000;"><img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain"/></div>`;
    try { await api('/api/content','post',{ content: html }); console.log(chalk.green('Displaying image'), url); }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('show:video <url>')
  .description('Set content to display a video URL (autoplay, muted, loop)')
  .action(async (url)=>{
    const html = `<video src="${url}" autoplay muted loop style="width:100%;height:100%;object-fit:cover;background:#000"></video>`;
    try { await api('/api/content','post',{ content: html }); console.log(chalk.green('Displaying video'), url); }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('push:image')
  .description('Push an image (file or URL) and display immediately')
  .option('-f, --file <path>', 'Local file path to upload and display')
  .option('-u, --url <url>', 'Remote URL to display')
  .option('-p, --persist', 'Persist file to /uploads (if using --file)')
  .action(async (opts)=>{
    if (!opts.file && !opts.url) { console.error(chalk.red('Error: --file or --url required')); process.exitCode = 1; return; }
    try { const res = await pushMedia('/api/push/image', opts); console.log(chalk.green('Image displayed at'), res.url); }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('push:video')
  .description('Push a video (file or URL) and display immediately')
  .option('-f, --file <path>', 'Local file path to upload and display')
  .option('-u, --url <url>', 'Remote URL to display')
  .option('-p, --persist', 'Persist file to /uploads (if using --file)')
  .action(async (opts)=>{
    if (!opts.file && !opts.url) { console.error(chalk.red('Error: --file or --url required')); process.exitCode = 1; return; }
    try { const res = await pushMedia('/api/push/video', opts); console.log(chalk.green('Video displayed at'), res.url); }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('show:carousel')
  .description('Display a carousel of URLs (images/videos). Usage: --items "[\"url1\",\"url2\"]" --duration 4000')
  .option('--items <json>', 'JSON array of URLs')
  .option('--duration <ms>', 'Slide duration in ms', '4000')
  .action(async (opts)=>{
    if (!opts.items) { console.error(chalk.red('Error: --items JSON array required')); process.exitCode = 1; return; }
    let items;
    try { items = JSON.parse(opts.items); } catch { console.error(chalk.red('Error: invalid JSON for --items')); process.exitCode = 1; return; }
    try { await api('/api/template/carousel','post',{ data: { items, duration: Number(opts.duration)||4000 } }); console.log(chalk.green('Carousel displayed')); }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.command('show:marquee')
  .description('Display animated scrolling text. Usage: --text "Hello" --speed 12')
  .option('--text <text>', 'Text to scroll')
  .option('--speed <seconds>', 'Animation duration in seconds', '12')
  .action(async (opts)=>{
    if (!opts.text) { console.error(chalk.red('Error: --text required')); process.exitCode = 1; return; }
    try { await api('/api/template/animated-text','post',{ data: { text: opts.text, speed: Number(opts.speed)||12 } }); console.log(chalk.green('Marquee displayed')); }
    catch(e){ console.error(chalk.red('Error:'), e.message); process.exitCode = 1; }
  });

program.parse(process.argv);
