#!/usr/bin/env node
const { Command } = require('commander');
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const os = require('os');
const path = require('path');

const program = new Command();
const CONFIG_PATH = path.join(os.homedir(), '.hdisplay.json');

function loadConfig(){
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH,'utf8')); } catch { return { server: 'http://localhost:3000' }; }
}
function saveConfig(cfg){ fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); }

async function api(pathname, method='get', data) {
  const cfg = loadConfig();
  const url = cfg.server.replace(/\/$/, '') + pathname;
  return axios({ url, method, data, timeout: 5000 }).then(r=>r.data);
}

program
  .name('hdisplay')
  .description('CLI to control hdisplay content server')
  .version('0.1.0');

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
    catch(e){ console.error(chalk.red('Error:'), e.message); }
  });

program.command('set <html...>')
  .description('Set display content (HTML)')
  .action(async (htmlParts)=>{
    const html = htmlParts.join(' ');
    try { await api('/api/content','post',{ content: html }); console.log(chalk.green('Content updated')); }
    catch(e){ console.error(chalk.red('Error:'), e.message); }
  });

program.command('notify <message...>')
  .option('-d, --duration <ms>', 'Duration ms', '5000')
  .description('Send a notification overlay')
  .action( async (msgParts, opts)=>{
    const message = msgParts.join(' ');
    const duration = parseInt(opts.duration,10)||5000;
    try { await api('/api/notification','post',{ message, duration }); console.log(chalk.green('Notification sent')); }
    catch(e){ console.error(chalk.red('Error:'), e.message); }
  });

program.command('clear')
  .description('Clear content & notification')
  .action(async ()=>{
    try { await api('/api/clear','post'); console.log(chalk.green('Display cleared')); }
    catch(e){ console.error(chalk.red('Error:'), e.message); }
  });

program.parse(process.argv);
