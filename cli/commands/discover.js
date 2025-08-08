const Bonjour = require('bonjour-service');
const chalkImport = require('chalk');
const chalk = chalkImport.default || chalkImport;

module.exports = async function discover(timeoutMs = 2000) {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    const found = [];
    const browser = bonjour.find({ type: 'hdisplay' }, (service) => {
      const host = service.host || service.fqdn;
      const addr = (service.referer && service.referer.address) || (service.addresses && service.addresses[0]);
      const url = `http://${addr || host}:${service.port}`;
      found.push({ name: service.name, host, url, port: service.port, txt: service.txt });
      console.log(chalk.green('Found:'), service.name, chalk.cyan(url));
    });
    setTimeout(() => { browser.stop(); bonjour.destroy(); resolve(found); }, timeoutMs);
  });
};
