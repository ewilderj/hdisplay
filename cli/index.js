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

program.parse(process.argv);
